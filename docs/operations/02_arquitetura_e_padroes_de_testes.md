# Arquitetura e Padrões de Testes — PaceLab

> **Documentação Técnica de Qualidade — PaceLab**  
> Guia de referência para estruturar, escrever e manter testes automatizados (unitários, APIs, serviços, componentes e páginas) com Vitest, React Testing Library e cobertura V8.

---

## 1. Estrutura Canônica da Suíte (`__tests__/`)

Todos os testes, helpers compartilhados e fixtures residem exclusivamente sob [`__tests__/`](../../__tests__) (não existe pasta `test/` paralela na raiz):

| Diretório | Escopo e Responsabilidade | Exemplos Principais |
|---|---|---|
| `__tests__/lib/` | Regras puras de domínio: matemática (`pace`, `taf`, `goals`, `intervals`, `calories`, `cooper`, `evolution`, `averages`, `splitsAnalysis`, `math/weeklyAdherence`), formatação (`dateFormatting`, `formatting`), validações (`tafValidations`, `validation`), helpers de API (`apiResponse`, `apiHelpers`), Swagger (`swaggerBuilders`), `env`, `localStorage`, parsers (`fit/`, `gpx/`, `activityParser/`) e Google Sheets (`googleSheets/`). | `cooper.test.ts`, `dateFormatting.test.ts`, `apiHelpers.test.ts`, `swaggerBuilders.test.ts`, `fit/parseFit.test.ts`, `googleSheets/syncService.test.ts` |
| `__tests__/api/` | Route Handlers Next.js App Router invocados diretamente com `Request` e mocks de Prisma/Sheets, validando status HTTP, envelopes `ApiResponse`, `code`, `PathIdSchema`, paginação, conflitos `409`, autenticação `CRON_SECRET` e contrato OpenAPI. | `taf-routes.test.ts`, `profile-routes.test.ts`, `activity-parse-routes.test.ts`, `sync-sheets-route.test.ts`, `cron-sync-weekly-plan-route.test.ts`, `weekly-plan-route.test.ts`, `docs.test.ts` |
| `__tests__/services/` | Camada de serviço cliente (`apiClient`, `tafService`, `profileService`), cache otimista em `sessionStorage`, fallbacks offline, IMC e prompt semanal. | `apiClient.test.ts`, `tafService.test.ts`, `profileService.test.ts` |
| `__tests__/components/` | Testes de componentes React isolados (primitivos `ui/`, gráficos, formulários, cards, importação individual/lote, comparador, listas e Swagger UI). | `PeriodComparator.test.tsx`, `TafAttemptList.test.tsx`, `SwaggerUIViewer.test.tsx`, `Footer.test.tsx`, `WeeklyAdherenceCard.test.tsx`, `BatchImportPanel.test.tsx` |
| `__tests__/pages/` | Fluxos ponta a ponta de página com React Testing Library + `userEvent` sobre `mockTafApi.ts` (navegação de abas, CRUD, cache SWR, backup e importação). | `home.test.tsx`, `treinos.test.tsx`, `meu-taf.test.tsx`, `meu-taf-period-and-backup.test.tsx`, `perfil.test.tsx`, `historico.test.tsx`, `resilienceCache.test.tsx` |
| `__tests__/qa/` | Cenários de validação de exemplos clássicos e regras matemáticas de referência. | `enunciado_exemplos.test.ts` |
| `__tests__/helpers/` | Helpers reutilizáveis de mock HTTP/estado para páginas e componentes. | [`mockTafApi.ts`](../../__tests__/helpers/mockTafApi.ts) |
| `__tests__/fixtures/` | Fixtures binárias `.FIT` (`10` sintéticas) e XML `.GPX` (`20` sintéticas + amostras reais), documentadas em `fit/README.md` e `gpx/README.md`. | `fixtures/fit/*.fit`, `fixtures/gpx/*.gpx` |

---

## 2. Configuração (`vitest.config.ts`) e Setup Global (`vitest.setup.ts`)

### [`vitest.config.ts`](../../vitest.config.ts)
- **Ambiente:** `jsdom` com `globals: true` e alias `@` apontando para a raiz do repositório.
- **Descoberta:** `include: ['**/__tests__/**/*.{test,spec}.{ts,tsx}']`.
- **Isolamento de credenciais:** define `GOOGLE_SHEETS_SPREADSHEET_ID: ''` e `GOOGLE_CREDENTIALS_BASE64: ''` no bloco `test.env`.
- **Cobertura (`@vitest/coverage-v8`):**
  - `include: ['lib/**/*.ts']`
  - `exclude: ['lib/storage/**', 'lib/prisma.ts']`
  - `thresholds`: **`lines: 90`** e **`functions: 90`** (meta operacional do projeto: **todos os arquivos individuais em `lib/**/*.ts` >= 90%**).

### [`vitest.setup.ts`](../../vitest.setup.ts)
- Registra matchers `@testing-library/jest-dom/vitest`.
- Reforça `process.env.GOOGLE_SHEETS_SPREADSHEET_ID = ""` e `process.env.GOOGLE_CREDENTIALS_BASE64 = ""` (como strings vazias, não `delete`, impedindo que o carregamento de `.env` pelo Prisma reative credenciais reais em testes).
- Define o polyfill global `global.ResizeObserver` (necessário para `ResponsiveContainer` do Recharts). **Regra:** não redefinir `ResizeObserver` dentro de arquivos de teste individuais.

---

## 3. Padrões de Mocks e Helpers Compartilhados

