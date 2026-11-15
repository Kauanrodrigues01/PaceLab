# Plano 15 — Sincronização Resiliente da Aba `Plano_Semanal` e Widget `WeeklyAdherenceCard`

> **Status:** Concluído e Homologado (Fases 0–6) ✅  
> **Escopo:** Integração da 4ª aba `"Plano_Semanal"` da planilha `"Treinos_Corrida"` (Google Sheets) com reconciliação em 2 passadas no PostgreSQL e exibição do widget `WeeklyAdherenceCard` no dashboard.  
> **Referências analisadas no repositório:** `prisma/schema.prisma`, `lib/googleSheets/{types.ts,client.ts,mapper.ts,syncService.ts}`, `lib/api/sheetsSync.ts`, `lib/sheetsSyncUi.ts`, `lib/math/evolution.ts`, `lib/validations/taf.ts`, `lib/services/tafService.ts`, `lib/swagger/spec.ts`, `app/api/sync/sheets/route.ts`, `app/api/taf/trainings/{route.ts,[id]/route.ts}`, `app/page.tsx`, `app/treinos/page.tsx`, `components/home/AthleteActiveStatusCard.tsx`, `components/meu-taf/TrainingList.tsx`, `components/treinos/TrainingDetailModal.tsx`, `vitest.config.ts` e suítes `__tests__/`.

---

## 1. Diagnóstico Crítico da Especificação vs. Arquitetura Atual do PaceLab

### 1.1. O que faz total sentido (Alinhamento Direto)
1. **Fechamento do Ciclo IA ↔ Planilha ↔ App:** A arquitetura já existente em `lib/googleSheets/syncService.ts` sincroniza 3 abas (`Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas`) com Retry exponencial (`withSheetsRetry` para HTTP 429/503) e execução segura em serverless (`safeAutoSync`). Adicionar `"Plano_Semanal"` como a 4ª aba da mesma planilha `"Treinos_Corrida"` transforma a prescrição do treinador Gemini (`/treinador-corrida`) em aderência rastreável dentro do PaceLab sem exigir credenciais novas.
2. **Alinhamento de Calendário Semanal:** Em `lib/math/evolution.ts`, `getWeeklyVolume` já define semana como **Segunda a Domingo** (`getMonday`), exatamente alinhado ao exemplo da especificação (`< Semana Atual (16/11 – 22/11) >` para Nov/2026).
3. **Relacionamento `onDelete: SetNull`:** Modelar `WeeklyPlanItem` em tabela separada com `matchedSessionId @unique` e `onDelete: SetNull` protege o histórico prescrito pela IA quando o atleta exclui ou reimporta uma `TrainingSession`.
4. **Cobertura de Empty State e Navegação Semanal:** Tratar explicitamente semanas sem planejamento (`NaN%` proibido) e listar sessões extras fora do plano resolve uma lacuna real de uso contínuo quando o atleta treina antes de solicitar o plano da semana.

### 1.2. Pontos de Atenção Críticos, Conflitos e Adaptações Necessárias Encontrados no Código

