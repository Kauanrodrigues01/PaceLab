import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ApiResponse, apiConflict } from "./response";

export function resolveActivityConflictMessage(
  source?: string | null,
  externalId?: string | null
): string {
  if (source === "fit_upload" || externalId?.startsWith("fit_")) {
    return "Este arquivo .FIT já foi importado";
  }
  if (source === "sheets" || externalId?.startsWith("sheets_")) {
    return "Este registro do Google Sheets já foi importado";
  }
  return "Este arquivo .GPX já foi importado";
}

/**
 * Constrói uma resposta HTTP 409 Conflict consistente para duplicidade de `externalId`
 * tanto na verificação prévia quanto no tratamento de race condition `P2002`.
 */
export function buildDuplicateExternalIdResponse(
  source?: string | null,
  externalId?: string | null,
  existingId?: string | null
): NextResponse<ApiResponse<null>> {
  return apiConflict(
    resolveActivityConflictMessage(source, externalId),
    {
      ...(existingId ? { existingId } : {}),
      code: "DUPLICATE_EXTERNAL_ID",
    },
    "DUPLICATE_EXTERNAL_ID"
  );
}

/**
 * Verifica se o erro lançado pelo Prisma é violação de unicidade (`P2002`),
 * restringindo a `external_id`/`externalId` quando `meta.target` estiver disponível.
 */
export function isPrismaUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }

  const target = (err.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.some((item) =>
      String(item).toLowerCase().includes("external")
    );
  }
  if (typeof target === "string" && target.trim().length > 0) {
    return target.toLowerCase().includes("external");
  }
  return true;
}
