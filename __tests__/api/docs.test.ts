import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { GET as getDocsSpec } from "@/app/api/docs/spec/route";
import { swaggerSpec } from "@/lib/swagger/spec";

function collectApiRoutePaths(dir: string, prefix = "/api"): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const collected: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith("[") && entry.name.endsWith("]")
        ? `{${entry.name.slice(1, -1)}}`
        : entry.name;
      collected.push(...collectApiRoutePaths(fullPath, `${prefix}/${segment}`));
    } else if (entry.isFile() && entry.name === "route.ts") {
      collected.push(prefix);
    }
  }

  return collected;
}

describe("Documentação Swagger / OpenAPI 3.0 (/api/docs/spec)", () => {
  it("GET retorna a especificação OpenAPI 3.0 com status 200 e headers corretos", async () => {
    const res = await getDocsSpec();
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");

    const data = await res.json();
    expect(data.openapi).toBe("3.0.3");
    expect(data.info.title).toBe("PaceLab API");
    expect(data.info.version).toBe("1.0.0");
  });

  it("garante via varredura dinâmica que 100% das rotas de app/api estão mapeadas na especificação", () => {
    const appApiDir = path.resolve(process.cwd(), "app/api");
    const discoveredPaths = collectApiRoutePaths(appApiDir).filter(
      (routePath) => routePath !== "/api/docs/spec"
    );

    expect(discoveredPaths.length).toBeGreaterThanOrEqual(13);
    for (const routePath of discoveredPaths) {
      expect(swaggerSpec.paths).toHaveProperty(routePath);
    }
  });

  it("garante suporte aos métodos HTTP corretos para cada rota", () => {
    const paths = swaggerSpec.paths as Record<string, Record<string, Record<string, unknown>>>;

    // Goals: GET e POST
    expect(paths["/api/taf/goals"]).toHaveProperty("get");
    expect(paths["/api/taf/goals"]).toHaveProperty("post");

    // Attempts: GET e POST (200 e 201); {id}: GET, PUT, DELETE
    expect(paths["/api/taf/attempts"]).toHaveProperty("get");
    expect(paths["/api/taf/attempts"]).toHaveProperty("post");
    expect(paths["/api/taf/attempts"].post.responses).toHaveProperty("200");
    expect(paths["/api/taf/attempts"].post.responses).toHaveProperty("201");
    expect(paths["/api/taf/attempts/{id}"]).toHaveProperty("get");
    expect(paths["/api/taf/attempts/{id}"]).toHaveProperty("put");
    expect(paths["/api/taf/attempts/{id}"]).toHaveProperty("delete");

    // Trainings: GET e POST (200 e 201); {id}: GET, PUT, DELETE
    expect(paths["/api/taf/trainings"]).toHaveProperty("get");
    expect(paths["/api/taf/trainings"]).toHaveProperty("post");
    expect(paths["/api/taf/trainings"].post.responses).toHaveProperty("200");
    expect(paths["/api/taf/trainings"].post.responses).toHaveProperty("201");
    expect(paths["/api/taf/trainings/{id}"]).toHaveProperty("get");
    expect(paths["/api/taf/trainings/{id}"]).toHaveProperty("put");
    expect(paths["/api/taf/trainings/{id}"]).toHaveProperty("delete");

    // Parse de Atividades (.FIT / .GPX) & Alias depreciado
    expect(paths["/api/training-sessions/parse-activity"]).toHaveProperty("post");
    expect(paths["/api/taf/trainings/gpx-preview"]).toHaveProperty("post");

    // Profile: GET e PUT
    expect(paths["/api/profile"]).toHaveProperty("get");
    expect(paths["/api/profile"]).toHaveProperty("put");

    // Weight: GET (com 400 para ?limit) e POST; {id}: DELETE
    expect(paths["/api/profile/weight"]).toHaveProperty("get");
    expect(paths["/api/profile/weight"].get.responses).toHaveProperty("400");
    expect(paths["/api/profile/weight"]).toHaveProperty("post");
    expect(paths["/api/profile/weight/{id}"]).toHaveProperty("delete");

    // Sync Google Sheets: GET e POST + Cron semanal GET
    expect(paths["/api/sync/sheets"]).toHaveProperty("get");
    expect(paths["/api/sync/sheets"]).toHaveProperty("post");
    expect(paths["/api/cron/sync-weekly-plan"]).toHaveProperty("get");
    expect(paths["/api/cron/sync-weekly-plan"].get.responses).toHaveProperty("200");
    expect(paths["/api/cron/sync-weekly-plan"].get.responses).toHaveProperty("401");
    expect(paths["/api/cron/sync-weekly-plan"].get.responses).toHaveProperty("503");

    // Weekly Plan: GET
    expect(paths["/api/weekly-plan"]).toHaveProperty("get");

    // Health: GET
    expect(paths["/api/taf/health"]).toHaveProperty("get");
  });

  it("valida integridade referencial ($ref) e ausência de anomalias OpenAPI 3.0.3", () => {
    const refs: string[] = [];
    const anomalies: string[] = [];

    function walk(node: unknown, nodePath: string) {
      if (Array.isArray(node)) {
        node.forEach((item, index) => walk(item, `${nodePath}[${index}]`));
        return;
      }
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (typeof obj.$ref === "string") {
        refs.push(`${nodePath} -> ${obj.$ref}`);
      }
      if ("$schema" in obj) {
        anomalies.push(`${nodePath}: possui $schema residual`);
      }
      if (Array.isArray(obj.allOf) && obj.nullable === true && obj.type === undefined) {
        anomalies.push(`${nodePath}: allOf+nullable sem type explícito`);
      }
      for (const [key, value] of Object.entries(obj)) {
        walk(value, `${nodePath}.${key}`);
      }
    }

    walk(swaggerSpec, "root");
    expect(anomalies).toEqual([]);
    expect(refs.length).toBeGreaterThan(0);

    for (const refEntry of refs) {
      const ref = refEntry.split(" -> ")[1];
      const segments = ref.replace(/^#\//, "").split("/");
      let cursor: unknown = swaggerSpec;
      for (const segment of segments) {
        cursor =
          cursor && typeof cursor === "object"
            ? (cursor as Record<string, unknown>)[segment]
            : undefined;
      }
      expect(cursor, `Referência quebrada: ${refEntry}`).toBeDefined();
    }
  });

  it("contém schemas para metas multimodais e diário de treinos com calorias e telemetria GPX", () => {
    const schemas = swaggerSpec.components.schemas as Record<string, Record<string, unknown>>;

    expect(schemas).toHaveProperty("TafGoalInput");
    expect(schemas).toHaveProperty("TafGoalResponse");
    expect(schemas).toHaveProperty("CreateTrainingInput");
    expect(schemas).toHaveProperty("TrainingSessionResponse");
    expect(schemas).toHaveProperty("SplitDetailSchema");
    expect(schemas).toHaveProperty("ProfileInput");
    expect(schemas).toHaveProperty("ProfileResponse");
    expect(schemas).toHaveProperty("WeightInput");
    expect(schemas).toHaveProperty("SheetsSyncRequest");
    expect(schemas).toHaveProperty("SheetsSyncStatusResponse");
    expect(schemas).toHaveProperty("SheetsSyncReportResponse");
    expect(schemas).toHaveProperty("WeeklyPlanResponse");

    const sheetsReportProps = (
      (schemas.SheetsSyncReportResponse.properties as Record<string, Record<string, unknown>>)
        .data.properties as Record<string, Record<string, unknown>>
    );
    expect(sheetsReportProps).toHaveProperty("weeklyPlan");

    const trainingProps = schemas.CreateTrainingInput.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(trainingProps.activityType.enum).toEqual([
      "rodagem_leve",
      "corrida_continua",
      "tempo_run",
      "corrida_intervalada",
      "longao",
      "caminhada",
    ]);
    expect(trainingProps).toHaveProperty("source");
    expect(trainingProps).toHaveProperty("externalId");
    expect(trainingProps).toHaveProperty("elapsedSeconds");
    expect(trainingProps).toHaveProperty("avgHeartRate");
    expect(trainingProps).toHaveProperty("maxHeartRate");
    expect(trainingProps).toHaveProperty("elevationGainM");
    expect(trainingProps).toHaveProperty("avgCadence");
    expect(trainingProps).toHaveProperty("shoeName");
    expect(swaggerSpec.components.responses).toHaveProperty("ConflictError");

    const paths = swaggerSpec.paths as Record<string, Record<string, Record<string, unknown>>>;
    const attemptPutParams = paths["/api/taf/attempts/{id}"].put.parameters as Array<{
      name: string;
    }>;
    const trainingPutParams = paths["/api/taf/trainings/{id}"].put.parameters as Array<{
      name: string;
    }>;
    const trainingDeleteParams = paths["/api/taf/trainings/{id}"].delete.parameters as Array<{
      name: string;
    }>;
    expect(attemptPutParams.some((p) => p.name === "skipSheetsSync")).toBe(true);
    expect(trainingPutParams.some((p) => p.name === "skipSheetsSync")).toBe(true);
    expect(trainingDeleteParams.some((p) => p.name === "skipSheetsSync")).toBe(true);

    const healthSchema = schemas.HealthResponse as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(healthSchema.required).toEqual(["success", "data", "timestamp"]);
    expect(healthSchema.properties).toHaveProperty("data");

    const apiErrorProps = schemas.ApiErrorResponse.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(apiErrorProps).toHaveProperty("code");
    expect(Array.isArray(apiErrorProps.details.oneOf)).toBe(true);

    // Contratos corrigidos na Fase 2 (Zod -> OpenAPI)
    const profileInputProps = schemas.ProfileInput.properties as Record<string, unknown>;
    expect(profileInputProps).toHaveProperty("currentWeightKg");
    expect(profileInputProps).toHaveProperty("heightCm");
    expect(profileInputProps).toHaveProperty("gender");
    expect(profileInputProps).not.toHaveProperty("weightKg");
    expect(profileInputProps).not.toHaveProperty("biologicalSex");

    const trainingsListProps = schemas.TrainingsListResponse.properties as Record<
      string,
      unknown
    >;
    const attemptsListProps = schemas.TafAttemptsListResponse.properties as Record<
      string,
      unknown
    >;
    expect(trainingsListProps).toHaveProperty("meta");
    expect(trainingsListProps).not.toHaveProperty("pagination");
    expect(attemptsListProps).toHaveProperty("meta");
    expect(attemptsListProps).not.toHaveProperty("pagination");

    const deleteProps = (
      schemas.DeleteSuccessResponse.properties as Record<string, { properties: Record<string, unknown> }>
    ).data.properties;
    expect(deleteProps).toHaveProperty("deletedId");
    expect(deleteProps).toHaveProperty("deleted");

    const goalDataProps = (
      schemas.TafGoalResponse.properties as Record<string, { properties: Record<string, unknown> }>
    ).data.properties;
    expect(goalDataProps).toHaveProperty("pullupMinSeconds");
    expect(goalDataProps).toHaveProperty("pullupTargetSeconds");

    const trainingsMetaProps = (
      schemas.TrainingsListResponse.properties as Record<
        string,
        { properties: Record<string, unknown> }
      >
    ).meta.properties;
    expect(trainingsMetaProps).toHaveProperty("limit");
    expect(trainingsMetaProps).toHaveProperty("nextCursor");
    expect(trainingsMetaProps).toHaveProperty("hasMore");
    expect(trainingsMetaProps).not.toHaveProperty("totalCount");

    const attemptDataProps = (
      schemas.TafAttemptResponse.properties as Record<
        string,
        { properties: Record<string, unknown> }
      >
    ).data.properties;
    expect(attemptDataProps).not.toHaveProperty("isPersonalRecord");
    expect(attemptDataProps).not.toHaveProperty("deltaPreviousMeters");
    expect(attemptDataProps).not.toHaveProperty("deficitTargetMeters");

    const previewDataProps = (
      schemas.ActivityParsePreviewResponse.properties as Record<
        string,
        { properties: Record<string, Record<string, unknown>> }
      >
    ).data.properties;
    expect(previewDataProps).toHaveProperty("rawType");
    expect(previewDataProps).toHaveProperty("avgTemperatureC");
    expect(previewDataProps).toHaveProperty("splits");
    expect(previewDataProps).toHaveProperty("laps");
    expect(previewDataProps).toHaveProperty("pointCount");
    expect(previewDataProps).toHaveProperty("warnings");
    expect(Array.isArray(previewDataProps.suggestedActivityType.enum)).toBe(true);

    const profileDataProps = (
      schemas.ProfileResponse.properties as Record<
        string,
        { properties: Record<string, Record<string, unknown>> }
      >
    ).data.properties;
    expect(profileDataProps.birthDate.format).toBe("date-time");
    expect(profileDataProps).toHaveProperty("_count");

    const updateAttemptProps = schemas.UpdateTafAttemptInput.properties as Record<
      string,
      Record<string, unknown>
    >;
    const updateTrainingProps = schemas.UpdateTrainingInput.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(updateAttemptProps.targetDurationSeconds).not.toHaveProperty("default");
    expect(updateTrainingProps.activityType).not.toHaveProperty("default");

    expect(paths["/api/taf/trainings/gpx-preview"].post.deprecated).toBe(true);
  });
});
