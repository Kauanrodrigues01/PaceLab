# 📋 Roadmap de Melhorias & Arquitetura — PaceLab

Este documento detalha o mapeamento da arquitetura atual de dados e um plano estruturado de melhorias de engenharia de software e produto para as próximas versões do **PaceLab**.

---

## 1. 💾 Estado Atual da Persistência de Dados

O PaceLab opera em um modelo híbrido bem delimitado e desacoplado, combinando a agilidade local para ferramentas públicas e a robustez relacional na nuvem para o acompanhamento do atleta:

### 1.1. Armazenamento Local (`localStorage`)
Dedicado exclusivamente a funcionalidades de conveniência no navegador, garantindo velocidade imediata e zero consumo de infraestrutura para visitantes casuais.

| Chave no `localStorage` | Tipo de Dado | Onde é Usado | O que Armazena |
| :--- | :--- | :--- | :--- |
| **`pacelab_history_v1`** | Array de `HistoryEntry` | `/historico`, `/calculadora`, `/taf`, `/intervalado`, `/metas` | Rascunho/bloco de notas de cálculos gerais feitos nas calculadoras (distância km, tempo total, pace médio, velocidade km/h, data e notas). |
| **`pacelab_draft_calc`** / **`pacelab_draft_interval`** | JSON (`CalcDraft` / `IntervalDraft`) | `/calculadora`, `/intervalado` | Persistência automática de rascunho dos campos preenchidos pelo usuário nas calculadoras. |
| **`pacelab_weight_prompt_dismissed_until`** | ISO Timestamp (`DISMISSED_PROMPT_KEY`) | `WeeklyWeightModal` ([`lib/services/profileService.ts`](../../lib/services/profileService.ts)) | Data/hora limite de dispensa temporária do lembrete semanal de pesagem. |
| **`pacelab_cache_*`** | JSON (`trainings`, `taf_attempts`, `taf_trainings`, `taf_goal`, `weekly_plan`, `profile`, `weights`) | `/treinos`, `/meu-taf`, `/perfil` (`CROSS_PAGE_SHEETS_CACHE_KEYS` e `profileService`) | Cache local rápido (SWR) de leituras da nuvem, invalidado após sincronizações com o Google Sheets. |
| **`theme`** | String (`"light"` \| `"dark"` \| `"system"`) | Todo o site (`ThemeProvider`) | Preferência visual de tema (modo claro ou modo escuro). |

### 1.2. Armazenamento na Nuvem (`Supabase • PostgreSQL via Prisma ORM`)
Camada relacional principal usada pelos módulos **Meu TAF** (`/meu-taf`), **Diário & Dashboard de Treinos** (`/treinos`), **Perfil** (`/perfil`), widgets dinâmicos da **Home** (`/`) e reconciliação semanal (`/api/weekly-plan`), com espelhamento bidirecional opcional para Google Sheets.

| Tabela no Banco | Modelo Prisma | Onde é Usado | O que Armazena |
| :--- | :--- | :--- | :--- |
| **`taf_goals`** | `TafGoal` | `/perfil`, `/meu-taf`, `/`, `/calculadora`, `/taf`, `/metas`, `/intervalado` | Meta oficial do concurso (instituição, distância mínima/alvo em metros, duração do teste, data prevista do edital e metas/tempos de Barra, Flexão e Abdominal). |
| **`taf_attempts`** | `TafAttempt` | `/meu-taf`, `/` (Home) e aba `Simulados_TAF` | Histórico de simulados de 12 min (metros percorridos, tempo real/alvo, pace, velocidade, voltas parciais de `400 m`, origem `manual`/`gpx_upload`/`fit_upload`/`sheets`, `external_id` e `synced_to_sheets_at`). |
| **`training_sessions`** | `TrainingSession` | `/treinos`, `/meu-taf`, `/`, `/historico` | Diário de treinos (distância km, tempo em movimento e `elapsed_seconds`, pace, `ActivityType`, RPE 1–10, peso corporal, calorias ativas/totais, MET, parciais por km, sensores/tênis, origem, `external_id`, `synced_to_sheets_at` e vínculo `1:1` opcional com `weekly_plan_items`). |
| **`user_profiles`** | `UserProfile` | `/perfil`, `/meu-taf`, `/treinos`, `/intervalado`, Home e Modais | Perfil biométrico do atleta (nome, altura em cm, peso atual em kg, data de nascimento e gênero). |
| **`weight_records`** | `WeightRecord` | `/perfil`, `WeeklyWeightModal` | Histórico temporal de pesagens corporais com data, peso em kg, notas e origem do registro (`manual`, `weekly_prompt`, `profile_update`). |
| **`weekly_plan_items`** | `WeeklyPlanItem` | `/`, `/treinos`, `/api/weekly-plan`, sync Google Sheets | Itens prescritos da 4ª aba `Plano_Semanal!A:I` (data planejada em `America/Fortaleza`, atividade, distância/pace alvo, status `Planejado` / `Concluído` / `Parcial` / `Perdido`, chave `plan_external_id` e FK `matched_session_id` `ON DELETE SET NULL`). *(Plano 15)* |

---

## 2. 🚀 Roadmap de Melhorias Técnicas e de Produto

