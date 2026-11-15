# Plano 16 — Organização, Atualização Pós-Plano 15 e Consolidação da Documentação PaceLab

> **Status:** ✅ Concluído e Arquivado (Fases 0–5 executadas após homologação do [Plano 15](./15_plan_sincronizacao_plano_semanal_e_aderencia.md))  
> **Ordem de Execução:** **Executar somente após a entrega e homologação do Plano 15 em `main`.**  
> **Objetivo Geral:** Reestruturar toda a documentação do PaceLab em uma árvore modular, navegável e 100% fiel ao código-fonte **já incluindo as entregas do Plano 15** (`Plano_Semanal`, `WeeklyPlanItem`, `WeeklyAdherenceCard`, `GET /api/weekly-plan` e `GET /api/taf/trainings/[id]`) dentro dos guias permanentes de arquitetura, integrações, produto e operações.

---

## 1. Princípio Estratégico e Escopo

O **Plano 16 não cria um documento isolado sobre o "Plano 15"**. Como ele será executado **após o Plano 15 entrar em produção**, tudo o que o Plano 15 entregar deixa de ser "especificação futura" e passa a ser **documentado nativamente como funcionalidade viva** nos documentos certos:

- O schema de `WeeklyPlanItem` e os endpoints `/api/weekly-plan` e `GET /api/taf/trainings/[id]` entram na referência de **Banco de Dados e APIs**;
- A 4ª aba `Plano_Semanal!A:I`, a reconciliação em 2 passadas e o fluxo com o Gemini entram na **Arquitetura do Ecossistema** e no **Guia Prático de Google Sheets & Gemini**;
- O widget `WeeklyAdherenceCard` e o deep-link `/treinos?trainingId=<id>` entram na documentação da **Home (`/`)** e do **Diário de Treinos (`/treinos`)**;
- Os cenários de falha/recuperação da aba semanal e das migrations entram no guia de **Operações & Troubleshooting**.

### 1.1. Problemas Atuais Diagnosticados que o Plano 16 Resolve

Auditoria direta do repositório identificou desvios concretos que devem ser sanados durante este plano:

| Arquivo / Área Atual | Problema Encontrado na Auditoria | Ação Planejada no Plano 16 |
|---|---|---|
| [`README.md`](../../../README.md) | Contém ~90 linhas de tutorial detalhado de Google Cloud inline; ainda descreve apenas 3 abas no Sheets; lista presets incorretos (`PMESP`, `PCERJ`) enquanto o código real em [`TafGoalConfigCard.tsx`](../../../components/profile/TafGoalConfigCard.tsx) implementa `["PM-SP", "PF", "PRF", "PMPR"]`. | Enxugar `README.md` como porta de entrada (~100 linhas), corrigir presets/stack pós-Plano 15, linkar para `docs/README.md` e mover o passo a passo Cloud/Base64 para `docs/integrations/`. |
| [`docs/architecture/02_ecossistema_strava_pacelab_sheets_gemini.md`](../../architecture/02_ecossistema_strava_pacelab_sheets_gemini.md) | Criado antes do Plano 15, portanto trata `Plano_Semanal`, `WeeklyPlanItem` e `WeeklyAdherenceCard` como *"Planejado (Não implementado)"*. | Promover `Plano_Semanal` e o ciclo fechado com o Gemini para o status **Em Produção**, atualizando diagrama, tabelas e regras de reconciliação. |
| [`docs/roadmap/01_roadmap_melhorias_futuras.md`](../../roadmap/01_roadmap_melhorias_futuras.md) | Desalinhamentos históricos: afirma que o PostgreSQL é *"exclusivo do módulo Meu TAF"*, cita apenas 5 tabelas (pré-Plano 15), lista 3 valores antigos de `ActivityType` no Eixo B.1 e menciona `5 KPIs` no dashboard (hoje são **6 KPIs** + **6 gráficos** + heatmap + RPE). | Atualizar tabela de persistência (`6` tabelas com `weekly_plan_items`), esclarecer evolução histórica sem apagar registro dos Eixos e registrar conclusão dos Planos 15 e 16. |
| Módulos sem guia funcional | Não há documentação de usuário/produto cobrindo: Hub `/calculadora` (5 abas), `/taf`, `/metas`, `/intervalado`, `/historico`, motores científicos (`calories.ts` Compêndio 2024 + `cooper.ts`), os 6 gráficos de `/treinos`, os 5 gráficos + comparador + régua de `/meu-taf` e `/perfil` (IMC e pesagens). | Criar a trilha `docs/features/` consolidada em 3 guias coesos sem pulverizar micro-páginas. |
| Falta de guia operacional e portal central | Scripts de teste (`vitest`, fixtures `.FIT`/`.GPX`), regras de migration (`prisma migrate deploy`), padrões de API (`lib/api/response.ts`) e troubleshooting não têm guia próprio nem índice unificado. | Criar `docs/architecture/03_*`, `docs/operations/01_*` e o portal central `docs/README.md`. |
| Rascunho sensível na raiz | O arquivo `documenta_o_completa_do_ecossistema_pacelab.md` expõe ID real de planilha pessoal e contém erros de enums e fluxos. | Confirmar exclusão definitiva da raiz na Fase 0 e rodar auditoria anti-segredos na Fase 5. |

