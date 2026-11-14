# Plano de Implementação 14 — Importação e Preenchimento em Massa (`.FIT` / `.GPX`) com Seleção Única Global (`Treino` vs `Simulado TAF`)

> **Status:** Concluído e Homologado (Fases 1–4) ✅ (`feat/batch-activity-import`)  
> **Branch recomendada:** `feat/batch-activity-import` (a partir de `main`)  
> **Objetivo Geral:** Permitir que o atleta envie **vários arquivos `.FIT` e/ou `.GPX` de uma única vez**, faça uma **seleção única global** para definir se **todos** serão importados como **Treinos do Diário** ou como **Simulados TAF**, revise/ajuste metadados em massa com praticidade (aproveitando pré-preenchimento pelo nome do arquivo, cálculo MET de calorias e recorte de 12 min) e grave tudo em lote com segurança no PostgreSQL e sincronização consolidada no Google Sheets.

---

## 1. Diagnóstico do Fluxo Atual & Riscos Arquiteturais a Evitar

A base técnica do PaceLab já possui peças sólidas criadas nos Planos 11, 12 e 13, mas hoje o upload (`components/treinos/GpxImportPanel.tsx` e `/api/training-sessions/parse-activity`) foi desenhado exclusivamente para **1 atividade por vez** (`1` arquivo ou `1 .FIT + 1 .GPX` pareados):

| Ponto no Sistema Atual | Limitação / Risco para Lote | Decisão Arquitetural no Plano 14 |
| :--- | :--- | :--- |
| **`GpxImportPanel.tsx` (`152–204`)** e **`parse-activity/route.ts` (`122–127`)** | Bloqueiam `> 2` arquivos ou `> 1 .FIT` / `> 1 .GPX` simultaneamente (`TOO_MANY_FILES`). | Manter `POST /api/training-sessions/parse-activity` para 1 atividade por requisição e orquestrar uma **fila com concorrência controlada (3 reqs)** no cliente ao receber múltiplos arquivos. |
| **Limite de Payload Serverless (Vercel 4,5 MB)** | Enviar 10–30 arquivos de até 4 MB em um único `FormData` causaria `413 Payload Too Large` e risco de *timeout*. | Cada requisição à API envia apenas **1 arquivo** (ou **1 par `.FIT + .GPX`** de mesmo nome base). Falhas em 1 arquivo isolado não travam os outros. |
| **Geração de IDs no cliente (`GpxImportPanel.tsx:481, 632`)** | Usa `trn_${Date.now()}` e `att_${Date.now()}`. Em salvamentos seguidos no mesmo milissegundo, `POST /api/taf/trainings` (`upsert` em `route.ts:190`) e `attempts` (`route.ts:141`) podem **colidir e sobrescrever** sessões distintas! | Criar helper único `generateClientRecordId("trn" \| "att")` em `lib/sheetsSyncUi.ts` usando `crypto.randomUUID()` (+ fallback aleatório), corrigindo tanto o fluxo unitário quanto o fluxo em massa. |
| **Duplicidade dentro do próprio lote ou arquivo repetido** | Usuário pode arrastar cópias da mesma atividade (ex.: `Treino.fit` e `Treino (1).fit`) ou clicar em "Adicionar mais" com arquivo já enfileirado, causando `409 Conflict` em concorrência. | Deduplicar pré-parse por assinatura de arquivo (`name + size + lastModified`) e pós-parse por `externalId` dentro da fila, sinalizando repetições como ignoradas no lote. |
| **Auto-sync com Google Sheets por item (`syncRecordWithSheets`)** | Gravar 25 treinos (ou simulados + espelhos) sem `?skipSheetsSync=true` dispararia dezenas de chamadas seguidas à Google Sheets API, gerando lentidão severa e erro de cota (`429`). | Enviar `{ skipSheetsSync: true }` em todos os saves (`saveTraining`, `saveAttempt` e espelho no Diário), checar `getSheetsSyncStatus()` e disparar **1 único push consolidado** (`syncGoogleSheets({ direction: "push" })`) ao fim do lote. |
| **Callbacks de página (`onImported` / `onAttemptImported`)** | Em `app/treinos/page.tsx` e `app/meu-taf/page.tsx`, cada chamada fecha o painel imediatamente e dispara 1 toast. Em lote, fecharia na 1ª atividade e geraria 20 toasts. | Introduzir callback opcional `onBatchImported(summary)` para atualizar estado/caches cross-page em bloco e exibir **1 único toast consolidado** (mantendo `onImported`/`onAttemptImported` intactos para o fluxo individual). |
| **Renderização pesada no preview (`GpxPreviewCard`)** | Montar 20–50 gráficos Recharts (`SplitsPaceChart`) e tabelas completas abertas ao mesmo tempo travaria o navegador no mobile. | Usar linhas/cards **compactos** na fila de revisão com expansão sob demanda (*lazy*) para visualizar parciais/gráfico apenas quando usuário abrir um item específico. |