### Eixo A: Autenticação & Multi-Usuário (Supabase Auth & RLS)

#### 1. Autenticação com Supabase Auth
- **Situação atual:** As tabelas do Prisma possuem a coluna `userId String?`, mas as rotas gravam como monousuário (`userId: null`).
- **Solução proposta:** Integrar Supabase Auth com suporte a Login via Google OAuth e Magic Link por e-mail.
- **Benefícios:**
  - Múltiplos candidatos ao TAF podem utilizar o app no mesmo dispositivo sem misturar seus recordes.
  - Sincronização multi-dispositivo real (treino registrado no celular na pista fica disponível imediatamente no notebook em casa).

#### 2. Ativação de Row Level Security (RLS) no PostgreSQL
- **Solução proposta:** Ativar políticas de RLS nas tabelas `taf_goals`, `taf_attempts` e `training_sessions` — além das tabelas adicionadas posteriormente ao schema (`user_profiles`, `weight_records` e `weekly_plan_items`) — garantindo que cada usuário só possa ler, alterar ou excluir seus próprios dados.

---

### Eixo B: Padronização e Resiliência da API (Backend) — ✅ Concluído e Validado

> **Status:** Concluído em 11/10/2026. Documentação completa e plano executado em [docs/plans/executed/04_plan_eixo_b_api_resilience.md](../plans/executed/04_plan_eixo_b_api_resilience.md).

#### 3. Validação Estrita de Entrada com Zod (✅ Implementado)
- **Status:** Schemas implementados em `lib/validations/taf.ts` (`TafGoalInputSchema`, `CreateTafAttemptSchema`, `UpdateTafAttemptSchema`, `CreateTrainingSessionSchema`, `UpdateTrainingSessionSchema`, `PaginationQuerySchema`).
- **Validação de Erros:** Formatador `formatZodErrors` gerando mensagens amigáveis em português e integrando com o envelope de resposta. Cobertura completa de testes em `__tests__/lib/tafValidations.test.ts`.

#### 4. Padronização de Respostas e Middleware de Erros da API (✅ Implementado)
- **Status:** Envelope de resposta uniforme e wrapper centralizado criados em `lib/api/response.ts`:
  - `ApiResponse<T>` (`success`, `data`, `error`, `details`, `meta`, `timestamp`).
  - Funções utilitárias `apiSuccess` e `apiError`.
  - Wrapper `withApiHandler` com tratamento automático de `ZodError` (400), `Prisma P2025` (404), `Prisma P2002` (409), `PrismaClientInitializationError` (503), `SyntaxError` (400) e erros inesperados (500).
- **Testes:** 13 testes unitários dedicados em `__tests__/lib/apiResponse.test.ts`.
- **Rotas Refatoradas:** Todas as 7 rotas REST em `app/api/taf/*` migradas para o novo padrão.

#### 5. Paginação Cursor-Based no Prisma (✅ Implementado)
- **Status:** Parâmetros `limit`, `cursor` e `activityType` suportados em `GET /api/taf/attempts` e `GET /api/taf/trainings` com `take: limit + 1`, `skip: cursor ? 1 : 0`, extração de `nextCursor` e detecção de `hasMore: boolean`.
- **Frontend:** Camada `lib/services/tafService.ts` atualizada com `unwrapApiResponse`, unificação de erros detalhados do Zod e métodos paginados retrocompatíveis.
- **Testes:** Cobertura de 25 testes de rotas em `__tests__/api/taf-routes.test.ts` e 27 testes de serviço em `__tests__/services/tafService.test.ts`.

---

### Eixo B.1: Tipagem Estrita com Enums no Banco & Dashboard Analítico de Treinos — ✅ Concluído e Validado

> **Status:** Concluído em 11/10/2026. Documentação completa e plano executado em [docs/plans/executed/06_plan_enums_database_e_dashboard_treinos.md](../plans/executed/06_plan_enums_database_e_dashboard_treinos.md).

