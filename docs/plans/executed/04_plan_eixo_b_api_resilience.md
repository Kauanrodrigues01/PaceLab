# 📌 Plano de Execução: Eixo B — Padronização, Validação com Zod e Resiliência da API

**Projeto:** PaceLab  
**Módulo:** Backend / Next.js Route Handlers (`app/api/taf/*`)  
**Data:** 11/10/2026  
**Status:** Concluído e Validado (Execução Completa)  
**Referência:** [docs/roadmap/04_roadmap_melhorias_futuras.md](../../roadmap/04_roadmap_melhorias_futuras.md)

---

## 1. 🎯 Contexto e Objetivo

Após a consolidação da persistência exclusiva do módulo **Meu TAF** no Supabase (PostgreSQL via Prisma ORM), a camada de rotas de API (`app/api/taf/*`) tornou-se o núcleo crítico de entrada de dados do PaceLab.

Atualmente, essa camada apresenta três oportunidades de melhoria arquitetural (Eixo B do Roadmap):
1. **Validação Manual Frágil:** Cada rota valida tipos e campos obrigatórios com `if (!distanceMeters) ...`, sujeita a inconsistências de tipos (ex: aceitar números negativos ou strings vazias).
2. **Respostas Despadronizadas:** Cada endpoint trata erros e constrói respostas `NextResponse.json(...)` de maneira ad-hoc, sem um contrato de dados previsível para o frontend.
3. **Ausência de Paginação:** As consultas `prisma.<model>.findMany()` carregam todos os registros de uma só vez, o que diminuirá a performance conforme o atleta acumular centenas de treinos e simulados ao longo dos meses.

### Objetivo Central
Implementar uma infraestrutura robusta, tipada e resiliente no backend do PaceLab, baseada em:
- **Zod Schemas** para validação estrita de payloads na borda (Edge/Server).
- **Contrato Uniforme de Resposta** (`ApiResponse<T>`) com captura centralizada de exceções.
- **Paginação e Filtros** no Prisma para treinos e simulados.

---

## 2. 🏗️ Arquitetura: Antes vs Depois

```mermaid
flowchart TD
    subgraph ANTES["Arquitetura Atual (Validação Manual)"]
        ReqA[Requisição HTTP] --> RouteA[Route Handler]
        RouteA --> ManualCheck{if payload válido?}
        ManualCheck -- Não --> ErrA[Status 400 + { error: string }]
        ManualCheck -- Sim --> PrismaA[Prisma findMany/create]
        PrismaA --> CatchA[try/catch manual ad-hoc]
    end

    subgraph DEPOIS["Arquitetura Proposta (Zod + Handler Padronizado)"]
        ReqB[Requisição HTTP] --> Wrapper[withApiHandler]
        Wrapper --> ZodCheck{Zod Schema Parse}
        ZodCheck -- Inválido --> ZodErr[Status 400 + ApiResponse com detalhes dos campos]
        ZodCheck -- Válido --> Controller[Handler Tipado e Seguro]
        Controller --> PrismaB[Prisma com Paginação / Cursor]
        PrismaB --> RespSuccess[Status 200/201 + ApiResponse padronizada]
        Controller -. Exceção .-> GlobalCatch[Captura Automática de Prisma / Erros de Rede]
    end
```

---

## 3. 📋 Fases Detalhadas de Implementação

### 🔹 Fase 1: Infraestrutura de Validação Estrita com Zod (✅ Concluída)
**Meta:** Instalar a biblioteca `zod` e definir schemas reutilizáveis de entrada e consulta para todas as entidades do TAF.

1. **Instalação:**
   - Adicionar dependência de produção: `npm install zod`.
