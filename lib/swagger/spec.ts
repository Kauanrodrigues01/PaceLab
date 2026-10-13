/**
 * Especificação OpenAPI 3.0 oficial do PaceLab
 * Documentação centralizada de todas as rotas da API REST
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
      description: "Configuração e consulta de metas de corrida, barra, flexão e abdominal do edital.",
    },
    {
      name: "Simulados TAF",
      description: "Registro, consulta e gestão de tentativas do teste de corrida de 12 minutos.",
    },
    {
      name: "Diário de Treinos",
      description: "Registro e análise de sessões de treino com métricas de ritmo, esforço (RPE) e calorias.",
    },
    {
      name: "Perfil do Atleta",
      description: "Dados biométricos do atleta (peso, altura, idade, sexo biológico e histórico de peso).",
    },
    {
      name: "Health & Diagnóstico",
      description: "Status de saúde do serviço e verificação de conexão com o banco de dados.",
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
          "200": {
            description: "Meta TAF recuperada com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TafGoalResponse",
                },
              },
            },
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
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
              schema: {
                $ref: "#/components/schemas/TafGoalInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Meta salva com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TafGoalResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/taf/attempts": {
      get: {
        tags: ["Simulados TAF"],
        summary: "Listar tentativas de simulados TAF",
        description:
          "Retorna a lista paginada de simulados realizados, incluindo dados de voltas (laps), recorde pessoal (PB) e déficit em relação à meta.",
        parameters: [
          {
            name: "limit",
            in: "query",
            description: "Quantidade máxima de registros a retornar (1 a 100, padrão 50).",
            schema: { type: "integer", default: 50, minimum: 1, maximum: 100 },
          },
          {
            name: "cursor",
            in: "query",
            description: "ID do cursor para paginação baseada em cursor.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Lista de simulados recuperada com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TafAttemptsListResponse",
                },
              },
            },
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      post: {
        tags: ["Simulados TAF"],
        summary: "Registrar novo simulado TAF",
        description:
          "Calcula pace, velocidade média, pontuação e registra a tentativa no histórico persistido.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateTafAttemptInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Simulado registrado com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TafAttemptResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/taf/attempts/{id}": {
      get: {
        tags: ["Simulados TAF"],
        summary: "Buscar simulado por ID",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Identificador UUID do simulado",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Simulado encontrado.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TafAttemptResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFoundError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      put: {
        tags: ["Simulados TAF"],
        summary: "Atualizar simulado existente",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateTafAttemptInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Simulado atualizado com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TafAttemptResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "404": {
            $ref: "#/components/responses/NotFoundError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      delete: {
        tags: ["Simulados TAF"],
        summary: "Excluir simulado",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Simulado excluído com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFoundError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/taf/trainings": {
      get: {
        tags: ["Diário de Treinos"],
        summary: "Listar sessões de treino",
        description:
          "Retorna o histórico de treinos do usuário com paginação por cursor e filtro opcional por modalidade.",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 50, minimum: 1, maximum: 100 },
          },
          {
            name: "cursor",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "activityType",
            in: "query",
            description: "Filtro opcional: corrida_continua, corrida_intervalada, caminhada",
            schema: {
              type: "string",
              enum: ["corrida_continua", "corrida_intervalada", "caminhada"],
            },
          },
        ],
        responses: {
          "200": {
            description: "Lista de treinos recuperada com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TrainingsListResponse",
                },
              },
            },
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      post: {
        tags: ["Diário de Treinos"],
        summary: "Registrar nova sessão de treino",
        description:
          "Grava o treino calculando ritmo, gasto calórico ativo e total segundo o Compêndio de Atividades Físicas 2024.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateTrainingInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Sessão registrada com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TrainingSessionResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/taf/trainings/{id}": {
      get: {
        tags: ["Diário de Treinos"],
        summary: "Buscar treino por ID",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Treino encontrado.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TrainingSessionResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFoundError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      put: {
        tags: ["Diário de Treinos"],
        summary: "Atualizar sessão de treino",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateTrainingInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Treino atualizado com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TrainingSessionResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "404": {
            $ref: "#/components/responses/NotFoundError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      delete: {
        tags: ["Diário de Treinos"],
        summary: "Excluir sessão de treino",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Treino excluído com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFoundError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/profile": {
      get: {
        tags: ["Perfil do Atleta"],
        summary: "Obter perfil biométrico",
        description: "Retorna peso, altura, sexo biológico, data de nascimento e cálculo de IMC.",
        responses: {
          "200": {
            description: "Perfil obtido com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProfileResponse",
                },
              },
            },
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      put: {
        tags: ["Perfil do Atleta"],
        summary: "Criar ou atualizar perfil biométrico",
        description: "Atualiza os dados antropométricos e registra nova pesagem caso o peso mude.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ProfileInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Perfil atualizado com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProfileResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
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
            schema: { type: "integer", default: 52, minimum: 1, maximum: 365 },
          },
        ],
        responses: {
          "200": {
            description: "Histórico de peso recuperado com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WeightListResponse",
                },
              },
            },
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
      post: {
        tags: ["Perfil do Atleta"],
        summary: "Registrar nova pesagem corporal",
        description: "Adiciona uma entrada no histórico de peso e atualiza o peso atual do perfil.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/WeightInput",
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Pesagem registrada com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WeightRecordResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/profile/weight/{id}": {
      delete: {
        tags: ["Perfil do Atleta"],
        summary: "Excluir registro de pesagem",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Registro de peso excluído com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DeleteSuccessResponse",
                },
              },
            },
          },
          "404": {
            $ref: "#/components/responses/NotFoundError",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
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
          "200": {
            description: "Sistema saudável e banco operacional.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse",
                },
              },
            },
          },
          "503": {
            description: "Falha de conectividade com o banco de dados.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse",
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    responses: {
      ValidationError: {
        description: "Erro de validação nos dados fornecidos.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ApiErrorResponse",
            },
          },
        },
      },
      NotFoundError: {
        description: "Recurso não encontrado.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ApiErrorResponse",
            },
          },
        },
      },
      InternalError: {
        description: "Erro interno do servidor.",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/ApiErrorResponse",
            },
          },
        },
      },
    },
    schemas: {
      ApiErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "string", example: "Dados de entrada inválidos" },
          details: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", example: "targetDistanceMeters" },
                message: { type: "string", example: "A distância alvo deve ser de no mínimo 500 metros" },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "error", "timestamp"],
      },
      DeleteSuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              deleted: { type: "boolean", example: true },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy", "unhealthy"], example: "healthy" },
          database: { type: "string", example: "connected" },
          latencyMs: { type: "number", example: 42 },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["status", "database", "timestamp"],
      },
      TafGoalInput: {
        type: "object",
        properties: {
          institutionName: { type: "string", example: "Polícia Militar SP", maxLength: 100 },
          minDistanceMeters: { type: "integer", example: 2400, minimum: 500, maximum: 10000 },
          targetDistanceMeters: { type: "integer", example: 2600, minimum: 500, maximum: 10000 },
          targetDurationMinutes: { type: "integer", example: 12, minimum: 1, maximum: 60 },
          targetExamDate: { type: "string", format: "date", nullable: true, example: "2026-12-15" },
          pullupType: { type: "string", enum: ["dinamica", "isometria"], nullable: true, example: "dinamica" },
          pullupMinReps: { type: "integer", minimum: 0, maximum: 100, nullable: true, example: 3 },
          pullupTargetReps: { type: "integer", minimum: 0, maximum: 100, nullable: true, example: 5 },
          pullupMinSeconds: { type: "integer", minimum: 0, maximum: 600, nullable: true },
          pullupTargetSeconds: { type: "integer", minimum: 0, maximum: 600, nullable: true },
          pushupMinReps: { type: "integer", minimum: 0, maximum: 200, nullable: true, example: 20 },
          pushupTargetReps: { type: "integer", minimum: 0, maximum: 200, nullable: true, example: 30 },
          pushupDurationSeconds: { type: "integer", minimum: 0, maximum: 600, nullable: true },
          absMinReps: { type: "integer", minimum: 0, maximum: 200, nullable: true, example: 30 },
          absTargetReps: { type: "integer", minimum: 0, maximum: 200, nullable: true, example: 40 },
          absDurationSeconds: { type: "integer", minimum: 0, maximum: 600, nullable: true },
        },
      },
      TafGoalResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              institutionName: { type: "string", example: "Polícia Militar SP" },
              minDistanceMeters: { type: "integer", example: 2400 },
              targetDistanceMeters: { type: "integer", example: 2600 },
              targetDurationMinutes: { type: "integer", example: 12 },
              targetExamDate: { type: "string", nullable: true },
              pullupType: { type: "string", example: "dinamica" },
              pullupMinReps: { type: "integer", example: 3 },
              pullupTargetReps: { type: "integer", example: 5 },
              pushupMinReps: { type: "integer", example: 20 },
              pushupTargetReps: { type: "integer", example: 30 },
              absMinReps: { type: "integer", example: 30 },
              absTargetReps: { type: "integer", example: 40 },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      CreateTafAttemptInput: {
        type: "object",
        required: [
          "distanceMeters",
          "actualDurationSeconds",
          "speedKmh",
          "paceSeconds",
          "paceFormatted",
        ],
        properties: {
          distanceMeters: { type: "integer", minimum: 100, maximum: 10000, example: 2450 },
          actualDurationSeconds: { type: "integer", minimum: 30, maximum: 7200, example: 720 },
          speedKmh: { type: "number", minimum: 1, maximum: 40, example: 12.25 },
          paceSeconds: { type: "integer", minimum: 90, maximum: 1800, example: 294 },
          paceFormatted: { type: "string", example: "4:54" },
          locationType: {
            type: "string",
            enum: ["pista_400m", "rua_plana", "parque_praca", "esteira", "outro"],
            example: "pista_400m",
          },
          notes: { type: "string", maxLength: 1000, nullable: true },
          testDate: { type: "string", format: "date-time" },
        },
      },
      UpdateTafAttemptInput: {
        type: "object",
        properties: {
          distanceMeters: { type: "integer", minimum: 100, maximum: 10000 },
          notes: { type: "string", maxLength: 1000, nullable: true },
          locationType: {
            type: "string",
            enum: ["pista_400m", "rua_plana", "parque_praca", "esteira", "outro"],
          },
        },
      },
      TafAttemptResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              distanceMeters: { type: "integer", example: 2450 },
              actualDurationSeconds: { type: "integer", example: 720 },
              speedKmh: { type: "number", example: 12.25 },
              paceSeconds: { type: "integer", example: 294 },
              paceFormatted: { type: "string", example: "4:54" },
              locationType: { type: "string", example: "pista_400m" },
              testDate: { type: "string", format: "date-time" },
              isPersonalRecord: { type: "boolean", example: true },
              deficitTargetMeters: { type: "integer", example: 0 },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      TafAttemptsListResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/TafAttemptResponse/properties/data" },
          },
          pagination: {
            type: "object",
            properties: {
              nextCursor: { type: "string", nullable: true },
              hasMore: { type: "boolean", example: false },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      CreateTrainingInput: {
        type: "object",
        required: [
          "activityType",
          "distanceKm",
          "durationSeconds",
          "speedKmh",
          "paceSeconds",
          "paceFormatted",
        ],
        properties: {
          activityType: {
            type: "string",
            enum: ["corrida_continua", "corrida_intervalada", "caminhada"],
            example: "corrida_continua",
          },
          distanceKm: { type: "number", minimum: 0.1, maximum: 100, example: 5.0 },
          durationSeconds: { type: "integer", minimum: 30, maximum: 86400, example: 1500 },
          speedKmh: { type: "number", example: 12.0 },
          paceSeconds: { type: "integer", example: 300 },
          paceFormatted: { type: "string", example: "5:00" },
          perceivedEffort: { type: "integer", minimum: 1, maximum: 10, nullable: true, example: 7 },
          bodyWeightKg: { type: "number", minimum: 30, maximum: 250, nullable: true, example: 75 },
          notes: { type: "string", maxLength: 1000, nullable: true },
          sessionDate: { type: "string", format: "date-time" },
        },
      },
      UpdateTrainingInput: {
        type: "object",
        properties: {
          distanceKm: { type: "number", minimum: 0.1, maximum: 100 },
          perceivedEffort: { type: "integer", minimum: 1, maximum: 10, nullable: true },
          notes: { type: "string", maxLength: 1000, nullable: true },
        },
      },
      TrainingSessionResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              activityType: { type: "string", example: "corrida_continua" },
              distanceKm: { type: "number", example: 5.0 },
              durationSeconds: { type: "integer", example: 1500 },
              paceFormatted: { type: "string", example: "5:00" },
              activeCalories: { type: "number", example: 312 },
              totalCalories: { type: "number", example: 345 },
              metValue: { type: "number", example: 11.5 },
              sessionDate: { type: "string", format: "date-time" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      TrainingsListResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/TrainingSessionResponse/properties/data" },
          },
          pagination: {
            type: "object",
            properties: {
              nextCursor: { type: "string", nullable: true },
              hasMore: { type: "boolean", example: false },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      ProfileInput: {
        type: "object",
        required: ["weightKg", "heightCm", "birthDate", "biologicalSex"],
        properties: {
          weightKg: { type: "number", minimum: 30, maximum: 250, example: 75.5 },
          heightCm: { type: "number", minimum: 100, maximum: 250, example: 178 },
          birthDate: { type: "string", format: "date", example: "1998-05-14" },
          biologicalSex: { type: "string", enum: ["M", "F"], example: "M" },
          activityLevel: {
            type: "string",
            enum: ["sedentario", "leve", "moderado", "intenso", "muito_intenso"],
            example: "moderado",
          },
        },
      },
      ProfileResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              weightKg: { type: "number", example: 75.5 },
              heightCm: { type: "number", example: 178 },
              biologicalSex: { type: "string", example: "M" },
              birthDate: { type: "string", example: "1998-05-14" },
              activityLevel: { type: "string", example: "moderado" },
              calculatedBmi: { type: "number", example: 23.83 },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      WeightInput: {
        type: "object",
        required: ["weightKg"],
        properties: {
          weightKg: { type: "number", minimum: 30, maximum: 250, example: 74.8 },
          recordedAt: { type: "string", format: "date-time" },
          notes: { type: "string", maxLength: 200, nullable: true },
          source: { type: "string", example: "weekly_prompt" },
        },
      },
      WeightRecordResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              id: { type: "string" },
              weightKg: { type: "number", example: 74.8 },
              recordedAt: { type: "string", format: "date-time" },
              source: { type: "string", example: "weekly_prompt" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      WeightListResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/WeightRecordResponse/properties/data" },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
    },
  },
} as const;

export type SwaggerSpec = typeof swaggerSpec;