---

## 2. Arquitetura-Alvo da Documentação

Ao final do Plano 16, o repositório seguirá uma separação estrita por responsabilidade (**evitando duplicação** entre contratos técnicos, passo a passo operacional, uso do produto e histórico de engenharia):

```text
PaceLab/
├── README.md                                  # Porta de entrada enxuta, visão do ecossistema, quickstart e links para docs/
└── docs/
    ├── README.md                              # ÍNDICE CENTRAL: navegação por perfil, mapa de rotas da app e status oficial
    │
    ├── architecture/                          # Contratos técnicos, dados e fluxo entre sistemas
    │   ├── 01_leitura_fit_gpx_e_divergencias_strava.md   # [Revisar] Motor .FIT/.GPX, merge, moving time, Strava e CLIs
    │   ├── 02_ecossistema_strava_pacelab_sheets_gemini.md # [Atualizar] Ciclo completo dos 4 pilares pós-Plano 15 (4 abas)
    │   └── 03_modelo_de_dados_e_apis.md                  # [Criar] Schema Prisma (6 tabelas + enums), persistência, timezone e APIs/Swagger
    │
    ├── integrations/                          # Manuais práticos de configuração e operação externa
    │   ├── 01_strava_exportacao_e_classificacao.md       # [Criar] Exportar Strava Web, lote até 50 arq., corrida vs caminhada e destino explícito
    │   └── 02_google_sheets_e_gemini_passo_a_passo.md    # [Criar] Google Cloud + Base64 + Vercel + planilha 4 abas + Gemini interativo e Domingo 19h
    │
    ├── features/                              # Documentação funcional do produto (UI, métricas e regras visuais)
    │   ├── 01_calculadoras_e_motores_cientificos.md      # [Criar] Home (/), /calculadora, /taf, /metas, /intervalado, /historico + Compêndio 2024 e Cooper
    │   ├── 02_treinos_e_dashboard_analitico.md           # [Criar] /treinos, WeeklyAdherenceCard (Plano 15), SplitsInsights, Heatmap, 6 KPIs e 6 gráficos
    │   └── 03_meu_taf_simulados_e_perfil.md              # [Criar] /meu-taf (4 abas, régua, VO2, 5 gráficos, comparador, backup JSON/CSV) e /perfil (IMC/pesagens)
    │
    ├── operations/                            # Qualidade, testes, deploy e resolução de problemas
    │   └── 01_testes_deploy_e_troubleshooting.md         # [Criar] Vitest >= 90%, fixtures .FIT/.GPX, db:check, Vercel/Supabase e erros comuns
    │
    ├── roadmap/
    │   └── 01_roadmap_melhorias_futuras.md               # [Atualizar] Alinhar estado atual pós-Planos 15/16 e próximos eixos (Auth, RLS, etc.)
    │
    └── plans/
        ├── executed/                                     # Registro histórico de sprints concluídas (incl. 15 e 16 após conclusão)
        └── ...
```

### Regra Anti-Duplicação entre Camadas
- **`architecture/`** documenta *o quê e por quê técnico* (schemas, colunas, contratos de API, limites numéricos, fórmulas e algoritmos).
- **`integrations/`** documenta *como configurar e operar passo a passo* (botões no Google Cloud, comandos de terminal Base64, compartilhamento no Drive, setup do Gemini e fluxo de importação no Strava).
- **`features/`** documenta *como funciona cada tela e visualização* do PaceLab para atletas e desenvolvedores de produto.
- **`operations/`** documenta *como testar, validar migrations, fazer deploy e diagnosticar incidentes*.
- **`plans/executed/`** fica explicitamente marcado no `docs/README.md` como **arquivo histórico**, nunca como fonte primária de comportamento atual.

---

## 3. Fases Estratégicas de Execução

