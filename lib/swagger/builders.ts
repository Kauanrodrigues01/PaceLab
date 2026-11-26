import { z } from "zod";
import { ACTIVITY_TYPES } from "@/types";
import { PaginationQuerySchema } from "@/lib/validations/taf";

export type OpenApiSchema = Record<string, unknown>;
export type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema: OpenApiSchema;
};

interface ZodToOpenApiOptions {
  required?: string[];
  stripRequired?: boolean;
  stripDefaults?: boolean;
  omitProperties?: string[];
  propertyOverrides?: Record<string, OpenApiSchema>;
}

const MAX_SAFE_INT = 9007199254740991;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringDateUnion(node: Record<string, unknown>): boolean {
  if (!Array.isArray(node.anyOf) || node.anyOf.length !== 2) return false;
  const hasString = node.anyOf.some(
    (entry) => isPlainObject(entry) && entry.type === "string"
  );
  const hasEmptyAny = node.anyOf.some(
    (entry) => isPlainObject(entry) && Object.keys(entry).length === 0
  );
  return hasString && hasEmptyAny;
}

function normalizeJsonSchemaNode(
  rawNode: unknown,
  options?: { stripDefaults?: boolean }
): unknown {
  if (Array.isArray(rawNode)) {
    return rawNode.map((item) => normalizeJsonSchemaNode(item, options));
  }
  if (!isPlainObject(rawNode)) return rawNode;

  const node: Record<string, unknown> = { ...rawNode };
  delete node.$schema;

  if (options?.stripDefaults) {
    delete node.default;
  }

  if (node.maximum === MAX_SAFE_INT) {
    delete node.maximum;
  }

  // Normaliza z.union([z.string(), z.date()]) para string OpenAPI date-time
  if (isStringDateUnion(node)) {
    delete node.anyOf;
    node.type = "string";
    node.format = "date-time";
  }

  // Normaliza campos z.unknown().nullable() sem tipo explícito para object nullable
  if (
    !node.type &&
    !node.anyOf &&
    !node.oneOf &&
    !node.allOf &&
    !node.$ref &&
    node.nullable === true
  ) {
    node.type = "object";
    node.additionalProperties = true;
  }

  if (isPlainObject(node.properties)) {
    const nextProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.properties)) {
      nextProps[key] = normalizeJsonSchemaNode(value, options);
    }
    node.properties = nextProps;
  }

  if (node.items !== undefined) {
    node.items = normalizeJsonSchemaNode(node.items, options);
  }

  if (isPlainObject(node.additionalProperties)) {
    node.additionalProperties = normalizeJsonSchemaNode(
      node.additionalProperties,
      options
    );
  }

  for (const compositeKey of ["anyOf", "oneOf", "allOf"] as const) {
    if (Array.isArray(node[compositeKey])) {
      node[compositeKey] = (node[compositeKey] as unknown[]).map((entry) =>
        normalizeJsonSchemaNode(entry, options)
      );
    }
  }

  return node;
}

/**
 * Converte um schema Zod v4 diretamente para OpenAPI 3.0 Schema Object,
 * eliminando divergências manuais entre validação runtime e documentação Swagger.
 */
export function zodToOpenApiSchema(
  schema: z.ZodTypeAny,
  options: ZodToOpenApiOptions = {}
): OpenApiSchema {
  const raw = z.toJSONSchema(schema, {
    target: "openapi-3.0",
    unrepresentable: "any",
    io: "input",
  });

  const normalized = normalizeJsonSchemaNode(raw, {
    stripDefaults: options.stripDefaults,
  }) as OpenApiSchema;

  const omittedKeys = options.omitProperties ?? [];
  const omittedSet = new Set(omittedKeys);

  if (isPlainObject(normalized.properties)) {
    const props = { ...(normalized.properties as Record<string, OpenApiSchema>) };

    for (const omitKey of omittedKeys) {
      delete props[omitKey];
    }

    if (options.propertyOverrides) {
      for (const [key, override] of Object.entries(options.propertyOverrides)) {
        props[key] = isPlainObject(props[key])
          ? { ...props[key], ...override }
          : override;
      }
    }

    normalized.properties = props;
  }

  if (options.stripRequired) {
    delete normalized.required;
  } else if (options.required) {
    normalized.required = options.required;
  } else if (Array.isArray(normalized.required) && omittedSet.size > 0) {
    const filteredRequired = (normalized.required as string[]).filter(
      (key) => !omittedSet.has(key)
    );
    if (filteredRequired.length > 0) {
      normalized.required = filteredRequired;
    } else {
      delete normalized.required;
    }
  }

  return normalized;
}

