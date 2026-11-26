import { NextResponse } from "next/server";
import { ApiResponse, apiSuccess } from "./response";

export interface PrismaCursorPaginationArgs {
  take: number;
  skip: number;
  cursor?: { id: string };
}

/**
 * Monta os argumentos padrão de paginação cursor-based para o Prisma ORM (`take = limit + 1`).
 */
export function getCursorPaginationPrismaArgs(
  limit: number,
  cursor?: string
): PrismaCursorPaginationArgs {
  return {
    take: limit + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  };
}

/**
 * Fatia o resultado do Prisma (`limit + 1`) e retorna `apiSuccess` com `meta: { limit, nextCursor, hasMore }`.
 */
export function buildCursorPaginatedResponse<T extends { id: string }>(
  items: T[],
  limit: number
): NextResponse<ApiResponse<T[]>> {
  const hasMore = items.length > limit;
  const paginatedItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor =
    hasMore && paginatedItems.length > 0
      ? paginatedItems[paginatedItems.length - 1].id
      : null;

  return apiSuccess(paginatedItems, 200, {
    limit,
    nextCursor,
    hasMore,
  });
}