### Fase 0 — Pré-Requisito Pós-Plano 15, Limpeza de Segurança e Padrão Editorial (`[PQD0]`)
**Objetivo:** Garantir que o código do Plano 15 já está estabilizado em `main`, remover rascunhos sensíveis e fixar regras de qualidade documental.

- **Critério de entrada (Gate):** O [Plano 15](./15_plan_sincronizacao_plano_semanal_e_aderencia.md) deve estar implementado, homologado e movido para `docs/plans/executed/15_plan_sincronizacao_plano_semanal_e_aderencia.md`.
- **Ações:**
  1. Inspecionar os arquivos finais alterados/criados pelo Plano 15 (`prisma/schema.prisma`, `lib/math/weeklyAdherence.ts`, `lib/googleSheets/{types.ts,mapper.ts,syncService.ts}`, `app/api/weekly-plan/route.ts`, `app/api/taf/trainings/[id]/route.ts`, `lib/swagger/spec.ts`, `components/dashboard/WeeklyAdherenceCard.tsx`, `app/page.tsx`, `app/treinos/page.tsx`, `lib/sheetsSyncUi.ts`) para garantir 100% de precisão de nomes, tipos e caminhos antes de escrever os docs.
  2. Excluir `documenta_o_completa_do_ecossistema_pacelab.md` da raiz do projeto (caso ainda exista) para evitar commit de ID real de planilha e dados pessoais.
  3. Definir padrão editorial para todos os arquivos novos:
     - Idioma **Português (Brasil)**, preservando nomes literais de símbolos/rotas/tabelas em crases;
     - Uso estrito de **links relativos Markdown** dentro de `README.md` e `docs/**` (proibido gravar URLs `file:///home/...` de máquina local);
     - Diagramas Mermaid limitados a blocos compatíveis (`flowchart TD` / `flowchart LR` / `sequenceDiagram` / `erDiagram`, com aspas em rótulos que contenham parênteses).
- **Critério de conclusão (`[PQD0]`):** Plano 15 presente em `docs/plans/executed/`, raiz livre de rascunhos com IDs pessoais e checklist de símbolos pós-Plano 15 conferido.

---

### Fase 1 — Arquitetura Técnica: Dados, APIs e Atualização Pós-Plano 15 (`docs/architecture/`, `[PQD1]`)
**Objetivo:** Consolidar a camada de referência técnica para desenvolvedores e IAs integradoras, incorporando todas as entregas do Plano 15 como comportamento padrão de produção.

- **Entregável 1.1 — Criar `docs/architecture/03_modelo_de_dados_e_apis.md`:**
  - **Persistência Híbrida:** tabela comparativa entre:
    - `localStorage` (`pacelab_history_v1`, `theme`);
    - `sessionStorage` (caches otimistas SWR e rascunhos de calculadoras em `/calculadora`, `/intervalado`, `/treinos`, `/meu-taf`);
    - PostgreSQL via Prisma ORM (Supabase).
  - **Modelo Relacional Completo (6 tabelas pós-Plano 15):**
    - `TafGoal` (`taf_goals`), `TafAttempt` (`taf_attempts`), `TrainingSession` (`training_sessions`), `UserProfile` (`user_profiles`), `WeightRecord` (`weight_records`) **e `WeeklyPlanItem` (`weekly_plan_items`)** (incluindo FK `matchedSessionId @unique` com `onDelete: SetNull`, índices e relação `1:1` com `TrainingSession`).
    - Enums oficiais: `ActivityType` (6 valores), `ActivitySource` (4 valores) e `LocationType` (5 valores).
    - Histórico consolidado de migrations em `prisma/migrations/` (7 originais + migration do Plano 15).
  - **Contrato de Datas e Fuso Horário:** documentar a convenção oficial `America/Fortaleza` (`formatDateFortaleza`, `toFortalezaDateKey` e calendário civil `YYYY-MM-DD`) e por que datas de treino/plano evitam deslocamento UTC em ambiente Vercel.
  - **Mapa Oficial de APIs REST + OpenAPI:**
    - Padrão de resposta `ApiResponse<T>` e `withApiHandler` em `lib/api/response.ts` (Zod 400, Prisma P2025/P2002/InitializationError, erros Sheets 429/502/503);
    - Paginação cursor-based (`PaginationQuerySchema`) e bypass `?skipSheetsSync=true`;
    - Catálogo das rotas documentadas no Swagger `/docs` (`/api/docs/spec`): todas as rotas existentes (`/api/taf/goals`, `/api/taf/attempts`, `/api/taf/attempts/[id]`, `/api/taf/trainings`, `/api/taf/trainings/[id]` agora com `GET`/`PUT`/`DELETE`, `/api/training-sessions/parse-activity`, `/api/taf/trainings/gpx-preview`, `/api/profile`, `/api/profile/weight`, `/api/profile/weight/[id]`, `/api/sync/sheets`, `/api/taf/health`) **mais `GET /api/weekly-plan` entregue pelo Plano 15**.

