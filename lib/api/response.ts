import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { formatZodErrors, FormattedZodError } from "@/lib/validations/taf";

// ─── Contrato de Dados e Códigos de Erro da API PaceLab ──────────────────────

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "INVALID_JSON"
  | "INVALID_PATH_ID"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE_EXTERNAL_ID"
  | "PAYLOAD_TOO_LARGE"
  | "UNPROCESSABLE_ENTITY"
  | "DATABASE_UNAVAILABLE"
  | "SERVICE_UNAVAILABLE"
  | "MISSING_FILE"
  | "TOO_MANY_FILES"
  | "INVALID_EXTENSION"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "PARSE_ERROR"
  | "SHEETS_NOT_CONFIGURED"
  | "SHEETS_QUOTA_EXCEEDED"
  | "SHEETS_PERMISSION_DENIED"
  | "SHEETS_NOT_FOUND"
  | "SHEETS_UNAVAILABLE"
  | "SHEETS_UPSTREAM_ERROR"
  | "INTERNAL_ERROR"
  | (string & {});

export interface ApiMeta {
  limit?: number;
  totalCount?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: ApiErrorCode;
  details?: FormattedZodError[] | Record<string, unknown> | unknown;
  meta?: ApiMeta;
  timestamp: string;
}

export interface DeleteResultPayload {
  deletedId: string;
  deleted: true;
}

// ─── Helpers de Resposta HTTP ──────────────────────────────────────────────────

/**
 * Cria uma resposta HTTP padronizada de sucesso (200, 201, etc.).
 */