---

## 2. Experiência do Usuário (UX) e Regras de Negócio

### 2.1 Entrada no Fluxo e Agrupamento Inteligente de Arquivos
1. **Alternância natural + Modo explícito no `GpxImportPanel.tsx`:**
   - **Seletores no topo do painel:** `"1 Treino (Individual)"` vs `"Em Massa (Vários Arquivos)"`.
   - **Entrada automática:** se o usuário estiver no modo padrão e selecionar/arrastar `>= 2` arquivos `.fit`, `>= 2` `.gpx`, ou `>= 3` arquivos no total, o componente alterna automaticamente para o **Modo Em Massa** e processa toda a seleção sem exibir erro de excesso de arquivos.
   - Se o usuário selecionar apenas `1` arquivo ou `1 .FIT + 1 .GPX` no modo `"1 Treino (Individual)"`, o fluxo atual permanece **100% preservado** (inclusive todos os `data-testid` e contratos existentes).
   - No **Modo Em Massa**, o dropzone aceita **adicionar mais arquivos** à fila (*append*) antes de salvar, até o teto prático de **50 itens por lote** (`MAX_BATCH_ACTIVITY_FILES = 50`).

2. **Pareamento Automático `.FIT + .GPX` por Nome Base (`groupActivityFilesForBatch`):**
   - Ao receber múltiplos arquivos (ex.: usuário selecionou `Longao_domingo.fit`, `Longao_domingo.gpx` e `Tiro_quarta.fit`), o agrupador normaliza o nome sem extensão (`trim().toLowerCase()`):
     - Arquivos `.fit` + `.gpx` com **mesmo nome-base normalizado** são agrupados automaticamente em **1 atividade mesclada** (`[fit, gpx]`, aproveitando o merge prioritário de `parseAndMergeActivity`).
     - Arquivos sem par ficam como itens individuais (`[fit]` ou `[gpx]`).
     - Se dois arquivos distintos tiverem o mesmo nome por acaso, cada item mesclado exibe um botão discreto *"Separar em 2 treinos"* para reanalisá-los separadamente.

### 2.2 Seleção Única Global (`Treino do Diário` vs `Simulado TAF`)
- Conforme requisito explícito: existe **APENAS UMA seleção global no topo do lote** (`role="radiogroup"`, inicializada com `defaultSaveAs` vindo de `/treinos` = `"training"` ou `/meu-taf` = `"taf_attempt"`):
  - **`Todos como Treinos do Diário`**
  - **`Todos como Simulados TAF (Cooper 12 min)`**
- **Não** existe botão ou dropdown individual por arquivo para alternar Treino vs Simulado. Todos os itens seguem unicamente essa escolha global.
- Ao alternar essa seleção global após os arquivos já terem sido analisados:
  - **Não** há novas chamadas ao backend, pois `/api/training-sessions/parse-activity` já devolve tanto o resumo completo quanto `tafWindow`, `alreadyExists` e `alreadyExistsAttempt` no mesmo `ActivityParsePreview`.
  - A lista atualiza instantaneamente os indicadores por item (duplicidade específica do destino selecionado, métricas principais e validação de limites TAF `100–10.000 m` / `30–7.200 s`).

