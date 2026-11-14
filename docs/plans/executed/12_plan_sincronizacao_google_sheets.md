# Plano de Implementação 12 — Sincronização Completa e Bidirecional PostgreSQL ↔ Google Sheets (`"Treinos_Corrida"`) + Documentação

> **Status:** Concluído e Homologado ✅ — Todas as fases (0–7) implementadas, verificadas em produção/Supabase + Google Sheets e movidas para `docs/plans/executed/`  
> **Branch recomendada:** `feat/sheets-sync` (a partir de `main` em `6a4363f`)  
> **Escopo:** Camada completa de sincronização bidirecional entre PostgreSQL (Prisma) e Google Sheets (`Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas`), compatibilidade serverless para Vercel (`@googleapis/sheets` + `google-auth-library`, Base64, `await` obrigatório, proteção de quota), hooks automáticos em tempo real, backfill em lote, sincronização reversa Planilha → Banco, controles de UI/feedback, suíte de testes automatizados (Vitest + RTL) e documentação completa em `README.md` e `.env.example`.

---

## 1. Objetivo, Princípios e Mapa de Adaptação à Arquitetura Real do PaceLab

Este plano traduz todos os requisitos funcionais e de infraestrutura da integração **PostgreSQL ↔ Google Sheets (`"Treinos_Corrida"`)** diretamente para a estrutura real e convenções já consolidadas no **PaceLab** (Planos 01–11).

### 1.1 Princípios Não Negociáveis
1. **PostgreSQL como Fonte Primária em Tempo de Execução:** Nenhuma leitura de página (`GET`), cálculo ou gráfico do PaceLab passa a depender da API do Google Sheets; todas as telas continuam consumindo exclusivamente o banco relacional.
2. **Falha Segura (*Graceful Degradation*):** A ausência de credenciais do Google ou instabilidade temporária da Google Sheets API **nunca** pode quebrar o carregamento das páginas do site, **nem** derrubar os 646+ testes existentes ou falhar o salvamento de um treino/simulado no PostgreSQL.
3. **Zero Dependência Pesada na Vercel:** Uso estrito de `@googleapis/sheets` + `google-auth-library` (nunca o pacote monolítico `googleapis`), rodando exclusivamente em rotas Node.js (`export const runtime = "nodejs"`).
4. **Sem *Fire-and-Forget* em Serverless:** Toda chamada automática em rotas HTTP executa `await` dentro de `try { ... } catch` antes do `return NextResponse`, garantindo execução completa na Vercel sem bloquear a persistência no Prisma.
5. **Cobertura V8 ≥ 90% em `lib/**/*.ts`:** Todo módulo novo sob `lib/googleSheets/**` deve obedecer `vitest.config.ts` (`lines >= 90%`, `functions >= 90%`) com suíte 100% determinística e offline por padrão.
6. **Segurança de Credenciais:** Nunca versionar chaves `.json` de Conta de Serviço no repositório (tratar imediatamente `pacelabd-12dbb8457153.json` na Fase 0 via conversão para Base64 + `.gitignore` + remoção do arquivo da árvore de trabalho).

### 1.2 Mapa de Adaptação: Especificação Genérica → Código Real do PaceLab

| Item na Especificação | Convenção Real no PaceLab | Motivo Técnico da Adaptação |
| :--- | :--- | :--- |
| `src/lib/googleSheetsClient.ts` | `lib/googleSheets/client.ts` | O projeto não possui pasta `src/`; `tsconfig.json` mapeia `@/*` para `./*` e `vitest.config.ts` cobre `lib/**/*.ts`. |
| `src/services/googleSheetsSyncService.ts` | `lib/googleSheets/syncService.ts` + `lib/googleSheets/mapper.ts` + `lib/googleSheets/types.ts` | Mantém funções puras (mapeamento/sanitização/regras) separadas de I/O (API Sheets + Prisma), facilitando testes de unidade e manutenção. |
| Leitura direta de `process.env` no cliente | Centralizado em `lib/env.ts` (`getGoogleSheetsEnvConfig()`) | Segue o mesmo padrão não-bloqueante de `getDatabaseEnvConfig()` já usado no projeto. |
| `ActivitySource`: `"fit_upload" \| "gpx_upload" \| "manual" \| "sheets"` | Adicionar `'sheets'` ao `enum ActivitySource` no `prisma/schema.prisma`, `types/index.ts`, `lib/validations/taf.ts`, `lib/activity.ts` e `lib/swagger/spec.ts` | Atualmente `ActivitySource` possui apenas `manual`, `gpx_upload`, `fit_upload`. |
| `TafAttempt.syncedToSheetsAt` | Adicionar `syncedToSheetsAt DateTime? @map("synced_to_sheets_at")` em `TafAttempt` no `prisma/schema.prisma` | `TrainingSession` já possui `syncedToSheetsAt` (desde o Plano 11), mas `TafAttempt` ainda não possui. |
| `ActivityType` com `"teste_taf"` | Manter os 6 valores reais do `enum ActivityType` (`rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`, `caminhada`) | Decisão `D2` do Plano 11 definiu que simulados de 12 min pertencem a `TafAttempt` (`Simulados_TAF`). O espelhamento opcional em `TrainingSession` grava `activityType = "tempo_run"` com prefixo `"[Simulado TAF] "` em `notes`; na leitura reversa da aba `Log_Treinos`, eventual valor `"teste_taf"` é normalizado graciosamente para `"tempo_run"` preservando `"[Simulado TAF]"` nas notas. |
| Rotas de escrita genéricas | Hooks nas rotas reais existentes:<br>• `app/api/taf/trainings/route.ts` (`POST`)<br>• `app/api/taf/trainings/[id]/route.ts` (`PUT`, `DELETE`)<br>• `app/api/taf/attempts/route.ts` (`POST`)<br>• `app/api/taf/attempts/[id]/route.ts` (`PUT`, `DELETE`)<br>• `app/api/taf/goals/route.ts` (`POST`)<br>• `app/api/profile/route.ts` (`PUT`)<br>• `app/api/profile/weight/route.ts` (`POST`)<br>• `app/api/profile/weight/[id]/route.ts` (`DELETE`) | Essas são todas as rotas mutáveis reais do PaceLab (rotas `gpx-preview` e `parse-activity` são apenas leitura/parse). |
| Restauração de backup (`tafService.importBackupJson`) | Suporte a `?skipSheetsSync=true` nas rotas `POST` durante loop de importação + sincronização única em lote ao final | Evita disparar N chamadas individuais à Google Sheets API durante restauração JSON e respeita o limite de 60 escritas/minuto. |
| Envelopes HTTP / Erros | `withApiHandler`, `apiSuccess`, `apiError` de `lib/api/response.ts` + Zod schemas | Mantém consistência de contratos da API e documentação OpenAPI em `/api/docs/spec`. |
| UI de Sincronização | • Toolbar de `app/treinos/page.tsx` + seção de sincronização em `components/meu-taf/GoalAndBackupSettings.tsx` (`/meu-taf`)<br>• Badges nos cards `TrainingCard.tsx` e `TafAttemptCard.tsx`<br>• Filtro `"sheets"` em `TrainingList.tsx` (`data-testid="filter-source-sheets"`) | Encaixa-se naturalmente no fluxo de diário, simulados TAF e backup/cloud já existentes na interface. |

---

## 2. Contrato Técnico Detalhado

### 2.1 Aba `Log_Treinos` (`Log_Treinos!A:O`) — Espelho de `TrainingSession`