- **Entregável 1.2 — Atualizar [`docs/architecture/02_ecossistema_strava_pacelab_sheets_gemini.md`](../../architecture/02_ecossistema_strava_pacelab_sheets_gemini.md):**
  - Atualizar Seção 1 (*Status Atual*): mover `Plano_Semanal`, `WeeklyPlanItem`, reconciliação em 2 passadas e `WeeklyAdherenceCard` para **Em Produção**.
  - Atualizar diagrama Mermaid da Seção 2 para incluir a 4ª aba `Plano_Semanal`, `GET /api/weekly-plan` e atualização automática de status `H:I`.
  - Promover a Seção 5.4 para **Aba 4: `Plano_Semanal!A:I` (Ativa)** dentro do contrato oficial da Seção 5.2, detalhando:
    - Colunas `A..I` (`ID`, `Data`, `Dia da Semana`, `Tipo`, `Distância Alvo (km)`, `Pace Alvo (min/km)`, `Descrição / Observação`, `Status`, `ID Treino Realizado`);
    - Parse pt-BR/en-US, preservação de faixas de pace (`parseWeeklyPlanTargetPace`), descarte limpo de linhas de descanso (`descanso`/`off`/`rest`) e limpeza segura de planos regenerados mantendo vínculos já concluídos;
    - Regras puras da reconciliação em 2 passadas (`ratio >= 0.40`, `>= 0.85` `Concluído`, `0.40..0.85` `Parcial`, Passada 2 com tolerância `±1 dia` apenas quando o dia da sessão não possui plano próprio, reversão pós-`DELETE`/`PUT`, atualização seletiva via `batchUpdate` somente em `H:I` modificadas e chamada automática em `push`/`pull`/`bidirectional`).
  - Atualizar Seção 6 (Gemini): documentar o ciclo fechado pós-Plano 15 (consulta da aderência e prescrição estruturada para `Plano_Semanal` quando o usuário optar por integrá-la à planilha).

- **Entregável 1.3 — Revisar [`docs/architecture/01_leitura_fit_gpx_e_divergencias_strava.md`](../../architecture/01_leitura_fit_gpx_e_divergencias_strava.md):**
  - Adicionar seção curta de navegação cruzada ligando ao guia de usuário `docs/integrations/01_strava_exportacao_e_classificacao.md` e validar que nenhum comportamento descrito diverge do código após o Plano 15.

- **Critério de conclusão (`[PQD1]`):** Os 3 arquivos de `docs/architecture/` refletem 100% do schema, rotas, enums e fluxos pós-Plano 15 sem menções desatualizadas a *"futuro"* para a aba `Plano_Semanal`.

---

### Fase 2 — Guias Práticos de Integrações Externas (`docs/integrations/`, `[PQD2]`)
**Objetivo:** Oferecer tutoriais passo a passo claros, seguros e operacionais para conectar Strava, Google Cloud/Sheets e Google Gemini sem poluir o `README.md` nem duplicar tabelas contratuais.

- **Entregável 2.1 — Criar `docs/integrations/01_strava_exportacao_e_classificacao.md`:**
  - Tutorial ilustrado em texto para exportar do **Strava Web** (`/export_original`, descompactação `.fit.gz`, quando o Strava entrega `.fit` vs `.gpx`).
  - Passo a passo de importação no PaceLab (`GpxImportPanel.tsx`):
    - **Importação Individual:** envio de `.fit`, `.gpx` ou par `.fit + .gpx` mesclado;
    - **Importação em Massa (Plano 14):** fila de até **50 arquivos** (máx. **4 MB cada**), agrupamento automático `.FIT + .GPX` por nome-base e opção *"Separar em 2 treinos"*, **seleção única global** (`Diário de Treinos` vs `Simulado TAF`), preenchimento rápido em lote (peso, tipo, tênis, RPE, espelhamento) e `1` único push consolidado ao final (`?skipSheetsSync=true`);
    - **Classificação inteligente Corrida vs. Caminhada** (`activitySuggestion.ts`), política de duplicados (`Pular` vs `Atualizar existentes`), preview de `tafWindow` e escolha explícita de destino (incluindo impacto na reconciliação automática do `Plano_Semanal` pós-Plano 15!).

