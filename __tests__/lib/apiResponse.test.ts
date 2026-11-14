import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  apiSuccess,
  apiError,
  apiConflict,
  apiPayloadTooLarge,
  apiUnprocessable,
  AppError,
  withApiHandler,
} from "@/lib/api/response";

describe("Utilitários de Resposta da API (Fase 2 - Eixo B)", () => {
  describe("apiSuccess", () => {
    it("cria resposta de sucesso padrão com status 200", async () => {
      const res = apiSuccess({ id: "123", name: "Simulado 12m" });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ id: "123", name: "Simulado 12m" });
      expect(json.timestamp).toBeDefined();
      expect(json.meta).toBeUndefined();
    });

    it("suporta status HTTP customizado (ex: 201 Created) e metadados", async () => {
      const meta = { totalCount: 100, nextCursor: "att_999", hasMore: true };
      const res = apiSuccess({ created: true }, 201, meta);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ created: true });
      expect(json.meta).toEqual(meta);
    });
  });

  describe("apiError", () => {
    it("cria resposta de erro padrão com status 400", async () => {
      const res = apiError("Parâmetro inválido");
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Parâmetro inválido");
      expect(json.details).toBeUndefined();
      expect(json.timestamp).toBeDefined();
    });

    it("suporta status HTTP customizado e array de detalhes de validação", async () => {
      const details = [{ field: "distanceMeters", message: "Deve ser maior que 100" }];
      const res = apiError("Erro de validação", 422, details);

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Erro de validação");
      expect(json.details).toEqual(details);
    });
  });

  describe("AppError", () => {
    it("instancia classe de erro com status code e mensagem", () => {
      const error = new AppError("Acesso não autorizado", 401);
      expect(error.message).toBe("Acesso não autorizado");
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe("AppError");
    });
  });

  describe("withApiHandler", () => {
    it("retorna a resposta original de sucesso quando nenhuma exceção ocorre", async () => {
      const handler = async () => apiSuccess({ status: "ok" });
      const res = await withApiHandler(handler);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ status: "ok" });
    });

    it("captura ZodError e retorna 400 com detalhes formatados em português", async () => {
      const dummySchema = z.object({
        distance: z.number().min(100, "Distância mínima é 100"),
      });

      const handler = async () => {
        dummySchema.parse({ distance: 10 });
        return apiSuccess({ done: true });
      };

      const res = await withApiHandler(handler);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Distância mínima é 100");
      expect(json.details).toBeDefined();
      expect(json.details?.[0].field).toBe("distance");
    });

    it("captura PrismaClientKnownRequestError P2025 e retorna 404 Not Found", async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        "Record to delete does not exist",
        {
          code: "P2025",
          clientVersion: "6.0.0",
        }
      );

      const handler = async () => {
        throw prismaError;
      };

      const res = await withApiHandler(handler);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Registro não encontrado");
    });

    it("captura PrismaClientKnownRequestError P2002 e retorna 409 Conflict", async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        {
          code: "P2002",
          clientVersion: "6.0.0",
        }
      );

      const handler = async () => {
        throw prismaError;
      };

      const res = await withApiHandler(handler);
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Conflito");
    });

    it("captura P2002 em external_id e retorna 409 amigável de GPX duplicado", async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`external_id`)",
        {
          code: "P2002",
          clientVersion: "6.0.0",
          meta: { target: ["external_id"] },
        }
      );

      const res = await withApiHandler(async () => {
        throw prismaError;
      });
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Este arquivo .GPX já foi importado");
      expect(json.details).toEqual({ code: "DUPLICATE_EXTERNAL_ID" });
    });

    it("helpers apiConflict (409), apiPayloadTooLarge (413) e apiUnprocessable (422) retornam os status esperados", async () => {
      const r409 = apiConflict("Arquivo duplicado", { existingId: "tr-1" });
      expect(r409.status).toBe(409);
      expect((await r409.json()).details).toEqual({ existingId: "tr-1" });

      const r413 = apiPayloadTooLarge();
      expect(r413.status).toBe(413);
      expect((await r413.json()).error).toContain("4 MB");

      const r422 = apiUnprocessable("GPX sem pontos de trajeto", { code: "NO_TRACKPOINTS" });
      expect(r422.status).toBe(422);
      expect((await r422.json()).details).toEqual({ code: "NO_TRACKPOINTS" });
    });

    it("captura AppError e retorna o status code customizado", async () => {
      const handler = async () => {
        throw new AppError("Permissão negada para alterar este simulado", 403);
      };

      const res = await withApiHandler(handler);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Permissão negada para alterar este simulado");
    });

    it("captura SyntaxError (JSON quebrado no body) e retorna 400", async () => {
      const handler = async () => {
        throw new SyntaxError("Unexpected token in JSON at position 0");
      };

      const res = await withApiHandler(handler);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Corpo da requisição com formato JSON inválido");
    });

    it("captura PrismaClientInitializationError e retorna 503 Service Unavailable", async () => {
      const initError = new Prisma.PrismaClientInitializationError(
        "Can't reach database server at aws-0-us-east-1.pooler.supabase.com:6543",
        "6.0.0"
      );

      const handler = async () => {
        throw initError;
      };

      const res = await withApiHandler(handler);
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Não foi possível conectar ao banco de dados Supabase");
    });

    it("captura erro genérico inesperado e retorna 500", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const handler = async () => {
        throw new Error("Falha catastrófica de infraestrutura");
      };

      const res = await withApiHandler(handler);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Falha catastrófica de infraestrutura");

      consoleSpy.mockRestore();
    });
  });
});
