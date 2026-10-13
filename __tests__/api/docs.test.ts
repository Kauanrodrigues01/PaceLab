import { describe, it, expect } from "vitest";
import { GET as getDocsSpec } from "@/app/api/docs/spec/route";
import { swaggerSpec } from "@/lib/swagger/spec";

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

  it("garante que 100% das rotas do sistema estão mapeadas na especificação", () => {
    const requiredPaths = [
      "/api/taf/goals",
      "/api/taf/attempts",
      "/api/taf/attempts/{id}",
      "/api/taf/trainings",
      "/api/taf/trainings/{id}",
      "/api/profile",
      "/api/profile/weight",
      "/api/profile/weight/{id}",
      "/api/taf/health",
    ];

    for (const path of requiredPaths) {
      expect(swaggerSpec.paths).toHaveProperty(path);
    }
  });

  it("garante suporte aos métodos HTTP corretos para cada rota", () => {
    const paths = swaggerSpec.paths as Record<string, Record<string, unknown>>;

    // Goals: GET e POST
    expect(paths["/api/taf/goals"]).toHaveProperty("get");
    expect(paths["/api/taf/goals"]).toHaveProperty("post");

    // Attempts: GET e POST; {id}: GET, PUT, DELETE
    expect(paths["/api/taf/attempts"]).toHaveProperty("get");
    expect(paths["/api/taf/attempts"]).toHaveProperty("post");
    expect(paths["/api/taf/attempts/{id}"]).toHaveProperty("get");
    expect(paths["/api/taf/attempts/{id}"]).toHaveProperty("put");
    expect(paths["/api/taf/attempts/{id}"]).toHaveProperty("delete");

    // Trainings: GET e POST; {id}: GET, PUT, DELETE
    expect(paths["/api/taf/trainings"]).toHaveProperty("get");
    expect(paths["/api/taf/trainings"]).toHaveProperty("post");
    expect(paths["/api/taf/trainings/{id}"]).toHaveProperty("get");
    expect(paths["/api/taf/trainings/{id}"]).toHaveProperty("put");
    expect(paths["/api/taf/trainings/{id}"]).toHaveProperty("delete");

    // Profile: GET e PUT
    expect(paths["/api/profile"]).toHaveProperty("get");
    expect(paths["/api/profile"]).toHaveProperty("put");

    // Weight: GET e POST; {id}: DELETE
    expect(paths["/api/profile/weight"]).toHaveProperty("get");
    expect(paths["/api/profile/weight"]).toHaveProperty("post");
    expect(paths["/api/profile/weight/{id}"]).toHaveProperty("delete");

    // Health: GET
    expect(paths["/api/taf/health"]).toHaveProperty("get");
  });

  it("contém schemas para metas multimodais e diário de treinos com calorias", () => {
    const schemas = swaggerSpec.components.schemas as Record<string, unknown>;

    expect(schemas).toHaveProperty("TafGoalInput");
    expect(schemas).toHaveProperty("TafGoalResponse");
    expect(schemas).toHaveProperty("CreateTrainingInput");
    expect(schemas).toHaveProperty("TrainingSessionResponse");
    expect(schemas).toHaveProperty("ProfileInput");
    expect(schemas).toHaveProperty("ProfileResponse");
    expect(schemas).toHaveProperty("WeightInput");
  });
});