- **Entregável 2.2 — Criar `docs/integrations/02_google_sheets_e_gemini_passo_a_passo.md`:**
  - **Setup Google Cloud + Vercel (migrado e aprimorado do `README.md`):**
    1. Ativação da `Google Sheets API`;
    2. Criação da `Service Account` e download da chave `.json`;
    3. Geração da string `GOOGLE_CREDENTIALS_BASE64` (comandos para Node.js, Linux, macOS e PowerShell) e cuidados de segurança (nunca commitar `.json` ou `.env`);
    4. Criação da planilha `"Treinos_Corrida"`, obtenção do `GOOGLE_SHEETS_SPREADSHEET_ID` (ID ou URL completa) e compartilhamento como **Editor** com `client_email`;
    5. Configuração local (`.env`) e em produção (**Vercel → Environment Variables** + redeploy).
  - **Guia de Uso das 4 Abas na Planilha (incluindo `Plano_Semanal` pós-Plano 15):**
    - Como a primeira sincronização cria e formata cabeçalhos automaticamente (`Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas`) e como adicionar/preencher a aba `Plano_Semanal!A:I` (padrão de IDs `PLAN-YYYY-MM-DD-N`, uso de `"Descanso"` para dias livres, faixas de pace `"5:45–6:00"`, e quais colunas não editar manualmente quando a origem for `.fit_upload` / `.gpx_upload`);
    - Como operar os botões **"Sincronizar Planilha"** em `/treinos` e **"Sincronizar Agora / Reenviar Histórico Completo (Full Backfill)"** em `/meu-taf` (aba `Meta & Banco`).
  - **Configuração Completa do Google Gemini (Coach Interativo + Tarefa Agendada):**
    - Ativação das extensões/conectores `@Google Workspace` / `@Google Drive` (e `@Google Calendar` opcional);
    - Como configurar a skill/instrução `/treinador-corrida` para coaching contínuo sob demanda;
    - Como agendar a rotina semanal (ex.: todo domingo às 19h);
    - **Template de Prompt Completo (Placeholder-Safe)** atualizado pós-Plano 15: ensina ao usuário como instruir o Gemini a ler as abas `Log_Treinos`, `Simulados_TAF`, `Perfil_e_Metas` e `Plano_Semanal` (para checar aderência real da semana antes de montar a próxima), respeitando rigorosamente os 6 valores de `ActivityType`, os 5 valores de `LocationType` e gerando linhas válidas para `Plano_Semanal` quando aplicável — sempre usando marcadores `[PREENCHER...]` para dados pessoais.

- **Critério de conclusão (`[PQD2]`):** Qualquer pessoa consegue replicar do zero a conexão Strava → PaceLab → Google Sheets (4 abas) → Gemini sem depender do `README.md` nem ler código-fonte.

---

### Fase 3 — Documentação Funcional dos Módulos de Produto (`docs/features/`, `[PQD3]`)
**Objetivo:** Documentar todas as páginas, calculadoras, gráficos, métricas científicas e widgets da aplicação com fidelidade total aos componentes e cálculos reais.

- **Entregável 3.1 — Criar `docs/features/01_calculadoras_e_motores_cientificos.md`:**
  - **Home (`/` — [`app/page.tsx`](../../../app/page.tsx)):** estrutura do painel inicial (`QuickPaceWidget`, `AthleteActiveStatusCard`, **card `WeeklyAdherenceCard` entregue no Plano 15**, card de acesso rápido ao Meu TAF e grade de calculadoras).
  - **Hub `/calculadora` e Rotas Dedicadas:**
    - **Pace & Ritmo (`/calculadora`):** 4 modos (`distance-time`, `pace-speed`, `time-needed`, `distance-covered`), tabela rápida `PaceSpeedTable`, suporte a entradas flexíveis de ritmo/tempo e salvamento no histórico local;
    - **Estratégia TAF (`/taf` + `lib/math/taf.ts`):** modos *Tempo Fixo* (ex.: 12 min) e *Distância Fixa* (ex.: 2.400 m), parciais na pista de 400 m e botão de aplicação rápida da meta do edital;
    - **Metas & Splits (`/metas` + `lib/math/goals.ts`):** planejamento por pace-alvo ou tempo-alvo, estratégias de ritmo (`even`, *negative split*, progressivo) e atalho do edital;
    - **Intervalado (`/intervalado` + `lib/math/intervals.ts`):** configuração de aquecimento, séries de tiro, caminhada/pausa e desaquecimento, limites opcionais de distância ou tempo com truncamento proporcional, gráfico `IntervalSpeedProfileChart`, cartão de pista de alto contraste (`TrackWorkoutCardModal`) e gasto calórico segmentado por etapa;
    - **Histórico Local (`/historico` + `lib/math/averages.ts`):** cálculo de médias simples e ponderadas por distância, filtros, conversão para o diário e exportação CSV/JSON a partir do `localStorage`.
  - **Motores Científicos Explicados (Com Fórmulas Verificadas):**
    - **Compêndio de Atividades Físicas 2024 (`lib/math/calories.ts`):** tabela de nós de caminhada e corrida, interpolação linear contínua por velocidade, fórmulas `(MET * 3.5 * pesoKg * duracaoMin) / 200` (Calorias Totais) vs `MET - 1` (Calorias Ativas) e ponderação multi-segmento para treinos intervalados;
    - **Teste de Cooper (`lib/math/cooper.ts`):** fórmula `VO2 Máx = (distância_em_metros - 504.9) / 44.73` e matriz de classificação por faixa etária e sexo biológico.

