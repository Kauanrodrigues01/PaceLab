import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  zodToOpenApiSchema,
  createSuccessEnvelopeSchema,
  createPaginatedListResponseSchema,
  createJsonResponse,
  createErrorResponses,
  createPathIdParam,
  createSkipSheetsSyncParam,
  createPaginationParams,
  ERROR_COMPONENT_REFS,
} from "@/lib/swagger/builders";

describe("lib/swagger/builders", () => {
  describe("zodToOpenApiSchema", () => {
    it("normaliza union string/date, remove $schema/MAX_SAFE_INT e trata unknown nullable", () => {
      const schema = z.object({
        eventDate: z.union([z.string(), z.date()]).optional(),
        count: z.number().int().min(1).default(10),
        metadata: z.unknown().nullable().optional(),
        tags: z.array(z.string()).optional(),
        extra: z.record(z.string(), z.number()).optional(),
      });

      const openApi = zodToOpenApiSchema(schema, {
        stripDefaults: true,
        stripRequired: true,
      });

      expect(openApi.$schema).toBeUndefined();
      expect(openApi.required).toBeUndefined();

      const props = openApi.properties as Record<string, Record<string, unknown>>;
      expect(props.eventDate).toMatchObject({ type: "string", format: "date-time" });
      expect(props.count.default).toBeUndefined();
      expect(props.count.maximum).toBeUndefined();
      expect(props.metadata).toMatchObject({
        type: "object",
        nullable: true,
        additionalProperties: true,
      });
      expect(props.tags).toMatchObject({ type: "array", items: { type: "string" } });
      expect(props.extra).toMatchObject({
        type: "object",
        additionalProperties: { type: "number" },
      });
    });

    it("aplica omitProperties (removendo também de required), required customizado e propertyOverrides", () => {
      const schema = z.object({
        id: z.string(),
        title: z.string(),
        notes: z.string().optional(),
      });

      const omittedAllRequired = zodToOpenApiSchema(schema, {
        omitProperties: ["id", "title"],
        propertyOverrides: {
          notes: { description: "Observações do treino" },
          computed: { type: "number", example: 5.5 },
        },
      });

      const props = omittedAllRequired.properties as Record<string, Record<string, unknown>>;
      expect(props.id).toBeUndefined();
      expect(props.title).toBeUndefined();
      expect(props.notes).toMatchObject({ type: "string", description: "Observações do treino" });
      expect(props.computed).toEqual({ type: "number", example: 5.5 });
      expect(omittedAllRequired.required).toBeUndefined();

      const partialOmit = zodToOpenApiSchema(schema, {
        omitProperties: ["id"],
      });
      expect(partialOmit.required).toEqual(["title"]);

      const customRequired = zodToOpenApiSchema(schema, {
        required: ["notes"],
      });
      expect(customRequired.required).toEqual(["notes"]);
    });

    it("normaliza esquemas compostos (anyOf / oneOf) e arrays aninhados", () => {
      const schema = z.union([
        z.object({ kind: z.literal("a"), value: z.number().int().default(1) }),
        z.object({ kind: z.literal("b"), labels: z.array(z.string()) }),
      ]);

      const openApi = zodToOpenApiSchema(schema, { stripDefaults: true });
      expect(Array.isArray(openApi.anyOf)).toBe(true);
      const firstBranch = (openApi.anyOf as Array<Record<string, unknown>>)[0];
      const firstProps = firstBranch.properties as Record<string, Record<string, unknown>>;
      expect(firstProps.value.default).toBeUndefined();
    });
  });

  describe("Envelopes, respostas e parâmetros", () => {
    it("cria envelopes de sucesso simples e paginados", () => {
      const single = createSuccessEnvelopeSchema({ type: "string" });
      expect(single.required).toEqual(["success", "data", "timestamp"]);
      expect((single.properties as Record<string, unknown>).meta).toBeUndefined();

      const paginated = createPaginatedListResponseSchema({ $ref: "#/components/schemas/Item" });
      const props = paginated.properties as Record<string, Record<string, unknown>>;
      expect(props.data).toEqual({
        type: "array",
        items: { $ref: "#/components/schemas/Item" },
      });
      expect(props.meta).toBeDefined();
      expect(props.meta.required).toEqual(["limit", "nextCursor", "hasMore"]);
    });

    it("createJsonResponse referencia corretamente o schema em components/schemas", () => {
      expect(createJsonResponse("Sucesso", "TafGoalResponse")).toEqual({
        description: "Sucesso",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/TafGoalResponse" },
          },
        },
      });
    });

    it("createErrorResponses usa $ref padrão quando não há override e inline quando há descrição ou status fora do mapa", () => {
      const responses = createErrorResponses([400, 404, 413, 422, 503], {
        404: "Registro específico não encontrado",
        413: "Arquivo excede 4 MB",
      });

      expect(responses["400"]).toEqual({ $ref: ERROR_COMPONENT_REFS[400] });
      expect(responses["404"]).toMatchObject({
        description: "Registro específico não encontrado",
      });
      expect(responses["413"]).toMatchObject({ description: "Arquivo excede 4 MB" });
      expect(responses["422"]).toMatchObject({
        description: "Erro padronizado da API PaceLab.",
      });
      expect(responses["503"]).toMatchObject({
        description: "Erro padronizado da API PaceLab.",
      });
    });

    it("createPathIdParam, createSkipSheetsSyncParam e createPaginationParams produzem parâmetros válidos", () => {
      expect(createPathIdParam()).toMatchObject({
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 1, maxLength: 128 },
      });

      expect(createSkipSheetsSyncParam("Custom desc")).toMatchObject({
        name: "skipSheetsSync",
        in: "query",
        required: false,
        description: "Custom desc",
      });

      const basePagination = createPaginationParams(false);
      expect(basePagination.map((p) => p.name)).toEqual(["limit", "cursor"]);

      const withActivity = createPaginationParams(true);
      expect(withActivity.map((p) => p.name)).toEqual(["limit", "cursor", "activityType"]);
    });
  });
});