2. **Criação do Módulo de Schemas (`lib/validations/taf.ts`):**
   - **Metas (`TafGoal`):**
     - `targetDistanceMeters`: inteiro entre `500` e `10.000` (default 2300).
     - `targetDurationMinutes`: inteiro entre `1` e `60` (default 12).
     - `targetExamDate`: string no formato data ISO ou null/undefined.
   - **Simulados (`TafAttempt`):**
     - `distanceMeters`: número positivo (`100` a `10.000`).
     - `actualDurationSeconds`: número positivo (`30` a `7.200`).
     - `laps`: array opcional de voltas com tempo e número de volta válidos.
     - `locationType`: string opcional com enum (`"pista_400m"`, `"rua"`, `"esteira"`, `"outro"`).
   - **Treinos (`TrainingSession`):**
     - `activityType`: enum obrigatório (`"corrida_continua"`, `"corrida_intervalada"`, `"caminhada"`, `"teste_taf"`, `"outro"`).
     - `distanceKm`: número positivo (`0.1` a `100.0`).
     - `durationSeconds`: inteiro positivo (`30` a `86.400`).
     - `perceivedEffort`: inteiro de `1` a `10` ou null.
     - `bodyWeightKg`: número entre `30.0` e `250.0` ou null.
     - `splits`: array opcional de parciais de km.
   - **Paginação & Filtros (`PaginationQuery`):**
     - `limit`: inteiro entre `1` e `100` (default 20 ou 50).
     - `cursor`: string opcional de ID para paginação rápida.
     - `activityType`: string opcional para filtragem no banco.
3. **Testes Unitários:**
   - Criar `__tests__/lib/validations.test.ts` cobrindo aceitação de entradas válidas e rejeição de payloads maliciosos ou incompletos.

---

### 🔹 Fase 2: Utilitários de Resposta Padronizada da API (`lib/api/response.ts`) (✅ Concluída)
**Meta:** Estabelecer o contrato unificado de resposta HTTP e wrapper de tratamento de exceções.

1. **Definição dos Tipos:**
   ```typescript
   export interface ApiResponse<T> {
     success: boolean;
     data?: T;
     error?: string;
     details?: Array<{ field: string; message: string }>;
     meta?: {
       totalCount?: number;
       nextCursor?: string | null;
       hasMore?: boolean;
     };
     timestamp: string;
   }
   ```
2. **Funções Auxiliares:**
   - `apiSuccess<T>(data: T, status?: number, meta?: object): NextResponse<ApiResponse<T>>`
   - `apiError(message: string, status?: number, details?: object): NextResponse<ApiResponse<null>>`
3. **Wrapper `withApiHandler`:**
   - Encapsula a execução da rota em `try/catch`.
   - Mapeia automaticamente:
     - `ZodError` ➔ Status `400 Bad Request` com array amigável em `details`.
     - `PrismaClientKnownRequestError` (ex: `P2025` registro não encontrado) ➔ Status `404 Not Found`.
     - Erros genéricos ou falta de conexão ➔ Status `500 Internal Server Error`.
4. **Testes Unitários:**
   - Criar `__tests__/lib/api-response.test.ts` garantindo os formatos de payload e status codes.

---

### 🔹 Fase 3: Refatoração das Rotas da API (`app/api/taf/*`) (✅ Concluída)
**Meta:** Proteger e padronizar todas as 7 rotas REST existentes no Next.js com envelope uniforme, validação na borda e status codes HTTP semânticos.

1. **`app/api/taf/goals/route.ts`:**
   - `GET`: Retorna meta existente ou padrão com envelope `apiSuccess<GoalDto>`.
   - `POST`: Valida corpo via `TafGoalInputSchema`, atualiza no Prisma e retorna meta salva com status `200`. Retorna `400 Bad Request` com array `details` para payloads inválidos.
2. **`app/api/taf/attempts/route.ts` & `[id]/route.ts`:**
   - `GET`: Retorna lista ordenada com envelope `apiSuccess`.
   - `POST`: Valida com `CreateTafAttemptSchema` e insere no banco com status `201 Created`.
   - `PUT`: Valida com `UpdateTafAttemptSchema` e atualiza no banco com status `200 OK` (ou `404 Not Found` via P2025).
   - `DELETE`: Remove registro existente com status `200 OK` (ou `404 Not Found` via P2025 quando ID inexistente).
3. **`app/api/taf/trainings/route.ts` & `[id]/route.ts`:**
   - `GET`: Suporta filtros por modalidade (`activityType`) e retorna treinos em `apiSuccess`.
   - `POST`: Valida com `CreateTrainingSessionSchema` e persiste no banco com status `201 Created`.
   - `PUT`: Valida com `UpdateTrainingSessionSchema` e retorna `200 OK` (ou `404 Not Found`).
   - `DELETE`: Remove registro com tratamento automático de P2025 para `404 Not Found`.
4. **`app/api/taf/health/route.ts`:**
   - Conexão ativa com PostgreSQL: status `200 OK`, `status: "connected"`, `orm: "Prisma"`, latência calculada.
   - Variável ausente ou falha: status `503 Service Unavailable`, `status: "disconnected"`.