- **Entregável 3.2 — Criar `docs/features/02_treinos_e_dashboard_analitico.md`:**
  - **Acompanhamento de Aderência Semanal (Pós-Plano 15 — `WeeklyAdherenceCard`):**
    - Onde aparece (`/` e `/treinos`), navegação semanal (`Segunda a Domingo` em Fortaleza), fórmula exata de aderência (`Math.round(((concluidos + 0.5 * parciais) / totalPlanned) * 100)`, cap 100%), média consolidada das últimas 4 semanas com plano, treinos extras fora do plano, comportamento do empty state sem `NaN%` nem barra falsa de `0%`, abertura direta do `TrainingDetailModal` (e deep-link `/treinos?trainingId=<id>`), e atualização reativa após sync/CRUD.
  - **Diário de Treinos (`/treinos` — aba `Diário`):**
    - KPIs rápidos superiores, busca/filtros (`TrainingList`), formulário manual (`TrainingForm` com estimativa calórica ao vivo), badge `SheetsSyncBadge`, botão **"Sincronizar Planilha"** e importador `.FIT`/`.GPX` (individual e lote).
  - **Modal de Análise de Sessão (`TrainingDetailModal` + `lib/math/splitsAnalysis.ts`):**
    - Tabela de splits (`SplitsTable`), gráfico pace × FC (`SplitsPaceChart`) e motor de insights (`SplitsInsights`: estratégia *negative/even/positive split*, score de regularidade, amplitude de ritmo, *cardiac drift* e variação de elevação).
  - **Dashboard Analítico (`/treinos?tab=graficos` — `TrainingEvolutionDashboard.tsx`):**
    - Filtros temporais (`7d`, `30d`, `90d`, ano, sessões recentes, personalizado);
    - **6 KPIs:** Volume Total (`km`), Tempo Total (em movimento), Gasto Calórico (ativas/totais), Pace Médio Ponderado, Carga Total (`TRIMP` = minutos × RPE) e Maior Sessão;
    - **`TrainingConsistencyHeatmap`:** matriz de 12 semanas e cálculo de *streaks*;
    - **Pirâmide de Intensidade (RPE):** referência **Regra 80/20**;
    - **6 Gráficos Recharts:** (1) Volume Semanal Acumulado, (2) Evolução do Pace por Sessão (eixo Y invertido e filtro por modalidade), (3) Carga de Treinamento TRIMP, (4) Volume por Modalidade (Donut), (5) Gasto Calórico Semanal Acumulado e (6) Calorias por Modalidade (Donut).

- **Entregável 3.3 — Criar `docs/features/03_meu_taf_simulados_e_perfil.md`:**
  - **Painel Meu TAF (`/meu-taf`) nas suas 4 Abas:**
    - `Testes de 12 Min`: **Régua Visual de Aprovação** (`TafApprovalRuler`), **VO2 Máx Cooper** (`CooperVo2MaxCard`), **Exercícios Complementares** (`TafComplementaryExercisesCard` — Barra Fixa, Flexão e Abdominal), importador `.FIT`/`.GPX` focado na janela de 12 min e registro manual/listagem de tentativas;
    - `Gráficos` (`EvolutionDashboard.tsx`): os **5 gráficos TAF** (`Gráfico A` Evolução nos Testes de 12 min c/ linha de corte, `Gráfico B` Distância por Sessão de Treino, `Gráfico C` Evolução do Pace Médio por Treino com eixo invertido, `Gráfico D` Volume Semanal Acumulado, `Gráfico E` Degrau dos Recordes Pessoais 12 min);
    - `Comparador` (`PeriodComparator.tsx` + `lib/math/evolution.ts`): comparação entre dois períodos com atalhos (`14d`, `30d`, mês);
    - `Meta & Backup` (`GoalAndBackupSettings.tsx`): resumo da meta, exportação **JSON completo (Backup)**, exportação **CSVs** (Simulados e Treinos), restauração de backup `.json`, status de pendências e sincronização/Full Backfill do Google Sheets.
  - **Perfil do Atleta & Biometria (`/perfil`):**
    - Cartões biométricos e barra visual de **IMC (OMS)**;
    - `TafGoalConfigCard`: configuração de edital de corrida + provas complementares com suporte a tempo máximo ou *"Tempo livre"* e os **4 presets oficiais verificados no código (`PM-SP`, `PF`, `PRF`, `PMPR`)**;
    - Gráfico de **Evolução Temporal do Peso** + modal recorrente **`WeeklyWeightModal`** (explícando como cada pesagem alimenta automaticamente o cálculo de calorias do diário e a aba `Perfil_e_Metas` no Sheets).