### 2.3 Preenchimento em Massa ("Aplicar a Todos") + Edição Rápida por Linha
- **Painel compacto "Configuração Rápida do Lote":**
  - **Quando destino global = `Treino do Diário`:**
    - `Peso Corporal (kg)`: pré-carregado de `UserProfile.currentWeightKg`, usado para estimar calorias (Compêndio 2024 / MET) em todas as sessões elegíveis do lote.
    - `Tipo de Treino do Lote`: opção *"Automático por arquivo (sugestão do .FIT/.GPX)"* (padrão) **ou** selecionar um tipo fixo (`rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`, `caminhada`) aplicado com 1 clique a todos os itens.
    - `Tênis Padrão (Opcional)`: campo único com opção de aplicar automaticamente a todos os itens (ou apenas aos que estiverem vazios).
    - `Esforço Percebido — RPE 1..10 (Opcional)`: opcional para o lote.
    - `Se algum arquivo já foi importado no Diário`: *"Pular duplicados (padrão seguro)"* vs *"Atualizar existentes"* (`onDuplicate: "update"`).
  - **Quando destino global = `Simulado TAF`:**
    - `Local do Teste do Lote`: opção *"Automático (Esteira se indoor, senão Pista 400m)"* (padrão) **ou** selecionar um local específico para todos (`pista_400m`, `rua_plana`, `parque_praca`, `esteira`, `outro`).
    - `Tênis Padrão (Opcional)`: compartilhado entre todos os simulados.
    - Checkbox único global `"Também registrar todos no Diário de Treinos (Log_Treinos)"`: quando marcado, gera o espelho (`buildMirroredTrainingFromAttempt`) para cada simulado salvo no lote.
    - `Se algum arquivo já foi importado como Simulado TAF`: *"Pular duplicados (padrão seguro)"* vs *"Atualizar existentes"*.

- **Execução e Cancelamento Seguro (`AbortSignal`):** fila controlada suportando interrupção limpa caso o usuário clique em *"Cancelar / Limpar lote"* ou feche o painel durante a análise ou gravação.
- **Espelhamento seguro no modo Simulado TAF (`alsoSaveToDiary`):**
  - Se `!preview.alreadyExists`: espelha com `externalId: preview.externalId` (passando `{ skipSheetsSync: true }`).
  - Se `preview.alreadyExists === true`: quando política de duplicados for `"skip"`, **não** cria segunda cópia órfã no Diário; quando política for `"update"` e `preview.existingTrainingId` existir, atualiza o treino vinculado (`id: preview.existingTrainingId`, `onDuplicate: "update"`, `{ skipSheetsSync: true }`) em vez de duplicar.
- **Precedência clara entre Configuração do Lote e Edição por Linha:**
  - `Peso Corporal`, `Política de Duplicados`, `Seleção Única Global` e `Também registrar todos no Diário` são controles globais do lote;
  - Alterar o padrão de `Tipo de Treino`, `Local do Teste` ou `Tênis Padrão` na barra superior aplica o valor aos itens da fila (com opção `"Automático por arquivo"` restaurando `preview.suggestedActivityType` / `"esteira"|"pista_400m"`), preservando títulos editados manualmente nas linhas.
- **Tabela / Cards Compactos de Revisão (`BatchImportReviewList` / `BatchImportItemRow`):**
  - Cada item mostra:
    - Nome do(s) arquivo(s) e origem (`.FIT`, `.GPX` ou `MESCLADO`).
    - Input inline curto de **Título / Nome** (já pré-preenchido por `result.name || result.suggestedNotes || filenameTitle`, editável rapidamente).
    - Data da sessão + métricas conforme a seleção única global (Treino: km, movimento/pausas, pace, calorias estimadas; TAF: metros na janela 12 min, tempo da janela, pace e aviso se `< 12 min` ou fora dos limites Zod).
    - Select rápido inline para ajuste pontual de `Tipo de Treino` (ou `Local` no modo TAF).
    - **Badge de status do item:**
      - `Pronto para salvar` (verde)
      - `Duplicado (será pulado)` ou `Duplicado (será atualizado)` (âmbar, conforme política escolhida e **verificado apenas contra o destino global ativo** — ex.: se já existe em Treino, ainda pode ser salvo normalmente como Simulado TAF)
      - `Repetido neste lote` (cinza/âmbar — quando outro item da mesma fila já tem o mesmo `externalId`, evitando erro `409` em concorrência)
      - `Fora dos limites TAF` (vermelho bloqueante quando em modo TAF e janela `< 100 m` / `> 10.000 m` / `< 30 s` / `> 7.200 s`)
      - `Requer dados manuais` (âmbar — expande 3 inputs curtos `Data / Distância / Duração` somente nesse item se o arquivo veio incompleto)
      - `Erro na leitura` (vermelho, mostrando a mensagem vinda do parser, com opção `Tentar novamente` ou `Remover`)
      - Pós-gravação: `Salvo ✓`, `Atualizado ✓`, `Pulado` ou `Falha ao salvar` (permite clicar em *"Tentar novamente falhos"* sem reenviar os que já foram salvos!).
    - Ação `Expandir detalhes / splits` (carregamento sob demanda com `GpxPreviewCard`) e ação `Remover da fila`.

