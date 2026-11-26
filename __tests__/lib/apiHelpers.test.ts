import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  resolveActivityConflictMessage,
  buildDuplicateExternalIdResponse,
  isPrismaUniqueConstraintError,
} from "@/lib/api/externalIdConflict";
import {
  parseJsonBody,
  parseOptionalJsonBody,
  parseQueryParams,
  parsePathId,
  hasOwnDefinedField,
  mergeDefinedFields,
  resolveDefinedUpdateFields,
} from "@/lib/api/request";
import {
  getCursorPaginationPrismaArgs,
  buildCursorPaginatedResponse,
} from "@/lib/api/pagination";
import {
  shouldSkipSheetsSync,
  safeReconcileWeeklyPlans,
  syncRecordWithSheets,
  syncTrainingRecordWithPlanAndSheets,
} from "@/lib/api/sheetsSync";
import { AppError } from "@/lib/api/response";
import * as googleSheets from "@/lib/googleSheets";
import * as envModule from "@/lib/env";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/googleSheets", () => ({
  pullWeeklyPlanFromSheets: vi.fn(),
  reconcileWeeklyPlansWithSessions: vi.fn(),
  safeAutoSync: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  isGoogleSheetsConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    weeklyPlanItem: {
      count: vi.fn(),
    },
  },
}));