- **Critério de conclusão (`[PQD3]`):** Todas as 10 páginas do App Router (`/`, `/calculadora`, `/taf`, `/intervalado`, `/metas`, `/historico`, `/treinos`, `/meu-taf`, `/perfil`, `/docs`) e seus respectivos gráficos/motores estão cobertos sem omissões nem discrepâncias com os componentes reais.

---

### Fase 4 — Operações, Índice Central (`docs/README.md`) e Refatoração de `README.md` & Roadmap (`[PQD4]`)
**Objetivo:** Unificar a entrada do repositório, separar documentação viva de registros históricos e disponibilizar um playbook completo de qualidade e troubleshooting.

- **Entregável 4.1 — Criar `docs/operations/01_testes_deploy_e_troubleshooting.md`:**
  - **Portões de Qualidade:** `npx prisma validate`, `npx prisma migrate status`, `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:coverage` (explicando os limites `lines: 90` e `functions: 90` para `lib/**/*.ts` definidos em `vitest.config.ts`) e `npm run build`.
  - **Validação de Parsers & Fixtures:** `fit:gen-fixtures`, `fit:test:synthetic`, `fit:test:real`, `fit:inspect`, `gpx:gen-fixtures`, `gpx:test:synthetic`, `gpx:test:real`, `gpx:inspect` e `npm run db:check`.
  - **Deploy & Migrations Seguras (Supabase + Vercel):** uso obrigatório de `prisma migrate deploy` (proibindo `prisma db push` em produção conforme R1 do Plano 15) e checklist de variáveis de ambiente.
  - **Troubleshooting Prático:** erro `503` (Sheets ou DB não configurado), erro `429`/`502` de quota Google Sheets e uso de `?skipSheetsSync=true`, desvios de data em treinos noturnos (`>= 21h` BRT vs Vercel UTC), diferenças normais entre `.FIT`/`.GPX` e tela do Strava, e recuperação de vínculos do `Plano_Semanal` após edição/exclusão de sessões.

- **Entregável 4.2 — Criar `docs/README.md` (Índice Central da Documentação):**
  - Guia rápido por perfil de leitor:
    - **Quero usar o app e conectar Strava + Planilhas + Gemini** → `integrations/01_*` → `integrations/02_*` → `features/*`
    - **Quero entender a arquitetura e dar manutenção no código** → `architecture/01..03_*` → `operations/01_*` → `/docs` (Swagger)
    - **Quero acompanhar decisões históricas e backlog** → `roadmap/01_*` e `plans/executed/*`
  - Mapa completo **Rota da Aplicação → Documento Funcional → Principais Arquivos-Fonte**.
  - Aviso explícito distinguindo **Documentação Viva** (`architecture/`, `integrations/`, `features/`, `operations/`) de **Histórico de Implementação (`plans/executed/`)**.

- **Entregável 4.3 — Refatorar [`README.md`](../../../README.md) na raiz:**
  - Apresentação clara do PaceLab para corredores, candidatos ao TAF e recrutadores/engenheiros (ecossistema 4 pilares pós-Plano 15: Strava + PaceLab + Google Planilhas 4 abas + Gemini, calculadoras com Compêndio 2024 e Cooper, `WeeklyAdherenceCard` e dashboards analíticos).
  - Stack verificada no `package.json`, quickstart local enxuto (`npm install`, `.env`, `npm run db:check`, `npm run dev`), resumo dos principais scripts e seção de **Documentação Completa** apontando para `docs/README.md` (removendo os ~90 linhas de passo a passo do Google Cloud Console que passam a morar em `docs/integrations/02_google_sheets_e_gemini_passo_a_passo.md`).
  - Corrigir a lista de presets para `PM-SP, PF, PRF, PMPR`.

