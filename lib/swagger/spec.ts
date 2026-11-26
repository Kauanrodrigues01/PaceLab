import {
  ACTIVITY_SOURCES,
  ACTIVITY_TYPES,
  SHEETS_SYNC_DIRECTIONS,
  WEEKLY_PLAN_STATUSES,
  WEIGHT_SOURCES,
} from "@/types";
import {
  CreateTafAttemptSchema,
  CreateTrainingSessionSchema,
  CreateWeightRecordSchema,
  LapDetailSchema,
  SheetsSyncRequestSchema,
  SplitDetailSchema,
  TafGoalInputSchema,
  UpdateTafAttemptSchema,
  UpdateTrainingSessionSchema,
  UserProfileInputSchema,
  WeeklyPlanQuerySchema,
  WeightListQuerySchema,
} from "@/lib/validations/taf";
import {
  createErrorResponses,
  createJsonResponse,
  createPaginatedListResponseSchema,
  createPaginationParams,
  createPathIdParam,
  createSkipSheetsSyncParam,
  createSuccessEnvelopeSchema,
  OpenApiSchema,
  zodToOpenApiSchema,
} from "./builders";

// ─── Schemas Derivados Diretamente do Zod (Single Source of Truth) ──────────

const tafGoalInputSchema = zodToOpenApiSchema(TafGoalInputSchema, {
  propertyOverrides: {
    institutionName: { example: "Polícia Militar SP" },
    minDistanceMeters: { example: 2400 },
    targetDistanceMeters: { example: 2600 },
    targetDurationMinutes: { example: 12 },
    targetExamDate: { format: "date", example: "2026-12-15" },
    pullupType: { example: "dinamica" },
    pullupMinReps: { example: 3 },
    pullupTargetReps: { example: 5 },
    pushupMinReps: { example: 20 },
    pushupTargetReps: { example: 30 },
    absMinReps: { example: 30 },
    absTargetReps: { example: 40 },
  },
});

const tafGoalResponseBase = zodToOpenApiSchema(TafGoalInputSchema, {
  stripDefaults: true,
  propertyOverrides: {
    institutionName: { example: "Polícia Militar SP" },
    minDistanceMeters: { example: 2400 },
    targetDistanceMeters: { example: 2600 },
    targetDurationMinutes: { example: 12 },
    targetExamDate: { format: "date-time", example: "2026-12-15T00:00:00.000Z" },
  },
});

const lapDetailSchema = zodToOpenApiSchema(LapDetailSchema, {
  propertyOverrides: {
    lapNumber: { example: 1 },
    distanceMeters: { example: 400 },
    durationSeconds: { example: 112 },
    paceFormatted: { example: "4:40" },
  },
});

const splitDetailSchema = zodToOpenApiSchema(SplitDetailSchema, {
  propertyOverrides: {
    kilometer: { example: 1 },
    distanceKm: { example: 1.0 },
    durationSeconds: { example: 300 },
    paceSeconds: { example: 300 },
    paceFormatted: { example: "5:00" },
    avgHeartRate: { example: 162 },
    elevationDiffM: { example: 4.5 },
  },
});

const createTafAttemptInputSchema = zodToOpenApiSchema(CreateTafAttemptSchema, {
  propertyOverrides: {
    source: { example: "manual" },
    distanceMeters: { example: 2450 },
    actualDurationSeconds: { example: 720 },
    speedKmh: { example: 12.25 },
    paceSeconds: { example: 294 },
    paceFormatted: { example: "4:54" },
    locationType: { example: "pista_400m" },
    shoeName: { example: "Nike Vaporfly 3" },
    avgHeartRate: { example: 172 },
    maxHeartRate: { example: 188 },
    laps: {
      type: "array",
      items: lapDetailSchema,
    },
  },
});

const tafAttemptResponseBase = zodToOpenApiSchema(CreateTafAttemptSchema, {
  stripDefaults: true,
  omitProperties: ["onDuplicate"],
  propertyOverrides: {
    id: { description: "Identificador único do simulado." },
    source: { example: "manual" },
    distanceMeters: { example: 2450 },
    actualDurationSeconds: { example: 720 },
    speedKmh: { example: 12.25 },
    paceSeconds: { example: 294 },
    paceFormatted: { example: "4:54" },
    locationType: { example: "pista_400m" },
    shoeName: { example: "Nike Vaporfly 3" },
    avgHeartRate: { example: 172 },
    maxHeartRate: { example: 188 },
    laps: {
      type: "array",
      items: lapDetailSchema,
    },
  },
});

const updateTafAttemptInputSchema = zodToOpenApiSchema(UpdateTafAttemptSchema, {
  stripDefaults: true,
  omitProperties: ["id", "userId"],
  propertyOverrides: {
    distanceMeters: { example: 2500 },
    actualDurationSeconds: { example: 720 },
    locationType: { example: "pista_400m" },
    shoeName: { example: "Nike Vaporfly 3" },
    avgHeartRate: { example: 174 },
    maxHeartRate: { example: 190 },
    laps: {
      type: "array",
      items: lapDetailSchema,
    },
  },
});