| # | Ponto na Especificação | Realidade no Código PaceLab | Adaptação / Solução Definida no Plano |
|---|---|---|---|
| **A1** | Snippet Prisma sem `@map`, `@@map` e `userId`, sugerindo `npx prisma db push` | Todos os 5 modelos em `prisma/schema.prisma` (`TafGoal`, `TafAttempt`, `TrainingSession`, `UserProfile`, `WeightRecord`) usam `@map("snake_case")`, `@@map("snake_case")` e `userId String? @map("user_id")`. O projeto possui **7 migrations** versionadas em `prisma/migrations/` (risco **R1** ao usar `db push` direto no Supabase). | Mapear colunas/tabela em `snake_case` (`@@map("weekly_plan_items")`), incluir `userId String? @map("user_id")`, gerar migration SQL aditiva defensiva (`IF NOT EXISTS`) em Postgres local e aplicar em produção via `prisma migrate deploy` + `prisma migrate status`. |
| **A2** | Datas em `12:00:00-03:00` e comparação `sessionDate == plannedDate` | `parseSheetDate` (`lib/googleSheets/mapper.ts`) normaliza datas para `buildMiddayUtcDate` (`12:00:00Z` = `09:00-03:00`). Já sessões `.FIT`/`.GPX` gravam timestamps UTC reais (ex.: corrida às 22h BRT = `01:00Z` do dia seguinte UTC). Além disso, a Vercel executa em **UTC**. | Padronizar **toda comparação e diferença de dias** via string civil `"YYYY-MM-DD"` no fuso `America/Fortaleza` (`formatDateFortaleza`), com aritmética pura de calendário gregoriano (`dayDiffCalendar`), sem jamais comparar horas locais da máquina Node (`.getDay()`, `.setHours`). |
| **A3** | Reversão automática quando `matchedSessionId` fica `null` após exclusão | Em `app/api/taf/trainings/[id]/route.ts`, `prisma.trainingSession.delete({ where: { id } })` dispara `ON DELETE SET NULL` **dentro** do PostgreSQL antes de qualquer código JS seguinte; buscar `where: { matchedSessionId: id }` depois do `delete` retornaria **0 registros**. Além disso, o `DELETE` ainda não checa `shouldSkipSheetsSync(request)`. | Reverter quaisquer `WeeklyPlanItem` com `status IN ('Concluído', 'Parcial')` e `matchedSessionId = null` (detectados via consulta pré-delete ou query de órfãos) **no banco local**, rodar re-reconciliação em seguida, e adicionar suporte a `shouldSkipSheetsSync(request)` também no `DELETE` antes do `safeAutoSync`. |
| **A4** | Rodar `syncWeeklyPlanFromSheets()` após criar, editar ou excluir `TrainingSession` | A importação em massa (`lib/activityParser/batchPayloads.ts`) cria até 50 sessões com `?skipSheetsSync=true` e finaliza com `syncGoogleSheets({ direction: "push", forceFullResync: false })`. Chamar Sheets a cada `POST` estouraria a cota da API (60 writes/min) e quebraria `?skipSheetsSync=true`; além disso, `push` no fim do batch não atualizaria `Plano_Semanal!H:I` se a função rodasse só em `bidirectional`/`pull`. | Desacoplar em **3 funções**: (1) `pullWeeklyPlanFromSheets()` (leitura Sheets); (2) `reconcileWeeklyPlansWithSessions()` (**100% PostgreSQL**, zero chamadas Google — roda sempre em `POST/PUT/DELETE`); (3) `pushWeeklyPlanStatusToSheets()` (`batchUpdate` apenas em `H:I` alteradas — roda em `safeAutoSync` unitário quando `!skipSheetsSync` e em **todas** as direções de `syncWithGoogleSheets`: `bidirectional`, `pull` e `push`). |
| **A5** | `parseFloat(String(val).replace(',', '.'))` | Falha em strings com unidade (`"5,0 km"`) ou separador de milhar pt-BR (`"1.200,5"`). Além disso, `parseSheetPaceFormatted` atual em `lib/googleSheets/mapper.ts` aceita apenas pace simples (`MM:SS` / `MM:SS:00`) e **retorna `null` para faixas** como `"5:45–6:00"`. | Reutilizar `parseSheetNumber` para `targetDistanceKm` e criar helper dedicado `parseWeeklyPlanTargetPace` em `mapper.ts` (removendo `^'+` e `/km`, delegando pace único a `parseSheetPaceFormatted` para corrigir `:00`, e preservando faixas como `"5:45–6:00"`). |
| **A6** | `activityType` `.FIT` padrão vs prescrição da IA e linhas de descanso | No Prisma, `TrainingSession.activityType` usa enum `ActivityType` com **6 valores canônicos** (`rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`, `caminhada`). Arquivos `.FIT` salvam corridas como `corrida_continua` por padrão, enquanto Gemini pode escrever rótulos/aliases (`regenerativo`, `tiro`, `fartlek`, `"Descanso"`). | (1) Ignorar linhas de descanso (`descanso`, `off`, `rest`) na importação (sem contar como `"Perdido"` nem bloquear dia na Passada 2); (2) Mapear aliases via `ACTIVITY_ALIAS_MAP` + `tiro`/`esteira` e compatibilidade por **família** (Corrida vs `caminhada`); (3) Aplicar **`ratio >= 0.40` antes** do ranking para aquecimentos nunca vencerem o treino principal. |
| **A7** | Posicionamento de `WeeklyAdherenceCard`, ausência de `GET /api/taf/trainings/[id]` e limite `50` | `GET /api/taf/trainings` limita por `PaginationQuerySchema` (`limit: 50`, máx. `100`), não calcula últimas 4 semanas e **`/api/taf/trainings/[id]` hoje só possui `PUT` e `DELETE` (sem `GET`)**. Na UI, o dashboard principal é `app/page.tsx` (`home.test.tsx`), enquanto `"Sincronizar Planilha"` e `TrainingDetailModal` ficam em `app/treinos/page.tsx` (`TrainingList.tsx`) e `GoalAndBackupSettings.tsx`. | Criar `GET /api/weekly-plan?weekStart=YYYY-MM-DD` retornando aderência, últimas 4 semanas com plano, `extraSessions` e dados completos de `matchedSession` (campos reais `sessionDate`, `durationSeconds`, etc.) para abrir `TrainingDetailModal` direto em `/` e `/treinos`. Adicionar também `GET /api/taf/trainings/[id]` + fallback `?trainingId=` em `/treinos`. |
| **A8** | Índices `[0..2]` de `batchGet`, `ALL_REQUIRED_TABS` exaustivo e mocks Vitest | `syncService.ts` acessa `batchGet` pelos índices `[0..2]` das 3 abas atuais, possui `Record<SheetTabName, ...>` exaustivos (`TAB_HEADER_RANGE_MAP`, `TAB_HEADERS_MAP`), e os testes (`syncService.test.ts`, `sheets-sync-hooks.test.ts`, `SheetsSyncUi.test.tsx`, `treinos.test.tsx` via `mockTafApi.ts`) têm mocks parciais e asserts estritos (ex.: `batchUpdate` chamado `1` vez quando sem mudanças). | Ler `Plano_Semanal!A2:I` via `values.get` isolado com `isMissingTabError` (sem incluir `"Plano_Semanal"` em `ALL_REQUIRED_TABS`, mas preenchendo `TAB_HEADER_RANGE_MAP`/`TAB_HEADERS_MAP`); disparar `batchUpdate` de `H:I` **somente se houver alterações**; manter texto do toast legado quando contadores do plano forem `0`; atualizar mocks em `syncService.test.ts`, `sheets-sync-hooks.test.ts` e `mockTafApi.ts`. |

---

## 2. Contrato da 4ª Aba (`Plano_Semanal`) e Regras de Negócio Detalhadas

### 2.1. Layout Esperado de `Plano_Semanal!A1:I`