- **Entregável 4.4 — Atualizar [`docs/roadmap/01_roadmap_melhorias_futuras.md`](../../roadmap/01_roadmap_melhorias_futuras.md):**
  - Atualizar Seção 1.2 com as **6 tabelas** pós-Plano 15 (incluindo `weekly_plan_items` / `WeeklyPlanItem`) e corrigir o texto que restringia o Postgres apenas ao módulo `/meu-taf`;
  - Adicionar notas clarificadoras nos eixos históricos onde houve evolução posterior (`ActivityType` para 6 valores e dashboard de `/treinos` para 6 KPIs);
  - Registrar conclusão dos marcos equivalentes ao **Plano 15** (aba `Plano_Semanal` e aderência semanal) e **Plano 16** (consolidação documental).

- **Critério de conclusão (`[PQD4]`):** `README.md`, `docs/README.md`, `docs/operations/01_*` e `docs/roadmap/01_*` publicados, coesos e sem redundância de tutoriais longos no `README.md`.

---

### Fase 5 — Auditoria Cruzada, Segurança e Arquivamento do Plano (`[PQD5]`)
**Objetivo:** Validar integridade estrutural, fidelidade técnica e segurança de toda a documentação antes de concluir o Plano 16.

- **Checklist de Verificação Obrigatória:**
  1. **Links internos:** validar que todos os links em `README.md` e `docs/**/*.md` usam caminhos relativos válidos e apontam para arquivos existentes no repositório (nenhum caminho absoluto local como `file:///home/...`).
  2. **Auditoria anti-vazamento de dados:** garantir ausência de IDs reais de planilha, chaves privadas, e-mails de Service Account ou dados médicos/pessoais reais em `docs/`, `README.md` e `.env.example`.
  3. **Aderência 1:1 com o código pós-Plano 15:** conferir cada enum (`ActivityType`, `ActivitySource`, `LocationType`), nome de tabela/coluna Prisma, endpoint REST, limite numérico (`50` arquivos, `4 MB`, limiares `0.85`/`0.40` e tolerância `±1 dia` do Plano 15), nome de gráfico e script `npm` contra os arquivos reais e `/api/docs/spec`.
  4. **Renderização visual:** verificar sintaxe de tabelas Markdown, alerts e blocos Mermaid para evitar quebras na visualização no GitHub.
  5. **Arquivamento:** atualizar o status deste plano e movê-lo para `docs/plans/executed/16_plan_organizacao_e_consolidacao_documentacao.md`, confirmando via `git status` / `git diff` que nenhuma alteração indesejada foi introduzida em código de aplicação.

- **Critério de conclusão (`[PQD5]`):** Checklist 100% aprovado, zero links quebrados, zero vazamento de dados pessoais e Plano 16 arquivado em `docs/plans/executed/`.

---

## 4. Riscos Documentais & Governança Contínua ("Doc-as-Code")

| Risco | Impacto | Mitigação |
|---|---|---|
| **D1 — Executar Plano 16 antes do Plano 15** | Documentar `Plano_Semanal`, `WeeklyPlanItem` e `WeeklyAdherenceCard` como ativos antes de existirem no código. | Bloqueio explícito na Fase 0 (`[PQD0]`): o Plano 16 só inicia após o Plano 15 estar em `docs/plans/executed/`. |
| **D2 — Copiar textos de planos/README antigos sem conferir o código** | Propagar bugs documentais antigos (ex.: presets `PMESP`/`PCERJ`, `5 KPIs`, enum `ActivityType` antigo ou `"teste_taf"`). | Regra de evidência: todo número, enum, rota e componente deve ser conferido diretamente em `prisma/schema.prisma`, `app/`, `components/` e `lib/`. |
| **D3 — Duplicação de contratos entre `architecture/` e `integrations/`** | Futuras mudanças exigirem edição em 3 arquivos diferentes e gerarem divergência. | Manter matrizes de colunas/regras detalhadas em `architecture/02_*` e `03_*`, deixando `integrations/*` e `README.md` com guias operacionais e links para a fonte única de verdade. |
| **D4 — Deterioração futura após o Plano 16** | Novos planos (17+) alterarem rotas/schemas sem atualizar a documentação viva. | Adotar regra de entrega nos próximos planos: toda alteração em `prisma/schema.prisma` ou `app/api/` atualiza `architecture/03_*` + `/docs` Swagger; toda nova aba no Sheets atualiza `architecture/02_*` + `integrations/02_*`; toda nova feature visual atualiza `features/*`. |