const createTrainingInputSchema = zodToOpenApiSchema(
  CreateTrainingSessionSchema,
  {
    propertyOverrides: {
      id: { description: "Identificador opcional para upsert idempotente." },
      source: { example: "manual" },
      activityType: { example: "corrida_continua" },
      distanceKm: { example: 5.0 },
      durationSeconds: { example: 1500 },
      elapsedSeconds: { example: 1560 },
      speedKmh: { example: 12.0 },
      paceSeconds: { example: 300 },
      paceFormatted: { example: "5:00" },
      avgHeartRate: { example: 160 },
      maxHeartRate: { example: 178 },
      elevationGainM: { example: 35.0 },
      avgCadence: { example: 174 },
      shoeName: { example: "Nike Pegasus 40" },
      perceivedEffort: { example: 7 },
      bodyWeightKg: { example: 75 },
      activeCalories: { example: 312 },
      totalCalories: { example: 345 },
      metValue: { example: 11.5 },
      calorieMethod: { example: "compendium_2024_met" },
      calorieSource: { example: "calculated_met" },
      splits: {
        type: "array",
        items: { $ref: "#/components/schemas/SplitDetailSchema" },
      },
    },
  }
);

const trainingResponseBase = zodToOpenApiSchema(CreateTrainingSessionSchema, {
  stripDefaults: true,
  omitProperties: ["onDuplicate"],
  propertyOverrides: {
    id: { description: "Identificador único da sessão de treino." },
    source: { example: "manual" },
    activityType: { example: "corrida_continua" },
    distanceKm: { example: 5.0 },
    durationSeconds: { example: 1500 },
    elapsedSeconds: { example: 1560 },
    speedKmh: { example: 12.0 },
    paceSeconds: { example: 300 },
    paceFormatted: { example: "5:00" },
    avgHeartRate: { example: 160 },
    maxHeartRate: { example: 178 },
    elevationGainM: { example: 35.0 },
    avgCadence: { example: 174 },
    shoeName: { example: "Nike Pegasus 40" },
    perceivedEffort: { example: 7 },
    bodyWeightKg: { example: 75 },
    activeCalories: { example: 312 },
    totalCalories: { example: 345 },
    metValue: { example: 11.5 },
    calorieMethod: { example: "compendium_2024_met" },
    calorieSource: { example: "calculated_met" },
    splits: {
      type: "array",
      items: { $ref: "#/components/schemas/SplitDetailSchema" },
    },
  },
});

const updateTrainingInputSchema = zodToOpenApiSchema(
  UpdateTrainingSessionSchema,
  {
    stripDefaults: true,
    omitProperties: ["id", "userId"],
    propertyOverrides: {
      splits: {
        type: "array",
        items: { $ref: "#/components/schemas/SplitDetailSchema" },
      },
    },
  }
);

const profileInputSchema = zodToOpenApiSchema(UserProfileInputSchema, {
  omitProperties: ["id", "userId"],
  propertyOverrides: {
    name: { example: "Atleta PaceLab" },
    heightCm: { example: 178 },
    currentWeightKg: { example: 75.5 },
    birthDate: { format: "date", example: "1998-05-14" },
    gender: { example: "masculino" },
  },
});

const profileResponseBase = zodToOpenApiSchema(UserProfileInputSchema, {
  stripDefaults: true,
  propertyOverrides: {
    name: { example: "Atleta PaceLab" },
    heightCm: { example: 178 },
    currentWeightKg: { example: 75.5 },
    birthDate: { format: "date-time", example: "1998-05-14T00:00:00.000Z" },
    gender: { example: "masculino" },
  },
});

const weightInputSchema = zodToOpenApiSchema(CreateWeightRecordSchema, {
  omitProperties: ["id", "profileId"],
  propertyOverrides: {
    weightKg: { example: 74.8 },
    source: { example: "weekly_prompt" },
  },
});

const weightResponseBase = zodToOpenApiSchema(CreateWeightRecordSchema, {
  stripDefaults: true,
  propertyOverrides: {
    weightKg: { example: 74.8 },
    source: { example: "weekly_prompt" },
  },
});

const sheetsSyncRequestSchema = zodToOpenApiSchema(SheetsSyncRequestSchema);
const weightListQuerySchema = zodToOpenApiSchema(WeightListQuerySchema);
const weightListLimitParamSchema = (
  (weightListQuerySchema.properties as Record<string, OpenApiSchema> | undefined)
    ?.limit ?? { type: "integer", default: 52, minimum: 1, maximum: 365 }
) as OpenApiSchema;
const weeklyPlanQuerySchema = zodToOpenApiSchema(WeeklyPlanQuerySchema);
const weeklyPlanWeekStartParamSchema = (
  (weeklyPlanQuerySchema.properties as Record<string, OpenApiSchema> | undefined)
    ?.weekStart ?? { type: "string", format: "date" }
) as OpenApiSchema;