| Coluna | Cabeçalho | Campo Prisma (`WeeklyPlanItem`) | Tratamento de Entrada / Saída |
|---|---|---|---|
| **A** | `ID` | `planExternalId` (`@unique`) | `trim()`. Linhas sem `ID` ou sem `Data` válida geram warning estruturado em `SheetsSyncReport` e são puladas sem abortar a sincronização. |
| **B** | `Data` | `plannedDate` (`DateTime`) | Aceita `YYYY-MM-DD` ou `DD/MM/YYYY`; salva `buildMiddayUtcDate` (ou `12:00:00-03:00` — ambas preservam o mesmo dia em Fortaleza e UTC). |
| **C** | `Dia da Semana` | `dayOfWeek` (`String`) | `sanitizeSheetText`; fallback calculado via `formatDateFortaleza` caso venha vazio. |
| **D** | `Tipo` | `activityType` (`String`) | `trim()` + normalização opcional para slug canônico mantendo compatibilidade com `ACTIVITY_ALIAS_MAP`. Linhas `descanso`/`rest`/`off` são ignoradas na importação (não entram como `"Perdido"`). |
| **E** | `Distância Alvo (km)` | `targetDistanceKm` (`Float?`) | `parseSheetNumber` (suporta `,`, `.` e sufixos como `km`). `<= 0` ou inválido → `null`. |
| **F** | `Pace Alvo (min/km)` | `targetPaceFormatted` (`String?`) | `parseWeeklyPlanTargetPace` (remove `^'+` e `/km`, delega pace simples a `parseSheetPaceFormatted`, preserva faixas como `"5:45–6:00"` ou `"5:50"`). |
| **G** | `Descrição / Observação` | `description` (`String?`) | `sanitizeSheetText`; vazio → `null`. |
| **H** | `Status` | `status` (`String`, default `"Planejado"`) | Valores permitidos: `"Planejado"` \| `"Concluído"` \| `"Parcial"` \| `"Perdido"`. |
| **I** | `ID Treino Realizado` | `matchedSessionId` (`String? @unique`) | UUID da `TrainingSession` vinculada; escrito de volta pelo PaceLab (`""` quando desvinculado). |

> **Nota sobre nomes de arquivo:** No repositório PaceLab, o serviço de Google Sheets reside em `lib/googleSheets/syncService.ts` (referido na especificação conceitualmente como `googleSheetsSyncService.ts`). Toda a nova lógica será modularizada entre `lib/googleSheets/mapper.ts`, `lib/math/weeklyAdherence.ts` (regras puras testáveis offline) e `lib/googleSheets/syncService.ts`.

### 2.2. Regras de Reconciliação em 2 Passadas, Edição, Exclusão e Limpeza

1. **Reversão de Vínculos Quebrados (Pós-Exclusão ou Edição):**
   - **Caso 1 — Exclusão de `TrainingSession`:** Se um `WeeklyPlanItem` possui `status ∈ { "Concluído", "Parcial" }` e `matchedSessionId === null` (resultado direto de `ON DELETE SET NULL`), reverte imediatamente para `"Perdido"` se `plannedDate < ontem` (Fortaleza) ou `"Planejado"` se `plannedDate >= ontem`.
   - **Caso 2 — Edição (`PUT`) de `TrainingSession` vinculada:** Se a sessão vinculada teve `date`, `distanceKm` ou `activityType` alterados de modo a deixar de atender os critérios do plano (`|dayDiff| > 1`, atividade incompatível, `ratio < 0.40`, ou passou a haver outro plano no novo dia que tem prioridade em Passada 1), libera o vínculo anterior (revertendo o item antigo para `"Planejado"`/`"Perdido"`) e submete plano + sessões novamente às 2 passadas. Se ainda atender dentro dos limites, apenas recalcula o `status` (`"Concluído"` ↔ `"Parcial"`).

2. **Limpeza de Planos Regenerados / Removidos:**
   - Após o `upsert` dos itens válidos lidos da planilha (`sheetIds`):
     - Remove itens do banco onde `matchedSessionId = null` e `planExternalId NOT IN sheetIds` quando:
       - `status === "Planejado"`, **OU**
       - `status === "Perdido"` e a semana (`weekStartFortaleza`) desse item corresponde a alguma semana presente nos itens recém-lidos da planilha (evita acúmulo de fantasmas quando o usuário/Gemini regenera a semana inteira no domingo/meio da semana, mantendo intacto o histórico `"Perdido"` de semanas antigas não sobrescritas).
   - Itens com `matchedSessionId !== null` (`"Concluído"` ou `"Parcial"`) **nunca** são apagados automaticamente pela limpeza de planilha.

