# Plano de Implementação 13 — Precisão do Leitor `.FIT` vs. Strava, Pré-preenchimento do Título pelo Nome do Arquivo e Correção do Feedback de Sincronização Google Sheets

> **Status:** Planejado (aguardando aprovação para iniciar execução) 📋  
> **Branch recomendada:** `fix/fit-precision-filename-sheets-feedback` (a partir de `main` em `8dd0c2c`)  
> **Objetivo Geral:** Resolver com precisão cirúrgica quatro pontos levantados após o merge do Plano 12:
> 1. Eliminar as divergências entre o parser `.FIT` (`lib/fit/parseFit.ts`) e os dados exibidos no Strava (tempo em movimento sem pausas, preservação de `elapsedSeconds`, parciais sem distorção e preenchimento de `elevationDiffM`).
> 2. Dar visibilidade clara de pausas (`elapsedSeconds > durationSeconds`) nos cards do Diário de Treinos.
> 3. Pré-preencher automaticamente o título do treino a partir do nome do arquivo (substituindo `_` por espaço) quando o arquivo `.FIT`/`.GPX` não trouxer nome interno.
> 4. Corrigir o feedback `"Planilha sincronizada: 0 enviado(s), 0 atualizado(s), 0 importado(s) do Sheets"` quando há pendências sincronizadas, blindar o sync bidirecional contra sobrescrita de pendências locais e manter caches/contadores sincronizados entre as páginas.

---

## 1. Análise Detalhada: Problemas Encontrados vs. Soluções Propostas

### 1.1 Problema 1 — Divergência do Leitor `.FIT` em Relação ao Strava (Tempo em Movimento, Parciais e Elevação)

#### A. Evidência Real Observada (`"Caminhada leve"` — `2026-10-29T20:24:17.000Z`)

Comparação direta entre os dados exibidos no Strava, o cálculo matemático puro, o registro salvo hoje no PostgreSQL a partir do `.FIT` (`trn_1794677620405`) e o arquivo complementar `Caminhada_leve.gpx`:

| Métrica | Exibido no Strava | Conferência Matemática (Base Strava) | `.FIT` atual no BD (`trn_1794677620405`) | `.GPX` (`Caminhada_leve.gpx`) via `parseGpx` |
| :--- | :--- | :--- | :--- | :--- |
| **Distância** | `2,84 km` *(trunca `2,849 km`)* | `session.totalDistance = 2.849 m` (`2,849 km`) | `2,849 km` | `2,835 km` *(bruto: `2,887 km`)* |
| **Tempo em Movimento** | `35:26` (`2.126 s`) | `2.141 s - 15 s de pausa = 2.126 s` | **`2.140 s` (`35:40`)** ❌ *(incluiu pausas)* | `2.043 s` (`34:03`) *(cortou trechos lentos)* |
| **Tempo Decorrido** | `35:41` (`2.141 s`) | `2.141 s` | `2.140 s` (`35:40`) | `2.141 s` (`35:41`) |
| **Pace Médio** | `12:26 /km` (`746 s/km`) | `2.126 / 2,849 = 746,23 s/km` → **`12:26`** ✅ | `12:31 /km` (`751 s/km`) ❌ | `12:01 /km` (`721 s/km`) |
| **Velocidade Média** | `4,8 km/h` | `2,849 / (2.126 / 3.600) = 4,82 km/h` → **`4,8`** ✅ | `4,79 km/h` | `5,00 km/h` |
| **Elevação (D+)** | `17 m` *(modelo DEM Strava)* | Strava recalcula altitude no servidor | `11 m` (`session.totalAscent`) | `18 m` *(EMA 5 pts + histerese 2 m)* |
| **Parcial 1 (`1,00 km`)** | `9:48` (`588 s`), `-2 m` | `588 s` em movimento | **`11:19` (`679 s`)**, `ele: null` ❌ | `9:28` (`568 s`), `-3 m` |
| **Parcial 2 (`1,00 km`)** | `13:24` (`804 s`), `+1 m` | `804 s` em movimento | **`12:37` (`757 s`)**, `ele: null` ❌ | `13:22` (`802 s`), `+1 m` |
| **Parcial 3 (`0,849 km`)** | `14:25 /km`, `+4 m` | `(2.126 - 588 - 804) = 734 s`; `734 / 0,849 = 864,55 s/km` → **`14:25`** ✅ | **`13:49 /km` (`704 s`)**, `ele: null` ❌ | `13:26 /km` (`673 s`), `+4 m` |

**Conclusão matemática:** Os números exibidos pelo Strava fecham exatos entre si (não há erro de cálculo no Strava). Todas as diferenças do PaceLab vêm de como o `.FIT` exportado pelo app Strava Mobile estrutura os campos e de como `lib/fit/parseFit.ts` processa esses campos hoje.

#### B. Problema Encontrado (4 Causas Raízes em `lib/fit/parseFit.ts` e `lib/activityParser/`)