/**
 * Envolve um schema de `data` no envelope padrão `{ success, data, meta?, timestamp }`.
 */
export function createSuccessEnvelopeSchema(
  dataSchema: OpenApiSchema,
  options: { withMeta?: boolean } = {}
): OpenApiSchema {
  const properties: Record<string, OpenApiSchema> = {
    success: { type: "boolean", example: true },
    data: dataSchema,
    ...(options.withMeta
      ? {
          meta: {
            type: "object",
            properties: {
              limit: { type: "integer", example: 50 },
              nextCursor: { type: "string", nullable: true },
              hasMore: { type: "boolean", example: false },
            },
            required: ["limit", "nextCursor", "hasMore"],
          },
        }
      : {}),
    timestamp: { type: "string", format: "date-time" },
  };

  return {
    type: "object",
    properties,
    required: ["success", "data", "timestamp"],
  };
}

/**
 * Cria o schema de resposta paginada por cursor (`data[]` + `meta`).
 */
export function createPaginatedListResponseSchema(
  itemSchema: OpenApiSchema
): OpenApiSchema {
  return createSuccessEnvelopeSchema(
    {
      type: "array",
      items: itemSchema,
    },
    { withMeta: true }
  );
}

/**
 * Retorna um schema de resposta JSON referenciando `#/components/schemas/<name>`.
 */
export function createJsonResponse(
  description: string,
  schemaName: string
): Record<string, unknown> {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          $ref: `#/components/schemas/${schemaName}`,
        },
      },
    },
  };
}

export const ERROR_COMPONENT_REFS = {
  400: "#/components/responses/ValidationError",
  404: "#/components/responses/NotFoundError",
  409: "#/components/responses/ConflictError",
  500: "#/components/responses/InternalError",
} as const;

type StandardErrorRefStatus = keyof typeof ERROR_COMPONENT_REFS;

/**
 * Monta mapa de respostas de erro padronizadas para operações OpenAPI.
 */
export function createErrorResponses(
  statuses: Array<400 | 401 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503>,
  inlineDescriptions: Partial<Record<number, string>> = {}
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const status of statuses) {
    if (status in ERROR_COMPONENT_REFS && !inlineDescriptions[status]) {
      result[String(status)] = {
        $ref: ERROR_COMPONENT_REFS[status as StandardErrorRefStatus],
      };
      continue;
    }

    result[String(status)] = {
      description:
        inlineDescriptions[status] || "Erro padronizado da API PaceLab.",
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/ApiErrorResponse",
          },
        },
      },
    };
  }

  return result;
}

/**
 * Parâmetro inline de path `{id}` alinhado a `PathIdSchema` (`1` a `128` caracteres).
 */
export function createPathIdParam(
  description = "Identificador único do registro (1 a 128 caracteres)"
): OpenApiParameter {
  return {
    name: "id",
    in: "path",
    required: true,
    description,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
}

/**
 * Parâmetro inline `skipSheetsSync` (mantido inline para preservar inspeção direta de query params).
 */
export function createSkipSheetsSyncParam(
  description = "Quando true/1, evita chamada automática ao Google Sheets (útil em restauração em lote)."
): OpenApiParameter {
  return {
    name: "skipSheetsSync",
    in: "query",
    required: false,
    description,
    schema: { type: "boolean", default: false },
  };
}

/**
 * Parâmetros inline de paginação por cursor derivados de `PaginationQuerySchema`.
 */
export function createPaginationParams(
  includeActivityType = false
): OpenApiParameter[] {
  const derived = zodToOpenApiSchema(PaginationQuerySchema);
  const props = (derived.properties ?? {}) as Record<string, OpenApiSchema>;

  const params: OpenApiParameter[] = [
    {
      name: "limit",
      in: "query",
      required: false,
      description:
        "Quantidade máxima de registros a retornar (1 a 100, padrão 50).",
      schema: props.limit ?? {
        type: "integer",
        default: 50,
        minimum: 1,
        maximum: 100,
      },
    },
    {
      name: "cursor",
      in: "query",
      required: false,
      description: "ID do cursor para paginação baseada em cursor.",
      schema: props.cursor ?? { type: "string" },
    },
  ];

  if (includeActivityType) {
    params.push({
      name: "activityType",
      in: "query",
      required: false,
      description: "Filtra por tipo de atividade.",
      schema: props.activityType ?? {
        type: "string",
        enum: [...ACTIVITY_TYPES],
      },
    });
  }

  return params;
}