3. **Algoritmo de Cruzamento Puro (2 Passadas):**
   - **Candidatos elegíveis:**
     - Planos pendentes: `status ∈ { "Planejado", "Perdido" }` e `matchedSessionId === null`, ordenados por `plannedDate` ascendente.
     - Sessões livres: `TrainingSession` sem `weeklyPlanItem` associado.
   - **Compatibilidade de `activityType`:**
     - **Enum canônico no banco (`TrainingSession.activityType` — 6 valores):** `rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`, `caminhada`. Já `WeeklyPlanItem.activityType` é `String` livre para preservar exatamente a prescrição da IA.
     - Família **Corrida**: os 5 tipos de corrida canônicos (`rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`) e quaisquer aliases da planilha que normalizem para eles (ex.: `regenerativo` → `rodagem_leve`; `tiro`, `tiros`, `fartlek` → `corrida_intervalada`; `simulado_taf` → `tempo_run`; `esteira` → `corrida_continua`).
     - Família **Caminhada**: `caminhada` (compatível apenas com plano `caminhada`).
     - Match **Exato**: mesma atividade canônica após normalização via `normalizePlanActivityType`.
     - Match **Compatível**: mesma família (ex.: plano `rodagem_leve` + sessão `.FIT` salva como `corrida_continua`).
     - **Descanso / Off:** linhas da planilha com `descanso`, `rest`, `off` ou `folga` são ignoradas na importação (não entram em `weekly_plan_items` nem contam como falta).
   - **Elegibilidade por distância (`evaluateMatchStatus`):**
     - Se `targetDistanceKm != null && targetDistanceKm > 0`:
       - `ratio = session.distanceKm / targetDistanceKm`
       - `ratio >= 0.85` → elegível, `status = "Concluído"`
       - `0.40 <= ratio < 0.85` → elegível, `status = "Parcial"`
       - `ratio < 0.40` → **inelegível** (descartado antes mesmo do ranking, evitando falsos positivos com aquecimento/trote curto)
     - Se `targetDistanceKm == null || targetDistanceKm <= 0` (treino apenas por tempo):
       - Elegível para qualquer sessão compatível da mesma família (rejeitando `caminhada` para plano de corrida) → `status = "Concluído"`.
   - **Passada 1 — Mesmo Dia (`dayDiffFortaleza(session.sessionDate, plan.plannedDate) === 0`):**
     - Filtra sessões livres compatíveis e **elegíveis (`ratio >= 0.40` quando há meta de distância)**.
     - Ordena candidatas por: (1º) Match exato de `activityType`, (2º) Menor diferença absoluta `|session.distanceKm - plan.targetDistanceKm|` (para treinos sem meta de distância, maior `durationSeconds`/`distanceKm`), (3º) desempate determinístico por `session.sessionDate` / `session.id`.
     - Consome sessão e plano vencedores.
   - **Passada 2 — Tolerância de `±1 dia` (`|dayDiffFortaleza| === 1`, apenas sobras da Passada 1):**
     - Só permite vincular se:
       1. A `sessionDate` (Fortaleza) **não possuir nenhum plano de treino ativo** registrado para aquele próprio dia (linhas `"Descanso"` ignoradas na importação não bloqueiam o dia);
       2. A atividade for compatível dentro da mesma família;
       3. O corte `ratio >= 0.40` for respeitado.
     - Prioriza match exato de tipo e menor `|distanceKm - targetDistanceKm|`.
   - **Atualização de `"Perdido"`:**
     - Para planos que permanecerem sem `matchedSessionId`: se `plannedDateFortaleza < yesterdayFortaleza`, define `status = "Perdido"`; se `>= yesterdayFortaleza`, mantém `"Planejado"`.

4. **Matemática da Aderência Semanal & Média das 4 Semanas:**
   - Para uma semana (`weekStart` Segunda a `weekEnd` Domingo em Fortaleza):
     - `concluidos` = contagem de itens da semana com `status === "Concluído"`
     - `parciais` = contagem de itens da semana com `status === "Parcial"`
     - `planejados` = total de `WeeklyPlanItem` na semana (`totalPlanned`)
     - Se `totalPlanned > 0`:
       - `adherencePercent = Math.min(100, Math.round(((concluidos + 0.5 * parciais) / totalPlanned) * 100))`
     - Se `totalPlanned === 0`:
       - `adherencePercent = null` (**nunca** renderizar `NaN%` nem `0%` como reprovação).
     - `extraSessions` = sessões da semana selecionada cuja `weeklyPlanItem` seja `null` (excluindo corretamente uma sessão da semana que tenha cumprido um plano de dia limítrofe via tolerância `±1 dia`).
   - **Média Consolidada das Últimas 4 Semanas com Plano:**
     - Agrupa por semana (`Monday..Sunday` em Fortaleza) todas as semanas até `selectedWeekStart` (ou até a semana corrente, documentado e consistente) que possuam `totalPlanned > 0`.
     - Seleciona as **4 semanas mais recentes com plano** e calcula a média aritmética simples das taxas `adherencePercent` dessas semanas (`Math.round(sum / count)`), retornando `null` caso não exista nenhuma semana anterior com plano.

---

## 3. Fases Detalhadas de Execução e Verificação

### Fase 0 — Baseline, Backup e Ambiente Postgres Local
**Objetivo:** Garantir ponto de partida limpo e ambiente seguro para gerar migration sem risco ao banco de produção Supabase (R1).

- **Passos:**
  1. Verificar `git status`, presença de `.env` local / Postgres local para geração de migration (`npx prisma migrate status`).
  2. Executar baseline atual de compilação e testes antes de editar arquivos:
     - `npx tsc --noEmit`
     - `npm run test`
  3. Confirmar que não há drift prévio de schema no ambiente conectado.
- **Critério de conclusão (`[PQ0]`):** Baseline verde (`tsc` + `vitest` sem erros) e estratégia R1 validada.

---

### Fase 1 — Modelagem Prisma (`prisma/schema.prisma`) e Migration Aditiva
**Objetivo:** Criar a tabela `weekly_plan_items` e a relação `1:1` opcional com `training_sessions` respeitando integralmente as convenções do repositório.

- **Arquivos a alterar / criar:**
  - `prisma/schema.prisma`
  - `prisma/migrations/<timestamp>_add_weekly_plan_items/migration.sql`