#### 6. Tipagem com Enums Nativos (Prisma, PostgreSQL e Zod) (✅ Implementado)
- **Status:** Criação dos Enums nativos `ActivityType` (`corrida_continua`, `corrida_intervalada`, `caminhada`) e `LocationType` (`pista_400m`, `rua_plana`, `parque_praca`, `esteira`, `outro`) no `prisma/schema.prisma` e migração SQL segura com conversão de registros legados.
- **Camada Zod & Domínio:** Validação estrita em `lib/validations/taf.ts` e labels humanizados em `types/index.ts`.
- *(Nota de evolução posterior: no Plano 11 / Eixo B.6, `ActivityType` foi expandido para 6 valores com `rodagem_leve`, `tempo_run` e `longao`; veja [Modelo de Dados e APIs](../architecture/03_modelo_de_dados_e_apis.md#22-enums-oficiais-prismaschemaprisma).)*

#### 7. Dashboard de Evolução do Treinamento em `/treinos` (✅ Implementado)
- **Status:** Componente analítico `components/treinos/TrainingEvolutionDashboard.tsx` integrado à página com navegação por abas e deep linking (`/treinos?tab=graficos`).
- **Recursos Analíticos:**
  - 5 KPIs do período (Volume, Tempo, Pace Médio Ponderado, Carga TRIMP e Maior Sessão);
  - Gráfico de Volume Semanal Acumulado (km);
  - Gráfico de Evolução do Pace por Sessão (`mm:ss /km`);
  - Gráfico de Carga de Treinamento TRIMP (Fadiga Acumulada);
  - Pirâmide Polarizada de Intensidade (RPE com Regra 80/20 de Stephen Seiler);
  - Gráfico Donut de Volume por Modalidade.
- **Testes:** Suíte dedicada em `__tests__/components/TrainingEvolutionDashboard.test.tsx` e integração em `__tests__/pages/treinos.test.tsx`.
- *(Nota de evolução posterior: com os Planos 8 e 9, o painel evoluiu para **6 KPIs** — somando `Gasto Calórico` —, **Heatmap de 12 semanas** (`TrainingConsistencyHeatmap`) e **7 painéis visuais** — 6 gráficos Recharts somados à Pirâmide RPE; veja [Treinos e Dashboard Analítico](../features/02_treinos_e_dashboard_analitico.md#5-dashboard-analítico-treinostabgraficos).)*

---

### Eixo B.2: Resiliência de Navegação, Limites de Treino no Intervalado e Correção de Inputs Numéricos — ✅ Concluído e Validado

> **Status:** Concluído em 12/10/2026. Documentação completa e plano executado em [docs/plans/executed/07_plan_resiliencia_ux_limites_intervalado_e_correcao_inputs.md](../plans/executed/07_plan_resiliencia_ux_limites_intervalado_e_correcao_inputs.md).

#### 8. Correção de Inputs Numéricos Controlados nos Formulários (✅ Implementado)
- **Status:** Tratamento dos campos de distância, tempo e duração em `TrainingForm.tsx` e `TafAttemptForm.tsx` como strings controladas. Eliminação definitiva de artefatos de digitação como `"017,5km"` e permissão de esvaziamento limpo com Backspace.
- **Testes:** Suítes dedicadas em `__tests__/components/TrainingFormInputs.test.tsx` e `__tests__/components/TafAttemptFormInputs.test.tsx`.

#### 9. Motor de Limite de Treino no Simulador Intervalado (✅ Implementado)
- **Status:** Parâmetros de teto por distância (`maxDistanceKm`, ex: 2,4 km) ou por tempo (`maxDurationSeconds`, ex: 12 min) com corte proporcional da última etapa (`isTruncated: true`), descarte automático de recuperação quando o tiro forte anterior já bate o limite e recálculo milimétrico do pace médio em `lib/math/intervals.ts`.
- **UI:** Seletores tipo pill com atalhos para o TAF (2,4 km e 12 min) e badges de corte na tabela em `app/intervalado/page.tsx`.
- **Testes:** 7 testes unitários em `__tests__/lib/intervalsLimit.test.ts` e 8 testes de integração em `__tests__/pages/intervalado.test.tsx`.

#### 10. Resiliência de Navegação e Cache Otimista (✅ Implementado)
- **Status:** Padrão Stale-While-Revalidate com hidratação via `sessionStorage` em `app/treinos/page.tsx` e `app/meu-taf/page.tsx`, eliminando telas em branco e spinners agressivos ao revisitar as páginas. Persistência de rascunhos em `app/intervalado/page.tsx` e `app/calculadora/page.tsx`.
- **Testes:** Suíte dedicada em `__tests__/pages/resilienceCache.test.tsx`.

---

### Eixo B.3: Sistema de Gasto Calórico (Compêndio 2024 Herrmann et al.), Perfil do Atleta e Pesagem Semanal — ✅ Concluído e Validado

> **Status:** Concluído em 12/10/2026. Documentação completa e plano executado em [docs/plans/executed/08_plan_gasto_calorico_met_perfil_pesagem_semanal.md](../plans/executed/08_plan_gasto_calorico_met_perfil_pesagem_semanal.md).

#### 11. Motor Metabólico Baseado no Compêndio de Atividades Físicas 2024 (✅ Implementado)
- **Status:** Criação de `lib/math/calories.ts` implementando rigorosamente a tabela oficial de METs do Compêndio 2024 (Herrmann et al.) para corrida contínua (códigos 12020 a 12090), caminhada (17151 a 17220) e corrida intervalada com nós de velocidade milimétricos.
- **Cálculo Científico:** Distinção exata entre Calorias Totais (gasto bruto) e Calorias Ativas (gasto líquido adicional ao repouso metabólico basal: MET - 1). Cálculo segmentado para séries intervaladas somando tiros, recuperações e pausas com seus respectivos METs.
- **Testes:** 11 testes unitários em `__tests__/lib/calories.test.ts`.

#### 12. Modelagem Relacional de Perfil e Pesagem Semanal no Prisma & APIs REST (✅ Implementado)
- **Status:** Novos modelos `UserProfile` e `WeightRecord` e campos calóricos em `TrainingSession` no `prisma/schema.prisma` com migração aplicada no PostgreSQL Supabase.
- **Rotas REST Padronizadas:** `GET`/`PUT` `/api/profile`, `GET`/`POST` `/api/profile/weight` e `DELETE` `/api/profile/weight/[id]` com validação Zod (`UserProfileSchema`, `WeightRecordSchema`), envelope `ApiResponse` e testes em `__tests__/api/profile-routes.test.ts`.

#### 13. Módulo Perfil do Atleta, Classificação OMS e Modal de Pesagem (✅ Implementado)
- **Status:** Página `/perfil` com cálculo em tempo real de IMC e classificação segundo a Organização Mundial da Saúde (OMS), gráfico de evolução temporal do peso corporal com Recharts e histórico de pesagens com opção de exclusão.
- **Prompt Semanal:** Algoritmo de lembrete em `lib/services/profileService.ts` (`isWeeklyWeightDue`), verificação da segunda-feira ou janela $\ge 7$ dias com opção de adiar por 24 horas e modal não-obstrutivo `WeeklyWeightModal.tsx` integrado no layout global (`Navbar` e `BottomNav`).
- **Testes:** Suítes em `__tests__/services/profileService.test.ts`, `__tests__/components/WeeklyWeightModal.test.tsx` e `__tests__/pages/perfil.test.tsx`.

#### 14. Integração no Diário de Treinos, Simulador Intervalado e Dashboard (✅ Implementado)
- **Status:** Formulário de treinos com pré-carregamento do peso corporal e card de previsão calórica em tempo real; badges de calorias nos cards de treinos com retrocompatibilidade para treinos antigos; estimativa de calorias segmentada por etapa no simulador intervalado (`/intervalado`); novos KPIs e gráficos analíticos de calorias semanais e por modalidade em `/treinos`.
- **Testes:** Suítes em `__tests__/components/TrainingFormCalories.test.tsx`, `__tests__/pages/intervalado.test.tsx` e `__tests__/components/TrainingEvolutionDashboardCalories.test.tsx`.

---

### Eixo B.4: Documentação Swagger/OpenAPI, Metas TAF Dinâmicas Multimodais e Revitalização de UI/UX — ✅ Concluído e Validado

> **Status:** Concluído em 13/10/2026. Documentação completa e plano executado em [docs/plans/executed/09_plan_swagger_ux_metas_taf_dinamicas.md](../plans/executed/09_plan_swagger_ux_metas_taf_dinamicas.md).

#### 15. Documentação Interativa da API com Swagger & OpenAPI 3.0 (✅ Implementado)
- **Status:** Endpoint oficial `/api/docs/spec` gerando especificação OpenAPI 3.0 completa para 100% das rotas de `taf` e `profile`. Interface interativa em `/docs` com Swagger UI customizado no tema dark glassmorphism do PaceLab, atalho de acesso no rodapé global e testes automatizados em `__tests__/api/docs.test.ts`.

#### 16. Modelo Multimodal e Eliminação Definitiva de Hardcoding (✅ Implementado)
- **Status:** Expansão do modelo Prisma `TafGoal` com suporte multimodal (`institution`, `minDistanceMeters`, `pullupsTarget`, `pushupsTarget`, `absTarget`) e migração SQL segura.
- **Zero Hardcoding:** Eliminação total de valores estáticos legados (2.300m / 2.400m). O Meu TAF, Intervalado, Calculadora Principal, Metas e Home agora carregam e calculam réguas de aprovação e atalhos baseados estritamente na meta do edital cadastrado do atleta.
- **Configuração no Perfil:** Criação do componente `TafGoalConfigCard.tsx` em `/perfil` com presets de 1 clique e validação Zod bidirecional. *(Nota de evolução posterior: os 4 presets implementados e padronizados no código são `PM-SP`, `PF`, `PRF` e `PMPR`.)*

#### 17. Revitalização de UI/UX e Métricas Fisiológicas Avançadas (✅ Implementado)
- **Status:**
  - **Cooper VO2 Máx Integrado:** Cálculo fisiológico a partir da distância atingida nos 12 minutos integrado com faixas de classificação por sexo e idade (`CooperVo2MaxCard.tsx`);
  - **Gráfico de Perfil de Tiros:** Visualizador gráfico em barras com gradiente de intensidade de ritmo no simulador intervalado (`IntervalLapProfileChart.tsx`);
  - **Cartão de Pista para Treino:** Visão condensada e de alto contraste em modal para acompanhamento na borda da pista (`TrackWorkoutCardModal.tsx`);
  - **Heatmap de Consistência Anual:** Matriz de frequência anual estilo GitHub para visualização da aderência aos treinos (`TrainingConsistencyHeatmap.tsx`);
  - **Quick Pace Widget & Card do Atleta:** Cálculo de ritmo em 2 cliques e contagem regressiva para a prova na Home (`app/page.tsx`);
  - **Estratégias de Ritmo (Pacing):** Divisão automática constante, split negativo e progressivo em `/metas` e parciais km a km em `/calculadora`;
  - **Régua de Aprovação TAF & Tática de Volta:** Régua visual de pontuação e coluna tática da pista de 400m em `/taf`;
  - **Filtros e Conversão no Histórico:** Chips de filtro por categoria e conversão em 1 clique para treino do diário com cálculo calórico do Compêndio 2024 em `/historico`.

---

### Eixo B.5: Correção do Gráfico de Intervalados, Metas com Tempo Opcional, Assets de Marca e Nova Paleta Oficial PaceLab — ✅ Concluído e Validado

> **Status:** Concluído em 18/10/2026. Documentação completa e plano executado em [docs/plans/executed/10_plan_correcoes_ux_metas_tempo_novo_design_system.md](../plans/executed/10_plan_correcoes_ux_metas_tempo_novo_design_system.md).

#### 18. Calibração e Correção do Gráfico de Perfil de Velocidade em `/intervalado` (✅ Implementado)
- **Status:** Correção na geração temporal do componente `IntervalSpeedProfileChart.tsx`, eliminando pontos consecutivos com timestamps duplicados que geravam anomalias na interpolação do Recharts. Aplicação das cores oficiais: Tiros em **Verde-Lima (`#B7F34A`)** e Recuperação/Aquecimento em **Cinza-Azulado (`#8E9BB0`)** sobre fundo `#0B1020`, com tooltip flutuante detalhando pace formatado, velocidade em km/h e estágio da série.
- **Testes:** Suíte dedicada em `__tests__/components/IntervalSpeedProfileChart.test.tsx` e integração em `__tests__/pages/intervalado.test.tsx`.

#### 19. Metas de Exercícios com Tempo Máximo Opcional / Livre (✅ Implementado)
- **Status:** Suporte a editais de concursos com ou sem limite de tempo para Barra Fixa Dinâmica, Flexão de Braço e Abdominal Remador.
- **Banco de Dados & Schema Prisma:** Adicionadas colunas `pullupDurationSeconds Int?`, `pushupDurationSeconds Int?` e `absDurationSeconds Int?` no modelo `TafGoal` (`null` = tempo livre / sem limite).
- **Validação Zod & APIs:** Schemas e rotas REST `/api/taf/goals` atualizados com aceitação de duração opcional e testes em `__tests__/api/taf-routes.test.ts` e `__tests__/lib/tafValidations.test.ts`.
- **Interface e Meu TAF:** Controles de alternância (*"Definir tempo máximo"* / *"Tempo livre"*) em `TafGoalConfigCard.tsx` no Perfil e exibição contextual no card `TafComplementaryExercisesCard.tsx` no Meu TAF.

#### 20. Assets de Marca e Nova Paleta Oficial PaceLab (*Dark Performance Athletics*) (✅ Implementado)
- **Status:** Integração dos assets oficiais de marca em `public/images/logo.png`, `public/images/ico.png` e `app/icon.png` através do componente `BrandLogo.tsx`.
- **Paleta Oficial Consolidada:**
  - Azul-Marinho Profundo (`#0B1020`): Fundo principal da aplicação;
  - Superfície Elevada (`#131A2E`): Fundo dos cartões e tabelas;
  - Bordas Sutis (`#1E2942`): Linhas de separação e contornos;
  - Verde-Lima Elétrico (`#B7F34A`): Destaques, botões primários, badges e acentos esportivos;
  - Branco Puro (`#FFFFFF`): Títulos e métricas de alto contraste;
  - Cinza-Azulado (`#8E9BB0`): Textos secundários, legendas e placeholders.
- **Migração Visual 100% Abrangente:** Configuração em `tailwind.config.ts`, `app/globals.css`, componentes base de UI (`Button`, `Card`, `Badge`, `Input`, `ResultBlock`), navegação global (`Navbar`, `BottomNav`, `Footer`), todas as 9 páginas do sistema e todos os gráficos Recharts (Perfil, Meu TAF, Intervalado, Diário de Treinos e Heatmap).
- **Testes & Portão de Qualidade:** 467/467 testes aprovados em 57 arquivos, 0 erros no TypeScript, 0 alertas no ESLint e build de produção Next.js 14 gerado com 100% de sucesso.

---

### Eixo B.6: Importação Unificada `.FIT` (Prioritário) + `.GPX` (Strava/Garmin), Janela TAF 12 min, Análise de Splits & Backup v3 — ✅ Concluído e Homologado (Fases 0–11)

> **Status:** Todas as fases implementadas, homologadas e validadas em produção (`PQ0`–`PQ11`; Fase 5 marcada como `SKIP`). Migrations aplicadas no Supabase com zero drift e ensaio ponta a ponta aprovado. Plano detalhado em [docs/plans/executed/11_plan_importacao_gpx_strava_e_evolucao_schema.md](../plans/executed/11_plan_importacao_gpx_strava_e_evolucao_schema.md).

#### B.6.1. Schema Relacional, Tipos e Contratos API com Anti-Duplicação (✅ Implementado)
- **Schema & Migrations:** Evolução de `TrainingSession` e `TafAttempt` em `prisma/schema.prisma` com rastreabilidade de origem (`source: "manual" | "gpx_upload" | "fit_upload"`), chave única `externalId`, telemetria (`elapsedSeconds`, `avgHeartRate`, `maxHeartRate`, `avgCadence`, `elevationGainM`, `shoeName`), `splits`/`laps` estruturados em JSON e suporte expandido em `ActivityType`.
- **APIs & Swagger:** Rotas REST atualizadas para filtros por `source` / `externalId`, bloqueio idempotente `HTTP 409 (DUPLICATE_EXTERNAL_ID)` e especificação OpenAPI 3.0 atualizada em `/api/docs/spec`.

#### B.6.2. Motores de Parsing `.FIT` + `.GPX` e Endpoint Unificado (✅ Implementado)
- **Motor Prioritário `.FIT` (`lib/fit/*`):** Decodificação binária oficial via `@garmin/fitsdk` extraindo métricas de `sessionMesgs`, voltas reais (`lapMesgs`), registros segundo a segundo (`recordMesgs`), detecção automática de atividades indoor/esteira e geração de hash determinístico anti-duplicação.
- **Fallback/Complemento `.GPX` (`lib/gpx/*`) & Mesclagem (`lib/activityParser/*`):** Parser XML seguro (`fast-xml-parser` com bloqueio explícito de `DOCTYPE`/`ENTITY` contra XXE e sanitização de strings) + algoritmo Haversine com filtragem de pausas/spikes, ganho de elevação suavizado e mesclagem inteligente quando `.fit` + `.gpx` do mesmo treino são enviados juntos.
- **Endpoint Unificado:** `POST /api/training-sessions/parse-activity` aceitando 1 ou 2 arquivos (`.fit` e/ou `.gpx`, limite de 4 MB), checagem de duplicidade cruzada (`TrainingSession` e `TafAttempt`) e tratamento seguro de erros sem exposição de stack trace.

#### B.6.3. UX Pós-Upload, Janela de 12 min TAF, Visualização de Splits e Backup v3 (✅ Implementado)
- **Upload & Formulário Inteligente (`GpxImportPanel.tsx`):** Preview somente leitura com todas as métricas extraídas, aviso de atividade já importada, seletor de destino (**Treino do Diário** ou **Simulado TAF**) e formulário contextual simples para escolha da modalidade/tênis/RPE.
- **Melhor Janela Contínua de 12 min TAF (`lib/activityParser/window.ts`):** Algoritmo `O(N)` de dois ponteiros sobre séries de `.FIT`/`.GPX` para localizar automaticamente os 12 minutos de maior distância, computar pace/velocidade/FC e gerar voltas parciais de 400 m em `TafAttempt` (exibidas nos cards e formulário de edição do `/meu-taf`).
- **Análise de Splits (`/treinos`):** Componentes `SplitsTable.tsx`, `SplitsPaceChart.tsx` e `SplitsInsights.tsx` para inspeção quilômetro a quilômetro, comparação pace x FC e métricas automáticas de split negativo/variabilidade.
- **Backup v3 & CSV Seguros:** `exportBackupJson` evoluído para `version: 3` com suporte integral a `fit_upload`/`gpx_upload`; `importBackupJson` retrocompatível (v1/v2/v3) e tolerante a conflitos `409 Conflict`; `exportAttemptsCsv` e `exportTrainingsCsv` ampliados mantendo ordem de colunas legadas e proteção contra CSV Formula Injection.

---

### Eixo B.7: Sincronização Completa e Bidirecional PostgreSQL ↔ Google Sheets (`Treinos_Corrida`) — ✅ Concluído e Validado (Fases 0–7)

> **Plano executado:** [`docs/plans/executed/12_plan_sincronizacao_google_sheets.md`](../plans/executed/12_plan_sincronizacao_google_sheets.md)

- **Autenticação Serverless & Schema de Rastreamento:** Cliente singleton seguro baseado em `@googleapis/sheets` + `google-auth-library` com credencial de *Service Account* via Base64 (`GOOGLE_CREDENTIALS_BASE64`) e `GOOGLE_SHEETS_SPREADSHEET_ID` (zero escrita em disco e isolamento estrito *server-side*). Migração aditiva adicionando `sheets` em `activity_source` e `synced_to_sheets_at` em `taf_attempts`.
- **Arquitetura 3 Abas & Mappers Puros:** Planilha estruturada automaticamente em `Log_Treinos` (15 colunas), `Simulados_TAF` (10 colunas) e `Perfil_e_Metas` (9 colunas), com *auto-provisionamento* idempotente de cabeçalhos, sanitização anti-*Formula Injection* em células textuais, conversão precisa de distância/tempo/pace/telemetria e cálculo calórico automático (Compêndio 2024) ao importar treinos do Sheets.
- **Motor Bidirecional Idempotente:**
  - *PostgreSQL → Google Sheets (Push):* *Upsert* por coluna `ID` sem duplicar linhas, atualização determinística da aba `Perfil_e_Metas` e remoção sincronizada ao excluir registros.
  - *Google Sheets → PostgreSQL (Pull):* Criação de treinos inseridos manualmente na planilha (geração automática de ID + gravação de retorno na coluna `ID`) e atualização segura de edições manuais sem deleção em cascata.
  - *Resiliência Best-Effort:* Mutações em `/api/taf/trainings`, `/api/taf/attempts`, `/api/taf/goals`, `/api/profile` e `/api/profile/weight` espelham automaticamente sem bloquear a gravação principal no PostgreSQL caso haja indisponibilidade externa, marcando pendências para reenvio posterior.
- **Endpoint `/api/sync/sheets`, OpenAPI & UI:** Rotas `GET` (diagnóstico e contagens pendentes sem expor segredos) e `POST` (modos `bidirectional`, `push`, `pull` + `forceFullResync`) documentadas em `/docs`, botões de sincronização em `/treinos` e `/meu-taf` (`Meta & Banco`), *backfill* completo e badges discretos de status por item.

---

### Eixo B.8: Precisão do Leitor `.FIT` vs. Strava, Título pelo Nome do Arquivo e Feedback Google Sheets — ✅ Concluído e Homologado (Fases 1–4)

> **Plano executado:** [`docs/plans/executed/13_plan_melhoria_fit_titulo_arquivo_e_feedback_sheets.md`](../plans/executed/13_plan_melhoria_fit_titulo_arquivo_e_feedback_sheets.md)

- **Precisão `.FIT` (Strava Mobile, pausas e parciais):** Separação entre tempo em movimento (`durationSeconds`) e tempo total decorrido (`elapsedSeconds`) em `lib/fit/movingMetrics.ts` e `lib/fit/parseFit.ts`, com parciais (`splits`) consistentes com o resumo da atividade (validado com o arquivo real `Caminhada_leve.fit`).
- **Título pelo nome do arquivo e transparência de pausas:** Sugestão automática de título (`suggestedNotes` / `titleSource` via `/api/training-sessions/parse-activity`) mantendo observações já preenchidas e exibição de pausas na importação e visualização de treinos.
- **Sincronização Google Sheets, Toast e Cache entre Páginas:** Proteção contra sobrescrita no pull para registros locais mais recentes (`shouldProtectDirtyLocalRecord` via `syncedToSheetsAt`/`updatedAt`), comparação de divergência em `Perfil_e_Metas` (`hasProfileGoalRowDivergence` e `profileSynced`), resumo claro no toast (`formatSheetsSyncReportSummary`), reatividade da badge de pendências em `GoalAndBackupSettings` (`recordsSyncFingerprint`) e invalidação de cache entre `/treinos` e `/meu-taf`.

---

### Eixo B.9: Importação e Preenchimento em Massa (`.FIT` / `.GPX`) com Seleção Única Global — ✅ Concluído e Homologado (Fases 1–4)

> **Plano executado:** [`docs/plans/executed/14_plan_importacao_em_massa_fit_gpx.md`](../plans/executed/14_plan_importacao_em_massa_fit_gpx.md)
>
> **Guia técnico complementar:** [`docs/architecture/01_leitura_fit_gpx_e_divergencias_strava.md`](../architecture/01_leitura_fit_gpx_e_divergencias_strava.md)

- **Agrupamento, Pareamento e Isolamento por Atividade (`lib/activityParser/batchGrouping.ts`):** Seleção múltipla entra automaticamente no **Modo Em Massa** (até 50 atividades/lote, limite 4 MB por arquivo), pareia arquivos `.FIT` + `.GPX` homônimos mantendo o `.FIT` prioritário (com ação para separar em 2 itens), pré-valida extensões/arquivos vazios/repetidos na fila e detecta duplicidade intra-lote pelo `externalId`.
- **Motor de Análise, Payloads e Políticas em Lote (`lib/activityParser/batchPayloads.ts`):** Pool concorrente com suporte a `AbortSignal` para chamadas individuais a `/api/training-sessions/parse-activity`, pré-preenchimento de títulos por arquivo/GPX, recálculo calórico MET em lote (`bodyWeightKg`), sanitização compatível com os schemas Zod (`CreateTrainingSessionSchema` e `CreateTafAttemptSchema`), fallback manual para arquivos sem métricas completas, políticas globais de duplicidade (`"skip"` vs `"update"` via `onDuplicate: "update"`) e espelhamento seguro TAF → Diário (`buildSafeMirroredDiaryPayload`) sem criar registros órfãos.
- **UI em Massa com Seleção Única Global (`components/treinos/GpxImportPanel.tsx` + `components/treinos/batch/*`):** Alternador de modo (`1 Treino (Individual)` vs `Em Massa (Vários Arquivos)`) preservando integralmente o fluxo individual, **`radiogroup` único global (`BatchImportTargetBar.tsx`)** definindo todo o lote como *Todos como Treinos do Diário* ou *Todos como Simulados TAF (Cooper 12 min)* sem seletores individuais por linha, barra de configuração rápida para aplicar tipo/local/tênis/RPE em massa (`BatchImportDefaultsBar.tsx`), cartões compactos de revisão (`BatchImportItemRow.tsx`) com `<GpxPreviewCard />` sob demanda para performance mobile e recuperação granular via *"Tentar novamente falhos"* sem duplicar itens já persistidos.
- **Push Único Consolidado para Google Sheets & Cache (`lib/services/tafService.ts`, `lib/sheetsSyncUi.ts`, `app/treinos/page.tsx`, `app/meu-taf/page.tsx`):** Suporte a `{ skipSheetsSync: true }` nas gravações individuais via query param `?skipSheetsSync=true` (`shouldSkipSheetsSync` em `lib/api/sheetsSync.ts`) nas rotas `/api/taf/trainings` e `/api/taf/attempts` (`POST`/`PUT`), disparo de **1 único push consolidado** (`direction: "push"`) ao final quando configurado, invalidação de caches cross-page preservando a meta TAF (`clearCrossPageSheetsCaches({ includeGoal: false })`) e 1 toast resumo consolidado (`formatBatchImportToast`).

---

### Eixo B.10: Sincronização do `Plano_Semanal` (4ª Aba Sheets), Reconciliação em 2 Passadas e Card de Aderência Semanal — ✅ Concluído e Homologado (Fases 0–5)

> **Plano executado:** [`docs/plans/executed/15_plan_sincronizacao_plano_semanal_e_aderencia.md`](../plans/executed/15_plan_sincronizacao_plano_semanal_e_aderencia.md)

- **Modelo `WeeklyPlanItem` & Migration (`prisma/schema.prisma`):** Criação da 6ª tabela PostgreSQL (`weekly_plan_items` via migration `20261115191047_add_weekly_plan_items`) com chave `planExternalId` e relação `1:1` opcional (`matchedSessionId @unique`, `ON DELETE SET NULL`) com `TrainingSession`.
- **Reconciliação Automática e Sync da 4ª Aba (`lib/math/weeklyAdherence.ts`, `lib/googleSheets/syncService.ts`):** Integração opcional da aba `Plano_Semanal!A:I` (suportando criação orgânica sem quebrar planilhas com 3 abas), calendário canônico `America/Fortaleza` (`toFortalezaDateKey`), matching em 2 passadas (D+0 e tolerância `±1 dia` em dias sem outro plano, corte `>= 0.40` e `>= 0.85` `Concluído`), reversão automática após `PUT`/`DELETE` de treinos e *write-back* seletivo em `H:I`.
- **APIs & UI (`GET /api/weekly-plan`, `GET /api/taf/trainings/[id]`, `WeeklyAdherenceCard.tsx`):** Novos endpoints documentados no Swagger `/docs` e card interativo renderizado na Home (`/`) e em `/treinos` com aderência semanal, média móvel de até 4 semanas, sessões extras e abertura direta do `TrainingDetailModal` (incluindo deep-link `/treinos?trainingId=<id>`).

---

### Eixo B.11: Organização, Atualização Pós-Plano 15 e Consolidação da Documentação (Plano 16) — ✅ Concluído e Arquivado (Fases 0–5)

> **Portal resultante:** [`docs/README.md`](../README.md) · **Playbook de Operações:** [`docs/operations/01_testes_deploy_e_troubleshooting.md`](../operations/01_testes_deploy_e_troubleshooting.md) · **Plano executado:** [`16_plan_organizacao_e_consolidacao_documentacao.md`](../plans/executed/16_plan_organizacao_e_consolidacao_documentacao.md)

- **Arquitetura Modular Anti-Duplicação (`docs/` + `README.md`):** Separação estrita entre **Arquitetura Técnica** (`docs/architecture/01..03_*`), **Guias Práticos de Integração** (`docs/integrations/01..02_*`), **Documentação Funcional de Produto** (`docs/features/01..03_*`), **Operações & Troubleshooting** (`docs/operations/01_*`) e **Portal Central** (`docs/README.md`).
- **Atualização Integral Pós-Plano 15:** Promoção de `Plano_Semanal`, `WeeklyPlanItem` e `WeeklyAdherenceCard` para a documentação viva em produção, remoção do rascunho sensível da raiz, correção dos presets oficiais (`PM-SP`, `PF`, `PRF`, `PMPR`) e refatoração do [`README.md`](../../README.md) enxuto na raiz.

---

### Eixo C: Recursos de Produto para o Atleta na Pista

#### 21. Transformação em PWA Completo (Progressive Web App)
- **Solução proposta:** Configurar `manifest.json`, ícones nativos e service worker para cache estático da interface:
  - Botão *"Instalar PaceLab"* na tela inicial do Android e iOS.
  - Execução em tela cheia (standalone) sem barra de navegação do browser.

#### 22. Wake Lock API (Manter Tela Ativa na Pista)
- **Solução proposta:** Integrar a API nativa `navigator.wakeLock.request("screen")` durante a navegação no módulo Meu TAF ou durante cronometragem, impedindo que a tela do celular bloqueie no meio do treino.

#### 23. Cronômetro Interativo com Bip Sonoro de Parciais de Volta (400m)
- **Solução proposta:** Adicionar cronômetro nativo na aba de simulados que emite sinal sonoro a cada volta de 400m projetada, orientando o atleta auditivamente sobre estar à frente ou atrás do ritmo da aprovação.

---

### Eixo D: Relatórios, Estimativas e Compartilhamento

#### 24. Exportação de Laudo Técnico do TAF em PDF
- **Solução proposta:** Gerar laudo formatado para impressão ou envio via WhatsApp contendo:
  - Evolução gráfica dos 12 minutos.
  - Projeção de aprovação segundo o edital da Guarda Municipal.
  - Histórico de parciais e recorde pessoal para apresentação a preparadores físicos e instrutores.

---

### Eixo E: Qualidade de Engenharia & CI/CD

#### 25. Pipeline de CI no GitHub Actions
- **Solução proposta:** Workflow automatizado disparado em todo push/pull request:
  - Validação de tipos (`npx tsc --noEmit`).
  - Linter (`npx eslint`).
  - Execução dos testes automatizados (`npm test`).
  - Verificação de build de produção (`npm run build`).

#### 26. Seed Script do Prisma para Desenvolvimento Local
- **Solução proposta:** Criar `prisma/seed.ts` com dados representativos de teste para popular o banco local com 1 comando (`npx prisma db seed`).