const multipartActivityRequestBody = {
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: { type: "string", format: "binary" },
            description: "1 ou 2 arquivos (.fit e/ou .gpx, máx. 4 MB cada).",
          },
          file: {
            type: "string",
            format: "binary",
            description: "Campo alternativo aceito para envio de arquivo único.",
          },
          fitFile: {
            type: "string",
            format: "binary",
            description: "Campo alternativo opcional para arquivo .FIT.",
          },
          gpxFile: {
            type: "string",
            format: "binary",
            description: "Campo alternativo opcional para arquivo .GPX.",
          },
        },
      },
    },
  },
};

const parseActivityResponses = {
  "200": createJsonResponse(
    "Atividade analisada com sucesso.",
    "ActivityParsePreviewResponse"
  ),
  ...createErrorResponses([400, 413, 422, 500], {
    413: "Arquivo excede o limite máximo de 4 MB.",
    422: "Erro semântico no arquivo .FIT/.GPX ou esporte incompatível.",
  }),
};

/**
 * Especificação OpenAPI 3.0 oficial do PaceLab
 * Schemas de entrada e query derivados automaticamente de `lib/validations/taf.ts`.
 */
export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "PaceLab API",
    version: "1.0.0",
    description:
      "Documentação oficial da API do PaceLab - Plataforma de Alta Performance para Corredores e Candidatos ao Teste de Aptidão Física (TAF). Inclui rotas de metas multimodais, simulados TAF, diário de treinos com gasto calórico (Compêndio 2024), perfil biométrico e pesagens.",
    contact: {
      name: "PaceLab Engineering Team",
      url: "https://github.com/Kauanrodrigues01/PaceLab",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: "/",
      description: "Ambiente Atual (Relativo)",
    },
  ],
  tags: [
    {
      name: "Metas TAF",
      description:
        "Configuração e consulta de metas de corrida, barra, flexão e abdominal do edital.",
    },
    {
      name: "Simulados TAF",
      description:
        "Registro, consulta e gestão de tentativas do teste de corrida de 12 minutos.",
    },
    {
      name: "Diário de Treinos",
      description:
        "Registro e análise de sessões de treino com métricas de ritmo, esforço (RPE) e calorias.",
    },
    {
      name: "Perfil do Atleta",
      description:
        "Dados biométricos do atleta (peso, altura, idade, sexo biológico e histórico de peso).",
    },
    {
      name: "Health & Diagnóstico",
      description:
        "Status de saúde do serviço e verificação de conexão com o banco de dados.",
    },
    {
      name: "Sincronização Google Sheets",
      description:
        "Sincronização manual e bidirecional PostgreSQL ↔ Google Sheets (Log_Treinos, Simulados_TAF, Perfil_e_Metas e Plano_Semanal).",
    },
    {
      name: "Plano Semanal",
      description:
        "Consulta do plano prescrito semanal (Plano_Semanal), aderência consolidada, média móvel de 4 semanas e treinos extras.",
    },
  ],
  paths: {
    "/api/taf/goals": {
      get: {
        tags: ["Metas TAF"],
        summary: "Obter meta TAF ativa",
        description:
          "Retorna a meta configurada mais recente para o candidato ou os padrões oficiais caso nenhuma tenha sido definida.",
        responses: {
          "200": createJsonResponse(
            "Meta TAF recuperada com sucesso.",
            "TafGoalResponse"
          ),
          ...createErrorResponses([500]),
        },
      },
      post: {
        tags: ["Metas TAF"],
        summary: "Criar ou atualizar meta TAF multimodal",
        description:
          "Salva ou substitui a meta ativa do edital (distância mínima de corte, meta de segurança, barra fixa, flexões e abdominais).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TafGoalInput" },
            },
          },
        },
        responses: {
          "200": createJsonResponse(
            "Meta salva com sucesso.",
            "TafGoalResponse"
          ),
          ...createErrorResponses([400, 500]),
        },
      },
    },

    "/api/taf/attempts": {
      get: {
        tags: ["Simulados TAF"],
        summary: "Listar tentativas de simulados TAF",
        description:
          "Retorna a lista paginada por cursor de simulados realizados (`meta.limit`, `meta.nextCursor`, `meta.hasMore`), incluindo dados de voltas (`laps`) e telemetria.",
        parameters: createPaginationParams(false),
        responses: {
          "200": createJsonResponse(
            "Lista de simulados recuperada com sucesso.",
            "TafAttemptsListResponse"
          ),
          ...createErrorResponses([400, 500]),
        },
      },
      post: {
        tags: ["Simulados TAF"],
        summary: "Registrar novo simulado TAF",
        description:
          "Calcula pace, velocidade média, pontuação e registra a tentativa no histórico persistido (retorna 200 quando `onDuplicate='update'` atualiza registro existente).",
        parameters: [createSkipSheetsSyncParam()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateTafAttemptInput" },
            },
          },
        },
        responses: {
          "200": createJsonResponse(
            "Simulado existente atualizado via onDuplicate='update'.",
            "TafAttemptResponse"
          ),
          "201": createJsonResponse(
            "Simulado registrado com sucesso.",
            "TafAttemptResponse"
          ),
          ...createErrorResponses([400, 409, 500]),
        },
      },
    },

    "/api/taf/attempts/{id}": {
      get: {
        tags: ["Simulados TAF"],
        summary: "Buscar simulado por ID",
        parameters: [createPathIdParam("Identificador único do simulado (1 a 128 caracteres)")],
        responses: {
          "200": createJsonResponse(
            "Simulado encontrado.",
            "TafAttemptResponse"
          ),
          ...createErrorResponses([400, 404, 500]),
        },
      },
      put: {
        tags: ["Simulados TAF"],
        summary: "Atualizar simulado existente",
        parameters: [createPathIdParam(), createSkipSheetsSyncParam()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateTafAttemptInput" },
            },
          },
        },
        responses: {
          "200": createJsonResponse(
            "Simulado atualizado com sucesso.",
            "TafAttemptResponse"
          ),
          ...createErrorResponses([400, 404, 500]),
        },
      },
      delete: {
        tags: ["Simulados TAF"],
        summary: "Excluir simulado",
        parameters: [createPathIdParam()],
        responses: {
          "200": createJsonResponse(
            "Simulado excluído com sucesso.",
            "DeleteSuccessResponse"
          ),
          ...createErrorResponses([400, 404, 500]),
        },
      },
    },

    "/api/taf/trainings": {
      get: {
        tags: ["Diário de Treinos"],
        summary: "Listar sessões de treino",
        description:
          "Retorna treinos paginados por cursor (`meta.limit`, `meta.nextCursor`, `meta.hasMore`) ordenados cronologicamente com splits e gasto calórico.",
        parameters: createPaginationParams(true),
        responses: {
          "200": createJsonResponse(
            "Lista de treinos recuperada com sucesso.",
            "TrainingsListResponse"
          ),
          ...createErrorResponses([400, 500]),
        },
      },
      post: {
        tags: ["Diário de Treinos"],
        summary: "Registrar nova sessão de treino",
        description:
          "Grava o treino (manual ou importado via .FIT/.GPX do Strava) calculando ritmo, gasto calórico ativo e total segundo o Compêndio de Atividades Físicas 2024, executa reconciliação local com `Plano_Semanal` e agenda espelhamento no Google Sheets (salvo `skipSheetsSync=true`). Retorna 200 quando `onDuplicate='update'` atualiza registro existente.",
        parameters: [createSkipSheetsSyncParam()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateTrainingInput" },
            },
          },
        },
        responses: {
          "200": createJsonResponse(
            "Sessão existente atualizada via onDuplicate='update'.",
            "TrainingSessionResponse"
          ),
          "201": createJsonResponse(
            "Sessão registrada com sucesso.",
            "TrainingSessionResponse"
          ),
          ...createErrorResponses([400, 409, 500]),
        },
      },
    },

    "/api/taf/trainings/{id}": {
      get: {
        tags: ["Diário de Treinos"],
        summary: "Buscar treino por ID",
        parameters: [createPathIdParam("Identificador único da sessão de treino (1 a 128 caracteres)")],
        responses: {
          "200": createJsonResponse(
            "Treino encontrado.",
            "TrainingSessionResponse"
          ),
          ...createErrorResponses([400, 404, 500]),
        },
      },
      put: {
        tags: ["Diário de Treinos"],
        summary: "Atualizar sessão de treino",
        description:
          "Atualiza os campos da sessão e executa reconciliação local com `Plano_Semanal` (revalidando vínculos existentes ou encontrando novas correspondências).",
        parameters: [createPathIdParam(), createSkipSheetsSyncParam()],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateTrainingInput" },
            },
          },
        },
        responses: {
          "200": createJsonResponse(
            "Treino atualizado com sucesso.",
            "TrainingSessionResponse"
          ),
          ...createErrorResponses([400, 404, 500]),
        },
      },
      delete: {
        tags: ["Diário de Treinos"],
        summary: "Excluir sessão de treino",
        description:
          "Remove a sessão do banco, limpa vínculos órfãos no `Plano_Semanal` (revertendo itens afetados para `Planejado` ou `Perdido`) e atualiza o Google Sheets salvo `skipSheetsSync=true`.",
        parameters: [
          createPathIdParam(),
          createSkipSheetsSyncParam(
            "Quando true, ignora a remoção e atualização automática na planilha Google Sheets."
          ),
        ],
        responses: {
          "200": createJsonResponse(
            "Treino excluído com sucesso.",
            "DeleteSuccessResponse"
          ),
          ...createErrorResponses([400, 404, 500]),
        },
      },
    },

    "/api/training-sessions/parse-activity": {
      post: {
        tags: ["Diário de Treinos"],
        summary:
          "Analisar e mesclar arquivos de treino (.FIT prioritário + .GPX complementar/fallback)",
        description:
          "Recebe 1 ou 2 arquivos via `multipart/form-data` (`.fit` isolado, `.gpx` isolado ou `.fit` + `.gpx` do mesmo treino). Aplica prioridade absoluta do `.FIT` (`@garmin/fitsdk`) para telemetria, tempos, distância, splits e calorias, complementando com `<trk><name>` e `elevationGainM` do `.GPX` quando aplicável, e verifica duplicidade no banco (`alreadyExists`).",
        requestBody: multipartActivityRequestBody,
        responses: parseActivityResponses,
      },
    },

    "/api/taf/trainings/gpx-preview": {
      post: {
        tags: ["Diário de Treinos"],
        deprecated: true,
        summary:
          "[Obsoleto] Alias compatível para análise de arquivos .FIT / .GPX",
        description:
          "Rota espelho depreciada mantida apenas para retrocompatibilidade. Prefira `POST /api/training-sessions/parse-activity` em novas integrações.",
        requestBody: multipartActivityRequestBody,
        responses: parseActivityResponses,
      },
    },

    "/api/profile": {
      get: {
        tags: ["Perfil do Atleta"],
        summary: "Obter perfil biométrico",
        description:
          "Retorna os dados antropométricos atuais do atleta (`currentWeightKg`, `heightCm`, `birthDate`, `gender`).",
        responses: {
          "200": createJsonResponse(
            "Perfil obtido com sucesso.",
            "ProfileResponse"
          ),
          ...createErrorResponses([500]),
        },
      },
      put: {
        tags: ["Perfil do Atleta"],
        summary: "Criar ou atualizar perfil biométrico",
        description:
          "Atualiza os dados antropométricos e registra nova pesagem caso `currentWeightKg` seja alterado.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProfileInput" },
            },
          },
        },
        responses: {
          "200": createJsonResponse(
            "Perfil atualizado com sucesso.",
            "ProfileResponse"
          ),
          ...createErrorResponses([400, 500]),
        },
      },
    },

    "/api/profile/weight": {
      get: {
        tags: ["Perfil do Atleta"],
        summary: "Listar histórico de pesagens",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Quantidade máxima de registros retornados (1 a 365, padrão 52).",
            schema: weightListLimitParamSchema,
          },
        ],
        responses: {
          "200": createJsonResponse(
            "Histórico de peso recuperado com sucesso.",
            "WeightListResponse"
          ),
          ...createErrorResponses([400, 500]),
        },
      },
      post: {
        tags: ["Perfil do Atleta"],
        summary: "Registrar nova pesagem corporal",
        description:
          "Adiciona uma entrada no histórico de peso e atualiza `currentWeightKg` no perfil do atleta.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WeightInput" },
            },
          },
        },
        responses: {
          "201": createJsonResponse(
            "Pesagem registrada com sucesso.",
            "WeightRecordResponse"
          ),
          ...createErrorResponses([400, 500]),
        },
      },
    },

    "/api/profile/weight/{id}": {
      delete: {
        tags: ["Perfil do Atleta"],
        summary: "Excluir registro de pesagem",
        parameters: [createPathIdParam("Identificador único da pesagem (1 a 128 caracteres)")],
        responses: {
          "200": createJsonResponse(
            "Registro de peso excluído com sucesso.",
            "DeleteSuccessResponse"
          ),
          ...createErrorResponses([400, 404, 500]),
        },
      },
    },

    "/api/sync/sheets": {
      get: {
        tags: ["Sincronização Google Sheets"],
        summary:
          "Consultar status da integração e pendências Google Sheets",
        description:
          "Retorna se as credenciais Base64 e `GOOGLE_SHEETS_SPREADSHEET_ID` estão configuradas e conta registros pendentes no PostgreSQL sem consumir quota da Google API.",
        responses: {
          "200": createJsonResponse(
            "Status de sincronização obtido com sucesso.",
            "SheetsSyncStatusResponse"
          ),
          ...createErrorResponses([500]),
        },
      },
      post: {
        tags: ["Sincronização Google Sheets"],
        summary: "Executar sincronização manual com Google Sheets",
        description:
          "Executa reconciliação bidirecional (`bidirectional`), envio (`push`) ou importação (`pull`) com a planilha Google Sheets. Sincroniza `Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas` e importa/atualiza o plano prescrito em `Plano_Semanal`.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SheetsSyncRequest" },
            },
          },
        },
        responses: {
          "200": createJsonResponse(
            "Sincronização concluída com sucesso.",
            "SheetsSyncReportResponse"
          ),
          ...createErrorResponses([400, 429, 500, 502, 503], {
            429: "Limite de requisições (quota) da API Google Sheets excedido.",
            502: "Erro de permissão (403/401) ou recurso não encontrado (404) na planilha.",
            503: "Integração Google Sheets não configurada ou temporariamente indisponível.",
          }),
        },
      },
    },

    "/api/weekly-plan": {
      get: {
        tags: ["Plano Semanal"],
        summary: "Consultar plano semanal e aderência consolidada",
        description:
          "Retorna os treinos prescritos da semana (segunda a domingo em America/Fortaleza), resumo de aderência, média móvel das até 4 últimas semanas com plano, sessões vinculadas e treinos extras realizados.",
        parameters: [
          {
            name: "weekStart",
            in: "query",
            required: false,
            description:
              "Data de referência (YYYY-MM-DD, preferencialmente segunda-feira) para consultar a respectiva semana em America/Fortaleza.",
            schema: {
              ...weeklyPlanWeekStartParamSchema,
              format: "date",
              example: "2026-10-12",
            },
          },
        ],
        responses: {
          "200": createJsonResponse(
            "Snapshot semanal consolidado.",
            "WeeklyPlanResponse"
          ),
          ...createErrorResponses([400, 500]),
        },
      },
    },

    "/api/taf/health": {
      get: {
        tags: ["Health & Diagnóstico"],
        summary: "Verificação de integridade e conectividade",
        description:
          "Executa query leve `SELECT 1` no banco PostgreSQL (Supabase) e valida tempo de resposta.",
        responses: {
          "200": createJsonResponse(
            "Sistema saudável e banco operacional.",
            "HealthResponse"
          ),
          ...createErrorResponses([503], {
            503: "Falha de conectividade com o banco de dados.",
          }),
        },
      },
    },
  },

  components: {
    responses: {
      ValidationError: createJsonResponse(
        "Erro de validação nos dados fornecidos.",
        "ApiErrorResponse"
      ),
      NotFoundError: createJsonResponse(
        "Recurso não encontrado.",
        "ApiErrorResponse"
      ),
      ConflictError: createJsonResponse(
        "Conflito de duplicidade (ex.: arquivo .FIT/.GPX já importado com o mesmo externalId).",
        "ApiErrorResponse"
      ),
      InternalError: createJsonResponse(
        "Erro interno do servidor.",
        "ApiErrorResponse"
      ),
    },
    schemas: {
      ApiErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "string",
            example: "Dados de entrada inválidos",
          },
          code: {
            type: "string",
            description: "Código máquina estável para tratamento no cliente.",
            example: "VALIDATION_ERROR",
          },
          details: {
            oneOf: [
              {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: {
                      type: "string",
                      example: "targetDistanceMeters",
                    },
                    message: {
                      type: "string",
                      example:
                        "A distância alvo deve ser de no mínimo 500 metros",
                    },
                  },
                },
              },
              {
                type: "object",
                additionalProperties: true,
                example: {
                  code: "SHEETS_NOT_CONFIGURED",
                  sheetsConfigured: false,
                },
              },
            ],
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "error", "timestamp"],
      },

      DeleteSuccessResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          deletedId: { type: "string" },
          deleted: { type: "boolean", example: true },
        },
        required: ["deletedId", "deleted"],
      }),

      HealthResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          status: { type: "string", enum: ["connected"], example: "connected" },
          orm: { type: "string", example: "Prisma" },
          database: { type: "string", example: "PostgreSQL" },
          latencyMs: { type: "number", example: 42 },
          sheetsConfigured: { type: "boolean", example: true },
        },
        required: ["status", "orm", "database", "latencyMs", "sheetsConfigured"],
      }),

      SheetsSyncRequest: sheetsSyncRequestSchema,

      SheetsSyncStatusResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          configured: { type: "boolean", example: true },
          error: { type: "string" },
          pendingTrainingsCount: { type: "integer", example: 3 },
          pendingAttemptsCount: { type: "integer", example: 1 },
          totalPendingCount: { type: "integer", example: 4 },
        },
        required: [
          "configured",
          "pendingTrainingsCount",
          "pendingAttemptsCount",
          "totalPendingCount",
        ],
      }),

      SheetsSyncReportResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          direction: { type: "string", enum: [...SHEETS_SYNC_DIRECTIONS] },
          forceFullResync: { type: "boolean" },
          pulledUpdated: { type: "integer" },
          pulledCreated: { type: "integer" },
          pulledLinked: { type: "integer" },
          pushedAppended: { type: "integer" },
          pushedUpdated: { type: "integer" },
          tafPulledUpdated: { type: "integer" },
          tafPulledCreated: { type: "integer" },
          tafPulledLinked: { type: "integer" },
          tafPushedAppended: { type: "integer" },
          tafPushedUpdated: { type: "integer" },
          profileSynced: { type: "boolean" },
          weeklyPlan: {
            type: "object",
            properties: {
              imported: { type: "integer" },
              updated: { type: "integer" },
              removed: { type: "integer" },
              matched: { type: "integer" },
              missed: { type: "integer" },
              pushed: { type: "integer" },
              sheetMissingOrEmpty: { type: "boolean" },
            },
          },
          skipped: { type: "integer" },
          warnings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tab: {
                  type: "string",
                  enum: [
                    "Log_Treinos",
                    "Simulados_TAF",
                    "Perfil_e_Metas",
                    "Plano_Semanal",
                  ],
                },
                rowNumber: { type: "integer" },
                message: { type: "string" },
              },
            },
          },
          durationMs: { type: "integer" },
          syncedAt: { type: "string", format: "date-time" },
        },
      }),

      TafGoalInput: tafGoalInputSchema,

      TafGoalResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string", nullable: true },
          ...(tafGoalResponseBase.properties as Record<string, OpenApiSchema>),
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      }),

      CreateTafAttemptInput: createTafAttemptInputSchema,
      UpdateTafAttemptInput: updateTafAttemptInputSchema,

      TafAttemptResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          ...(tafAttemptResponseBase.properties as Record<string, OpenApiSchema>),
          source: {
            type: "string",
            enum: [...ACTIVITY_SOURCES],
            example: "manual",
          },
          targetDurationSeconds: { type: "integer", example: 720 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      }),

      TafAttemptsListResponse: createPaginatedListResponseSchema({
        $ref: "#/components/schemas/TafAttemptResponse/properties/data",
      }),

      SplitDetailSchema: splitDetailSchema,
      CreateTrainingInput: createTrainingInputSchema,
      UpdateTrainingInput: updateTrainingInputSchema,

      TrainingSessionResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          ...(trainingResponseBase.properties as Record<string, OpenApiSchema>),
          source: {
            type: "string",
            enum: [...ACTIVITY_SOURCES],
            example: "manual",
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      }),

      TrainingsListResponse: createPaginatedListResponseSchema({
        $ref: "#/components/schemas/TrainingSessionResponse/properties/data",
      }),

      ProfileInput: profileInputSchema,

      ProfileResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          ...(profileResponseBase.properties as Record<string, OpenApiSchema>),
          id: { type: "string" },
          _count: {
            type: "object",
            properties: {
              weightRecords: { type: "integer", example: 5 },
            },
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "createdAt", "updatedAt"],
      }),

      WeightInput: weightInputSchema,

      WeightRecordResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          ...(weightResponseBase.properties as Record<string, OpenApiSchema>),
          id: { type: "string" },
          profileId: { type: "string" },
          recordedAt: { type: "string", format: "date-time" },
          source: {
            type: "string",
            enum: [...WEIGHT_SOURCES],
            example: "weekly_prompt",
          },
          createdAt: { type: "string", format: "date-time" },
        },
      }),

      WeightListResponse: createSuccessEnvelopeSchema({
        type: "array",
        items: {
          $ref: "#/components/schemas/WeightRecordResponse/properties/data",
        },
      }),

      ActivityParsePreviewResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["fit_upload", "gpx_upload"],
            example: "fit_upload",
          },
          filesUsed: {
            type: "array",
            items: { type: "string", enum: ["fit", "gpx"] },
            example: ["fit", "gpx"],
          },
          name: {
            type: "string",
            nullable: true,
            example: "Rodagem Matinal",
          },
          titleSource: {
            type: "string",
            enum: ["metadata", "filename"],
            nullable: true,
            example: "filename",
          },
          rawType: {
            type: "string",
            nullable: true,
            example: "running",
          },
          sourceActivityKind: {
            type: "string",
            enum: ["run", "walk", "unknown"],
          },
          isIndoor: { type: "boolean", example: false },
          startedAt: { type: "string", format: "date-time" },
          distanceKm: { type: "number", example: 5.0 },
          durationSeconds: { type: "integer", example: 1500 },
          elapsedSeconds: { type: "integer", example: 1525 },
          speedKmh: { type: "number", example: 12.0 },
          paceSeconds: { type: "integer", example: 300 },
          paceFormatted: { type: "string", example: "5:00" },
          avgHeartRate: {
            type: "integer",
            nullable: true,
            example: 162,
          },
          maxHeartRate: {
            type: "integer",
            nullable: true,
            example: 179,
          },
          avgCadence: { type: "integer", nullable: true, example: 174 },
          elevationGainM: {
            type: "number",
            nullable: true,
            example: 32,
          },
          activeCalories: {
            type: "integer",
            nullable: true,
            example: 365,
          },
          avgTemperatureC: {
            type: "number",
            nullable: true,
            example: 24.5,
          },
          splits: {
            type: "array",
            items: { $ref: "#/components/schemas/SplitDetailSchema" },
          },
          laps: {
            type: "array",
            items: lapDetailSchema,
          },
          externalId: { type: "string", example: "fit_a1b2c3d4..." },
          pointCount: { type: "integer", example: 942 },
          warnings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string", example: "HR_OUTLIER_CLAMPED" },
                message: { type: "string" },
                count: { type: "integer" },
              },
              required: ["code", "message"],
            },
          },
          alreadyExists: { type: "boolean", example: false },
          existingTrainingId: {
            type: "string",
            nullable: true,
            example: null,
          },
          alreadyExistsAttempt: { type: "boolean", example: false },
          existingAttemptId: {
            type: "string",
            nullable: true,
            example: null,
          },
          tafWindow: {
            type: "object",
            nullable: true,
            description:
              "Melhor janela contínua de 12 minutos (720s) extraída automaticamente para importação como Simulado TAF",
            properties: {
              targetDurationSeconds: { type: "integer", example: 720 },
              actualDurationSeconds: { type: "integer", example: 720 },
              distanceMeters: { type: "integer", example: 2580 },
              speedKmh: { type: "number", example: 12.9 },
              paceSeconds: { type: "integer", example: 279 },
              paceFormatted: { type: "string", example: "4:39" },
              avgHeartRate: {
                type: "integer",
                nullable: true,
                example: 174,
              },
              maxHeartRate: {
                type: "integer",
                nullable: true,
                example: 189,
              },
              windowStartOffsetSeconds: { type: "number", example: 120 },
              windowEndOffsetSeconds: { type: "number", example: 840 },
              isShorterThanTarget: { type: "boolean", example: false },
              laps: {
                type: "array",
                items: lapDetailSchema,
              },
            },
          },
          suggestedActivityType: {
            type: "string",
            enum: [...ACTIVITY_TYPES],
            nullable: true,
            example: "corrida_continua",
          },
          suggestedNotes: { type: "string", example: "Rodagem Matinal" },
          allowedActivityTypes: {
            type: "array",
            items: { type: "string", enum: [...ACTIVITY_TYPES] },
          },
        },
      }),

      WeeklyPlanResponse: createSuccessEnvelopeSchema({
        type: "object",
        properties: {
          weekStart: {
            type: "string",
            format: "date",
            example: "2026-10-12",
          },
          weekEnd: {
            type: "string",
            format: "date",
            example: "2026-10-18",
          },
          weekLabel: { type: "string", example: "12/10 – 18/10" },
          isCurrentWeek: { type: "boolean", example: true },
          hasNextPlannedWeek: { type: "boolean", example: false },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                planExternalId: {
                  type: "string",
                  example: "plan-20261012-rodagem_leve",
                },
                plannedDate: {
                  type: "string",
                  format: "date",
                  example: "2026-10-12",
                },
                dayOfWeek: { type: "string", example: "Segunda" },
                activityType: { type: "string", example: "Rodagem Leve" },
                isRestDay: { type: "boolean", example: false },
                targetDistanceKm: {
                  type: "number",
                  nullable: true,
                  example: 8,
                },
                targetPaceFormatted: {
                  type: "string",
                  nullable: true,
                  example: "5:40",
                },
                description: { type: "string", nullable: true },
                status: {
                  type: "string",
                  enum: [...WEEKLY_PLAN_STATUSES],
                },
                matchedSessionId: { type: "string", nullable: true },
                matchedSession: {
                  type: "object",
                  nullable: true,
                  allOf: [
                    {
                      $ref: "#/components/schemas/TrainingSessionResponse/properties/data",
                    },
                  ],
                  description: "Objeto completo da sessão de treino vinculada.",
                },
              },
            },
          },
          summary: {
            type: "object",
            properties: {
              totalPlanned: { type: "integer" },
              completed: { type: "integer" },
              partial: { type: "integer" },
              planned: { type: "integer" },
              missed: { type: "integer" },
              adherencePercent: {
                type: "integer",
                nullable: true,
                example: 83,
              },
            },
          },
          rollingFourWeeksAverage: {
            type: "object",
            properties: {
              averagePercent: {
                type: "integer",
                nullable: true,
                example: 79,
              },
              weeksCount: { type: "integer", example: 4 },
              weeks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    weekStart: { type: "string", format: "date" },
                    weekEnd: { type: "string", format: "date" },
                    label: { type: "string" },
                    adherencePercent: { type: "integer" },
                    completed: { type: "integer" },
                    partial: { type: "integer" },
                    totalPlanned: { type: "integer" },
                  },
                },
              },
            },
          },
          extraSessions: {
            type: "array",
            items: {
              $ref: "#/components/schemas/TrainingSessionResponse/properties/data",
            },
            description:
              "Sessões realizadas na semana sem vínculo ao plano prescrito.",
          },
          extraSummary: {
            type: "object",
            properties: {
              count: { type: "integer" },
              totalDistanceKm: { type: "number" },
            },
          },
        },
      }),
    },
  },
} as const;