### 2.4 Execução do Salvamento em Lote & Google Sheets
1. Ao clicar em **"Importar Lote (N itens)"**:
   - Filtra itens elegíveis (`ready` sem bloqueios de bounds/fallback faltante; ignora ou atualiza duplicados conforme política selecionada; nunca reenvia itens que já tenham status `saved` caso usuário esteja fazendo *retry* de falhas).
   - Processa com **concorrência controlada de 2 itens** (`Promise` pool) usando `tafService.saveTraining(..., false, { skipSheetsSync: true })` ou `tafService.saveAttempt(..., false, { skipSheetsSync: true })`.
   - Atualiza a barra de progresso item a item (`"Salvando 8 de 15..."`) e marca cada item individualmente com o resultado final (`saved`, `updated`, `skipped`, `save_error`).
2. **Sincronização Única Consolidada & Invalidação de Caches:**
   - Ao final do salvamento, se pelo menos 1 registro foi criado ou atualizado (`savedCount + updatedCount > 0`):
     - Verifica `tafService.getSheetsSyncStatus().catch(() => null)`: se `configured === true`, executa **1 única chamada** `tafService.syncGoogleSheets({ direction: "push", forceFullResync: false })` (mesmo padrão seguro de `importBackupJson`).
     - Chama `clearCrossPageSheetsCaches({ includeGoal: false })`.
     - Dispara `onBatchImported(summary)` para que `/treinos` (`loadTrainings`) e `/meu-taf` (`loadData`) atualizem listas, gráficos e a badge reativa de pendências (`GoalAndBackupSettings`) com **1 único toast consolidado**.
   - Se o usuário gravou com sucesso no PostgreSQL mas o push final no Google Sheets falhar, exibe aviso não-destrutivo informando que os registros já foram gravados no banco e estão prontos para reenvio em `"Sincronizar Planilha"`.

---

## 3. Execução em Fases & Portões de Qualidade (Quality Gates)

### Fase 1 — Motores Puros de Agrupamento, Geração de IDs, Payloads e Executor de Lote (`lib/`)