export function apiSuccess<T>(
  data: T,
  status = 200,
  meta?: ApiMeta
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/**
 * Cria uma resposta HTTP padronizada de exclusão de recurso por ID.
 */
export function apiDeleted(
  deletedId: string,
  status = 200
): NextResponse<ApiResponse<DeleteResultPayload>> {
  return apiSuccess({ deletedId, deleted: true }, status);
}

function extractCodeFromDetails(details: unknown): ApiErrorCode | undefined {
  if (
    details &&
    !Array.isArray(details) &&
    typeof details === "object" &&
    "code" in details &&
    typeof (details as { code?: unknown }).code === "string"
  ) {
    return (details as { code: ApiErrorCode }).code;
  }
  return undefined;
}

/**
 * Cria uma resposta HTTP padronizada de erro (400, 404, 500, etc.).
 * Propaga `code` explícito (ou extraído de `details.code`) para o nível raiz mantendo retrocompatibilidade.
 */
export function apiError(
  message: string,
  status = 400,
  details?: FormattedZodError[] | Record<string, unknown> | unknown,
  code?: ApiErrorCode
): NextResponse<ApiResponse<null>> {
  let hasDetails = false;
  if (Array.isArray(details)) {
    hasDetails = details.length > 0;
  } else if (details && typeof details === "object") {
    hasDetails = Object.keys(details).length > 0;
  }

  const resolvedCode = code ?? extractCodeFromDetails(details);

  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(resolvedCode ? { code: resolvedCode } : {}),
      details: hasDetails ? (details as ApiResponse["details"]) : undefined,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/**
 * Cria uma resposta HTTP 400 Bad Request padronizada.
 */
export function apiBadRequest(
  message = "Requisição inválida",
  details?: FormattedZodError[] | Record<string, unknown> | unknown,
  code?: ApiErrorCode
): NextResponse<ApiResponse<null>> {
  return apiError(
    message,
    400,
    details,
    code ?? extractCodeFromDetails(details) ?? "BAD_REQUEST"
  );
}

/**
 * Cria uma resposta HTTP 404 Not Found padronizada.
 */
export function apiNotFound(
  message = "Registro não encontrado no banco de dados",
  details?: FormattedZodError[] | Record<string, unknown> | unknown,
  code?: ApiErrorCode
): NextResponse<ApiResponse<null>> {
  return apiError(
    message,
    404,
    details,
    code ?? extractCodeFromDetails(details) ?? "NOT_FOUND"
  );
}

/**
 * Cria uma resposta HTTP 409 Conflict padronizada (ex: duplicidade de arquivo/externalId).
 */
export function apiConflict(
  message = "Já existe um registro importado com este identificador externo",
  details?: FormattedZodError[] | Record<string, unknown> | unknown,
  code?: ApiErrorCode
): NextResponse<ApiResponse<null>> {
  return apiError(message, 409, details, code ?? extractCodeFromDetails(details) ?? "CONFLICT");
}

/**
 * Cria uma resposta HTTP 413 Payload Too Large padronizada (ex: arquivo > 4 MB).
 */
export function apiPayloadTooLarge(
  message = "Arquivo excede o limite máximo permitido (4 MB)",
  details?: FormattedZodError[] | Record<string, unknown> | unknown,
  code?: ApiErrorCode
): NextResponse<ApiResponse<null>> {
  return apiError(
    message,
    413,
    details,
    code ?? extractCodeFromDetails(details) ?? "PAYLOAD_TOO_LARGE"
  );
}

/**
 * Cria uma resposta HTTP 422 Unprocessable Entity padronizada (ex: erro semântico no .FIT/.GPX).
 */
export function apiUnprocessable(
  message: string,
  details?: FormattedZodError[] | Record<string, unknown> | unknown,
  code?: ApiErrorCode
): NextResponse<ApiResponse<null>> {
  return apiError(
    message,
    422,
    details,
    code ?? extractCodeFromDetails(details) ?? "UNPROCESSABLE_ENTITY"
  );
}

/**
 * Cria uma resposta HTTP 503 Service Unavailable padronizada.
 */
export function apiServiceUnavailable(
  message = "Serviço temporariamente indisponível",
  details?: FormattedZodError[] | Record<string, unknown> | unknown,
  code?: ApiErrorCode
): NextResponse<ApiResponse<null>> {
  return apiError(
    message,
    503,
    details,
    code ?? extractCodeFromDetails(details) ?? "SERVICE_UNAVAILABLE"
  );
}

// ─── Classe de Erro Customizado ────────────────────────────────────────────────

export class AppError extends Error {
  statusCode: number;
  code?: ApiErrorCode;
  details?: FormattedZodError[] | Record<string, unknown> | unknown;

  constructor(
    message: string,
    statusCode = 400,
    details?: FormattedZodError[] | Record<string, unknown> | unknown,
    code?: ApiErrorCode
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code ?? extractCodeFromDetails(details);
    this.details = details;
  }
}

// ─── Wrapper de Execução e Captura Centralizada ─────────────────────────────────

/**
 * Encapsula a execução de um Route Handler do Next.js capturando
 * automaticamente erros de Zod, Prisma e exceções não tratadas.
 */
export async function withApiHandler<T>(
  handler: () => Promise<NextResponse<ApiResponse<T>>>
): Promise<NextResponse<ApiResponse<T> | ApiResponse<null>>> {
  try {
    return await handler();
  } catch (error: unknown) {
    // 1. Validação com Zod
    if (error instanceof ZodError) {
      const details = formatZodErrors(error);
      const firstMessage = details[0]?.message || "Dados enviados inválidos";
      return apiBadRequest(firstMessage, details, "VALIDATION_ERROR");
    }

    // 2. Erros Conhecidos do Prisma ORM
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return apiNotFound("Registro não encontrado no banco de dados");
      }
      if (error.code === "P2002") {
        const rawTarget = error.meta?.target;
        const targetStr = Array.isArray(rawTarget)
          ? rawTarget.join(",")
          : typeof rawTarget === "string"
            ? rawTarget
            : "";
        if (
          targetStr.includes("external_id") ||
          targetStr.includes("externalId") ||
          error.message.includes("external_id") ||
          error.message.includes("externalId")
        ) {
          return apiConflict(
            "Já existe um registro importado com este identificador externo",
            { code: "DUPLICATE_EXTERNAL_ID" },
            "DUPLICATE_EXTERNAL_ID"
          );
        }
        return apiConflict(
          "Conflito: já existe um registro com estes dados únicos",
          undefined,
          "CONFLICT"
        );
      }
      return apiError(
        "Falha na operação com o banco de dados",
        500,
        undefined,
        "INTERNAL_ERROR"
      );
    }

    // 3. Erro customizado da aplicação (AppError)
    if (error instanceof AppError) {
      return apiError(error.message, error.statusCode, error.details, error.code);
    }

    // 4. JSON Malformado no Body da Requisição
    if (error instanceof SyntaxError) {
      return apiBadRequest(
        "Corpo da requisição com formato JSON inválido",
        undefined,
        "INVALID_JSON"
      );
    }

    // 5. Falha de Conexão com o Banco de Dados
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return apiServiceUnavailable(
        "Não foi possível conectar ao banco de dados Supabase",
        undefined,
        "DATABASE_UNAVAILABLE"
      );
    }

    // 6. Erro genérico inesperado
    console.error("[PaceLab API Error]:", error);
    const message = error instanceof Error ? error.message : "Erro interno do servidor";
    return apiError(message, 500, undefined, "INTERNAL_ERROR");
  }
}