1. **O que o app Strava Mobile grava dentro do arquivo `.FIT` (*"Exportar Original"*):**
   - Ao contrário de relógios Garmin/Coros com *Auto-Pause*, o aplicativo de celular do Strava grava `session.totalTimerTime ≈ session.totalElapsedTime` (ambos `~2.140 s`, sem mensagens `eventMesgs` de `timer/stop`), porque o Strava só calcula *Moving Time* (`2.126 s`), correção topográfica (**DEM** — *Digital Elevation Model*, que explica `17 m` na tela vs. `11 m` brutos de GPS no `.FIT`) e parciais depois do upload no servidor.
   - Hoje `lib/fit/parseFit.ts` (linhas `630–669`) assume cegamente que `session.totalTimerTime` já descontou todas as pausas e **ignora** campos oficiais do perfil FIT presentes no `@garmin/fitsdk`:
     - `session.totalMovingTime` e `lap.totalMovingTime`;
     - `eventMesgs` (`event: "timer"`, `eventType: "stop" | "stopAll" | "start"`);
     - `record.enhancedSpeed`, `record.speed` e `record.gpsAccuracy`.
2. **Distorção grave nas parciais (`buildSplitsFromFitRecords`, linhas `241–335`):**
   - O algoritmo atual contém três distorções combinadas:
     - **Descarte destrutivo de `dDist <= 0` (linhas `275–278`):** quando o usuário fica parado em dois pontos seguidos (`dDist <= 0`), o loop apenas faz `anchor = cur; continue;`, jogando fora o intervalo sem registrar se foi pausa real nem respeitar a continuidade temporal.
     - **Substituição artificial `speed < 0.3 ? dDist / 1.5` (linhas `280–282`):** qualquer passo lento vira um tempo sintético calculado à velocidade fixa de `1,5 m/s`.
     - **Multiplicador global `timeScale = totalMovingSeconds / rawTotalElapsedMoveSec` (linhas `299–315`):** o parser multiplica **todos** os passos de todos os quilômetros pelo mesmo fator para forçar que a soma feche com `totalMovingSeconds`. Como `totalMovingSeconds` veio de `totalTimerTime` (`2.140 s`, contendo pausas que aconteceram nos Kms 2–3), o `timeScale > 1.0` **inflou artificialmente o Km 1** (`~579 s` esticados para `679 s` / `11:19`) e comprimiu os Kms 2 (`757 s`) e 3 (`704 s`).
3. **Filtro de movimento sem histerese penaliza caminhadas (`Caminhada_leve.gpx`):**
   - No `.GPX`, o corte pontual simples (`speed < 0,32 m/s`) removeu `98 s` (`2.043 s`), enquanto o Strava removeu apenas `15 s` (`2.126 s`), porque durante uma caminhada leve o GPS oscila amostra a amostra sem configurar pausa real. Aplicar o mesmo corte pontual ingênuo no `.FIT` estragaria treinos de caminhada.
4. **Parciais saindo com `elevationDiffM: null` (linhas `815–838` e `428, 443`):**
   - Quando `validLaps.length >= 2` (ex.: auto-laps de 1 km gravados sem `totalAscent`/`totalDescent` por volta), `parseFit.ts` define `elevationDiffM: null` sem aproveitar os valores de altitude existentes nos `recordMesgs` dentro do intervalo `[lap.startTime, lap.timestamp]`.
   - Mesmo no upload combinado `.FIT + .GPX` (`lib/activityParser/parseAndMergeActivity.ts`), a lógica atual só complementa `elevationGainM` global quando zerado/nulo, deixando `splits[i].elevationDiffM` todos como `null`.

#### C. Solução Proposta para o Problema 1

1. **Hierarquia em 3 níveis para `durationSeconds` (Tempo em Movimento Sem Pausas) + Preservação de `elapsedSeconds`:**
   - **`elapsedSeconds` (sempre salvo com pausas):** calculado como `Math.max(durationSeconds, Math.round(rawElapsedSec))` usando `session.totalElapsedTime`, soma de `lap.totalElapsedTime` ou extensão de timestamps dos `recordMesgs`.
   - **Regra anti-duplo-desconto em `durationSeconds`:**
     - **Prioridade 1 (`totalMovingTime` explícito):** se `session.totalMovingTime` (ou soma dos `lap.totalMovingTime`) estiver presente e válido (`> 0` e `<= rawElapsedSec`), usá-lo diretamente como base de `durationSeconds`.
     - **Prioridade 2 (relógio com cronômetro/auto-pause oficial):** se `rawElapsedSec - rawTimerSec >= 2` **ou** houver eventos explícitos de pausa em `eventMesgs` (`event === "timer"` com `eventType === "stop" | "stopAll"`), respeitar `session.totalTimerTime` — garantindo zero alteração em arquivos Garmin/Coros (como `fit_run_5k_autolap.fit` e `fit_run_intervalado_pista.fit`).
     - **Prioridade 3 (app móvel sem Auto-Pause, ex.: Strava App):** quando `Math.abs(rawElapsedSec - rawTimerSec) < 2`, não houver `totalMovingTime` e existirem `records.length >= 10` em alta frequência (mediana de `Δt <= 5 s`), calcular o tempo em movimento a partir dos `recordMesgs`:
       - Velocidade efetiva do passo combinando `enhancedSpeed`/`speed` (quando presente e finita) e `dDist / dTime`, ignorando spikes absurdos (`> 12,0 m/s`) ou amostras degradadas por `gpsAccuracy` ruim quando esse campo existir.
       - **Detecção com histerese temporal por modalidade:**
         - **Corrida (`run` / `unknown`):** passo considerado parado quando `effectiveSpeed < 0,85 m/s` (`~3,06 km/h`) sustentado em janela mínima contínua (`>= 3 s`, com suporte a gaps de GPS).
         - **Caminhada (`walk`):** passo considerado parado apenas quando `dDist === 0` ou `dDist / dTime < 0,30 m/s` sustentado em janela contínua `>= 3 s` **e** sem cadência ativa (`cadenceRaw == null || cadenceRaw === 0`), evitando descontar passadas lentas momentâneas.
         - Recalcular `speedKmh`, `paceSeconds` e `paceFormatted` de forma 100% consistente com `distanceKm` e o `durationSeconds` em movimento.