- **Objetivo:** Extrair e criar toda a lógica pura de lote e compartilhamento de payload sem alterar contratos de API ou duplicar regras do fluxo unitário.
- **Checklist:**
  - [x] **1.1** Criar helper `generateClientRecordId(prefix: "trn" | "att"): string` em `lib/sheetsSyncUi.ts` garantindo unicidade sub-milissegundo via `globalThis.crypto?.randomUUID()` com fallback seguro `Math.random().toString(36)`.
  - [x] **1.2** Criar `lib/activityParser/batchGrouping.ts` (reexportado em `lib/activityParser/index.ts`) com:
    - Constante `MAX_BATCH_ACTIVITY_FILES = 50`.
    - `groupActivityFilesForBatch(files: File[], existingKeys?: Set<string>)`: deduplica por assinatura de arquivo (`name + size + lastModified`), valida extensão `.fit`/`.gpx`, tamanho `0 < size <= 4 MB`, normaliza nome-base e agrupa pares `.fit` + `.gpx` homônimos em 1 item mesclado (mantendo ordem original), além de `splitMergedBatchGroup(...)` e `markDuplicateExternalIdsInBatch(...)`.
    - `shouldAutoSwitchToBatchImport(files: File[], currentMode: "single" | "batch")`: retorna `true` quando já estiver em `"batch"`, ou houver `>= 3` arquivos, `>= 2` `.fit` ou `>= 2` `.gpx`.
  - [x] **1.3** Criar `lib/activityParser/batchPayloads.ts` (reexportado em `lib/activityParser/index.ts`) extraindo a lógica pura compartilhada entre fluxo unitário e lote:
    - `resolveSafeIsoDate(...)`, `computeFallbackTafWindow(...)`, `buildTrainingSessionFromPreview(...)`, `buildTafAttemptFromPreview(...)` e validação de limites (`0,05–100 km`, `30–86.400 s` para treino; `100–10.000 m`, `30–7.200 s` para TAF), usando `generateClientRecordId` e reutilizando `combineTitleAndNotes` e `estimateTrainingCalories`/`buildCaloriePayload`.
    - Helper de concorrência controlada `runPool<T, R>(items, concurrency, worker, signal?)` + orquestradores puros `analyzeBatchActivityGroups(...)` e `persistBatchActivityItems(...)` (suporte a `skip` vs `update` em duplicados, espelhamento seguro sem duplicata órfã no Diário em modo TAF, `{ skipSheetsSync: true }` em **todas** as gravações inclusive espelhos, detecção intra-lote de `externalId`, `AbortSignal` e `onProgress`).
  - [x] **1.4** Definir interfaces tipadas em `types/index.ts` (se compartilhadas com páginas): `BatchImportTarget = "training" | "taf_attempt"`, `BatchDuplicatePolicy = "skip" | "update"`, `BatchImportSummary`.
  - [x] **1.5 Testes unitários (`__tests__/lib/activityParser/batchGrouping.test.ts` e `__tests__/lib/activityParser/batchPayloads.test.ts`):**
    - Agrupamento `.fit + .gpx` com mesmo nome-base (*case-insensitive*), múltiplos `.fit`, arquivos inválidos/vazios/>4MB isolados sem abortar o lote, `shouldAutoSwitchToBatchImport`.
    - Geração de IDs 100% únicos em loop rápido no mesmo milissegundo.
    - Construção de payloads de Treino (com MET por peso corporal, fallback calorias do `.FIT`, `elapsedSeconds`, notas) e TAF (janela 12 min, limite out-of-bounds, FC válida).
    - `persistBatchActivityItems`: pula duplicados no modo `"skip"`, envia `onDuplicate: "update"` no modo `"update"`, chama `{ skipSheetsSync: true }` em todos os itens (incluindo espelho TAF → Diário sem criar cópia órfã), ignora itens já com `externalId` repetido na fila e respeita `AbortSignal`.
- **Portão de Qualidade `[PQ1]`:**
  - `npx tsc --noEmit` = 0 erros.
  - `npx vitest run __tests__/lib/activityParser/` 100% verde com cobertura `>= 90%` nos novos módulos.

---

### Fase 2 — Interface de Importação em Massa no `GpxImportPanel` & Integração nas Páginas `/treinos` e `/meu-taf`

- **Objetivo:** Implementar a UI completa do Modo Em Massa com seleção única global (`Treino` vs `Simulado TAF`), barra de padrões do lote, fila de revisão interativa e integração limpa com `/treinos` e `/meu-taf`.
- **Checklist:**
  - [x] **2.1** Refatorar `components/treinos/GpxImportPanel.tsx` para consumir `generateClientRecordId` e os builders de payload de `lib/activityParser/batchPayloads.ts` também no fluxo unitário (eliminando duplicação e corrigindo colisão `Date.now()`).
  - [x] **2.2** Adicionar no `GpxImportPanel.tsx`:
    - Alternador de modo `"1 Treino (Individual)"` / `"Em Massa (Vários Arquivos)"` + troca automática quando `shouldAutoSwitchToBatchImport(...)` for verdadeiro.
    - Subcomponentes organizados em `components/treinos/batch/`:
      - `BatchImportTargetBar.tsx`: seleção única global (`role="radiogroup"` com `data-testid="batch-target-training"` e `data-testid="batch-target-taf"`) que define o destino de **todos** os arquivos do lote simultaneamente, mantendo `defaultSaveAs` como valor inicial.
      - `BatchImportDefaultsBar.tsx`: configuração rápida em massa contextual à seleção global (Treino: Peso, Tipo do lote, Tênis, RPE, política de duplicados; TAF: Local do lote, Tênis, checkbox *"Também registrar todos no Diário"*, política de duplicados).
      - `BatchImportItemRow.tsx`: linha/card compacto por atividade com edição inline de título, tipo/local, status/duplicidade/erros, botão desagrupar (quando `.FIT+.GPX`), expansão sob demanda de detalhes/splits (`GpxPreviewCard`), inputs fallback quando necessários e remover.
    - Barra de progresso (`"Analisando X de Y..."` / `"Salvando X de Y..."`), botão principal `"Importar Lote (N prontos)"`, botão `"Tentar novamente falhos"` após falhas parciais e painel resumo final com status do push único para Google Sheets.
  - [x] **2.3** Estender `GpxImportPanelProps` com `onBatchImported?: (summary: BatchImportSummary) => Promise<void> | void`:
    - Integrar em `app/treinos/page.tsx`: limpar `clearCrossPageSheetsCaches({ includeGoal: false })`, recarregar `await loadTrainings()`, fechar formulário quando `summary.failedCount === 0` e exibir toast único resumido em português (`max-w-[calc(100vw-2rem)]`).
    - Integrar em `app/meu-taf/page.tsx`: limpar `clearCrossPageSheetsCaches({ includeGoal: false })`, recarregar `await loadData()`, fechar painel quando `summary.failedCount === 0` e exibir toast único resumido em português.