### 3.1. Helper Central de API para UI (`__tests__/helpers/mockTafApi.ts`)
Testes de páginas (`__tests__/pages/`) e componentes conectados a APIs devem usar `setupMockTafApi(initialState?)` de [`__tests__/helpers/mockTafApi.ts`](../../__tests__/helpers/mockTafApi.ts) em vez de reescrever `global.fetch` manualmente:

```typescript
import {
  setupMockTafApi,
  createMockJsonResponse,
} from "@/__tests__/helpers/mockTafApi";

const mockApi = setupMockTafApi({
  trainings: [/* estado inicial opcional */],
});

// Para simular falhas pontuais preservando o restante das rotas:
mockApi.setRequestHandler(async (url, _init, fallback) => {
  if (url.includes("/api/taf/health")) {
    return createMockJsonResponse({ success: false, error: "Database offline" }, 503);
  }
  return fallback();
});
```

- O helper implementa em memória todas as rotas REST reais (`/api/taf/health`, `/api/taf/goals`, `/api/taf/attempts`, `/api/taf/attempts/[id]`, `/api/taf/trainings`, `/api/taf/trainings/[id]`, `/api/profile`, `/api/profile/weight`, `/api/profile/weight/[id]`, `/api/sync/sheets` e `/api/weekly-plan`, já inicializando `summary.adapted: 0`).
- Prefira `mockApi.setRequestHandler(...)` para injetar erros HTTP (`400`, `404`, `409`, `500`, `503`); reserve `global.fetch = vi.fn(...)` apenas para testes unitários diretos do cliente HTTP (`tafService.test.ts`) ou testes de *race condition* com promises controladas manualmente.

### 3.2. Mocks de Prisma e Google Sheets em Rotas (`__tests__/api/`)
- Em testes de Route Handlers (`__tests__/api/*.test.ts`), mocke `@/lib/prisma` com `vi.mock("@/lib/prisma", ...)` definindo apenas os delegates necessários e limpe mocks no `beforeEach(() => vi.clearAllMocks())`.
- Para testar `P2025` (`404`), `P2002` (`409`) e `PrismaClientInitializationError` (`503`), instancie classes reais de `Prisma` (`new Prisma.PrismaClientKnownRequestError(...)`) para garantir fidelidade ao `instanceof` usado em [`lib/api/response.ts`](../../lib/api/response.ts).
- Para testar módulos dependentes de Google Sheets sem rede, mocke `@/lib/googleSheets` ou o cliente `@googleapis/sheets` conforme adotado em [`__tests__/lib/googleSheets/syncService.test.ts`](../../__tests__/lib/googleSheets/syncService.test.ts) e [`__tests__/api/sheets-sync-hooks.test.ts`](../../__tests__/api/sheets-sync-hooks.test.ts).

---

## 4. Boas Práticas Obrigatórias ao Escrever Novos Testes

1. **Independência de Fuso Horário (`America/Fortaleza`):**
   - Nunca construa datas relativas de teste com `new Date().toISOString().slice(0, 10)` quando o componente usa o calendário de Fortaleza — entre **21:00 e 23:59 BRT**, UTC já está no dia seguinte (`D+1`).
   - Use `getTodayFortalezaDateKey()` / `shiftFortalezaDateKey(...)` de [`lib/formatting/date.ts`](../../lib/formatting/date.ts) ou fixe o relógio com `vi.useFakeTimers({ shouldAdvanceTime: true })` + `vi.setSystemTime(new Date("2026-10-30T12:00:00-03:00"))` (lembrando de chamar `vi.useRealTimers()` no `afterEach`).
   - Valide testes temporais com `TZ=UTC` e `TZ=Asia/Tokyo` sempre que mexer em lógica de datas.
2. **Interações reais e acessibilidade:**
   - Prefira `userEvent.setup()` e queries acessíveis (`getByRole`, `getByLabelText`, `findByText`) em vez de seletores CSS frágeis.
   - Em ações destrutivas, teste o fluxo completo em **2 cliques inline** (*Excluir* → *Sim, Excluir* / *Cancelar*), nunca mockando `window.confirm`.
3. **Limpeza de estado entre testes:**
   - Limpe `localStorage.clear()`, `sessionStorage.clear()` e restaure spies (`vi.restoreAllMocks()`) em `beforeEach`/`afterEach` para evitar vazamento de cache SWR entre casos.
4. **Cobertura contínua em `lib/`:**
   - Todo novo módulo em `lib/**/*.ts` deve nascer acompanhado de suíte dedicada cobrindo caminhos felizes, bordas e falhas, mantendo **>= 90% individualmente** em `npm run test:coverage`.

---

## 5. Fixtures `.FIT` / `.GPX` e Comandos de Verificação

- **Execução rápida:** `npm test`
- **Cobertura completa V8:** `npm run test:coverage`
- **Verificação multi-timezone:** `TZ=UTC npm test`
- **Validação binária `.FIT` e XML `.GPX`:** `npm run fit:test:synthetic` e `npm run gpx:test:synthetic` (detalhes de cada fixture em [`__tests__/fixtures/fit/README.md`](../../__tests__/fixtures/fit/README.md) e [`__tests__/fixtures/gpx/README.md`](../../__tests__/fixtures/gpx/README.md)).

> Para o pipeline completo de deploy, migrations e troubleshooting operacional, consulte [`01_testes_deploy_e_troubleshooting.md`](./01_testes_deploy_e_troubleshooting.md).
