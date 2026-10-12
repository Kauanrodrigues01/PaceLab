import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { formatZodErrors, FormattedZodError } from "@/lib/validations/taf";

// ─── Contrato de Dados da API PaceLab ──────────────────────────────────────────

export interface ApiMeta {
  totalCount?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: FormattedZodError[] | Record<string, unknown> | unknown;
  meta?: ApiMeta;
  timestamp: string;
}

// ─── Helpers de Resposta HTTP ──────────────────────────────────────────────────

/**
 * Cria uma resposta HTTP padronizada de sucesso (200, 201, etc.)
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
 * Cria uma resposta HTTP padronizada de erro (400, 404, 500, etc.)
 */
export function apiError(
  message: string,
  status = 400,
  details?: FormattedZodError[] | Record<string, unknown> | unknown
): NextResponse<ApiResponse<null>> {
  let hasDetails = false;
  if (Array.isArray(details)) {
    hasDetails = details.length > 0;
  } else if (details && typeof details === "object") {
    hasDetails = Object.keys(details).length > 0;
  }

  return NextResponse.json(
    {
      success: false,
      error: message,
      details: hasDetails ? (details as ApiResponse["details"]) : undefined,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

// ─── Classe de Erro Customizado ────────────────────────────────────────────────

export class AppError extends Error {
  statusCode: number;
  details?: FormattedZodError[];

  constructor(message: string, statusCode = 400, details?: FormattedZodError[]) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
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
      return apiError(firstMessage, 400, details);
    }

    // 2. Erros Conhecidos do Prisma ORM
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return apiError("Registro não encontrado no banco de dados", 404);
      }
      if (error.code === "P2002") {
        return apiError("Conflito: já existe um registro com estes dados únicos", 409);
      }
      return apiError("Falha na operação com o banco de dados", 500);
    }

    // 3. Erro customizado da aplicação (AppError)
    if (error instanceof AppError) {
      return apiError(error.message, error.statusCode, error.details);
    }

    // 4. JSON Malformado no Body da Requisição
    if (error instanceof SyntaxError) {
      return apiError("Corpo da requisição com formato JSON inválido", 400);
    }

    // 5. Falha de Conexão com o Banco de Dados
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return apiError("Não foi possível conectar ao banco de dados Supabase", 503);
    }

    // 6. Erro genérico inesperado
    console.error("[PaceLab API Error]:", error);
    const message = error instanceof Error ? error.message : "Erro interno do servidor";
    return apiError(message, 500);
  }
}