- **Portão de Qualidade `[PQ2]`:**
  - `npx tsc --noEmit` = 0 erros.
  - `npm run lint` sem erros ou avisos ESLint.
  - Fluxo unitário anterior (`__tests__/components/GpxImportPanel.test.tsx`, `TafImportFlow.test.tsx`, `SheetsSyncUi.test.tsx`) **100% passando sem alterações regressivas**.

---

### Fase 3 — Testes Completos da UI em Massa, Integração com Páginas e Edge Cases

- **Objetivo:** Garantir cobertura completa de todos os cenários do novo fluxo em massa (seleção única global, pareamento, erros parciais, duplicados, Google Sheets único ao final, mobile e páginas).
- **Checklist:**
  - [x] **3.1** Criar `__tests__/components/BatchImportPanel.test.tsx`:
    - Seleção de 3 arquivos (ex.: `a.fit`, `b.fit`, `c.gpx`) entra automaticamente em modo Em Massa, faz 3 chamadas separadas a `parseActivity` e pré-preenche os títulos pelo nome dos arquivos.
    - Pareamento automático `longao.fit` + `longao.gpx` + `tiro.fit` gera 2 itens na fila (1 mesclado + 1 isolado) e permite desagrupar.
    - **Seleção única global (`Treino` vs `Simulado TAF`):** verifica que existe apenas 1 `radiogroup` de destino, não há seletores individuais por linha, e alternar de `"Treinos"` para `"Simulados TAF"` muda todas as prévias para janela 12 min e grava todos via `saveAttempt(..., { skipSheetsSync: true })`.
    - Aplicação de defaults em massa (tênis + peso corporal ou tipo fixo) reflete no payload salvo de todos os itens.
    - Resiliência a erro parcial: 1 arquivo corrompido + 2 válidos permite salvar os 2 válidos sem bloquear o lote; 1 falha no save permite *"Tentar novamente falhos"* sem duplicar os já salvos.
    - Política de duplicados `"skip"` vs `"update"`: pula ou atualiza corretamente usando `existingTrainingId`/`existingAttemptId` + `onDuplicate: "update"`, além de deduplicação intra-lote para arquivos idênticos na mesma fila e espelhamento TAF → Diário (`alsoSaveToDiary`) passando `{ skipSheetsSync: true }` sem gerar cópia órfã.
    - Ao finalizar gravação bem-sucedida, confirma chamada **única** a `syncGoogleSheets({ direction: "push", forceFullResync: false })` quando Sheets está configurado.
  - [x] **3.2** Cobrir integração de `onBatchImported` nas suítes de páginas/componentes existentes (ex.: `__tests__/pages/treinos.test.tsx` e `__tests__/pages/meu-taf-period-and-backup.test.tsx` ou mocks equivalentes) validando invalidação de cache, reload e toast único.
  - [x] **3.3** Executar `npm run test:coverage` confirmando `lines >= 90%` e `functions >= 90%` em `lib/**/*.ts` e 100% dos arquivos passando.
- **Portão de Qualidade `[PQ3]`:**
  - `npx tsc --noEmit`, `npm run lint` e `npm run test:coverage` aprovados com cobertura global e em `lib/**` acima dos thresholds.

---

### Fase 4 — Homologação Final, Validação Controlada e Documentação