| Col | Cabeçalho | Direção Banco → Planilha | Direção Planilha → Banco (`Sheets → Postgres`) |
| :--- | :--- | :--- | :--- |
| **A** | `ID` | `session.id` (UUID ou ID legado `trn_*` existente) | Qualquer `ID` não-vazio existente no PostgreSQL atualiza o registro (suporta UUID e IDs `trn_*`); se vazio, aciona deduplicação (`±0.05 km` e `±10 s` na mesma data) ou cria com `crypto.randomUUID()` e grava UUID de volta na Coluna A; se preenchido com ID inexistente no banco, ignora com `warning` (não ressuscita exclusões). |
| **B** | `Data` | `YYYY-MM-DD` no fuso `America/Fortaleza` (`Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" })`) | Parse estrito `YYYY-MM-DD` (aceita também `DD/MM/YYYY` se editado manualmente em pt-BR no Sheets) convertendo para `YYYY-MM-DDT12:00:00.000Z` (meio-dia UTC evita recuo de dia em `UTC-3`). |
| **C** | `Origem` | `session.source` (`fit_upload`, `gpx_upload`, `manual`, `sheets`) | Se linha nova sem ID: força `"sheets"`. Em atualização de linha existente: normaliza para valor válido do enum, **nunca** rebaixando `"fit_upload"`/`"gpx_upload"` existentes no banco. |
| **D** | `Tipo` | `session.activityType` (`rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`, `caminhada`) | Normaliza alias/acentos/minúsculas (`"Rodagem Leve"` → `rodagem_leve`, `"teste_taf"` → `tempo_run`, fallback seguro `corrida_continua` com warning no log de sync). |
| **E** | `Distância (km)` | `Number(session.distanceKm.toFixed(2))` | Parse numérico tolerante a vírgula pt-BR (`"10,50"` → `10.5`) e sufixo `"km"`; obrigatório `> 0`. |
| **F** | `Tempo Mov.` | `formatDurationHHMMSS(session.durationSeconds)` → sempre 2 dígitos na hora (`"00:34:12"`) | Aceita `"HH:MM:SS"`, `"MM:SS"` (via `parseTime` estendido) e número serial/segundos se aplicável; obrigatório `> 0`. |
| **G** | `Pace Médio (min/km)` | Enviar com prefixo apóstrofo `'` + `session.paceFormatted` (ex.: `'5:13`) em modo `USER_ENTERED` | Remove apóstrofo líder se presente; aceita `"5:13"`, `"05:13"` e corrige conversão acidental do Sheets `"05:13:00"` quando coerente com distância/tempo; recalcula `speedKmh`, `paceSeconds` e `paceFormatted` sempre que distância ou tempo mudarem. |
| **H** | `FC Média` | `session.avgHeartRate ?? ""` | Inteiro opcional (`30..240`). Vazio → `null` apenas em `manual`/`sheets` (preserva valor existente se `fit_upload`/`gpx_upload`). |
| **I** | `FC Máx` | `session.maxHeartRate ?? ""` | Inteiro opcional (`30..240`). Mesma proteção de telemetria em uploads `.FIT`/`.GPX`. |
| **J** | `Elevação (m)` | `session.elevationGainM != null ? Math.round(session.elevationGainM) : ""` | Número opcional (`>= 0`). |
| **K** | `Cadência` | `session.avgCadence ?? ""` | Inteiro opcional (`1..300`). |
| **L** | `RPE (1-10)` | `session.perceivedEffort ?? ""` | Inteiro opcional clamped/validado entre `1` e `10`. |
| **M** | `Peso (kg)` | `session.bodyWeightKg ?? ""` | Número opcional (`20..300`), tolerante a vírgula pt-BR. |
| **N** | `Tênis` | Sanitizado (single-line + anti-Formula Injection) ou `""` | String sanitizada (máx. 100 chars) ou `null`. |
| **O** | `Observações` | `session.notes` com `\r?\n` → `" | "` e neutralização de fórmula inicial (`=`, `+`, `-`, `@`); preserva consolidação com título (`"${cleanTitle} — ${cleanNotes}"`) | String sanitizada (máx. 1000 chars) ou `null`. |