- **Detalhamento Técnico:**
  1. Adicionar em `prisma/schema.prisma`:
     ```prisma
     model WeeklyPlanItem {
       id                  String           @id @default(uuid())
       userId              String?          @map("user_id")
       planExternalId      String           @unique @map("plan_external_id")
       plannedDate         DateTime         @map("planned_date")
       dayOfWeek           String           @map("day_of_week")
       activityType        String           @map("activity_type")
       targetDistanceKm    Float?           @map("target_distance_km")
       targetPaceFormatted String?          @map("target_pace_formatted")
       description         String?
       status              String           @default("Planejado")
       matchedSessionId    String?          @unique @map("matched_session_id")
       matchedSession      TrainingSession? @relation(fields: [matchedSessionId], references: [id], onDelete: SetNull)
       createdAt           DateTime         @default(now()) @map("created_at")
       updatedAt           DateTime         @updatedAt @map("updated_at")

       @@index([plannedDate])
       @@map("weekly_plan_items")
     }
     ```
  2. Em `TrainingSession`, adicionar `weeklyPlanItem WeeklyPlanItem?`.
  3. Gerar migration SQL aditiva (com `CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` e constraint FK com `ON DELETE SET NULL ON UPDATE CASCADE`).
  4. Executar `npx prisma generate` e aplicar via `npx prisma migrate deploy` + `npx prisma migrate status`.
- **Verificação (`[PQ1]`):**
  - `npx prisma validate` e `npx prisma migrate status` sem pendências/drift.
  - `npx tsc --noEmit` verde após geração do Prisma Client.

---

### Fase 2 — Helpers de Mapeamento, Calendário Fortaleza e Motor Puro de Reconciliação/Aderência
**Objetivo:** Construir toda a lógica de parse `pt-BR`, datas `America/Fortaleza`, reconciliação em 2 passadas e cálculo de aderência de forma 100% pura (determinística e testável sem banco nem rede).

- **Arquivos a alterar / criar:**
  - `lib/googleSheets/types.ts` (adicionar `"Plano_Semanal"` a `SheetTabName` e tipos aditivos `WeeklyPlanSyncStats`, etc.)
  - `lib/googleSheets/mapper.ts` (`SHEET_TABS.PLANO_SEMANAL`, `SHEET_RANGES.PLANO_SEMANAL`, `SHEET_HEADERS.PLANO_SEMANAL`, `parseWeeklyPlanTargetPace` para preservar faixas como `"5:45–6:00"`, parse/normalização de linhas `A2:I` reutilizando `parseSheetDate`, `parseSheetNumber`, `parseSheetPaceFormatted`, `normalizeSheetActivityType` + suporte explícito a `"descanso"/"off"/"rest"`, `"tiro"` e `"esteira"`)
  - `lib/math/weeklyAdherence.ts` *(novo módulo puro)*:
    - `toFortalezaDateKey(date)` e `diffFortalezaDays(dateKeyA, dateKeyB)`
    - `getFortalezaWeekBounds(referenceDate)` / `shiftFortalezaWeek(weekStartKey, offsetWeeks)`
    - `normalizePlanActivityType(raw)` e `arePlanActivitiesCompatible(planType, sessionType)`
    - `evaluateWeeklyMatch(targetDistanceKm, sessionDistanceKm)` (`>= 0.85` Concluído, `0.40..0.85` Parcial, `< 0.40` null)
    - `computeWeeklyReconciliation(plans, freeSessions, todayFortalezaKey)` (Passada 1, Passada 2, marcação `"Perdido"`/`"Planejado"`)
    - `calculateWeeklyAdherenceSummary(...)` e `calculateRollingFourWeeksAdherence(...)`
  - `__tests__/lib/math/weeklyAdherence.test.ts` *(novo)*
  - `__tests__/lib/googleSheets/mapper.test.ts` *(expandir testes existentes)*
- **Casos de teste obrigatórios na Fase 2:**
  - Parse `"5,0"`, `"5,0 km"`, `"1.200,5"`, vazio/inválido (`null`), `" '5:45-6:00 "` → `"5:45-6:00"`.
  - Sessão gravada às `22:30` BRT (`01:30Z` do dia seguinte UTC) cruzando corretamente no **mesmo dia** em Fortaleza contra plano `YYYY-MM-DD` / `DD/MM/YYYY`.
  - Mesmo dia com aquecimento (`1,5 km`, `ratio = 0.30`) + treino principal (`5,1 km`) mesmo quando aquecimento tem exatamente o mesmo `activityType`: aquecimento rejeitado (`< 0.40`), principal vinculado (`Concluído`).
  - Limiares exatos de status: `0.85` (`Concluído`), `0.849` (`Parcial`), `0.40` (`Parcial`), `0.399` (não vincula), `targetDistanceKm = null/0` (`Concluído`).
  - Passada 2 (`±1 dia`): permite antecipar/atrasar se o dia da sessão **não** tem outro plano e atividade é da família corrida (`rodagem_leve` ↔ `corrida_continua`); **bloqueia** se o dia da sessão já possui outro plano próprio ou se a sessão for `caminhada` contra plano de corrida.
  - `"Perdido"` estritamente para `plannedDate < ontem`; ontem/hoje/futuro permanece `"Planejado"`.
  - Aderência semanal (`Math.round` + cap em `100%`), estado vazio (`adherencePercent === null`, nunca `NaN`), média de até 4 semanas com plano ignorando semanas intermediárias sem plano.
- **Verificação (`[PQ2]`):** `npx vitest run __tests__/lib/math/weeklyAdherence.test.ts __tests__/lib/googleSheets/mapper.test.ts` + `npx tsc --noEmit`.

---