- **Objetivo:** Verificar zero regressões no projeto completo, validar cenário real em desenvolvimento local (ex.: múltiplos `.FIT`/`.GPX` reais do projeto) e arquivar o plano.
- **Checklist:**
  - [x] **4.1** Atualizar `docs/roadmap/01_roadmap_melhorias_futuras.md` (registrar **Eixo B.9 — Importação e Preenchimento em Massa `.FIT`/`.GPX`**) e `README.md` (seção de funcionalidades de importação).
  - [x] **4.2** Validação controlada ponta a ponta com arquivos reais em memória/local (ex.: `Caminhada_leve.fit` + `Caminhada_leve.gpx` + fixtures `.fit`/`.gpx`): validar agrupamento, seleção única Treino vs Simulado TAF, payload pronto para API e integridade sem sujar banco/planilha reais (ou com criação+remoção controlada caso solicitado).
    - Validado em memória sobre 6 arquivos do projeto (`Caminhada_leve.fit`, `Caminhada_leve.gpx`, `Voltando.gpx`, `fit_run_5k_autolap.fit`, `fit_run_treadmill_indoor.fit`, `fit_corrupted.fit`) via `parseAndMergeActivity` + `groupActivityFilesForBatch` + `analyzeBatchActivityGroups` + `persistBatchActivityItems`: pareamento automático `Caminhada_leve.fit + Caminhada_leve.gpx` (`5` grupos no total; `splitMergedBatchGroup` separando para `6`), isolamento do `.fit` corrompido, Passagem A (`training`: `4` payloads validados no `CreateTrainingSessionSchema`, `{ skipSheetsSync: true }`, `1` push Sheets) e Passagem B (`taf_attempt` + `alsoSaveToDiary`: `4` payloads validados no `CreateTafAttemptSchema` + `4` espelhos validados no `CreateTrainingSessionSchema`, `1` push Sheets), sem alterar banco ou planilha reais.
  - [x] **4.3** Executar suíte completa pós-edição final:
    - `npx tsc --noEmit`
    - `npm run lint`
    - `npm run test:coverage`
    - `npm run build`
  - [x] **4.4** Registrar resultados finais de `[PQ4]` e mover este plano para `docs/plans/executed/`.
- **Portão de Qualidade Final `[PQ4]` — APROVADO:**
  - `npx tsc --noEmit`: 0 erros.
  - `npm run lint`: `✔ No ESLint warnings or errors`.
  - `npm run test:coverage`: **88/88 arquivos e 815/815 testes passando** (`0` falhas, `0` ignorados); cobertura global `All files` = `96.64%` linhas / `98.98%` funções / `88.15%` branch (`batchGrouping.ts`: `99.36%` linhas / `100%` funções; `batchPayloads.ts`: `97.04%` linhas / `100%` funções; `sheetsSyncUi.ts`: `99.33%` linhas / `100%` funções).
  - `npm run build`: build de produção Next.js `14.2.35` concluído (`16/16` páginas estáticas + rotas dinâmicas).

---

## 4. Resumo de Arquivos Impactados (Realizado)

- **Novos arquivos:**
  - `lib/activityParser/batchGrouping.ts`
  - `lib/activityParser/batchPayloads.ts`
  - `components/treinos/batch/BatchImportTargetBar.tsx`
  - `components/treinos/batch/BatchImportDefaultsBar.tsx`
  - `components/treinos/batch/BatchImportItemRow.tsx`
  - `__tests__/lib/activityParser/batchGrouping.test.ts`
  - `__tests__/lib/activityParser/batchPayloads.test.ts`
  - `__tests__/components/BatchImportPanel.test.tsx`
  - `docs/architecture/01_leitura_fit_gpx_e_divergencias_strava.md`
  - `docs/plans/executed/14_plan_importacao_em_massa_fit_gpx.md`
- **Arquivos existentes modificados:**
  - `types/index.ts`
  - `lib/sheetsSyncUi.ts` (`generateClientRecordId`)
  - `lib/activityParser/index.ts`
  - `lib/services/tafService.ts` (`SaveRecordOptions` com `skipSheetsSync`)
  - `components/treinos/GpxImportPanel.tsx`
  - `app/treinos/page.tsx`
  - `app/meu-taf/page.tsx`
  - `__tests__/components/SheetsSyncUi.test.tsx`
  - `__tests__/pages/treinos.test.tsx`
  - `__tests__/pages/meu-taf.test.tsx`
  - `docs/roadmap/01_roadmap_melhorias_futuras.md`
  - `README.md`
