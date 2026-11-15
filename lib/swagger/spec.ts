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
        parameters: [
          {
            name: "skipSheetsSync",
            in: "query",
            required: false,
            description:
              "Quando true/1, evita chamada automática ao Google Sheets (útil em restauração em lote).",
            schema: { type: "boolean", default: false },
          },
        ],
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
          "409": {
            $ref: "#/components/responses/ConflictError",
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
          {
            name: "skipSheetsSync",
            in: "query",
            required: false,
            description:
              "Quando true/1, evita chamada automática ao Google Sheets (útil em restauração em lote).",
            schema: { type: "boolean", default: false },
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
            description:
              "Filtro opcional: rodagem_leve, corrida_continua, tempo_run, corrida_intervalada, longao, caminhada",
            schema: {
              type: "string",
              enum: [
                "rodagem_leve",
                "corrida_continua",
                "tempo_run",
                "corrida_intervalada",
                "longao",
                "caminhada",
              ],
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
          "Grava o treino (manual ou importado via .FIT/.GPX do Strava) calculando ritmo, gasto calórico ativo e total segundo o Compêndio de Atividades Físicas 2024, executa reconciliação local com `Plano_Semanal` e agenda espelhamento no Google Sheets (salvo `skipSheetsSync=true`).",
        parameters: [
          {
            name: "skipSheetsSync",
            in: "query",
            required: false,
            description:
              "Quando true/1, evita chamada automática ao Google Sheets (útil em restauração em lote).",
            schema: { type: "boolean", default: false },
          },
        ],
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
          "409": {
            $ref: "#/components/responses/ConflictError",
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
        description:
          "Atualiza os campos da sessão e executa reconciliação local com `Plano_Semanal` (revalidando vínculos existentes ou encontrando novas correspondências).",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "skipSheetsSync",
            in: "query",
            required: false,
            description:
              "Quando true/1, evita chamada automática ao Google Sheets (útil em restauração em lote).",
            schema: { type: "boolean", default: false },
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
        description:
          "Remove a sessão do banco, limpa vínculos órfãos no `Plano_Semanal` (revertendo itens afetados para `Planejado` ou `Perdido`) e atualiza o Google Sheets salvo `skipSheetsSync=true`.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "skipSheetsSync",
            in: "query",
            required: false,
            description: "Quando true, ignora a remoção e atualização automática na planilha Google Sheets.",
            schema: { type: "boolean", default: false },
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

    "/api/training-sessions/parse-activity": {
      post: {
        tags: ["Diário de Treinos"],
        summary: "Analisar e mesclar arquivos de treino (.FIT prioritário + .GPX complementar/fallback)",
        description:
          "Recebe 1 ou 2 arquivos via `multipart/form-data` (`.fit` isolado, `.gpx` isolado ou `.fit` + `.gpx` do mesmo treino). Aplica prioridade absoluta do `.FIT` (`@garmin/fitsdk`) para telemetria, tempos, distância, splits e calorias, complementando com `<trk><name>` e `elevationGainM` do `.GPX` quando aplicável, e verifica duplicidade no banco (`alreadyExists`).",
        requestBody: {
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
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Atividade analisada com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ActivityParsePreviewResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "413": {
            description: "Arquivo excede o limite máximo de 4 MB.",
          },
          "422": {
            description: "Erro semântico no arquivo .FIT/.GPX ou esporte incompatível.",
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
        },
      },
    },

    "/api/taf/trainings/gpx-preview": {
      post: {
        tags: ["Diário de Treinos"],
        summary: "Alias compatível para análise de arquivos .FIT / .GPX",
        description:
          "Rota espelho de `POST /api/training-sessions/parse-activity` mantida no namespace `/api/taf/trainings/*`.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  files: {
                    type: "array",
                    items: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Atividade analisada com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ActivityParsePreviewResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "413": {
            description: "Arquivo excede o limite máximo de 4 MB.",
          },
          "422": {
            description: "Erro semântico no arquivo .FIT/.GPX ou esporte incompatível.",
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

    "/api/sync/sheets": {
      get: {
        tags: ["Sincronização Google Sheets"],
        summary: "Consultar status da integração e pendências Google Sheets",
        description:
          "Retorna se as credenciais Base64 e `GOOGLE_SHEETS_SPREADSHEET_ID` estão configuradas e conta registros pendentes no PostgreSQL sem consumir quota da Google API.",
        responses: {
          "200": {
            description: "Status de sincronização obtido com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SheetsSyncStatusResponse",
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
        tags: ["Sincronização Google Sheets"],
        summary: "Executar sincronização manual ou backfill com o Google Sheets",
        description:
          "Dispara sincronização bidirecional (`bidirectional`), envio em lote (`push`, incremental ou `forceFullResync: true`) ou leitura reversa (`pull`) entre PostgreSQL e Google Sheets.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SheetsSyncRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Sincronização concluída com sucesso.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SheetsSyncReportResponse",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/ValidationError",
          },
          "429": {
            description: "Limite de requisições (quota) da API Google Sheets excedido.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "502": {
            description: "Erro de permissão (403/401) ou recurso não encontrado (404) na planilha.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "503": {
            description: "Integração Google Sheets não configurada ou temporariamente indisponível.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ApiErrorResponse",
                },
              },
            },
          },
          "500": {
            $ref: "#/components/responses/InternalError",
          },
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
            schema: { type: "string", format: "date", example: "2026-10-12" },
          },
        ],
        responses: {
          "200": {
            description: "Snapshot semanal consolidado.",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/WeeklyPlanResponse",
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
                  $ref: "#/components/schemas/ApiErrorResponse",
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
      ConflictError: {
        description:
          "Conflito de duplicidade (ex.: arquivo .GPX já importado com o mesmo externalId).",
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
            oneOf: [
              {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string", example: "targetDistanceMeters" },
                    message: { type: "string", example: "A distância alvo deve ser de no mínimo 500 metros" },
                  },
                },
              },
              {
                type: "object",
                additionalProperties: true,
                example: { code: "SHEETS_NOT_CONFIGURED", sheetsConfigured: false },
              },
            ],
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
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["connected"], example: "connected" },
              orm: { type: "string", example: "Prisma" },
              database: { type: "string", example: "PostgreSQL" },
              latencyMs: { type: "number", example: 42 },
              sheetsConfigured: { type: "boolean", example: true },
            },
            required: ["status", "orm", "database", "latencyMs", "sheetsConfigured"],
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      SheetsSyncRequest: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["bidirectional", "push", "pull"],
            default: "bidirectional",
          },
          forceFullResync: {
            type: "boolean",
            default: false,
          },
        },
      },
      SheetsSyncStatusResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
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
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      SheetsSyncReportResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              direction: { type: "string", enum: ["bidirectional", "push", "pull"] },
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
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
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
          pullupDurationSeconds: { type: "integer", minimum: 0, maximum: 600, nullable: true },
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
              pullupDurationSeconds: { type: "integer", nullable: true },
              pushupMinReps: { type: "integer", example: 20 },
              pushupTargetReps: { type: "integer", example: 30 },
              pushupDurationSeconds: { type: "integer", nullable: true },
              absMinReps: { type: "integer", example: 30 },
              absTargetReps: { type: "integer", example: 40 },
              absDurationSeconds: { type: "integer", nullable: true },
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
          source: {
            type: "string",
            enum: ["manual", "gpx_upload", "fit_upload", "sheets"],
            default: "manual",
            example: "manual",
          },
          externalId: { type: "string", maxLength: 100, nullable: true },
          syncedToSheetsAt: { type: "string", format: "date-time", nullable: true },
          onDuplicate: { type: "string", enum: ["error", "update"] },
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
          shoeName: { type: "string", maxLength: 100, nullable: true, example: "Nike Vaporfly 3" },
          avgHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true, example: 172 },
          maxHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true, example: 188 },
          notes: { type: "string", maxLength: 1000, nullable: true },
          laps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                lapNumber: { type: "integer", example: 1 },
                distanceMeters: { type: "number", example: 400 },
                durationSeconds: { type: "integer", example: 112 },
                paceFormatted: { type: "string", example: "4:40" },
              },
            },
          },
          testDate: { type: "string", format: "date-time" },
        },
      },
      UpdateTafAttemptInput: {
        type: "object",
        properties: {
          syncedToSheetsAt: { type: "string", format: "date-time", nullable: true },
          distanceMeters: { type: "integer", minimum: 100, maximum: 10000 },
          notes: { type: "string", maxLength: 1000, nullable: true },
          locationType: {
            type: "string",
            enum: ["pista_400m", "rua_plana", "parque_praca", "esteira", "outro"],
          },
          shoeName: { type: "string", maxLength: 100, nullable: true },
          avgHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true },
          maxHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true },
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
              source: { type: "string", enum: ["manual", "gpx_upload", "fit_upload", "sheets"], example: "manual" },
              externalId: { type: "string", nullable: true },
              syncedToSheetsAt: { type: "string", format: "date-time", nullable: true },
              distanceMeters: { type: "integer", example: 2450 },
              actualDurationSeconds: { type: "integer", example: 720 },
              speedKmh: { type: "number", example: 12.25 },
              paceSeconds: { type: "integer", example: 294 },
              paceFormatted: { type: "string", example: "4:54" },
              locationType: { type: "string", example: "pista_400m" },
              shoeName: { type: "string", nullable: true, example: "Nike Vaporfly 3" },
              avgHeartRate: { type: "integer", nullable: true, example: 172 },
              maxHeartRate: { type: "integer", nullable: true, example: 188 },
              notes: { type: "string", nullable: true },
              laps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    lapNumber: { type: "integer", example: 1 },
                    distanceMeters: { type: "number", example: 400 },
                    durationSeconds: { type: "integer", example: 112 },
                    paceFormatted: { type: "string", example: "4:40" },
                  },
                },
              },
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
      SplitDetailSchema: {
        type: "object",
        required: ["kilometer", "durationSeconds"],
        properties: {
          kilometer: { type: "integer", minimum: 1, example: 1 },
          distanceKm: { type: "number", minimum: 0.01, maximum: 1.0, example: 1.0 },
          durationSeconds: { type: "integer", minimum: 1, example: 300 },
          paceSeconds: { type: "integer", minimum: 1, example: 300 },
          paceFormatted: { type: "string", example: "5:00" },
          avgHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true, example: 162 },
          elevationDiffM: { type: "number", nullable: true, example: 4.5 },
        },
      },
      CreateTrainingInput: {
        type: "object",
        required: [
          "activityType",
          "distanceKm",
          "durationSeconds",
        ],
        properties: {
          id: { type: "string", description: "UUID opcional para upsert idempotente." },
          userId: { type: "string", nullable: true },
          source: {
            type: "string",
            enum: ["manual", "gpx_upload", "fit_upload", "sheets"],
            default: "manual",
            example: "manual",
          },
          externalId: { type: "string", maxLength: 100, nullable: true },
          syncedToSheetsAt: { type: "string", format: "date-time", nullable: true },
          onDuplicate: { type: "string", enum: ["error", "update"] },
          activityType: {
            type: "string",
            enum: [
              "rodagem_leve",
              "corrida_continua",
              "tempo_run",
              "corrida_intervalada",
              "longao",
              "caminhada",
            ],
            example: "corrida_continua",
          },
          distanceKm: { type: "number", minimum: 0.05, maximum: 100, example: 5.0 },
          durationSeconds: { type: "integer", minimum: 30, maximum: 86400, example: 1500 },
          elapsedSeconds: { type: "integer", minimum: 30, maximum: 86400, nullable: true, example: 1560 },
          speedKmh: { type: "number", example: 12.0 },
          paceSeconds: { type: "integer", example: 300 },
          paceFormatted: { type: "string", example: "5:00" },
          avgHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true, example: 160 },
          maxHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true, example: 178 },
          elevationGainM: { type: "number", minimum: 0, maximum: 10000, nullable: true, example: 35.0 },
          avgCadence: { type: "integer", minimum: 30, maximum: 300, nullable: true, example: 174 },
          shoeName: { type: "string", maxLength: 100, nullable: true, example: "Nike Pegasus 40" },
          perceivedEffort: { type: "integer", minimum: 1, maximum: 10, nullable: true, example: 7 },
          bodyWeightKg: { type: "number", minimum: 30, maximum: 250, nullable: true, example: 75 },
          notes: { type: "string", maxLength: 1000, nullable: true },
          activeCalories: { type: "number", minimum: 0, maximum: 15000, nullable: true, example: 312 },
          totalCalories: { type: "number", minimum: 0, maximum: 15000, nullable: true, example: 345 },
          metValue: { type: "number", minimum: 0.5, maximum: 30, nullable: true, example: 11.5 },
          calorieMethod: { type: "string", nullable: true, example: "compendium_2024_met" },
          calorieSource: { type: "string", nullable: true, example: "calculated_met" },
          calorieMetadata: { type: "object", nullable: true },
          splits: {
            type: "array",
            items: { $ref: "#/components/schemas/SplitDetailSchema" },
          },
          sessionDate: { type: "string", format: "date-time" },
        },
      },
      UpdateTrainingInput: {
        type: "object",
        properties: {
          syncedToSheetsAt: { type: "string", format: "date-time", nullable: true },
          sessionDate: { type: "string", format: "date-time" },
          activityType: {
            type: "string",
            enum: [
              "rodagem_leve",
              "corrida_continua",
              "tempo_run",
              "corrida_intervalada",
              "longao",
              "caminhada",
            ],
          },
          distanceKm: { type: "number", minimum: 0.05, maximum: 100 },
          durationSeconds: { type: "integer", minimum: 30, maximum: 86400 },
          elapsedSeconds: { type: "integer", minimum: 30, maximum: 86400, nullable: true },
          speedKmh: { type: "number" },
          paceSeconds: { type: "integer" },
          paceFormatted: { type: "string" },
          avgHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true },
          maxHeartRate: { type: "integer", minimum: 30, maximum: 250, nullable: true },
          elevationGainM: { type: "number", minimum: 0, maximum: 10000, nullable: true },
          avgCadence: { type: "integer", minimum: 30, maximum: 300, nullable: true },
          shoeName: { type: "string", maxLength: 100, nullable: true },
          perceivedEffort: { type: "integer", minimum: 1, maximum: 10, nullable: true },
          bodyWeightKg: { type: "number", minimum: 30, maximum: 250, nullable: true },
          notes: { type: "string", maxLength: 1000, nullable: true },
          activeCalories: { type: "number", minimum: 0, maximum: 15000, nullable: true },
          totalCalories: { type: "number", minimum: 0, maximum: 15000, nullable: true },
          metValue: { type: "number", minimum: 0.5, maximum: 30, nullable: true },
          calorieMethod: { type: "string", nullable: true },
          calorieSource: { type: "string", nullable: true },
          calorieMetadata: { type: "object", nullable: true },
          splits: {
            type: "array",
            items: { $ref: "#/components/schemas/SplitDetailSchema" },
          },
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
              userId: { type: "string", nullable: true },
              source: { type: "string", enum: ["manual", "gpx_upload", "fit_upload", "sheets"], example: "manual" },
              externalId: { type: "string", nullable: true },
              syncedToSheetsAt: { type: "string", format: "date-time", nullable: true },
              activityType: { type: "string", example: "corrida_continua" },
              distanceKm: { type: "number", example: 5.0 },
              durationSeconds: { type: "integer", example: 1500 },
              elapsedSeconds: { type: "integer", nullable: true, example: 1560 },
              paceFormatted: { type: "string", example: "5:00" },
              speedKmh: { type: "number", example: 12.0 },
              paceSeconds: { type: "integer", example: 300 },
              avgHeartRate: { type: "integer", nullable: true, example: 160 },
              maxHeartRate: { type: "integer", nullable: true, example: 178 },
              elevationGainM: { type: "number", nullable: true, example: 35.0 },
              avgCadence: { type: "integer", nullable: true, example: 174 },
              shoeName: { type: "string", nullable: true, example: "Nike Pegasus 40" },
              perceivedEffort: { type: "integer", nullable: true, example: 7 },
              bodyWeightKg: { type: "number", nullable: true, example: 75 },
              notes: { type: "string", nullable: true, example: "Rodagem leve no parque" },
              activeCalories: { type: "number", nullable: true, example: 312 },
              totalCalories: { type: "number", nullable: true, example: 345 },
              metValue: { type: "number", nullable: true, example: 11.5 },
              calorieMethod: { type: "string", nullable: true, example: "compendium_2024_met" },
              calorieSource: { type: "string", nullable: true, example: "calculated_met" },
              calorieMetadata: { type: "object", nullable: true },
              splits: {
                type: "array",
                items: { $ref: "#/components/schemas/SplitDetailSchema" },
              },
              sessionDate: { type: "string", format: "date-time" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
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
      ActivityParsePreviewResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              source: { type: "string", enum: ["fit_upload", "gpx_upload"], example: "fit_upload" },
              filesUsed: {
                type: "array",
                items: { type: "string", enum: ["fit", "gpx"] },
                example: ["fit", "gpx"],
              },
              name: { type: "string", nullable: true, example: "Rodagem Matinal" },
              titleSource: {
                type: "string",
                enum: ["metadata", "filename"],
                nullable: true,
                example: "filename",
              },
              sourceActivityKind: { type: "string", enum: ["run", "walk", "unknown"] },
              isIndoor: { type: "boolean", example: false },
              startedAt: { type: "string", format: "date-time" },
              distanceKm: { type: "number", example: 5.0 },
              durationSeconds: { type: "integer", example: 1500 },
              elapsedSeconds: { type: "integer", example: 1525 },
              speedKmh: { type: "number", example: 12.0 },
              paceSeconds: { type: "integer", example: 300 },
              paceFormatted: { type: "string", example: "5:00" },
              avgHeartRate: { type: "integer", nullable: true, example: 162 },
              maxHeartRate: { type: "integer", nullable: true, example: 179 },
              avgCadence: { type: "integer", nullable: true, example: 174 },
              elevationGainM: { type: "number", nullable: true, example: 32 },
              activeCalories: { type: "integer", nullable: true, example: 365 },
              externalId: { type: "string", example: "fit_a1b2c3d4..." },
              alreadyExists: { type: "boolean", example: false },
              existingTrainingId: { type: "string", nullable: true, example: null },
              alreadyExistsAttempt: { type: "boolean", example: false },
              existingAttemptId: { type: "string", nullable: true, example: null },
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
                  avgHeartRate: { type: "integer", nullable: true, example: 174 },
                  maxHeartRate: { type: "integer", nullable: true, example: 189 },
                  windowStartOffsetSeconds: { type: "number", example: 120 },
                  windowEndOffsetSeconds: { type: "number", example: 840 },
                  isShorterThanTarget: { type: "boolean", example: false },
                  laps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        lapNumber: { type: "integer", example: 1 },
                        distanceMeters: { type: "number", example: 400 },
                        durationSeconds: { type: "integer", example: 112 },
                        paceFormatted: { type: "string", example: "4:40" },
                      },
                    },
                  },
                },
              },
              suggestedActivityType: { type: "string", nullable: true, example: "corrida_continua" },
              suggestedNotes: { type: "string", example: "Rodagem Matinal" },
              allowedActivityTypes: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
      WeeklyPlanResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              weekStart: { type: "string", format: "date", example: "2026-10-12" },
              weekEnd: { type: "string", format: "date", example: "2026-10-18" },
              weekLabel: { type: "string", example: "12/10 – 18/10" },
              isCurrentWeek: { type: "boolean", example: true },
              hasNextPlannedWeek: { type: "boolean", example: false },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    planExternalId: { type: "string", example: "plan-20261012-rodagem_leve" },
                    plannedDate: { type: "string", format: "date", example: "2026-10-12" },
                    dayOfWeek: { type: "string", example: "Segunda" },
                    activityType: { type: "string", example: "Rodagem Leve" },
                    isRestDay: { type: "boolean", example: false },
                    targetDistanceKm: { type: "number", nullable: true, example: 8 },
                    targetPaceFormatted: { type: "string", nullable: true, example: "5:40" },
                    description: { type: "string", nullable: true },
                    status: {
                      type: "string",
                      enum: ["Planejado", "Concluído", "Parcial", "Perdido"],
                    },
                    matchedSessionId: { type: "string", nullable: true },
                    matchedSession: {
                      allOf: [
                        {
                          $ref: "#/components/schemas/TrainingSessionResponse/properties/data",
                        },
                      ],
                      nullable: true,
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
                  adherencePercent: { type: "integer", nullable: true, example: 83 },
                },
              },
              rollingFourWeeksAverage: {
                type: "object",
                properties: {
                  averagePercent: { type: "integer", nullable: true, example: 79 },
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
          },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["success", "data", "timestamp"],
      },
    },
  },
} as const;

export type SwaggerSpec = typeof swaggerSpec;