5. **Integração Defensiva em `tafService.ts`:**
   - Implementado helper `unwrapApiResponse` garantindo compatibilidade transparente com envelopes de resposta da API e mocks de testes de UI.
6. **Testes Unitários:**
   - Atualizado `__tests__/api/taf-routes.test.ts` com 17 testes cobrindo todas as rotas, status codes (200, 201, 400, 404, 503) e validações Zod. Todos os 296 testes da aplicação aprovados.

---

### 🔹 Fase 4: Paginação Cursor-Based & Filtros no Prisma (✅ Concluída)
**Meta:** Permitir carregamento performático e incremental de registros de pista.

1. **Configuração de Consulta no Prisma:**
   - Aplicado padrão `cursor` nas rotas `GET /api/taf/attempts` e `GET /api/taf/trainings`:
     ```typescript
     const items = await prisma.trainingSession.findMany({
       take: limit + 1,
       skip: cursor ? 1 : 0,
       cursor: cursor ? { id: cursor } : undefined,
       where: activityType ? { activityType } : undefined,
       orderBy: { sessionDate: "desc" },
     });
     ```
2. **Detecção de Próxima Página & Metadados:**
   - Se o resultado tiver mais que `limit` registros (`items.length > limit`), extrai o último ID como `nextCursor` e define `hasMore: true`.
   - Caso contrário, `hasMore: false` e `nextCursor: null`.
   - Inseridos metadados de paginação padronizados em `meta: { limit, nextCursor, hasMore }`.
3. **Retrocompatibilidade Garantida:**
   - Por padrão, sem parâmetros de cursor, retorna os registros mais recentes (default de até 50) preservando a integridade com o frontend atual e todos os testes existentes.
4. **Validações na Borda:**
   - Rejeição de `limit` inválido (< 1 ou > 100) com `400 Bad Request`.
   - Rejeição de `activityType` fora do enum com `400 Bad Request`.
5. **Cobertura de Testes:**
   - 22 testes em `__tests__/api/taf-routes.test.ts` cobrindo cenários com e sem cursor, corte de limite, detecção de próxima página e rejeição de limites inválidos. Todos os 301 testes da aplicação aprovados.

---

### 🔹 Fase 5: Integração no Serviço de Frontend & Testes de Regressão (✅ Concluída)
**Meta:** Ajustar `tafService.ts` para desempacotar as respostas padronizadas e garantir 100% de aprovação na suíte de testes.

1. **Atualização do `lib/services/tafService.ts`:**
   - Adicionada função utilitária `unwrapApiResponse` que desempacota transparentemente `json.data` tanto para respostas da nova API quanto para respostas brutas de mocks legados.
   - Adicionada função `extractErrorMessage` que extrai mensagens específicas de validação Zod contidas no array `details` da resposta de erro (ex: exibição de mensagens amigáveis diretamente no toast/formulário).
   - Adicionado suporte opcional a parâmetros de paginação e filtros em `getAttempts(options)` e `getTrainings(options)`.
2. **Atualização dos Testes Automatizados:**
   - Atualizado `test/helpers/mockTafApi.ts` para refletir o contrato uniforme `ApiResponse<T>` (`success: true`, `data`, `meta`, `timestamp`).
   - Atualizado `__tests__/services/tafService.test.ts` com 27 testes cobrindo respostas envelopadas, montagem de query strings com paginação, e concatenação de mensagens de múltiplos erros de validação Zod.
3. **Validação Final de Qualidade:**
   - `npx tsc --noEmit` executado com **0 erros** de tipagem.
   - `npx eslint .` executado em todo o repositório com **0 erros e 0 warnings**.
   - `npm test` executado com **34 arquivos de teste e 309 testes aprovados (100% de sucesso)**.
   - `npm run build` compilado com sucesso com todas as páginas e rotas otimizadas.

---

## 4. 🎯 Critérios de Aceite (Definition of Done)

- [x] Pacote `zod` instalado e schemas implementados em `lib/validations/taf.ts`.
- [x] Utilitários de resposta e tratamento de erro em `lib/api/response.ts`.
- [x] Todas as rotas em `app/api/taf/*` protegidas contra payloads inválidos via Zod.
- [x] Mensagens de validação em português retornadas amigavelmente pelo backend.
- [x] Suporte a paginação e limites nas rotas de listagem.
- [x] 100% dos testes unitários e de integração aprovados no Vitest.
- [x] Build de produção (`npm run build`) compilado com sucesso.