2. **Reconstrução exata das parciais em `buildSplitsFromFitRecords` (fim de `timeScale` e `dDist / 1.5`):**
   - Remover integralmente o multiplicador global `timeScale` e a fórmula sintética `dDist / 1.5`.
   - Percorrer os `recordMesgs` classificados passo a passo com a flag `isMovingStep` (obtida pela mesma classificação com histerese usada para a sessão):
     - Cada passo em movimento contribui com seu `dDist` e seu `deltaTimeSec` real (limitado ao máximo razoável quando houver salto pontual de pausa).
     - Passos classificados como pausa **não** recebem distância sintética nem inflam outros quilômetros; ao cruzar cada marco exato de `1.000 m`, interpola-se proporcionalmente `takeTime`, `ele`, e `hr` na fronteira do quilômetro.
     - O residuo final (`>= MIN_RESIDUAL_SPLIT_METERS` ou incorporado ao último km se pequeno) preserva a soma exata das parciais em movimento igual a `durationSeconds`.
3. **Tratamento inteligente de `validLaps` vs. auto-laps de `1 km` e cálculo de `elevationDiffM`:**
   - **Voltas reais/heterogêneas (ex.: treino intervalado de pista `800 m / 400 m / 200 m`):** preservadas integralmente via `validLaps`. Quando `lap.totalMovingTime` existir e diferir do timer, usá-lo; quando `lap.totalAscent == null` (`eleDiff === null`), calcular `elevationDiffM` via `computeSplitElevationDiff` (`lib/gpx/elevation.ts`) usando a altitude dos `records` dentro da janela temporal daquela volta (`[lapStartMs, lapEndMs]`).
   - **Modo mobile sem auto-pause (`Math.abs(rawElapsedSec - rawTimerSec) < 2`) com voltas uniformes de `1 km` sem `totalMovingTime`:** reconstruir `splits` km a km usando `buildSplitsFromFitRecords` quando `records` confiáveis com distância existirem (mantendo `laps` preservados para referência), para que o desconto de pausas incida exatamente no quilômetro onde a parada aconteceu.
   - **Sessão sem `totalAscent` (`null`):** calcular `elevationGainM` com `calculateElevationGain` (`lib/gpx/elevation.ts`: média móvel 5 pontos + histerese `2,0 m`) se `records` contiverem altitude válida.
   - **Enriquecimento no merge `.FIT + .GPX` (`lib/activityParser/parseAndMergeActivity.ts`):** se os `splits` do `.FIT` ainda retornarem todos com `elevationDiffM === null` e o `.GPX` tiver parciais compatíveis com elevação calculada, transferir `elevationDiffM` por parcial (mantendo 100% distância, tempos, ritmo, FC e cadência do `.FIT`), além do `elevationGainM` global já existente.
   - **Janela TAF (`samplesFromFitRecords` em `lib/activityParser/window.ts`):** filtrar corretamente intervalos não-monotônicos ou com velocidade anômala ao montar `WindowSample[]`.

---

### 1.2 Problema 2 — Visibilidade de Pausas (`elapsedSeconds`) no Diário Após Cálculo Sem Pausas

#### A. Problema Encontrado

- Em `components/meu-taf/TrainingCard.tsx` (linhas `222–228`), o card principal do Diário de Treinos exibe apenas `formatTime(training.durationSeconds)` no bloco **"Duração"**, sem qualquer menção ao `elapsedSeconds` mesmo quando o usuário fez pausas durante o treino (`training.elapsedSeconds > training.durationSeconds`).
- Embora `GpxPreviewCard.tsx` (linha `150`) e `TrainingDetailModal.tsx` (linhas `223–224`) já mostrem o tempo decorrido, quem navega pela lista do Diário só vê `35:26` e não percebe à primeira vista que o treino durou `35:41` no relógio por conta de `15s` de pausa.

#### B. Solução Proposta

- Manter a regra de ouro: `durationSeconds` (sem pausas) é o tempo principal do card, usado em `paceSeconds`, `paceFormatted`, `speedKmh`, gráficos e gasto calórico, enquanto `elapsedSeconds` (`>= durationSeconds`) é salvo sempre no banco.
- No bloco `"Duração"` de `components/meu-taf/TrainingCard.tsx`, quando `training.elapsedSeconds != null && training.elapsedSeconds > training.durationSeconds`, exibir uma linha auxiliar discreta abaixo de `{formatTime(training.durationSeconds)}` informando o tempo total decorrido e a soma de pausas (ex.: `Decorrido: 35:41 • 15s pausa`), mantendo o layout limpo quando não houver pausa.

---

### 1.3 Problema 3 — Título do Treino Vazio em Arquivos `.FIT` (Pré-preenchimento pelo Nome do Arquivo)

#### A. Problema Encontrado