### Fase 3 — Sincronização Sheets (`Plano_Semanal`) + Reconciliação DB em `lib/googleSheets/syncService.ts`
**Objetivo:** Integrar leitura resiliente da aba `Plano_Semanal!A2:I`, limpeza de planos regenerados, reconciliação transacional no Prisma e escrita seletiva em lote de `H:I`.

- **Arquivos a alterar / criar:**
  - `lib/googleSheets/types.ts` (estender `SheetsSyncReport` com contadores aditivos para `Plano_Semanal`: ex. `weeklyPlan: { imported, updated, removed, matched, missed, pushed, sheetMissingOrEmpty }`)
  - `lib/googleSheets/syncService.ts`:
    - Manter `ALL_REQUIRED_TABS` com as 3 abas núcleo (`Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas`) e preencher os mapas exaustivos `TAB_HEADER_RANGE_MAP` e `TAB_HEADERS_MAP` para `"Plano_Semanal"` (sem deslocar os índices `[0..2]` de `batchGet`);
    - `pullWeeklyPlanFromSheets(sheets, spreadsheetId)`:
      - Lê `Plano_Semanal!A2:I` tratando `isMissingTabError` (400/404) e aba sem linhas de dados graciosamente (`0` erro);
      - Valida e faz `upsert` no PostgreSQL **preservando `matchedSessionId` e `status` de itens já vinculados**, sem sobrescrevê-los com `"Planejado"` vindo de uma releitura antes da reconciliação;
      - Executa limpeza segura de itens regenerados/removidos da planilha (`matchedSessionId = null` e `planExternalId` ausente na planilha quando `status = "Planejado"` ou `status = "Perdido"` pertencente às semanas contidas no novo pull).
    - `reconcileWeeklyPlansWithSessions(options?)`:
      - Passo 0: se `editedSessionId` foi passado (`PUT` ou caminho de `update`/`upsert` em `POST`), valida se o vínculo existente ainda respeita regras (data, compatibilidade, `ratio >= 0.40`, prioridade de Passada 1 no novo dia); se inválido, desvincula antes de reconciliar;
      - Passo 1: reverte itens com `matchedSessionId === null` e `status ∈ { "Concluído", "Parcial" }` (órfãos após `DELETE`) para `"Perdido"` (`< ontem`) ou `"Planejado"` (`>= ontem`);
      - Passo 2: busca sessões livres (`weeklyPlanItem: { is: null }`) e planos pendentes (`status ∈ { "Planejado", "Perdido" }`, `matchedSessionId: null`), invoca `computeWeeklyReconciliation` e persiste atualizações em lote/transação no Prisma.
    - `pushWeeklyPlanStatusToSheets(sheets, spreadsheetId)`:
      - Lê mapa atual `Plano_Semanal!A2:I` (se aba inexistente ou vazia, retorna sem erro);
      - Compara colunas `H` (`status`) e `I` (`matchedSessionId ?? ""`) linha a linha por `planExternalId`;
      - Envia `spreadsheets.values.batchUpdate` (`withSheetsRetry`) **apenas quando há divergências** para as faixas `Plano_Semanal!H{row}:I{row}` modificadas (mantendo 0 writes quando já sincronizado).
    - `syncWeeklyPlanFromSheets()` (orquestrador completo pull + reconcile + push retornando `{ syncedPlans, matched, ... }` para compatibilidade direta com a especificação).
    - Integrar em `syncWithGoogleSheets()`:
      - `direction: "bidirectional"` ou `"pull"`: `pullWeeklyPlanFromSheets()` → `reconcileWeeklyPlansWithSessions()` → `pushWeeklyPlanStatusToSheets()`
      - `direction: "push"`: `reconcileWeeklyPlansWithSessions()` → `pushWeeklyPlanStatusToSheets()` (garantindo que o fim do import em massa atualize `Plano_Semanal!H:I`!)
  - `lib/sheetsSyncUi.ts` (incluir resumo de itens do `Plano_Semanal` importados e reconciliados em `formatSheetsSyncReportSummary`, preservando exatamente o texto legado quando os contadores do plano forem `0`/ausentes — cobrindo tanto `/treinos` quanto `GoalAndBackupSettings` em `/meu-taf`)
  - `__tests__/lib/googleSheets/syncService.test.ts` *(adicionar `mockPrisma.weeklyPlanItem` e validar preservação do `batchUpdate` único quando `Plano_Semanal` não tem alterações)* & `__tests__/components/SheetsSyncUi.test.tsx`
- **Verificação (`[PQ3]`):**
  - Testar com `fakeSheets` e `mockPrisma`: aba ausente/vazia, limpeza de plano regenerado mantendo concluídos, `batchUpdate` somente nas linhas alteradas (`H:I`), `direction: "push"` pós-lote, preservação dos índices `[0..2]` das 3 abas anteriores e compatibilidade do toast com fixtures legados.
  - Rodar `npx vitest run __tests__/lib/googleSheets/ __tests__/components/SheetsSyncUi.test.tsx`.

---

### Fase 4 — API `/api/weekly-plan`, Hooks nas Rotas de Treino, `tafService` e Swagger
**Objetivo:** Expor os dados semanais consolidados ao frontend, garantir reconciliação em tempo real após `POST`/`PUT`/`DELETE /api/taf/trainings` e documentar o contrato OpenAPI.

