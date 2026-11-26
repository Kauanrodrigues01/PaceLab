import { z } from "zod";
import { PathIdSchema } from "@/lib/validations/taf";
import { AppError } from "./response";

/**
 * Faz o parse do JSON da requisição e valida contra um schema Zod.
 */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ body: unknown; data: z.infer<T> }> {
  const body: unknown = await request.json();
  const data = schema.parse(body);
  return { body, data };
}

/**
 * Faz o parse de um body JSON opcional (aceitando requisição vazia como `{}`),
 * lançando 400 INVALID_JSON em caso de sintaxe quebrada.
 */
export async function parseOptionalJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<{ body: unknown; data: z.infer<T> }> {
  const rawText = await request.text();
  let body: unknown = {};

  if (rawText.trim().length > 0) {
    try {
      body = JSON.parse(rawText);
    } catch {
      throw new AppError(
        "Corpo da requisição JSON inválido.",
        400,
        undefined,
        "INVALID_JSON"
      );
    }
  }

  const data = schema.parse(body);
  return { body, data };
}

/**
 * Extrai query parameters não-vazios da URL e valida com schema Zod.
 */
export function parseQueryParams<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): z.infer<T> {
  const { searchParams } = new URL(request.url, "http://localhost");
  const rawParams: Record<string, string> = {};

  searchParams.forEach((value, key) => {
    const trimmed = value.trim();
    if (trimmed.length > 0 && rawParams[key] === undefined) {
      rawParams[key] = trimmed;
    }
  });

  return schema.parse(rawParams);
}

/**
 * Valida o parâmetro dinâmico `[id]` das rotas REST.
 */
export function parsePathId(params: { id?: string }): string {
  const result = PathIdSchema.safeParse(params?.id);
  if (!result.success) {
    throw new AppError(
      result.error.issues[0]?.message || "Identificador inválido",
      400,
      undefined,
      "INVALID_PATH_ID"
    );
  }
  return result.data;
}

/**
 * Verifica se o payload bruto informado pelo cliente definiu explicitamente a chave.
 */
export function hasOwnDefinedField(rawBody: unknown, key: string): boolean {
  return Boolean(
    rawBody &&
      typeof rawBody === "object" &&
      Object.prototype.hasOwnProperty.call(rawBody, key) &&
      (rawBody as Record<string, unknown>)[key] !== undefined
  );
}

/**
 * Preserva os valores existentes para chaves condicionais omitidas no payload bruto
 * (usado em fluxos idempotentes `onDuplicate: "update"`).
 */
export function mergeDefinedFields<
  TData extends Record<string, unknown>,
  TExisting extends Record<string, unknown>
>(
  rawBody: unknown,
  incoming: TData,
  existing: TExisting,
  conditionalKeys: ReadonlyArray<keyof TData & keyof TExisting>,
  fallbacks?: Partial<Record<keyof TData, unknown>>
): TData {
  const merged = { ...incoming };
  for (const key of conditionalKeys) {
    if (!hasOwnDefinedField(rawBody, String(key))) {
      const existingVal = existing[key];
      merged[key] = (
        existingVal === undefined && fallbacks && key in fallbacks
          ? fallbacks[key]
          : existingVal
      ) as TData[typeof key];
    }
  }
  return merged;
}

/**
 * Mapeia somente campos explicitamente definidos no payload bruto e validados,
 * aplicando transformações opcionais por chave para updates parciais (`PUT`).
 */
export function resolveDefinedUpdateFields<
  TValidated extends Record<string, unknown>
>(
  rawBody: unknown,
  validated: TValidated,
  transforms?: Partial<{
    [K in keyof TValidated]: (value: Exclude<TValidated[K], undefined>) => unknown;
  }>
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(validated)) {
    if (value === undefined || !hasOwnDefinedField(rawBody, key)) continue;
    const transform = transforms?.[key as keyof TValidated];
    data[key] = transform
      ? transform(value as Exclude<TValidated[keyof TValidated], undefined>)
      : value;
  }
  return data;
}