describe("lib/api helpers (externalIdConflict, request, pagination, sheetsSync)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("externalIdConflict", () => {
    it("resolve mensagens por origem (.FIT, Google Sheets e .GPX)", () => {
      expect(resolveActivityConflictMessage("fit_upload", null)).toBe(
        "Este arquivo .FIT já foi importado"
      );
      expect(resolveActivityConflictMessage(null, "fit_abc")).toBe(
        "Este arquivo .FIT já foi importado"
      );
      expect(resolveActivityConflictMessage("sheets", null)).toBe(
        "Este registro do Google Sheets já foi importado"
      );
      expect(resolveActivityConflictMessage(null, "sheets_row_1")).toBe(
        "Este registro do Google Sheets já foi importado"
      );
      expect(resolveActivityConflictMessage("gpx_upload", "gpx_xyz")).toBe(
        "Este arquivo .GPX já foi importado"
      );
    });

    it("buildDuplicateExternalIdResponse retorna 409 com e sem existingId", async () => {
      const withExisting = buildDuplicateExternalIdResponse("fit_upload", "fit_1", "trn_1");
      expect(withExisting.status).toBe(409);
      const bodyWith = await withExisting.json();
      expect(bodyWith.code).toBe("DUPLICATE_EXTERNAL_ID");
      expect(bodyWith.details).toEqual({
        existingId: "trn_1",
        code: "DUPLICATE_EXTERNAL_ID",
      });

      const withoutExisting = buildDuplicateExternalIdResponse("sheets", "sheets_1");
      expect(withoutExisting.status).toBe(409);
      const bodyWithout = await withoutExisting.json();
      expect(bodyWithout.error).toBe("Este registro do Google Sheets já foi importado");
      expect(bodyWithout.details).toEqual({ code: "DUPLICATE_EXTERNAL_ID" });
    });

    it("isPrismaUniqueConstraintError diferencia P2002 por target array, string, ausente e outros erros", () => {
      expect(isPrismaUniqueConstraintError(new Error("generic"))).toBe(false);

      const p2025 = new Prisma.PrismaClientKnownRequestError("not found", {
        code: "P2025",
        clientVersion: "6.0.0",
      });
      expect(isPrismaUniqueConstraintError(p2025)).toBe(false);

      const arrayExternal = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "6.0.0",
        meta: { target: ["external_id"] },
      });
      expect(isPrismaUniqueConstraintError(arrayExternal)).toBe(true);

      const arrayOther = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "6.0.0",
        meta: { target: ["email"] },
      });
      expect(isPrismaUniqueConstraintError(arrayOther)).toBe(false);

      const stringExternal = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "6.0.0",
        meta: { target: "TrainingSession_externalId_key" },
      });
      expect(isPrismaUniqueConstraintError(stringExternal)).toBe(true);

      const stringOther = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "6.0.0",
        meta: { target: "User_email_key" },
      });
      expect(isPrismaUniqueConstraintError(stringOther)).toBe(false);

      const noTarget = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "6.0.0",
      });
      expect(isPrismaUniqueConstraintError(noTarget)).toBe(true);
    });
  });

  describe("request helpers", () => {
    it("parseJsonBody e parseOptionalJsonBody validam payloads válidos, vazios e JSON quebrado", async () => {
      const schema = z.object({ name: z.string().default("Padrão") });

      const validReq = new Request("http://localhost/test", {
        method: "POST",
        body: JSON.stringify({ name: "PaceLab" }),
      });
      await expect(parseJsonBody(validReq, schema)).resolves.toEqual({
        body: { name: "PaceLab" },
        data: { name: "PaceLab" },
      });

      const emptyReq = new Request("http://localhost/test", { method: "POST", body: "   " });
      await expect(parseOptionalJsonBody(emptyReq, schema)).resolves.toEqual({
        body: {},
        data: { name: "Padrão" },
      });

      const filledOptionalReq = new Request("http://localhost/test", {
        method: "POST",
        body: JSON.stringify({ name: "Custom" }),
      });
      await expect(parseOptionalJsonBody(filledOptionalReq, schema)).resolves.toEqual({
        body: { name: "Custom" },
        data: { name: "Custom" },
      });

      const brokenReq = new Request("http://localhost/test", {
        method: "POST",
        body: "{json-quebrado",
      });
      await expect(parseOptionalJsonBody(brokenReq, schema)).rejects.toBeInstanceOf(AppError);
    });

    it("parseQueryParams ignora valores vazios e preserva primeira ocorrência", () => {
      const schema = z.object({
        limit: z.coerce.number().default(10),
        cursor: z.string().optional(),
      });
      const req = new Request(
        "http://localhost/api/items?limit=25&limit=99&cursor=%20%20&extra=ok"
      );
      expect(parseQueryParams(req, schema)).toEqual({ limit: 25 });
    });

    it("parsePathId aceita IDs válidos e rejeita vazios ou > 128 caracteres", () => {
      expect(parsePathId({ id: "  att_123  " })).toBe("att_123");
      expect(() => parsePathId({ id: "   " })).toThrowError(AppError);
      expect(() => parsePathId({ id: "x".repeat(129) })).toThrowError(AppError);
    });

    it("hasOwnDefinedField, mergeDefinedFields e resolveDefinedUpdateFields respeitam campos explícitos", () => {
      expect(hasOwnDefinedField(null, "a")).toBe(false);
      expect(hasOwnDefinedField({ a: undefined }, "a")).toBe(false);
      expect(hasOwnDefinedField({ a: null }, "a")).toBe(true);

      const merged = mergeDefinedFields(
        { notes: "Novo" },
        { notes: "Novo", shoe: undefined as string | undefined, rpe: undefined as number | undefined },
        { notes: "Antigo", shoe: "Pegasus", rpe: undefined as number | undefined },
        ["notes", "shoe", "rpe"],
        { rpe: 6 }
      );
      expect(merged).toEqual({ notes: "Novo", shoe: "Pegasus", rpe: 6 });

      const updated = resolveDefinedUpdateFields(
        { date: "2026-10-12", distance: 5 },
        { date: "2026-10-12", distance: 5, omitted: "default-val" },
        { date: (v) => new Date(v) }
      );
      expect(updated.date).toBeInstanceOf(Date);
      expect(updated.distance).toBe(5);
      expect("omitted" in updated).toBe(false);
    });
  });

  describe("pagination helpers", () => {
    it("monta args Prisma e fatia resultado com e sem hasMore", async () => {
      expect(getCursorPaginationPrismaArgs(20)).toEqual({
        take: 21,
        skip: 0,
        cursor: undefined,
      });
      expect(getCursorPaginationPrismaArgs(20, "cur_1")).toEqual({
        take: 21,
        skip: 1,
        cursor: { id: "cur_1" },
      });

      const resHasMore = buildCursorPaginatedResponse(
        [{ id: "a" }, { id: "b" }, { id: "c" }],
        2
      );
      const bodyMore = await resHasMore.json();
      expect(bodyMore.data).toEqual([{ id: "a" }, { id: "b" }]);
      expect(bodyMore.meta).toEqual({ limit: 2, nextCursor: "b", hasMore: true });

      const resDone = buildCursorPaginatedResponse([{ id: "a" }], 2);
      const bodyDone = await resDone.json();
      expect(bodyDone.meta).toEqual({ limit: 2, nextCursor: null, hasMore: false });
    });
  });

  describe("sheetsSync helpers", () => {
    it("shouldSkipSheetsSync interpreta true/1 e lida com URL inválida", () => {
      expect(shouldSkipSheetsSync(new Request("http://localhost/api?skipSheetsSync=true"))).toBe(true);
      expect(shouldSkipSheetsSync(new Request("http://localhost/api?skipSheetsSync=1"))).toBe(true);
      expect(shouldSkipSheetsSync(new Request("http://localhost/api?skipSheetsSync=false"))).toBe(false);
      expect(shouldSkipSheetsSync({ url: "http://[invalid-url" } as unknown as Request)).toBe(false);
    });

    it("safeReconcileWeeklyPlans isola erros sem propagar exceção", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(googleSheets.reconcileWeeklyPlansWithSessions).mockRejectedValueOnce(
        new Error("DB lock")
      );

      await expect(safeReconcileWeeklyPlans({ editedSessionId: "tr-1" })).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("syncRecordWithSheets respeita skip, falhas e diferentes formatos de syncedAt", async () => {
      const base = { id: "1", syncedToSheetsAt: null as Date | null };
      const syncFn = vi.fn();

      // skip=true
      await expect(syncRecordWithSheets(base, syncFn, { skip: true })).resolves.toEqual(base);
      expect(googleSheets.safeAutoSync).not.toHaveBeenCalled();

      // skipped ou falha
      vi.mocked(googleSheets.safeAutoSync).mockResolvedValueOnce({
        ok: true,
        skipped: true,
      } as never);
      await expect(syncRecordWithSheets(base, syncFn)).resolves.toEqual(base);

      // data.syncedAt como Date
      const dateObj = new Date("2026-10-12T12:00:00.000Z");
      vi.mocked(googleSheets.safeAutoSync).mockResolvedValueOnce({
        ok: true,
        skipped: false,
        data: { syncedAt: dateObj },
      } as never);
      const resDate = await syncRecordWithSheets(base, syncFn);
      expect(resDate.syncedToSheetsAt).toEqual(dateObj);

      // syncedAt string ISO válida
      vi.mocked(googleSheets.safeAutoSync).mockResolvedValueOnce({
        ok: true,
        skipped: false,
        syncedAt: "2026-10-13T12:00:00.000Z",
      } as never);
      const resIso = await syncRecordWithSheets(base, syncFn);
      expect(resIso.syncedToSheetsAt?.toISOString()).toBe("2026-10-13T12:00:00.000Z");

      // syncedAt inválido mantém registro original
      vi.mocked(googleSheets.safeAutoSync).mockResolvedValueOnce({
        ok: true,
        skipped: false,
        syncedAt: "invalid-date",
      } as never);
      const resInvalid = await syncRecordWithSheets(base, syncFn);
      expect(resInvalid.syncedToSheetsAt).toBeNull();
    });

    it("syncTrainingRecordWithPlanAndSheets reconcilia e dispara push do plano quando skipSheetsSync=false", async () => {
      const record = { id: "tr-1", syncedToSheetsAt: null as Date | null };
      vi.mocked(googleSheets.reconcileWeeklyPlansWithSessions).mockResolvedValueOnce({} as never);
      vi.mocked(googleSheets.safeAutoSync)
        .mockResolvedValueOnce({
          ok: true,
          skipped: false,
          syncedAt: "2026-10-14T10:00:00.000Z",
        } as never)
        .mockResolvedValueOnce({ ok: true, skipped: false } as never);

      const result = await syncTrainingRecordWithPlanAndSheets(
        record,
        vi.fn(),
        vi.fn(),
        { skipSheetsSync: false, editedSessionId: "tr-1" }
      );

      expect(googleSheets.reconcileWeeklyPlansWithSessions).toHaveBeenCalledWith({
        editedSessionId: "tr-1",
      });
      expect(googleSheets.safeAutoSync).toHaveBeenCalledTimes(2);
      expect(result.syncedToSheetsAt?.toISOString()).toBe("2026-10-14T10:00:00.000Z");
    });

    it("syncTrainingRecordWithPlanAndSheets puxa Plano_Semanal sob demanda quando banco não tem planos na semana da sessão", async () => {
      vi.mocked(envModule.isGoogleSheetsConfigured).mockReturnValueOnce(true);
      vi.mocked(prisma.weeklyPlanItem.count).mockResolvedValueOnce(0);
      vi.mocked(googleSheets.reconcileWeeklyPlansWithSessions).mockResolvedValueOnce({} as never);
      vi.mocked(googleSheets.safeAutoSync)
        .mockResolvedValueOnce({ ok: true, skipped: false } as never) // pullWeeklyPlanFromSheets
        .mockResolvedValueOnce({ ok: true, skipped: false, syncedAt: "2026-11-18T12:00:00.000Z" } as never) // syncSession
        .mockResolvedValueOnce({ ok: true, skipped: false } as never); // pushWeeklyPlan

      const record = {
        id: "tr-2",
        sessionDate: new Date("2026-11-18T10:00:00.000Z"),
        syncedToSheetsAt: null as Date | null,
      };
      const result = await syncTrainingRecordWithPlanAndSheets(
        record,
        vi.fn(),
        vi.fn(),
        { skipSheetsSync: false }
      );

      expect(prisma.weeklyPlanItem.count).toHaveBeenCalledTimes(1);
      expect(googleSheets.safeAutoSync).toHaveBeenCalledTimes(3);
      expect(result.syncedToSheetsAt?.toISOString()).toBe("2026-11-18T12:00:00.000Z");
    });
  });
});