- **Arquivos a alterar / criar:**
  - `lib/validations/taf.ts` (`WeeklyPlanQuerySchema` validando `weekStart` opcional no formato `YYYY-MM-DD`)
  - `app/api/weekly-plan/route.ts` *(novo, `GET`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`)*:
    - Resolve `weekStart` (padrão: Segunda-feira da semana atual em `America/Fortaleza`);
    - Retorna `{ weekStart, weekEnd, isCurrentWeek, items (com matchedSession completa compatível com TrainingSession/TrainingDetailModal: id, sessionDate, activityType, distanceKm, durationSeconds, elapsedSeconds, paceFormatted, speedKmh, source, avgHeartRate, maxHeartRate, elevationGainM, avgCadence, perceivedEffort, bodyWeightKg, shoeName, notes, splits, activeCalories, totalCalories), summary { totalPlanned, completed, partial, planned, missed, adherencePercent }, rollingFourWeeksAverage { averagePercent, weeksCount, weeks }, extraSessions: [...], extraSummary: { count, totalDistanceKm } }`.
  - `app/api/taf/trainings/route.ts` (`POST`):
    - Após salvar no banco: nos caminhos de criação, executa `await reconcileWeeklyPlansWithSessions()`; nos caminhos de atualização/reimportação (`onDuplicate === "update"` ou `upsert` por `validated.id`), passa `{ editedSessionId: saved.id }`;
    - Se `!skipSheetsSync`: além de `syncTrainingSessionToSheet(saved)`, executa `await safeAutoSync(() => pushWeeklyPlanStatusToSheets())` mantendo compatibilidade com os testes de `syncTrainingSessionToSheet`.
  - `app/api/taf/trainings/[id]/route.ts` (`GET`, `PUT` e `DELETE`):
    - **`GET`**: busca `TrainingSession` por `id` (retorna `404` padronizado se inexistente) para suportar carregamento direto e deep-link `/treinos?trainingId=<id>` mesmo além da paginação padrão (`limit=50`).
    - **`PUT`**: após atualizar a sessão, executa `await reconcileWeeklyPlansWithSessions({ editedSessionId: id })`; se `!skipSheetsSync`, executa `syncRecordWithSheets` + `safeAutoSync(() => pushWeeklyPlanStatusToSheets())`.
    - **`DELETE`**: detecta órfãos imediatamente após `prisma.trainingSession.delete({ where: { id } })`, executa `await reconcileWeeklyPlansWithSessions()`, respeita `shouldSkipSheetsSync(request)`, e quando `!skipSheetsSync` remove de `Log_Treinos` + chama `pushWeeklyPlanStatusToSheets()` via `safeAutoSync` (limpando `H:I` da planilha).
  - `lib/services/tafService.ts`: adicionar `getWeeklyPlan(weekStart?: string)` e tipagens correspondentes (reexportadas em `types/index.ts`).
  - `lib/swagger/spec.ts`: adicionar `GET /api/weekly-plan`, schema `WeeklyPlanResponse` e atualizar `SheetsSyncReportResponse` + enum `SheetTabName` (`"Plano_Semanal"`).
  - `__tests__/api/weekly-plan-route.test.ts` *(novo)*
  - `__tests__/api/sheets-sync-hooks.test.ts` *(atualizar mocks Prisma e validar reconciliação em POST/PUT/DELETE, inclusive `?skipSheetsSync=true` e reversão pós-DELETE)*
  - `__tests__/api/sync-sheets-route.test.ts` *(validar retorno JSON com métricas de `Plano_Semanal`)*
- **Verificação (`[PQ4]`):**
  - `npx vitest run __tests__/api/`
  - `npx tsc --noEmit`

---

### Fase 5 — Interface `WeeklyAdherenceCard` e Integração no Dashboard (`/` e `/treinos`)
**Objetivo:** Implementar o componente visual completo com navegação entre semanas, todos os estados exigidos (com plano, treinos extras, vazio sem `NaN%`), link para detalhes do treino e atualização reativa após sincronização/CRUD.

- **Arquivos a alterar / criar:**
  - `components/dashboard/WeeklyAdherenceCard.tsx` *(novo componente reutilizável)*:
    - Navegação por semana (`< Semana Anterior / Semana Atual (16/11 – 22/11) / Próxima >`, com botão rápido `"Semana Atual"` quando deslocado e seta direita liberada caso haja plano prescrito futuro ou até próxima semana).
    - **Estado 1 (`totalPlanned > 0`):**
      - KPI principal de aderência semanal (`adherencePercent%`) + barra de progresso visual + badge/indicador comparativo da **média consolidada das últimas 4 semanas com plano** (quando disponível).
      - Checklist ordenado por data com badges semânticos usando tokens do Design System: Verde (`Concluído`), Âmbar (`Parcial`), Azul/Neutro (`Planejado`), Vermelho (`Perdido`).
      - Bloco comparativo lado a lado quando vinculado (`matchedSession`):
        - **Planejado:** `5,0 km • Pace 5:45–6:00/km` (omitindo pace quando nulo e exibindo observação/descrição se houver).
        - **Realizado:** `5,12 km • Pace 5:41/km` clicável para abrir os detalhes do treino.
      - Rodapé discreto de treinos extras quando `extraSummary.count > 0`: `+X treino(s) extra(s) realizado(s) fora do plano (Y km)`.
    - **Estado 2 (`totalPlanned === 0`):**
      - Empty state sem `NaN%` nem barra vermelha de `0%`:
        - Título exato: *"Nenhum plano semanal registrado para este período"*
        - Subtítulo exato: *"Peça ao seu Treinador IA no Gemini para prescrever a semana na aba Plano_Semanal e clique em Sincronizar Planilha."*
      - Se `extraSummary.count > 0`: exibe resumo e lista discreta dos treinos realizados (`X treinos realizados • Y km totais esta semana`) com link para detalhes.
    - Suporte a `refreshTrigger` prop (recarrega quando `Sincronizar Planilha`, salvamento ou exclusão ocorre) e abertura direta do `<TrainingDetailModal />` com o objeto completo de `matchedSession` / `extraSessions` já retornado por `/api/weekly-plan` (com fallback opcional de navegação/edição `/treinos?trainingId=<id>`).
  - `app/page.tsx`: renderizar `<WeeklyAdherenceCard />` abaixo de `<AthleteActiveStatusCard />` (falha de fetch tratada defensivamente sem quebrar SSR/RTL de `__tests__/pages/home.test.tsx`).
  - `app/treinos/page.tsx`: renderizar `<WeeklyAdherenceCard refreshTrigger={...} onOpenSession={...} />`, incrementar `refreshTrigger` ao concluir `Sincronizar Planilha` / salvar / excluir / importar em massa, e ler query `?trainingId=` (via parsing seguro em `window.location.search` / `GET /api/taf/trainings/[id]`, evitando erro de `<Suspense>` no build Next 14) para abrir automaticamente `TrainingDetailModal` com o treino vinculado.
  - `test/helpers/mockTafApi.ts`: adicionar suporte a `GET /api/weekly-plan` e `GET /api/taf/trainings/[id]` para manter `__tests__/pages/treinos.test.tsx` verde.
  - `lib/sheetsSyncUi.ts`: garantir invalidação de eventual chave de cache em `CROSS_PAGE_SHEETS_CACHE_KEYS` e feedback claro no toast visual após `POST /api/sync/sheets`.
  - `__tests__/components/WeeklyAdherenceCard.test.tsx` *(novo)*
  - `__tests__/pages/home.test.tsx` *(garantir que continua passando com o novo card)*
- **Verificação (`[PQ5]`):**
  - `npx vitest run __tests__/components/ __tests__/pages/`
  - Inspeção visual em `localhost:3000/` e `localhost:3000/treinos` (mobile 375px + desktop 1440px, sem overflow horizontal ou quebra de texto).

---

### Fase 6 — Cobertura ≥ 90%, Documentação e Homologação Final
**Objetivo:** Garantir conformidade com a régua de cobertura V8 (`lines: 90, functions: 90` em `vitest.config.ts`), documentação atualizada e validação ponta a ponta.

- **Arquivos a atualizar:**
  - `README.md` (documentar a 4ª aba `"Plano_Semanal"`, coluna `A..I`, reconciliação em 2 passadas e widget `WeeklyAdherenceCard`)
  - `lib/swagger/spec.ts` (revisão final do OpenAPI em `/docs` e `/api/docs/spec`)
  - Mover este plano para `docs/plans/executed/15_plan_sincronizacao_plano_semanal_e_aderencia.md` após conclusão.
- **Comandos de Homologação Final (`[PQ6]`):**
  1. `npx prisma validate && npx prisma migrate status`
  2. `npx tsc --noEmit`
  3. `npm run lint`
  4. `npm run test:coverage` *(confirmando cobertura ≥ 90% linhas e funções em `lib/**/*.ts` e 0 testes falhando ou pulados)*
  5. `npm run build` *(garantindo build de produção Next.js 14 sem erros de tipo/SSR/`useSearchParams`)*

---

## 4. Matriz Consolidada de Riscos & Mitigações

| ID | Risco | Severidade | Mitigação Planejada |
|---|---|---|---|
| **R1** | Deriva de schema ou erro de migration em produção Supabase | **Alta** | Proibido rodar `prisma db push` em produção; gerar SQL aditivo (`CREATE TABLE IF NOT EXISTS`) em Postgres local e aplicar com `prisma migrate deploy`. |
| **R2** | Deslocamento de dia (`±1 dia`) em Vercel UTC para treinos noturnos (`>= 21h` BRT) | **Alta** | Normalização estrita via `formatDateFortaleza` (`America/Fortaleza`) antes de qualquer igualdade/diferença de dias ou agrupamento semanal. |
| **R3** | Aquecimento curto (`< 40%`) vencendo corrida principal por igualdade de `activityType` | **Média** | Filtro de corte mínimo `ratio >= 0.40` aplicado **antes** do ranking por `activityType` e proximidade de distância. |
| **R4** | Estouro de cota da Google Sheets API em importação em massa (`50` arquivos) | **Alta** | Reconciliação (`reconcileWeeklyPlansWithSessions`) é 100% PostgreSQL local; chamadas à Sheets API são suprimidas com `?skipSheetsSync=true` e disparadas em único `batchUpdate` ao final via `direction: "push"`. |
| **R5** | Regressão em planilhas antigas sem a aba `Plano_Semanal` | **Média** | `isMissingTabError` (400/404) retorna graciosamente `0` planos sem falhar `Log_Treinos`/`Simulados_TAF`/`Perfil_e_Metas`. |
| **R6** | `ON DELETE SET NULL` mascarando itens que deveriam voltar para `"Planejado"`/`"Perdido"` | **Alta** | Passo de detecção de órfãos (`status ∈ { "Concluído", "Parcial" } AND matchedSessionId IS NULL`) integrado em `reconcileWeeklyPlansWithSessions`, rodando sincronamente após `DELETE`. |
| **R7** | Queda na cobertura global `< 90%` (`vitest.config.ts`) ao adicionar novo código em `lib/` | **Média** | Separação da lógica em `lib/math/weeklyAdherence.ts` (funções puras 100% cobertas) + testes dedicados para `mapper.ts`, `syncService.ts` e `sheetsSyncUi.ts`. |