> **Nota sobre Título do Treino (`workoutTitle`):** Em [GpxImportPanel.tsx](file:///home/kauan/%C3%81rea%20de%20trabalho/PaceLab/components/treinos/GpxImportPanel.tsx), o formulário pós-upload já consolida `workoutTitle` + `notes` no formato `${cleanTitle} — ${cleanNotes}` (respeitando o limite de 1.000 caracteres do Zod) antes do envio para `POST /api/taf/trainings` e `POST /api/taf/attempts`. Manteremos esse contrato exato para preservar 100% da compatibilidade com os testes das Fases 10 e 11, refletindo automaticamente na Coluna **O** (`Log_Treinos`) e Coluna **J** (`Simulados_TAF`).

### 2.2 Aba `Simulados_TAF` (`Simulados_TAF!A:J`) — Espelho de `TafAttempt`

| Col | Cabeçalho | Direção Banco → Planilha | Direção Planilha → Banco (`Sheets → Postgres`) |
| :--- | :--- | :--- | :--- |
| **A** | `ID` | `attempt.id` (UUID ou ID legado `taf_*` / `att_*`) | Qualquer `ID` não-vazio existente no PostgreSQL atualiza o registro; se vazio, deduplica (`YYYY-MM-DD`, distância `±25 m`, tempo real `±10 s`) ou cria com `source: "sheets"` + `crypto.randomUUID()` e escreve o UUID na Coluna A; ID órfão inexistente no banco é ignorado com `warning`. |
| **B** | `Data` | `YYYY-MM-DD` (`America/Fortaleza`) | Parse `YYYY-MM-DD` (ou `DD/MM/YYYY`) → `YYYY-MM-DDT12:00:00.000Z`. |
| **C** | `Local` | `attempt.locationType ?? ""` (`pista_400m`, `rua_plana`, `parque_praca`, `esteira`, `outro`) | Normaliza chave exata ou label humanizada de `LOCATION_LABELS` → `LocationType \| null`. |
| **D** | `Tempo Alvo (s)` | `attempt.targetDurationSeconds` (padrão `720`) | Inteiro positivo (default `720` se omitido). |
| **E** | `Tempo Real (s)` | `attempt.actualDurationSeconds` | Inteiro positivo (aceita também string `MM:SS` caso digitada manualmente na planilha). |
| **F** | `Distância (m)` | `attempt.distanceMeters` | Inteiro positivo (`>= 100`). |
| **G** | `Pace (min/km)` | Prefixado com apóstrofo `'` + `attempt.paceFormatted` (ex.: `'5:13`) | Recalculado de forma determinística a partir de `actualDurationSeconds` e `distanceMeters` (`calcPaceFromDistanceAndTime`). |
| **H** | `Vel. (km/h)` | `Number(attempt.speedKmh.toFixed(2))` | Recalculado de forma determinística a partir de `distanceMeters` e `actualDurationSeconds`. |
| **I** | `Status Meta` | Calculado contra `TafGoal` ativo (`effectiveMin = goal.minDistanceMeters`, `effectiveTarget = Math.max(goal.minDistanceMeters, goal.targetDistanceMeters)`):<br>• `distanceMeters >= effectiveTarget` → `"Meta Segurança Atingida"`<br>• `distanceMeters >= effectiveMin` → `"Aprovado (Mínimo)"`<br>• caso contrário → `"Abaixo do Mínimo"` | Coluna derivada (somente escrita na ida; ignorada na importação reversa). |
| **J** | `Observações` | `attempt.notes` sanitizado (`\r?\n` → `" | "` + anti-Formula Injection) | String sanitizada (máx. 1000 chars) ou `null`. |

> **Espelhamento opcional Simulado TAF → Diário (`Log_Treinos`):** Quando o usuário registrar um simulado de 12 minutos (seja no formulário manual [TafAttemptForm.tsx](file:///home/kauan/%C3%81rea%20de%20trabalho/PaceLab/components/meu-taf/TafAttemptForm.tsx) ou no pós-upload de [GpxImportPanel.tsx](file:///home/kauan/%C3%81rea%20de%20trabalho/PaceLab/components/treinos/GpxImportPanel.tsx)) e marcar a opção **"Também registrar no Diário de Treinos"**, o cliente salva o `TafAttempt` e também cria a `TrainingSession` pareada (`activityType: "tempo_run"`, `distanceKm: distanceMeters / 1000`, notas prefixadas com `"[Simulado TAF]"`), e o backend sincroniza **cada entidade em sua respectiva aba** com seu próprio ID.

### 2.3 Aba `Perfil_e_Metas` (`Perfil_e_Metas!A2:I2`) — Espelho Vivo de `UserProfile` + `TafGoal`

Sempre sobrescreve exclusivamente a faixa **`Perfil_e_Metas!A2:I2`** em `valueInputOption: "USER_ENTERED"` (preservando os cabeçalhos da Linha 1; caso não exista linha em `TafGoal`, utiliza os defaults canônicos de `prisma/schema.prisma`):

| Col | Cabeçalho | Regra Exata de Origem |
| :--- | :--- | :--- |
| **A** | `Nome` | `profile?.name ?? ""` (sanitizado) |
| **B** | `Idade` | `calculateAge(profile.birthDate)` (via `lib/math/cooper.ts`) em anos completos até a data atual, ou `""` |
| **C** | `Altura (cm)` | `profile?.heightCm ?? ""` |
| **D** | `Peso Atual (kg)` | Peso mais recente comparando o último `WeightRecord` (`recordedAt`, `desc`) e `profile.currentWeightKg` (ou `""`) |
| **E** | `Edital Alvo` | `goal?.institutionName ?? "Edital Padrão"` (sanitizado) |
| **F** | `Distância Mínima (m)` | `goal?.minDistanceMeters ?? 2400` |
| **G** | `Distância Alvo (m)` | `goal?.targetDistanceMeters ?? 2600` |
| **H** | `Tempo Prova (min)` | `goal?.targetDurationMinutes ?? 12` |
| **I** | `Data Prova` | `goal?.targetExamDate` formatada em `YYYY-MM-DD` (`America/Fortaleza`) ou `""` |

### 2.4 Regras Críticas de Confiabilidade, Segurança e Serverless

1. **Armadilha do `USER_ENTERED` para Pace (`"5:13"`):**
   - Sem cuidado especial, `USER_ENTERED` converte `"5:13"` em duração de planilha `05:13:00` (5 horas e 13 minutos).
   - **Regra:** Todas as células de Pace (`Log_Treinos!G`, `Simulados_TAF!G`) devem ser gravadas com prefixo apóstrofo `'` (`"'5:13"`). Na leitura (`valueRenderOption: "FORMATTED_VALUE"`), o Sheets devolve `"5:13"` limpo como texto visível!
2. **Prevenção contra *Formula Injection*:**
   - Campos de texto livre (`Observações`, `Tênis`, `Nome`, `Edital Alvo`) devem passar por `sanitizeSheetText(value)`: substitui `\r?\n` por `" | "`, aplica `.trim()` e prefixa `'` caso o primeiro caractere seja `=`, `+`, `-`, `@`, `\t` ou `\r`.
3. **Prevenção contra Loop `updatedAt > syncedToSheetsAt` no Prisma:**
   - Como os modelos possuem `@updatedAt`, gravar `syncedToSheetsAt: new Date()` via `prisma.*.update` ou `updateMany` atualiza `updatedAt` alguns milissegundos depois de `syncedToSheetsAt`.
   - **Regra dupla de defesa 100% Prisma-nativa:**
     1. As rotas `PUT /api/taf/trainings/[id]` e `PUT /api/taf/attempts/[id]` passam a gravar `syncedToSheetsAt: null` no update (quando o payload não especificar `syncedToSheetsAt`) antes de invocar `safeAutoSync` — assim qualquer edição fica explicitamente marcada como pendente se o Google Sheets falhar, e é carimbada logo em seguida se tiver sucesso; **e**
     2. Na consulta de pendências de backfill incremental (`forceFullResync = false`), considerar modificado apenas quando `syncedToSheetsAt === null` **ou** `(updatedAt.getTime() - syncedToSheetsAt.getTime()) > 2000` (margem de 2 segundos que neutraliza micro-jitter do `@updatedAt` durante o próprio `update`/`updateMany` de sync).
4. **Cálculo Calórico Automático no Sync Reverso (`Sheets → Banco`):**
   - Ao inserir novo registro em `TrainingSession` vindo da aba `Log_Treinos` (`source: "sheets"`), buscar o peso do próprio registro (`Col M`) ou `profile.currentWeightKg` e calcular `activeCalories`, `totalCalories`, `metValue`, `calorieMethod`, `calorieSource` e `calorieMetadata` usando `estimateTrainingCalories` + `buildCaloriePayload` de `lib/math/calories.ts` (se peso estiver disponível).
5. **Proteção de Telemetria Rica no Sync Reverso (`Sheets → Banco`):**
   - Registros no Postgres com `source` igual a `"fit_upload"` ou `"gpx_upload"`:
     - **Nunca** têm `splits`, `laps`, `elapsedSeconds`, `externalId`, `source` ou metadados calóricos alterados/zerados pelo Sheets;
     - **Nunca** têm `avgHeartRate`, `maxHeartRate`, `avgCadence` ou `elevationGainM` apagados caso as células correspondentes venham vazias da planilha;
     - Só aplicam alterações nos campos contextuais/editáveis (`activityType`, `perceivedEffort`, `bodyWeightKg`, `shoeName`, `notes`) quando houver mudança efetiva em relação ao banco.
   - Registros `"manual"` ou `"sheets"` aceitam atualização completa das colunas `B..O`, recalculando `speedKmh`, `paceSeconds` e `paceFormatted` de forma consistente sempre que `distanceKm` ou `durationSeconds` mudarem.
   - Nenhuma escrita no Prisma é executada se os valores normalizados da linha forem **idênticos** aos valores já gravados no banco (evita loops infinitos de sync).
6. **Eficiência de Quota e Limite de Tempo na Vercel:**
   - Leitura inicial em lote único: `sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: ["Log_Treinos!A1:O", "Simulados_TAF!A1:J", "Perfil_e_Metas!A1:I2"], valueRenderOption: "FORMATTED_VALUE" })` → **1 única chamada HTTP** para ler todas as abas!
   - Escrita em lote: `spreadsheets.values.batchUpdate` (atualizações em linhas existentes, incluindo gravação de UUIDs gerados na Coluna A) e `spreadsheets.values.append` (inserções em bloco), fatiados em lotes (`chunkSize = 200`) com *retry* exponencial controlado apenas para HTTP `429` / `503` transitórios (máx. 2 tentativas curtas para caber no timeout serverless).
7. **Ordem Cronológica e Mapeamento de Cabeçalhos Tolerante a Localização:**
   - Backfill busca registros ordenados por `sessionDate ASC` e `testDate ASC`.
   - Ao ler a planilha, valida cabeçalhos da Linha 1 de forma case/acento-tolerante ou por índice fixo contratual (`A:O`, `A:J`, `A2:I2`), ignorando linhas totalmente em branco e registrando avisos legíveis (`warnings`) por linha inválida sem abortar o restante do lote.

---

## 3. Decisões Consolidadas (`D1`–`D10`)

- **D1 (Pacotes Google Enxutos):** Instalar apenas `@googleapis/sheets` e `google-auth-library` via `npm install`, mantendo `next.config.mjs` e bundle de rotas cliente intactos.
- **D2 (Modularização sob `lib/googleSheets/`):** Organizar em `types.ts`, `client.ts`, `mapper.ts`, `syncService.ts` e `index.ts`, com injeção opcional de cliente/dependências para testes unitários 100% offline.
- **D3 (Migration Aditiva Única):** Estender `ActivitySource` com `'sheets'` e adicionar `TafAttempt.syncedToSheetsAt`; manter `ActivityType` nos 6 valores atuais (`rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`, `caminhada`).
- **D4 (Autenticação Base64 Segura):** Credenciais via `GOOGLE_CREDENTIALS_BASE64` + `GOOGLE_SHEETS_SPREADSHEET_ID` decodificadas via `lib/env.ts`; ausência de env faz rotas REST normais pularem sync silenciosamente (`{ skipped: true }`) enquanto `POST /api/sync/sheets` retorna HTTP `503` estruturado.
- **D5 (Escopo Serverless `await` Não-Bloqueante):** Em rotas `POST`/`PUT`/`DELETE`, o sync aguarda (`await`) em `try/catch`; falhas gravam log `[SheetsSync]` e mantêm `syncedToSheetsAt: null` sem retornar erro ao usuário.
- **D6 (Endpoint Dedicado de Sincronização):** `POST /api/sync/sheets` aceita `{ direction?: "bidirectional" | "push" | "pull", forceFullResync?: boolean }` (default `"bidirectional"`, `forceFullResync: false`), retornando relatório completo de contagens (`pushed`, `updated`, `pulled`, `linked`, `skipped`, `warnings`, `durationMs`). `GET /api/sync/sheets` opcional retorna status leve `{ configured: boolean, pendingTrainingsCount, pendingAttemptsCount }` para badge na UI sem chamar API do Google!
- **D7 (Direção Padrão no Fluxo Manual `"Sincronizar Planilha"`):** Ordem segura no sync bidirecional: **1º Pull (`Sheets → Banco`)** para absorver edições/novas linhas da planilha e vincular IDs antes de reescrever → **2º Push/Backfill (`Banco → Sheets`)** para enviar pendências, atualizações e `Perfil_e_Metas!A2:I2` já com estado consolidado. (Se `forceFullResync: true`, faz push completo garantindo que o estado do banco prevaleça após opcionalmente puxar linhas órfãs sem ID).
- **D8 (Proteção para Importação de Backup JSON em Lote):** Rotas `POST /api/taf/trainings` e `POST /api/taf/attempts` suportam query param `?skipSheetsSync=true` (usado por `tafService.importBackupJson`), disparando 1 único `syncWithGoogleSheets("push")` ao fim da restauração quando configurada.
- **D9 (Cálculo Automático de Calorias e Métricas no Sync Reverso):** Linhas criadas/editadas manualmente no Sheets sem calorias ganham cálculo automático pelo Compêndio 2024 (`lib/math/calories.ts`) usando o peso informado ou o peso do perfil.
- **D10 (Documentação Passo a Passo e Segurança Local):** Documentar claramente no `README.md` (Linux, macOS e PowerShell/Windows) como criar a Service Account, habilitar Google Sheets API, compartilhar a planilha como Editor, converter JSON para Base64 sem quebras de linha (`base64 -w 0`), preencher `.env.example` e configurar Vercel Env Vars.

---

## 4. Fases de Execução e Portões de Qualidade (`PQ`)

### Fase 0 — Segurança de Credenciais, Dependências, Ambiente e Estrutura Base

- **Objetivo:** Blindar o repositório quanto a chaves privadas, preparar ambiente isolado/branch, instalar dependências enxutas do Google e centralizar leitura segura de variáveis de ambiente.
- **Ações obrigatórias:**
  1. Criar branch `feat/sheets-sync` a partir de `main`.
  2. Converter o arquivo atualmente *untracked* `pacelabd-12dbb8457153.json` na raiz para `GOOGLE_CREDENTIALS_BASE64` no arquivo `.env` local (garantindo ausência de `\n` com `base64 -w 0`), adicionar `GOOGLE_SHEETS_SPREADSHEET_ID` no `.env`, validar o decode em memória, atualizar `.gitignore` para bloquear qualquer chave GCP/Service Account (`*-credentials.json`, `*service-account*.json`, `pacelabd-*.json`, `*.key.json`) e **remover `pacelabd-12dbb8457153.json` do diretório do repositório**.
  3. Instalar dependências:
     ```bash
     npm install @googleapis/sheets google-auth-library
     ```
  4. Atualizar `.env.example` com:
     - `GOOGLE_CREDENTIALS_BASE64=""`
     - `GOOGLE_SHEETS_SPREADSHEET_ID=""`
     (com comentários explicativos breves).
  5. Atualizar `lib/env.ts` com `GoogleSheetsEnvConfig`, `getGoogleSheetsEnvConfig()` (faz parse Base64 + JSON apenas quando chamado e valida presença de `client_email`, `private_key` e `spreadsheetId` sem lançar erro no boot do Next.js) e helper `isGoogleSheetsConfigured()`.
  6. Criar esqueleto de tipos em `lib/googleSheets/types.ts`.
  7. Garantir que o container PostgreSQL de testes locais (`pacelab-pg-test` na porta `5433`) esteja ativo para ensaiar a Fase 1 antes de tocar o banco Supabase.
- **Arquivos criados/modificados:** `.gitignore`, `.env.example`, `package.json`, `package-lock.json`, `lib/env.ts`, `lib/googleSheets/types.ts` (e `.env` local não versionado).
- **Portão de Qualidade `[PQ0]`:**
  - [x] `git status` não mostra nenhum `.json` de credencial sensível ou `.env`.
  - [x] `npm ls @googleapis/sheets google-auth-library` confirma apenas os 2 pacotes enxutos instalados (sem `googleapis`).
  - [x] Testes unitários para `getGoogleSheetsEnvConfig()` (variáveis ausentes, Base64 inválido, JSON incompleto, configuração válida) passando com `npx vitest run`.
  - [x] `npx tsc --noEmit` verde.

---

### Fase 1 — Evolução Aditiva do Schema Prisma, Tipos, Zod e Swagger

- **Objetivo:** Habilitar `ActivitySource.sheets` e `TafAttempt.syncedToSheetsAt` sem quebrar dados existentes nem nenhum contrato anterior.
- **Ações obrigatórias:**
  1. Atualizar `prisma/schema.prisma`:
     - Em `enum ActivitySource`, adicionar `sheets`.
     - Em `model TafAttempt`, adicionar `syncedToSheetsAt DateTime? @map("synced_to_sheets_at")`.
     - Verificar índices úteis (ex.: `@@index([syncedToSheetsAt])` opcional se benéfico para backfill).
  2. Gerar migration aditiva via Prisma (`npx prisma migrate dev --name add_sheets_sync_fields`) apontando para o Postgres local de testes (`pacelab-pg-test:5433`) e validar SQL gerado:
     - `ALTER TYPE "activity_source" ADD VALUE IF NOT EXISTS 'sheets';`
     - `ALTER TABLE "taf_attempts" ADD COLUMN IF NOT EXISTS "synced_to_sheets_at" TIMESTAMP(3);`
  3. Atualizar tipos e validações em sincronia com o schema:
     - `types/index.ts`: adicionar `"sheets"` a `ACTIVITY_SOURCES`, `SOURCE_LABELS.sheets = "Google Sheets"` e `syncedToSheetsAt?: string | null` em `TafAttempt`.
     - `lib/validations/taf.ts`: atualizar `ActivitySourceEnum` (`["manual", "gpx_upload", "fit_upload", "sheets"]`), e adicionar `syncedToSheetsAt` opcional/nullable em `CreateTafAttemptBaseSchema` (herdando em `UpdateTafAttemptSchema`).
     - `lib/services/tafService.ts`: garantir que `importBackupJson` / normalizadores aceitem `source: "sheets"`.
     - `lib/swagger/spec.ts`: atualizar enum `ActivitySource` e campos `syncedToSheetsAt` nos schemas OpenAPI.
- **Arquivos modificados:** `prisma/schema.prisma`, `prisma/migrations/20261114151320_add_sheets_sync_fields/migration.sql`, `types/index.ts`, `lib/validations/taf.ts`, `lib/services/tafService.ts`, `lib/swagger/spec.ts`, `app/api/taf/attempts/route.ts`, `app/api/taf/attempts/[id]/route.ts`.
- **Portão de Qualidade `[PQ1]`:**
  - [x] Migration aplicada com sucesso no PostgreSQL de teste (`pacelab-pg-test:5433`) com `prisma generate` executado.
  - [x] Toda a suíte existente (`646` -> `655` testes) executada e 100% verde após expansão de `ActivitySource` e `TafAttempt`.
  - [x] `npx tsc --noEmit`, `npm run lint` e `npm run build` verdes.

---

### Fase 2 — Cliente Serverless (`client.ts`) e Mapeadores Puros Bidirecionais (`mapper.ts`)

- **Objetivo:** Construir e testar exaustivamente em TDD toda a camada de autenticação Google Base64 e todas as regras determinísticas de mapeamento das 3 abas (`Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas`).
- **Ações obrigatórias:**
  1. Implementar `lib/googleSheets/client.ts`:
     - Exporta `GoogleSheetsNotConfiguredError` (erro controlado com mensagem acionável quando env faltam).
     - Exporta `getGoogleSheetsClient()` usando `getGoogleSheetsEnvConfig()`, `GoogleAuth` (`scopes: ['https://www.googleapis.com/auth/spreadsheets']`) e `sheets({ version: 'v4', auth })`.
     - Singleton/cache leve seguro por credenciais (ou instanciação limpa compatível com testes e rotação de env) + injeção de factory para testes.
     - Utilitários de baixo nível com *retry* exponencial controlado para `429`/`503` (`withSheetsRetry`) e resolução segura de `sheetId` numérico por nome de aba (necessário para `spreadsheets.batchUpdate` → `deleteDimension` na exclusão de linhas).
  2. Implementar `lib/googleSheets/mapper.ts`:
     - **Constantes de contrato:** `SHEET_TABS` (`Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas`), ranges (`A:O`, `A:J`, `A2:I2`), cabeçalhos esperados.
     - **Formatadores / Sanitizadores (Banco → Sheets):**
       - `formatDateFortaleza(date)`: `YYYY-MM-DD` em `America/Fortaleza`.
       - `formatDurationHHMMSS(seconds)`: sempre `HH:MM:SS` (`00:34:12`).
       - `formatSheetPace(paceFormatted)`: prefíxa `'` (`"'5:13"`).
       - `sanitizeSheetText(text)`: substitui `\r?\n` por `" | "` e previne *Formula Injection* (`=`, `+`, `-`, `@`, `\t`, `\r`).
       - `computeTafStatusMeta(distanceMeters, goal)`: `"Meta Segurança Atingida"` / `"Aprovado (Mínimo)"` / `"Abaixo do Mínimo"`.
       - `mapTrainingSessionToRow(session)`: array de 15 células (`A..O`).
       - `mapTafAttemptToRow(attempt, goal)`: array de 10 células (`A..J`).
       - `mapProfileAndGoalToRow(profile, goal, latestWeight)`: array de 9 células (`A..I`).
     - **Parsers / Normalizadores (Sheets → Banco):**
       - `parseSheetDate(value)` → `Date` em `T12:00:00.000Z` (aceita `YYYY-MM-DD` e `DD/MM/YYYY`).
       - `parseSheetNumber(value)` → aceita ponto ou vírgula decimal (`"10,50"` → `10.5`) e remove unidades opcionais (`"km"`, `"kg"`, `"m"`).
       - `parseSheetDurationSeconds(value)` → suporta `HH:MM:SS`, `MM:SS`, e segundos puros.
       - `normalizeSheetActivityType(value)` → mapeia qualquer uma das 6 chaves, labels humanizados e legado `"teste_taf"` → `"tempo_run"`.
       - `normalizeSheetLocationType(value)` → mapeia chaves e `LOCATION_LABELS` → `LocationType | null`.
       - `parseTrainingRowFromSheet(row, rowIndex)` e `parseTafAttemptRowFromSheet(row, rowIndex)` retornando `{ valid: true, data }` ou `{ valid: false, warning }`.
       - `hasTrainingRowDivergence(dbSession, parsedRow)` e `hasTafAttemptRowDivergence(dbAttempt, parsedRow)` para evitar reescritas no-op no sync reverso.
- **Testes obrigatórios (TDD):**
  - `__tests__/lib/googleSheets/client.test.ts`: validação de erro controlado sem env, Base64 decode, inicialização de `GoogleAuth` + `sheets`, retry em `429`, erro permanente sem retry infinito, busca de `sheetId` por nome de aba.
  - `__tests__/lib/googleSheets/mapper.test.ts`: fuso `America/Fortaleza` próximo à meia-noite (`23:30 UTC-3` e `01:00 UTC`), `HH:MM:SS` (`0s`, `3599s`, `3661s`), proteção de pace `'5:13`, quebras de linha e fórmulas `=CMD(...)` em `Observações`/`Tênis`, 3 estados de `Status Meta`, cálculo de idade e peso mais recente em `Perfil_e_Metas`, vírgulas pt-BR (`"10,25"`), normalização de `"teste_taf"` → `"tempo_run"`, e detecção de divergência nula (idempotência).
- **Portão de Qualidade `[PQ2]`:**
  - [x] Todos os testes de `client.test.ts` e `mapper.test.ts` verdes.
  - [x] Cobertura de `lib/googleSheets/client.ts` e `lib/googleSheets/mapper.ts` ≥ 95% de linhas e funções.
  - [x] `npx tsc --noEmit` verde.

---

### Fase 3 — Motor Central de Sincronização (`syncService.ts`: Tempo Real, Backfill em Lote, Exclusão e Sync Reverso)

- **Objetivo:** Implementar a orquestração completa bidirecional sobre Prisma + Google Sheets API com respeito a quotas, proteção de telemetria e idempotência.
- **Ações obrigatórias:**
  1. Implementar `lib/googleSheets/syncService.ts` + `lib/googleSheets/index.ts`:
     - **A. Sync Pontual em Tempo Real (Banco → Sheets):**
       - `syncTrainingSessionToSheet(sessionOrId)`: lê coluna `A` de `Log_Treinos`; se `id` já existe na linha `idx`, executa `values.update` em `Log_Treinos!A{idx}:O{idx}`; se não existe, `values.append` em `Log_Treinos!A:O`. Em sucesso, atualiza `syncedToSheetsAt = new Date()` no Postgres via `prisma.trainingSession.update` e retorna `{ syncedAt }`.
       - `syncTafAttemptToSheet(attemptOrId)`: mesmo comportamento na aba `Simulados_TAF!A:J` consultando `TafGoal` ativo para a Coluna `I` (`Status Meta`), e atualizando `TafAttempt.syncedToSheetsAt` via `prisma.tafAttempt.update`.
       - `syncProfileAndGoalToSheet()`: busca `UserProfile`, `WeightRecord` mais recente e `TafGoal`, e atualiza `Perfil_e_Metas!A2:I2` via `values.update`.
       - `deleteTrainingSessionFromSheet(id)` e `deleteTafAttemptFromSheet(id)`: localiza `id` na Coluna `A`; obtém `sheetId` da aba correspondente e envia `spreadsheets.batchUpdate` com `deleteDimension` (em ordem decrescente de índice caso exista duplicata acidental). Se `id` não existir na planilha, retorna `{ deleted: false }` sem erro.
     - **B. Backfill em Lote (`syncHistoricalDataToSheets(options?: { forceFullResync?: boolean })`):**
       - Executa 1 única chamada `spreadsheets.values.batchGet` para ler `Log_Treinos!A2:A` e `Simulados_TAF!A2:A` (mapeando `id -> rowNumber`).
       - Busca `TrainingSession` (`orderBy: { sessionDate: "asc" }`) e `TafAttempt` (`orderBy: { testDate: "asc" }`).
       - Filtra: se `forceFullResync = false`, apenas registros com `syncedToSheetsAt === null` ou `(updatedAt.getTime() - syncedToSheetsAt.getTime()) > 2000`; se `forceFullResync = true`, todos os registros.
       - Separa por aba em `updates` (linhas existentes → `spreadsheets.values.batchUpdate` em chunks de 200) e `appends` (linhas novas em ordem cronológica → `spreadsheets.values.append` em chunks de 200).
       - Atualiza `Perfil_e_Metas!A2:I2` sempre ao final do backfill.
       - Marca `syncedToSheetsAt = new Date()` em lote no Prisma apenas para os IDs enviados com sucesso (`prisma.trainingSession.updateMany` / `prisma.tafAttempt.updateMany`).
     - **C. Sincronização Reversa (`pullChangesFromSheets()`):**
       - 1 único `batchGet` lendo `Log_Treinos!A1:O` e `Simulados_TAF!A1:J`.
       - Para cada linha com `Coluna A` (`ID`) **preenchida**:
         - Procura o registro no PostgreSQL pelo `id` exato (aceitando tanto UUIDs quanto IDs legados `trn_*` / `taf_*` / `att_*`).
         - Se existir e houver divergência real nos campos permitidos, atualiza no PostgreSQL respeitando proteção de telemetria `.FIT`/`.GPX` e atualiza `syncedToSheetsAt`.
         - Se não existir no PostgreSQL (registro excluído no app anteriormente ou ID inválido), não ressuscita automaticamente e registra um aviso (`warning`) no resumo da sincronização.
       - Para cada linha com `Coluna A` (`ID`) **vazia**:
         - Executa deduplicação no Postgres (`sessionDate` no mesmo dia em `America/Fortaleza`, distância `±0.05 km`, tempo `±10 s` para treinos; `testDate`, distância `±25 m`, tempo real `±10 s` para simulados).
         - Se houver *match*: vincula gravando o `id` existente do Postgres na Coluna `A` (em lote via `batchUpdate`), faz merge apenas de campos complementares ausentes e marca `syncedToSheetsAt`.
         - Se não houver *match*: gera `id = crypto.randomUUID()`, calcula calorias (Compêndio 2024 para treinos se peso disponível), `speedKmh`, `paceSeconds`, `paceFormatted`, insere no Postgres com `source: "sheets"` e `syncedToSheetsAt: now`, e escreve o `id` gerado de volta na **Coluna `A`** da planilha via `values.batchUpdate`!
     - **D. Orquestrador Unificado (`syncWithGoogleSheets(options)`):**
       - Suporta `direction`: `"bidirectional"` | `"push"` | `"pull"`.
       - Em `"bidirectional"` com `forceFullResync = false`: executa `pullChangesFromSheets()` seguido de `syncHistoricalDataToSheets({ forceFullResync: false })`.
       - Em `"bidirectional"` com `forceFullResync = true`: executa primeiro captura/deduplicação segura ou `syncHistoricalDataToSheets({ forceFullResync: true })` (documentado em D7).
       - Wrapper seguro para rotas REST normais: `safeAutoSync(fn)` que verifica `isGoogleSheetsConfigured()` primeiro (retornando `{ skipped: true }` imediatamente em 0ms quando não configurado) e envolve em `try/catch` logando `[SheetsSync]` em caso de erro sem relançar exceção.
- **Testes obrigatórios:**
  - `__tests__/lib/googleSheets/syncService.test.ts` (com mock completo de `sheets_v4.Sheets` + mock do `prisma`):
    - Criação/atualização/re-upload com mesmo `ID` (verifica `values.update` na linha existente, zero duplicação).
    - Exclusão de treino e simulado (verifica `batchUpdate` com `deleteDimension` e fallback gracioso se ID não existir na planilha).
    - Backfill incremental (`syncedToSheetsAt: null` e `updatedAt > syncedToSheetsAt + 2000`, ignorando falso-dirty `< 2000ms`) vs `forceFullResync: true` em ordem cronológica.
    - Sync reverso: edição de registro existente (incluindo IDs legados `trn_*` / `taf_*`), ignorar ID órfão com warning sem ressuscitar exclusões, criação de linha manual sem `ID` (`source: "sheets"` + gravação de UUID na Coluna A), deduplicação `±0.05 km / ±10 s` sem duplicar no banco, edição de treino `.FIT` preservando `splits`/`avgHeartRate`/`externalId`, cálculo calórico automático em treino vindo da planilha, e comportamento idempotente sem update quando não há divergência.
    - `safeAutoSync` não falhando quando Google Sheets não está configurado ou lança HTTP 500/429.
- **Portão de Qualidade `[PQ3]`:**
  - [x] `syncService.test.ts` verde com cobertura ≥ 90% em `lib/googleSheets/**/*.ts`.
  - [x] Zero chamada de rede real durante `npm test`.
  - [x] `npx tsc --noEmit` verde.

---

### Fase 4 — Conexão em Tempo Real (`await`) nas Rotas REST Existentes

- **Objetivo:** Ligar todas as rotas de escrita de treinos, simulados TAF, metas, perfil e pesagem ao `syncService` com `await` não-bloqueante.
- **Rotas atualizadas:**
  1. `app/api/taf/trainings/route.ts` (`POST`):
     - Lê query param opcional `?skipSheetsSync=true`.
     - Após `prisma.trainingSession.create` / `upsert` (`201`) ou `prisma.trainingSession.update` (`onDuplicate === "update"`, `200`, resetando `syncedToSheetsAt: null` quando não informado no body): se `!skipSheetsSync`, executa `await safeAutoSync(() => syncTrainingSessionToSheet(session))` e, caso `syncedAt` seja retornado, reflete `syncedToSheetsAt` atualizado no JSON retornado ao frontend!
  2. `app/api/taf/trainings/[id]/route.ts`:
     - `PUT`: grava `syncedToSheetsAt: null` (quando não explícito no body) no `prisma.trainingSession.update`, executa `await safeAutoSync(() => syncTrainingSessionToSheet(updated))` e retorna `updated` com `syncedToSheetsAt` atualizado quando houver sucesso (ou `null` em caso de falha).
     - `DELETE`: após exclusão bem-sucedida (`prisma.trainingSession.delete`), `await safeAutoSync(() => deleteTrainingSessionFromSheet(id))`.
  3. `app/api/taf/attempts/route.ts` (`POST`):
     - Suporte a `?skipSheetsSync=true`; após criar/upsert (`201`) ou sobrescrever (`onDuplicate: "update"`, `200`), `await safeAutoSync(() => syncTafAttemptToSheet(attempt))`, retornando `syncedToSheetsAt` atualizado.
  4. `app/api/taf/attempts/[id]/route.ts`:
     - `PUT`: grava `syncedToSheetsAt: null` (quando não explícito no body), executa `await safeAutoSync(() => syncTafAttemptToSheet(updated))` e reflete `syncedToSheetsAt` na resposta.
     - `DELETE`: `await safeAutoSync(() => deleteTafAttemptFromSheet(id))`.
  5. `app/api/taf/goals/route.ts` (`POST`):
     - Após salvar `TafGoal`, `await safeAutoSync(() => syncProfileAndGoalToSheet())`.
  6. `app/api/profile/route.ts` (`PUT`):
     - Após salvar `UserProfile` (e eventual `WeightRecord`), `await safeAutoSync(() => syncProfileAndGoalToSheet())`. (Observação: o `GET /api/profile` que cria perfil vazio padrão **não** dispara escrita no Sheets desnecessariamente).
  7. `app/api/profile/weight/route.ts` (`POST`) e `app/api/profile/weight/[id]/route.ts` (`DELETE`):
     - Após gravar ou excluir pesagem (e recalcular `currentWeightKg`), `await safeAutoSync(() => syncProfileAndGoalToSheet())`.
- **Atenção aos testes existentes:** Como `safeAutoSync` checa `isGoogleSheetsConfigured()` antes de tocar no cliente do Google, todos os testes atuais das rotas `/api/taf/*` e `/api/profile/*` continuarão passando sem precisar de variáveis de ambiente Google.
- **Novos testes obrigatórios:**
  - `__tests__/api/sheets-sync-hooks.test.ts`: testa explicitamente cada endpoint mutável com `syncService` mockado (verificando `await` na chamada correta, comportamento não-bloqueante quando o sync lança erro, manutenção de `syncedToSheetsAt: null` na falha, e respeito a `?skipSheetsSync=true`).
- **Portão de Qualidade `[PQ4]`:**
  - [x] Todas as rotas mutáveis citadas aguardam `safeAutoSync` antes da `NextResponse`.
  - [x] Todos os testes novos e existentes de API passam 100%.
  - [x] `npx tsc --noEmit` verde.

---

### Fase 5 — Endpoint Dedicado `/api/sync/sheets`, Schema Zod, Health & Client Service

- **Objetivo:** Expor a API oficial para disparar sincronização manual, backfill histórico, pull reverso e diagnóstico de status, além de integrá-la no `tafService` e Swagger.
- **Ações obrigatórias:**
  1. Criar `app/api/sync/sheets/route.ts` com `export const runtime = "nodejs"` e `export const dynamic = "force-dynamic"`:
     - `GET /api/sync/sheets`: verifica `isGoogleSheetsConfigured()` e conta registros pendentes no Postgres (`syncedToSheetsAt: null` ou `updatedAt > syncedToSheetsAt + 2000`) sem consumir quota da Google API.
     - `POST /api/sync/sheets`: valida body com `SheetsSyncRequestSchema` (`direction?: "bidirectional" | "push" | "pull"`, `forceFullResync?: boolean`, default `{ direction: "bidirectional", forceFullResync: false }`).
       - Se não configurado: retorna `apiError("Integração com Google Sheets não configurada...", 503, { code: "SHEETS_NOT_CONFIGURED" })`.
       - Executa `await syncWithGoogleSheets(parsed)` e retorna `apiSuccess(report, 200)`.
       - Se Google retornar HTTP `429` / erro de permissão `403`, retorna `apiError` com status apropriado (`429` ou `502`/`503`) e mensagem clara em português.
  2. Adicionar `SheetsSyncRequestSchema` em `lib/validations/taf.ts` e documentar `/api/sync/sheets` em `lib/swagger/spec.ts`.
  3. Atualizar `app/api/taf/health/route.ts`: adicionar campo informativo booleano não-invasivo `sheetsConfigured: isGoogleSheetsConfigured()` (sem alterar contratos de status existentes).
  4. Atualizar `lib/services/tafService.ts`:
     - Adicionar `getSheetsSyncStatus()` (`GET /api/sync/sheets`).
     - Adicionar `syncGoogleSheets(options)` (`POST /api/sync/sheets`).
     - Atualizar `saveTraining` / `saveAttempt` com opção `{ skipSheetsSync?: boolean }` usada dentro de `importBackupJson` — passando `?skipSheetsSync=true` no loop e disparando `syncGoogleSheets({ direction: "push", forceFullResync: false })` ao final da restauração se a integração estiver ativa!
- **Testes obrigatórios:**
  - `__tests__/api/sync-sheets-route.test.ts`: testa `GET` (configurado / não configurado + contagem pendente) e `POST` (`200` sync bidirecional, `forceFullResync: true`, `400` payload Zod inválido, `503` credenciais ausentes, `429` quota excedida simulada).
- **Portão de Qualidade `[PQ5]`:**
  - [x] `POST /api/sync/sheets` e `GET /api/sync/sheets` totalmente validados por Zod + OpenAPI `/docs`.
  - [x] Todos os testes de `__tests__/api/sync-sheets-route.test.ts` e `tafService` verdes.
  - [x] `npx tsc --noEmit` verde.

---

### Fase 6 — Frontend & UX: Botões de Sincronização, Badges de Status, Filtros e Cache

- **Objetivo:** Dar visibilidade e controle total ao usuário dentro das páginas reais do PaceLab (`/treinos` e `/meu-taf`), com feedback claro em português.
- **Ações obrigatórias:**
  1. **Toolbar e Feedback em `app/treinos/page.tsx`:**
     - Na barra de ações superior (junto a `"Registrar Treino"` e `"Importar .FIT / .GPX"`), adicionar botão **"Sincronizar Planilha"** (`data-testid="sync-sheets-btn"`) com estado *loading* (`animate-spin`), exibindo toast de resumo ao finalizar (ex.: `"Planilha sincronizada: X enviados, Y atualizados, Z importados do Sheets"`) e recarregando a lista de treinos + invalidando `TRAININGS_CACHE_KEY` quando houver alterações vindas do Sheets (`pulled > 0` ou `linked > 0` ou `pushed > 0`).
     - Se Google Sheets retornar `503` (`SHEETS_NOT_CONFIGURED`), exibir toast orientando configurar as variáveis e consultar o guia no `README.md`.
  2. **Controles Avançados de Backfill em `components/meu-taf/GoalAndBackupSettings.tsx` (`app/meu-taf/page.tsx` aba Configurações / Backup):**
     - Adicionar card dedicado **"Sincronização Google Sheets (`Treinos_Corrida`)"**:
       - Indicador de status da integração (Configurada / Não configurada + contagem de treinos/simulados pendentes via `GET /api/sync/sheets`).
       - Botão **"Sincronizar Agora (Bidirecional)"** (`POST /api/sync/sheets` com `forceFullResync: false`).
       - Botão secundário com confirmação clara: **"Reenviar Histórico Completo (Full Backfill)"** (`POST /api/sync/sheets` com `forceFullResync: true`) para enviar todos os dados antigos ou reconstruir a planilha em ordem cronológica.
       - Callback `onSheetsSynced` em `app/meu-taf/page.tsx` para limpar `TAF_ATTEMPTS_CACHE_KEY` / `TAF_TRAININGS_CACHE_KEY` e recarregar o estado da página quando houver registros puxados do Sheets.
  3. **Badges de Sincronização nos Cards:**
     - Em `components/meu-taf/TrainingCard.tsx` e `components/meu-taf/TafAttemptCard.tsx`: exibir badge discreto indicando status de sincronização quando `syncedToSheetsAt` estiver preenchido (`"Sheets ✓"` / tooltip com data formatada em `pt-BR`) ou pendente (`"Pendente Sheets"`), além de badge visual distinta quando `source === "sheets"` (`"Google Sheets"`).
  4. **Filtro por Origem `"sheets"` em `components/meu-taf/TrainingList.tsx`:**
     - Na Linha 4 (`data-testid="list-filter-source"`), adicionar botão `Google Sheets` (`data-testid="filter-source-sheets"`, `setSourceFilter("sheets")`).
  5. **Garantia de Consolidação de Título e Espelhamento Opcional de Simulado TAF → Diário:**
     - Confirmar em `components/treinos/GpxImportPanel.tsx` a consolidação `${cleanTitle} — ${cleanNotes}` ao submeter treinos e simulados.
     - Adicionar opção opcional (checkbox **"Também registrar no Diário de Treinos (`Log_Treinos`)"**) no salvamento de Simulado TAF em `GpxImportPanel.tsx` e `TafAttemptForm.tsx`, salvando em paralelo uma `TrainingSession` (`activityType: "tempo_run"`, `distanceKm: distanceMeters / 1000`, notas com `"[Simulado TAF] ..."`) para que ambas as abas (`Simulados_TAF` e `Log_Treinos`) sejam sincronizadas com seus próprios IDs.
- **Testes obrigatórios (React Testing Library):**
  - `__tests__/components/SheetsSyncUi.test.tsx`:
    - Renderização dos badges `Sheets ✓`, `Pendente Sheets` e origem `Google Sheets` em `TrainingCard` e `TafAttemptCard`.
    - Filtro `"Google Sheets"` (`filter-source-sheets`) em `TrainingList`.
    - Clique em `"Sincronizar Planilha"` em `/treinos` chamando `/api/sync/sheets`, exibindo toast com contagens e recarregando a lista após pull.
    - Painel em `GoalAndBackupSettings` exibindo status, contagem de pendentes, callback `onSheetsSynced` e botões de backfill incremental e completo (`forceFullResync: true`).
    - Checkbox opcional de espelhar Simulado TAF no Diário de Treinos disparando salvamento pareado sem duplicar IDs.
- **Portão de Qualidade `[PQ6]`:**
  - [x] Suíte completa de UI + todos os testes anteriores de componentes verdes.
  - [x] Sem erro de hidratação SSR nem importação de módulos Node-only no bundle client.
  - [x] `npm run lint` e `npx tsc --noEmit` verdes.

---

### Fase 7 — Documentação Completa (`README.md`, `.env.example`, Roadmap) & Homologação Final

- **Objetivo:** Documentar o fluxo completo de configuração GCP → Base64 → Local → Vercel, atualizar documentos internos e validar o sistema ponta a ponta antes de deploy.
- **Ações obrigatórias:**
  1. Atualizar **`README.md`** (preservando todo o conteúdo existente) com nova seção didática **"📊 Integração com Google Sheets (`Treinos_Corrida` — Sincronização & Deploy na Vercel)"**, explicando passo a passo:
     - Visão geral da arquitetura e das 3 abas (`Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas`).
     - **Passo 1:** Criar projeto no Google Cloud Console e habilitar a **Google Sheets API**.
     - **Passo 2:** Criar **Conta de Serviço** (*Service Account*) e baixar a chave privada `.json`.
     - **Passo 3:** Criar/abrir a planilha `"Treinos_Corrida"`, copiar o `GOOGLE_SHEETS_SPREADSHEET_ID` da URL e **compartilhar a planilha com o `client_email` da Service Account com permissão de Editor** (sem notificação por e-mail).
     - **Passo 4:** Converter o arquivo `.json` para Base64 em **uma única linha**:
       - Node.js (Windows, Linux e macOS): `node -e "console.log(Buffer.from(require('fs').readFileSync('google-key.json')).toString('base64'))"`
       - Linux: `base64 -w 0 caminho/chave.json`
       - macOS: `base64 -i caminho/chave.json | tr -d '\n'`
       - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("caminho\chave.json"))`
     - **Passo 5:** Configurar `GOOGLE_CREDENTIALS_BASE64` e `GOOGLE_SHEETS_SPREADSHEET_ID` no `.env` local e no painel **Environment Variables** da Vercel (*Production*, *Preview* e *Development*).
     - **Passo 6:** Boas práticas de segurança (excluir o `.json` baixado após copiar o Base64, nunca commitar chaves `.json` nem o `.env`).
     - **Passo 7:** Como operar a sincronização automática, **"Sincronizar Planilha"** e **"Reenviar Histórico Completo"** (`/treinos`, `/meu-taf` ou `POST /api/sync/sheets`).
     - Atualizar também a lista de variáveis/comandos e módulos no `README.md`.
  2. Revisar `.env.example` garantindo documentação clara das novas variáveis.
  3. Atualizar `docs/roadmap/01_roadmap_melhorias_futuras.md` (registrando a entrega do Plano 12) e mover este plano para `docs/plans/executed/` somente após todos os PQs concluídos.
  4. **Homologação Técnica e Ensaio Real Controlado:**
     - Executar `npx tsc --noEmit`, `npm run lint`, `npm run test:coverage` (confirmando cobertura global ≥ 90% em `lib/**/*.ts` e 100% dos testes passando) e `npm run build`.
     - Aplicar a migration aditiva (`add_sheets_sync_fields`) no Supabase via `npx prisma migrate deploy` após validar zero drift com `prisma migrate diff`.
     - Realizar um **teste ponta a ponta real** em desenvolvimento local com suas credenciais reais em `.env` contra a planilha `"Treinos_Corrida"` (status → push/backfill → edição manual de célula no Sheets → pull reverso → criação/exclusão de treino de teste com remoção limpa ao final).
- **Portão de Qualidade Final `[PQ7]`:**
  - [x] `npx tsc --noEmit`: 0 erros.
  - [x] `npm run lint`: 0 erros e 0 warnings bloqueantes.
  - [x] `npm run test:coverage`: 100% dos arquivos de teste passando, `lines >= 90%` e `functions >= 90%` em `lib/**/*.ts`.
  - [x] `npm run build`: build de produção Next.js limpo (com `/api/sync/sheets` compilado em runtime Node.js sem incluir `@googleapis/sheets` em chunks client).
  - [x] `npx prisma migrate status` no banco de produção/Supabase em estado *"Database schema is up to date!"*.
  - [x] `README.md` e `.env.example` revisados e completos.

---

## 5. Resumo de Arquivos Impactados (Visão Consolidada)

- **Novos arquivos principais:**
  - `lib/googleSheets/types.ts`
  - `lib/googleSheets/client.ts`
  - `lib/googleSheets/mapper.ts`
  - `lib/googleSheets/syncService.ts`
  - `lib/googleSheets/index.ts`
  - `lib/api/sheetsSync.ts`
  - `lib/sheetsSyncUi.ts`
  - `components/meu-taf/SheetsSyncBadge.tsx`
  - `app/api/sync/sheets/route.ts`
  - `prisma/migrations/20261114151320_add_sheets_sync_fields/migration.sql`
  - `__tests__/lib/env.test.ts`
  - `__tests__/lib/googleSheets/client.test.ts`
  - `__tests__/lib/googleSheets/mapper.test.ts`
  - `__tests__/lib/googleSheets/syncService.test.ts`
  - `__tests__/api/sheets-sync-hooks.test.ts`
  - `__tests__/api/sync-sheets-route.test.ts`
  - `__tests__/components/SheetsSyncUi.test.tsx`
- **Arquivos existentes modificados:**
  - `.gitignore`, `.env.example`, `package.json`, `package-lock.json`, `README.md`, `vitest.config.ts`, `vitest.setup.ts`
  - `prisma/schema.prisma`, `lib/env.ts`, `types/index.ts`, `lib/validations/taf.ts`, `lib/activity.ts`, `lib/swagger/spec.ts`, `lib/services/tafService.ts`
  - `app/api/taf/trainings/route.ts`, `app/api/taf/trainings/[id]/route.ts`, `app/api/taf/attempts/route.ts`, `app/api/taf/attempts/[id]/route.ts`, `app/api/taf/goals/route.ts`, `app/api/taf/health/route.ts`, `app/api/profile/route.ts`, `app/api/profile/weight/route.ts`, `app/api/profile/weight/[id]/route.ts`
  - `app/treinos/page.tsx`, `app/meu-taf/page.tsx`, `components/meu-taf/GoalAndBackupSettings.tsx`, `components/meu-taf/TrainingCard.tsx`, `components/meu-taf/TafAttemptCard.tsx`, `components/meu-taf/TrainingList.tsx`, `components/meu-taf/TafAttemptForm.tsx`, `components/treinos/GpxImportPanel.tsx`
  - `__tests__/api/docs.test.ts`, `__tests__/api/gpx-routes.test.ts`, `__tests__/api/taf-routes.test.ts`, `__tests__/lib/activity.test.tsx`, `__tests__/lib/tafValidations.test.ts`, `__tests__/services/tafService.test.ts`
  - `docs/roadmap/01_roadmap_melhorias_futuras.md`