- Quando o usuário baixa um arquivo do Strava Web, o Strava gera o nome do arquivo usando o título do treino com underscores `_` no lugar de espaços (ex.: `Caminhada_leve.fit` ou `Treino_de_tiros_400m.fit`).
- Arquivos `.FIT` frequentemente não trazem nome interno (`workoutMesgs`/`session.workoutName`), fazendo `parseFit` retornar `name: null`.
- Hoje, em `app/api/training-sessions/parse-activity/route.ts` (linha `215`), `suggestedNotes` faz:
  ```ts
  const suggestedNotes = parsed.name ? parsed.name.trim().slice(0, 500) : "";
  ```
- E no frontend, `components/treinos/GpxImportPanel.tsx` (linha `212`) inicializa o input com `setWorkoutTitle(result.name ?? "")`, ignorando `result.suggestedNotes` e o nome do arquivo. Assim, o formulário abre em branco e obriga o usuário a redigitar manualmente `"Caminhada leve"`.

#### B. Solução Proposta

1. **Criar helper puro `extractActivityTitleFromFilename(fileName: string): string | null` em `lib/activityParser/filenameTitle.ts` (reexportado em `lib/activityParser/index.ts`):**
   - Extrai o nome base (removendo caminho `/` ou `\`), remove a extensão final `.fit` ou `.gpx` (*case-insensitive*), substitui `_` por `" "`, colapsa espaços múltiplos (`/\s+/g` → `" "`), aplica `.trim()` e sanitiza com `sanitizeActivityText(..., 300)` (`lib/gpx/xml.ts`).
   - **Proteção contra IDs numéricos puros:** se o resultado corresponder a `/^\d+$/` (ex.: `"1234567890.fit"`), retorna `null` para não pré-preencher ruído numérico.
   - Exemplos: `"Caminhada_leve.fit"` → `"Caminhada leve"`, `"Treino_intervalado__pista.FIT"` → `"Treino intervalado pista"`, `"987654321.fit"` → `null`.
2. **Integrar ao contrato de `/api/training-sessions/parse-activity` e `ActivityParsePreview` (`types/index.ts`):**
   - Manter `parsed.name` estritamente como o título interno oficial vindo do arquivo (preservando a regra de prioridade `.GPX <trk><name>` > `.FIT` sem quebrar contratos existentes).
   - Adicionar campo aditivo opcional `titleSource?: "metadata" | "filename" | null` em `ActivityParsePreview` (`types/index.ts`) e na especificação OpenAPI em `lib/swagger/spec.ts`.
   - Em `app/api/training-sessions/parse-activity/route.ts`: calcular `filenameTitle` priorizando `.gpx` (se tiver título válido) e depois `.fit`; definir `suggestedNotes = (parsed.name ?? filenameTitle ?? "").trim().slice(0, 500)` e `titleSource = parsed.name ? "metadata" : filenameTitle ? "filename" : null`.
3. **Atualizar `components/treinos/GpxImportPanel.tsx`:**
   - Em `validateAndAnalyzeFiles`: calcular também fallback local com `extractActivityTitleFromFilename` caso `result.suggestedNotes` venha vazio em mocks antigos, preenchendo `setWorkoutTitle(result.name || result.suggestedNotes || filenameTitle || "")`.
   - Atualizar o badge junto ao campo `"Nome / Título do Treino"` (linhas `1217–1228`) para distinguir claramente:
     - `parsed.name` presente → `"Preenchido pelo .GPX (editável)"` (ou metadado do arquivo);
     - `isTitleMissingFromSource` e `workoutTitle.trim().length > 0` → mantendo `data-testid="title-highlight-badge"` com texto `"Sugerido pelo arquivo • Editável"`;
     - `isTitleMissingFromSource` e `workoutTitle.trim().length === 0` → `"Destaque • Nomeie seu treino"`.

---

### 1.4 Problema 4 — Toast Exibindo `"0 enviado(s), 0 atualizado(s), 0 importado(s)"` Apesar de Pendências Sincronizadas

#### A. Problema Encontrado (5 Pontos Interligados no Código Atual)

> *Nota visual de posicionamento:* hoje o toast de notificação aparece no **canto superior direito** (`fixed top-4 right-4` em `app/treinos/page.tsx:395` e `fixed top-20 right-4 sm:right-8` em `app/meu-taf/page.tsx:355`) e não possui `max-w` para telas estreitas — **não** há toast no canto superior esquerdo no código atual. Vale confirmar antes da Fase 3 se o usuário deseja manter no canto superior direito ou mover explicitamente para o esquerdo.

Os testes no banco real + código fonte revelaram **cinco causas combinadas** que explicam exatamente por que o usuário via pendências, clicava em `"Sincronizar Planilha"`, via as pendências sumirem/sincronizarem e ainda assim recebia `0, 0, 0`:

1. **`Perfil_e_Metas` (`profileSynced`) é ignorado por `formatSheetsSyncReportSummary` (`lib/sheetsSyncUi.ts:51–67`):**
   - Sempre que Perfil, Meta do TAF ou Peso mudam, `syncHistoricalDataToSheets()` grava `Perfil_e_Metas!A2:I2` e retorna `profileSynced: true` (`lib/googleSheets/syncService.ts:787–835`), mas `formatSheetsSyncReportSummary` só soma `pushedAppended`, `tafPushedAppended`, `pushedUpdated`, `pulledUpdated`, `pulledLinked`, `tafPushedUpdated`, `tafPulledUpdated`, `tafPulledLinked`, `pulledCreated` e `tafPulledCreated`. Resultado: quando só Perfil/Meta/Peso foram enviados para a planilha, o toast mostra **`Planilha sincronizada: 0 enviado(s), 0 atualizado(s), 0 importado(s) do Sheets`**.
2. **Risco de sobrescrita silenciosa de registros *dirty* no `pull` bidirecional (`lib/googleSheets/syncService.ts:1463–1467`, `1101–1130`, `1233–1258`):**
   - Ao clicar em `"Sincronizar Planilha"` (`direction: "bidirectional", forceFullResync: false`), `syncWithGoogleSheets()` executa `pullChangesFromSheets()` **antes** de `syncHistoricalDataToSheets()` (`push`).
   - Em `pullTrainingSheetRows` (`1101–1130`) e `pullTafSheetRows` (`1233–1258`), quando uma linha da planilha tem um `ID` já existente no banco, o código checa `hasTrainingRowDivergence(existing, parsed)` / `hasTafAttemptRowDivergence(existing, parsed)` — **sem verificar `isDirtyRecord(existing.syncedToSheetsAt, existing.updatedAt)`**.
   - Se o usuário alterou um treino/simulado localmente enquanto a auto-sync estava offline/falhando (registro *dirty* aguardando envio), o `pull` encontra diferença contra a versão antiga na planilha, **sobrescreve o banco local** com os dados antigos da planilha marcando `syncedToSheetsAt = now()` e o `push` em seguida enxerga `0` pendências!
3. **`syncHistoricalDataToSheets` e `getSheetsSyncStatus` não rastreiam se `Perfil_e_Metas` mudou de verdade:**
   - Em `syncHistoricalDataToSheets` (`syncService.ts:680–686, 787–835`), o `batchGet` lê apenas `LOG_TREINOS_IDS` e `SIMULADOS_TAF_IDS` (não lê `SHEET_RANGES.PERFIL_E_METAS_ROW`), escreve `Perfil_e_Metas!A2:I2` incondicionalmente e retorna sempre `profileSynced: true`, impossibilitando o toast saber se houve atualização real em `Perfil_e_Metas` ou se nada precisava ser gravado.
   - Em paralelo, `getSheetsSyncStatus()` (`syncService.ts:1392–1424`) conta apenas `trainingSession` e `tafAttempt` *dirty*.
4. **Pendências e caches em `sessionStorage` ficam defasados entre abas (`/treinos` ↔ `/meu-taf`):**
   - Em `components/meu-taf/GoalAndBackupSettings.tsx` (linhas `91–115`), `getSheetsSyncStatus()` roda **somente uma vez no *mount*** (`useEffect(..., [])`). Ao salvar uma Meta TAF ou registrar/alterar treinos ou simulados na página `/meu-taf`, o card `"Pendências aguardando envio"` não recarrega automaticamente.
   - Em `app/treinos/page.tsx`, `clearCrossPageSheetsCaches()` só é chamado em `handleSyncSheets` (linha `269`), e **não** após `handleSaveTraining`, `handleImportedTraining` ou `handleDeleteTraining`. Isso faz `sessionStorage` (`pacelab_cache_trainings`, `pacelab_cache_taf_attempts`, `pacelab_cache_taf_trainings`) manter selos visuais `"Pendente Sheets"` desatualizados até o usuário clicar em `"Sincronizar Planilha"` — quando o recarregamento limpa os selos visuais, mas o servidor já tinha tudo salvo e responde `0, 0, 0`!
5. **Mensagem zero-padded ambígua em `formatSheetsSyncReportSummary`:**
   - Dizer `"0 enviado(s), 0 atualizado(s), 0 importado(s) do Sheets"` nunca informa se Perfil/Meta foram atualizados nem diferencia "nada pendente" de uma sincronização real com itens novos/atualizados.

#### B. Solução Proposta para o Problema 4

1. **Proteger registros locais *dirty* em `pullTrainingSheetRows` e `pullTafSheetRows` (`lib/googleSheets/syncService.ts`):**
   - Quando `parsed.id` existir no banco (`existing`) e `isDirtyRecord(existing.syncedToSheetsAt, existing.updatedAt)` for `true`:
     - Em vez de sobrescrever com os dados desatualizados da planilha, **ignorar o `pull` desse registro (`skipped += 1; continue;`)** e preservar a alteração local no PostgreSQL para que `syncHistoricalDataToSheets()` imediatamente na sequência envie a atualização ao Sheets e contabilize `pushedUpdated` / `tafPushedUpdated` corretamente!
2. **Detecção real de mudança em `Perfil_e_Metas` em `syncHistoricalDataToSheets` (`lib/googleSheets/syncService.ts`):**
   - Incluir `SHEET_RANGES.PERFIL_E_METAS_ROW` no `batchGet` inicial de `syncHistoricalDataToSheets` (mantendo fallback tolerante caso mocks unitários retornem apenas 2 ranges em `valueRanges`).
   - Comparar a linha atual lida da aba `Perfil_e_Metas!A2:I2` (normalizada via `normalizeCellString`) com `mapProfileAndGoalToRow(snapshot.profile, snapshot.goal, snapshot.latestWeight)`:
     - Se `forceFullResync === true`, se a linha estiver vazia, se os valores diferirem, **ou** se o range não tiver vindo no `batchGet` (compatibilidade com mocks antigos), escrever `Perfil_e_Metas!A2:I2` e retornar `profileSynced: true`.
     - Caso `valueRanges[2]` tenha sido retornado e os 9 campos já estejam 100% idênticos (e `!forceFullResync`), evitar escrita redundante e retornar `profileSynced: false`.
   - Opcionalmente incluir campo aditivo em `SheetsSyncReport` (`lib/googleSheets/types.ts`), se necessário para telemetria, sem quebrar os campos existentes.
3. **Atualizar `formatSheetsSyncReportSummary(report)` (`lib/sheetsSyncUi.ts`):**
   - Calcular `pushedNew = report.pushedAppended + report.tafPushedAppended`, `updatedCount = ...`, `importedNew = report.pulledCreated + report.tafPulledCreated`.
   - **Caso 1 (`pushedNew > 0 || updatedCount > 0 || importedNew > 0`):**
     - Manter `"Planilha sincronizada: ${pushedNew} enviado(s), ${updatedCount} atualizado(s), ${importedNew} importado(s) do Sheets"` (com sufixo `(+ Perfil/Meta)` apenas opcional ou mantendo string exata quando há contagens de treino/TAF para compatibilidade estrita com testes existentes, mais `(${report.warnings.length} aviso(s))` quando aplicável).
   - **Caso 2 (`pushedNew === 0 && updatedCount === 0 && importedNew === 0` e `report.profileSynced === true`):**
     - Retornar `"Planilha sincronizada: Perfil/Meta atualizados no Sheets"` (com sufixo de avisos se houver), eliminando o `"0 enviado(s), 0 atualizado(s), 0 importado(s)"` quando Meta/Perfil/Peso foram sincronizados.
   - **Caso 3 (todos `0` e `!report.profileSynced`):**
     - Retornar `"Planilha já estava atualizada (nenhuma pendência encontrada)"` (com sufixo de avisos se houver).
4. **Atualização reativa do card de pendências, limpeza cruzada de caches e toast responsivo:**
   - Em `components/meu-taf/GoalAndBackupSettings.tsx`: chamar `loadSheetsStatus()` também quando `trainings`, `attempts` ou `goal` mudarem (via `useEffect` leve de sincronização de estado local, além de após `handleSaveGoal` e `handleImportBackup`), mantendo o resumo `"Pendências aguardando envio"` sempre atualizado sem precisar recarregar a página.
   - Em `app/treinos/page.tsx`: chamar `clearCrossPageSheetsCaches()` também após `handleSaveTraining`, `handleImportedTraining` e `handleDeleteTraining` para impedir que caches de `/meu-taf` exibam selos `"Pendente Sheets"` obsoletos ao trocar de página.
   - Em `app/meu-taf/page.tsx`: garantir invalidação coerente ao salvar/excluir simulados e metas.
   - Em `app/treinos/page.tsx` (`395`) e `app/meu-taf/page.tsx` (`355`): adicionar `max-w-[calc(100vw-2rem)]` ao toast para evitar corte no mobile (e ajustar esquerda/direita conforme decisão final do usuário).

---

## 2. Regras Arquiteturais e Critérios de Compatibilidade

1. **Definição oficial de tempo no PaceLab:**
   - `durationSeconds` = sempre **tempo em movimento (sem pausas)** → alimenta `paceSeconds`, `paceFormatted`, `speedKmh`, `splits` e gasto calórico.
   - `elapsedSeconds` = sempre **tempo total decorrido (incluindo pausas)** → garantido `elapsedSeconds >= durationSeconds`, persistido no banco e visível no card/preview/modal quando houver pausa.
2. **Zero duplo desconto de pausas:** relógios dedicados com `session.totalMovingTime` ou auto-pause explícito (`totalElapsedTime - totalTimerTime >= 2` ou eventos `timer/stop`) jamais sofrem segundo corte sobre os `records`.
3. **Preservação de treinos intervalados/estruturados:** arquivos com `lapMesgs` heterogêneas (ex.: `800 m / 400 m / 200 m`) preservam exatamente suas voltas originais em `splits` e `laps`.
4. **Cobertura e contratos:** manter `lines >= 90%` e `functions >= 90%` em `lib/**/*.ts` (`vitest.config.ts`) e não quebrar nenhum contrato existente de API ou tipo compartilhado.

---

## 3. Execução em Fases & Portões de Qualidade (Quality Gates)

### Fase 1 — Motor `.FIT` Preciso (Tempo em Movimento Sem Pausas, Parciais Reais, `elapsedSeconds` e `elevationDiffM`)

- **Objetivo:** Corrigir o cálculo de movimento, parciais e elevação por parcial em `lib/fit/*` e `lib/activityParser/*` resolvendo integralmente o Problema 1.
- **Checklist:**
  - [x] **1.1** Estender `lib/fit/types.ts` com tipagem dos campos extras de `recordMesgs` (`speedMs`, `gpsAccuracyM`), constantes calibradas por modalidade (`FIT_STOP_SPEED_THRESHOLD_RUN_MS = 0.85`, `FIT_STOP_SPEED_THRESHOLD_WALK_MS = 0.30`, `FIT_PAUSE_HYSTERESIS_MIN_SECONDS = 3`, `FIT_MAX_VALID_SPEED_MS = 12.0`, `FIT_MAX_GPS_ACCURACY_METERS = 50`) e eventos de timer.
  - [x] **1.2** Ler `session.totalMovingTime`, `lap.totalMovingTime`, `eventMesgs` (`event === "timer"`), `record.enhancedSpeed`/`record.speed` e `record.gpsAccuracy` em `lib/fit/parseFit.ts`.
  - [x] **1.3** Implementar detecção de tempo em movimento em 3 prioridades (sem duplo desconto para relógios dedicados; histerese temporal por modalidade para arquivos estilo Strava Mobile sem Auto-Pause), mantendo `elapsedSeconds = Math.max(durationSeconds, rawElapsedSec)`.
  - [x] **1.4** Refatorar `buildSplitsFromFitRecords` removendo `timeScale` global e `speed < 0.3 ? dDist / 1.5`, acumulando distância e tempo em movimento passo a passo com interpolação nas marcas de `1.000 m`.
  - [x] **1.5** Calcular `elevationDiffM` por volta (`computeLapElevationDiff` em `lib/fit/movingMetrics.ts` sobre `records` na janela da volta quando `lap.totalAscent` faltar) e reconstruir splits km a km quando laps uniformes de `1 km` vierem sem `totalMovingTime` em modo mobile sem auto-pause; calcular `elevationGainM` de sessão via `calculateElevationGain` quando `session.totalAscent` for nulo.
  - [x] **1.6** Em `lib/activityParser/parseAndMergeActivity.ts`, enriquecer `splits[i].elevationDiffM` a partir do `.GPX` complementar quando todas as parciais do `.FIT` estiverem com `elevationDiffM: null` (ou zeradas quando `elevationMergedFromGpx`).
  - [x] **1.7** Revisar `samplesFromFitRecords` em `lib/activityParser/window.ts` para filtrar saltos/anomalias coerentes com os `records`.
  - [x] **1.8 Testes (`__tests__/lib/fit/parseFit.test.ts` e `__tests__/lib/fit/parseAndMergeActivity.test.ts`):**
    - `.FIT` estilo Strava Mobile (`sport='walking'`, `totalTimerTime === totalElapsedTime`, `15 s` parado nos Kms 2–3, sem `totalAscent` nas voltas): valida `durationSeconds` sem pausa, `elapsedSeconds` completo, Km 1 não inflado, e `elevationDiffM` preenchido.
    - Regressão Garmin/auto-pause (`fit_run_5k_autolap.fit`) e intervalado (`fit_run_intervalado_pista.fit`) 100% intactos.
    - Merge `.FIT + .GPX` preenchendo `elevationDiffM` por parcial.
- **Portão de Qualidade `[PQ1]` — APROVADO:**
  - `npx tsc --noEmit`: 0 erros.
  - `npm run lint`: sem erros ou avisos ESLint.
  - `npm run test:coverage` completo: **84/84 arquivos e 758/758 testes passando**, cobertura geral `96.66%` linhas / `98.82%` funções (`lib/fit`: `91.12%` linhas / `100%` funções; `lib/activityParser`: `93.44%` linhas / `100%` funções; `lib/gpx`: `98.11%` linhas / `100%` funções).

---

### Fase 2 — Pré-preenchimento Automático pelo Nome do Arquivo + Pausas Visíveis no `TrainingCard`

- **Objetivo:** Implementar integralmente as soluções dos Problemas 2 e 3.
- **Checklist:**
  - [x] **2.1** Criar `lib/activityParser/filenameTitle.ts` com função pura `extractActivityTitleFromFilename(fileName: string): string | null` (e `pickPreferredActivityTitleFromFileNames`) e reexportar via `lib/activityParser/index.ts`.
  - [x] **2.2** Atualizar `types/index.ts` (`titleSource?: "metadata" | "filename" | null` em `ActivityParsePreview`), `app/api/training-sessions/parse-activity/route.ts` (`suggestedNotes` com fallback em `filenameTitle` + `titleSource`) e `lib/swagger/spec.ts`.
  - [x] **2.3** Atualizar `components/treinos/GpxImportPanel.tsx` para pré-preencher `workoutTitle` (`result.name?.trim() || result.suggestedNotes?.trim() || localFilenameTitle || ""`) e ajustar o texto do badge quando pré-preenchido via arquivo (`"Sugerido pelo arquivo • Editável"`).
  - [x] **2.4** Atualizar `components/meu-taf/TrainingCard.tsx` no bloco de `Duração` para exibir `Decorrido: {formatTime(training.elapsedSeconds)} • {pauseText}` discretamente quando `training.elapsedSeconds > training.durationSeconds`.
  - [x] **2.5 Testes (`__tests__/lib/activityParser/filenameTitle.test.ts`, `__tests__/api/activity-parse-routes.test.ts`, `__tests__/components/GpxImportPanel.test.tsx`, cobrindo também `TrainingCard`):** cobrir `.fit`/`.gpx`, múltiplos `_`, IDs numéricos ignorados, `titleSource`, pré-preenchimento no formulário e visibilidade de pausa no card.
- **Portão de Qualidade `[PQ2]` — APROVADO:**
  - `npx tsc --noEmit`: 0 erros.
  - `npm run lint`: sem erros ou avisos ESLint.
  - `npm run test:coverage`: **85/85 arquivos e 766/766 testes passando**, cobertura global `96.68%` linhas / `98.83%` funções (`filenameTitle.ts`: `94.93%` linhas / `100%` funções).

---

### Fase 3 — Correção Completa do Sync Bidirecional, Toast de Sincronização e Caches Cross-Page (Google Sheets)

- **Objetivo:** Resolver todos os 5 pontos do Problema 4 no backend e frontend do Google Sheets.
- **Checklist:**
  - [ ] **3.1** Em `lib/googleSheets/syncService.ts` (`pullTrainingSheetRows` e `pullTafSheetRows`), proteger registros locais *dirty* (`isDirtyRecord(existing.syncedToSheetsAt, existing.updatedAt) === true`), ignorando no `pull` para que o `push` subsequente envie a alteração local e contabilize `pushedUpdated` / `tafPushedUpdated`.
  - [ ] **3.2** Em `syncHistoricalDataToSheets` (`lib/googleSheets/syncService.ts`), incluir `SHEET_RANGES.PERFIL_E_METAS_ROW` no `batchGet`, comparar o conteúdo da aba com `mapProfileAndGoalToRow(...)`, e atribuir `profileSynced` fielmente quando houver escrita real (preservando `true` em respostas mockadas sem 3º range).
  - [ ] **3.3** Atualizar `formatSheetsSyncReportSummary(report)` em `lib/sheetsSyncUi.ts` para distinguir itens numéricos > 0, apenas `profileSynced: true` (`"Planilha sincronizada: Perfil/Meta atualizados no Sheets"`) e estado sem pendências (`"Planilha já estava atualizada (nenhuma pendência encontrada)"`).
  - [ ] **3.4** Em `components/meu-taf/GoalAndBackupSettings.tsx`, atualizar `loadSheetsStatus()` reativamente quando `trainings`, `attempts` ou `goal` mudarem ou após salvar meta/importar backup.
  - [ ] **3.5** Em `app/treinos/page.tsx`, chamar `clearCrossPageSheetsCaches()` também em `handleSaveTraining`, `handleImportedTraining` e `handleDeleteTraining`; em `app/treinos/page.tsx` e `app/meu-taf/page.tsx`, aplicar `max-w-[calc(100vw-2rem)]` ao toast (e posicionar à esquerda se solicitado pelo usuário).
  - [ ] **3.6 Testes (`__tests__/lib/googleSheets/syncService.test.ts` e `__tests__/components/SheetsSyncUi.test.tsx`):**
    - Registro local *dirty* não é sobrescrito pelo `pull` e soma `pushedUpdated: 1` no sync bidirecional.
    - `syncHistoricalDataToSheets` detecta `Perfil_e_Metas` igual vs. divergente.
    - `formatSheetsSyncReportSummary` cobrindo os 3 cenários (`contagens > 0`, só `profileSynced: true`, tudo zero).
    - `GoalAndBackupSettings` atualizando pendências reativamente.
- **Portão de Qualidade `[PQ3]`:** Suíte completa de Google Sheets e UI de sync 100% verde.

---

### Fase 4 — Homologação Final, Teste Controlado Real e Documentação

- **Objetivo:** Verificar zero regressões no projeto completo, validar cenário real controlado e arquivar documentação.
- **Checklist:**
  - [ ] **4.1** Atualizar `docs/roadmap/01_roadmap_melhorias_futuras.md` (e `__tests__/fixtures/fit/README.md` se houver nova fixture).
  - [ ] **4.2** Executar suíte completa de qualidade após a última edição:
    - `npx tsc --noEmit`
    - `npm run lint`
    - `npm run test:coverage` (`lines >= 90%` e `functions >= 90%` em `lib/**/*.ts`)
    - `npm run build`
  - [ ] **4.3** Validação controlada ponta a ponta: simular `.FIT` com perfil Strava Mobile (caminhada com pausas e `_` no nome do arquivo) + fluxo real de pendência local → `"Sincronizar Planilha"` confirmando contagem real no toast e integridade da planilha `"Treinos_Corrida"`.
  - [ ] **4.4** Mover este plano para `docs/plans/executed/`.
- **Portão de Qualidade Final `[PQ4]`:** Todos os 4 comandos finais (`tsc`, `lint`, `test:coverage`, `build`) passando sem erros e banco/planilha consistentes.

---

## 4. Resumo de Arquivos Previstos

- **Novos arquivos:**
  - `lib/activityParser/filenameTitle.ts`
  - `__tests__/lib/activityParser/filenameTitle.test.ts`
- **Arquivos existentes a modificar:**
  - `lib/fit/types.ts`, `lib/fit/parseFit.ts`, `lib/activityParser/types.ts`, `lib/activityParser/parseAndMergeActivity.ts`, `lib/activityParser/window.ts`, `lib/activityParser/index.ts`
  - `types/index.ts`, `lib/swagger/spec.ts`, `app/api/training-sessions/parse-activity/route.ts`
  - `lib/googleSheets/types.ts`, `lib/googleSheets/syncService.ts`, `lib/sheetsSyncUi.ts`
  - `components/treinos/GpxImportPanel.tsx`, `components/meu-taf/TrainingCard.tsx`, `components/meu-taf/GoalAndBackupSettings.tsx`, `app/treinos/page.tsx`, `app/meu-taf/page.tsx`
  - `__tests__/lib/fit/parseFit.test.ts`, `__tests__/lib/fit/parseAndMergeActivity.test.ts`, `__tests__/api/activity-parse-routes.test.ts`, `__tests__/components/GpxImportPanel.test.tsx`, `__tests__/lib/googleSheets/syncService.test.ts`, `__tests__/components/SheetsSyncUi.test.tsx`
  - `docs/roadmap/01_roadmap_melhorias_futuras.md`
