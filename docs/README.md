# Central de Documentação — PaceLab

Bem-vindo ao portal técnico e funcional do **PaceLab**. Toda a documentação está organizada por responsabilidade para evitar duplicação entre contratos de dados, tutoriais externos, guias de produto e operação de engenharia.

> [!IMPORTANT]
> **Documentação Viva vs. Registro Histórico:**
> - **Documentação Viva (fonte primária atualizada):** as pastas `architecture/`, `integrations/`, `features/` e `operations/` refletem o comportamento exato em produção na branch `main` (incluindo o ecossistema pós-Plano 15 com `Plano_Semanal`, `WeeklyPlanItem`, `WeeklyAdherenceCard` e Swagger `/docs`).
> - **Registro Histórico de Sprints:** os arquivos em [`plans/executed/`](plans/executed) preservam o contexto de cada sprint implementada e **não** devem ser lidos como referência primária do comportamento vigente sem checar a documentação viva.

---

## Guia Rápido por Perfil de Leitor

| Seu objetivo | Ordem recomendada de leitura |
|---|---|
| **Usar o app e conectar Strava + Google Planilhas + Gemini** | 1. [Exportação do Strava e Classificação](integrations/01_strava_exportacao_e_classificacao.md)<br>2. [Passo a Passo Google Sheets e Gemini](integrations/02_google_sheets_e_gemini_passo_a_passo.md)<br>3. Guias funcionais em [Calculadoras](features/01_calculadoras_e_motores_cientificos.md), [Treinos](features/02_treinos_e_dashboard_analitico.md) e [Meu TAF & Perfil](features/03_meu_taf_simulados_e_perfil.md) |
| **Entender a arquitetura, contratos e dar manutenção no código** | 1. [Arquitetura do Ecossistema (4 Pilares)](architecture/02_ecossistema_strava_pacelab_sheets_gemini.md)<br>2. [Modelo de Dados, Fuso Horário e APIs](architecture/03_modelo_de_dados_e_apis.md)<br>3. [Leitura `.FIT`/`.GPX` e Divergências Strava](architecture/01_leitura_fit_gpx_e_divergencias_strava.md)<br>4. [Testes, Deploy e Troubleshooting](operations/01_testes_deploy_e_troubleshooting.md) + console `/docs` ([Swagger UI](../app/docs/page.tsx)) |
| **Acompanhar decisões históricas e backlog** | 1. [Roadmap de Melhorias & Arquitetura](roadmap/01_roadmap_melhorias_futuras.md)<br>2. [Planos Executados](plans/executed) |

---

## Mapa Completo: Rota da Aplicação → Guia Funcional → Arquivos-Fonte

| Rota App Router | Finalidade na UI | Guia Funcional | Principais Arquivos-Fonte |
|---|---|---|---|
| `/` | Home com Quick Pace, Status Ativo e `WeeklyAdherenceCard` | [Calculadoras e Motores Científicos](features/01_calculadoras_e_motores_cientificos.md#2-home-) | [`app/page.tsx`](../app/page.tsx), [`QuickPaceWidget.tsx`](../components/home/QuickPaceWidget.tsx), [`AthleteActiveStatusCard.tsx`](../components/home/AthleteActiveStatusCard.tsx), [`WeeklyAdherenceCard.tsx`](../components/dashboard/WeeklyAdherenceCard.tsx) |
| `/calculadora` *(redirect de `/medias`)* | Hub central com 5 abas (`Pace & Ritmo`, `Estratégia TAF`, `Metas & Splits`, `Intervalado`, `Histórico`) | [Calculadoras e Motores Científicos](features/01_calculadoras_e_motores_cientificos.md#3-hub-central-calculadora) | [`app/calculadora/page.tsx`](../app/calculadora/page.tsx), [`PaceSpeedTable.tsx`](../components/calculadora/PaceSpeedTable.tsx), [`lib/math/pace.ts`](../lib/math/pace.ts) |
| `/taf` | Planejador Tempo Fixo (12 min / voltas `400 m`) e Distância Fixa | [Estratégia TAF (`/taf`)](features/01_calculadoras_e_motores_cientificos.md#41-estratégia-taf-taf) | [`app/taf/page.tsx`](../app/taf/page.tsx), [`lib/math/taf.ts`](../lib/math/taf.ts), [`TafApprovalRuler.tsx`](../components/meu-taf/TafApprovalRuler.tsx) |
| `/metas` | Planejamento por Pace/Tempo Alvo e estratégias de split | [Metas & Splits (`/metas`)](features/01_calculadoras_e_motores_cientificos.md#42-metas--planilha-de-splits-metas) | [`app/metas/page.tsx`](../app/metas/page.tsx), [`lib/math/goals.ts`](../lib/math/goals.ts) |
| `/intervalado` | Séries com limitadores (`none`/`distance`/`time`), calorias e Modo Pista | [Treino Intervalado (`/intervalado`)](features/01_calculadoras_e_motores_cientificos.md#43-treino-intervalado-intervalado) | [`app/intervalado/page.tsx`](../app/intervalado/page.tsx), [`lib/math/intervals.ts`](../lib/math/intervals.ts), [`IntervalSpeedProfileChart.tsx`](../components/intervalado/IntervalSpeedProfileChart.tsx), [`TrackWorkoutCardModal.tsx`](../components/intervalado/TrackWorkoutCardModal.tsx) |
| `/historico` | Histórico local (`localStorage`), médias e conversão para o Diário | [Histórico Rápido (`/historico`)](features/01_calculadoras_e_motores_cientificos.md#44-histórico-rápido-historico-e-motor-de-médias) | [`app/historico/page.tsx`](../app/historico/page.tsx), [`lib/math/averages.ts`](../lib/math/averages.ts), [`lib/storage/localStorage.ts`](../lib/storage/localStorage.ts) |
| `/treinos` | `WeeklyAdherenceCard`, Diário, `.FIT`/`.GPX`, Modal de Splits e 7 painéis analíticos (`?tab=graficos`) | [Treinos e Dashboard Analítico](features/02_treinos_e_dashboard_analitico.md) | [`app/treinos/page.tsx`](../app/treinos/page.tsx), [`TrainingForm.tsx`](../components/meu-taf/TrainingForm.tsx), [`GpxImportPanel.tsx`](../components/treinos/GpxImportPanel.tsx), [`TrainingDetailModal.tsx`](../components/treinos/TrainingDetailModal.tsx), [`TrainingEvolutionDashboard.tsx`](../components/treinos/TrainingEvolutionDashboard.tsx) |
| `/meu-taf` | Painel em 4 abas: `Testes de 12 Min`, `Gráficos de Evolução`, `Comparar Períodos` e `Meta & Banco` | [Meu TAF, Simulados e Perfil](features/03_meu_taf_simulados_e_perfil.md#1-painel-meu-taf-e-aba-testes-de-12-min) | [`app/meu-taf/page.tsx`](../app/meu-taf/page.tsx), [`CooperVo2MaxCard.tsx`](../components/meu-taf/CooperVo2MaxCard.tsx), [`EvolutionDashboard.tsx`](../components/meu-taf/EvolutionDashboard.tsx), [`PeriodComparator.tsx`](../components/meu-taf/PeriodComparator.tsx), [`GoalAndBackupSettings.tsx`](../components/meu-taf/GoalAndBackupSettings.tsx) |
| `/perfil` | Biometria, IMC OMS, gráfico de peso, presets (`PM-SP`, `PF`, `PRF`, `PMPR`) e pesagem semanal | [Perfil e Pesagem Semanal (`/perfil`)](features/03_meu_taf_simulados_e_perfil.md#5-perfil-biométrico-editais-presets-e-pesagem-semanal-perfil) | [`app/perfil/page.tsx`](../app/perfil/page.tsx), [`TafGoalConfigCard.tsx`](../components/profile/TafGoalConfigCard.tsx), [`WeeklyWeightModal.tsx`](../components/profile/WeeklyWeightModal.tsx), [`lib/services/profileService.ts`](../lib/services/profileService.ts) |
| `/docs` | Console interativo Swagger UI / OpenAPI 3.0.3 | [Catálogo de Endpoints REST & OpenAPI](architecture/03_modelo_de_dados_e_apis.md#5-catálogo-oficial-de-endpoints-rest--openapi-docs) | [`app/docs/page.tsx`](../app/docs/page.tsx), [`lib/swagger/spec.ts`](../lib/swagger/spec.ts), [`app/api/docs/spec/route.ts`](../app/api/docs/spec/route.ts) |

---

## Inventário Oficial da Documentação

### Arquitetura (`architecture/`)
- [`01_leitura_fit_gpx_e_divergencias_strava.md`](architecture/01_leitura_fit_gpx_e_divergencias_strava.md) — Engine `.FIT`/`.GPX`, mesclagem prioritária, histerese de movimento e divergências com o Strava. *(Documentação Viva)*
- [`02_ecossistema_strava_pacelab_sheets_gemini.md`](architecture/02_ecossistema_strava_pacelab_sheets_gemini.md) — Integração ponta a ponta dos 4 pilares pós-Plano 15 (Strava → PaceLab → Google Sheets em 4 abas → Gemini). *(Documentação Viva)*
- [`03_modelo_de_dados_e_apis.md`](architecture/03_modelo_de_dados_e_apis.md) — Persistência híbrida, 6 tabelas Prisma, enums oficiais, contrato `America/Fortaleza`, wrapper `withApiHandler` e catálogo completo de endpoints. *(Documentação Viva)*

### Integrações Externas (`integrations/`)
- [`01_strava_exportacao_e_classificacao.md`](integrations/01_strava_exportacao_e_classificacao.md) — Passo a passo de exportação no Strava Web (`/export_original`), lote de até 50 arquivos, classificação Corrida vs. Caminhada e escolha de destino. *(Documentação Viva)*
- [`02_google_sheets_e_gemini_passo_a_passo.md`](integrations/02_google_sheets_e_gemini_passo_a_passo.md) — Setup no Google Cloud Console (`Base64`), variáveis na Vercel, operação das 4 abas (`Plano_Semanal!A:I`) e configuração completa do Coach Gemini. *(Documentação Viva)*

### Módulos de Produto (`features/`)
- [`01_calculadoras_e_motores_cientificos.md`](features/01_calculadoras_e_motores_cientificos.md) — Home, Hub `/calculadora`, `/taf`, `/metas`, `/intervalado`, `/historico`, Compêndio 2024 e Teste de Cooper. *(Documentação Viva)*
- [`02_treinos_e_dashboard_analitico.md`](features/02_treinos_e_dashboard_analitico.md) — `WeeklyAdherenceCard`, Diário `/treinos`, modal/análise de parciais e Dashboard Analítico (6 KPIs, Heatmap 12 semanas e 7 painéis). *(Documentação Viva)*
- [`03_meu_taf_simulados_e_perfil.md`](features/03_meu_taf_simulados_e_perfil.md) — Painel `/meu-taf` (régua, Cooper, complementares, 5 gráficos, comparador, backup JSON/CSV) e `/perfil` (IMC, presets oficiais e `WeeklyWeightModal`). *(Documentação Viva)*

### Operações & Qualidade (`operations/`)
- [`01_testes_deploy_e_troubleshooting.md`](operations/01_testes_deploy_e_troubleshooting.md) — Portões de qualidade (`Vitest >= 90%`), CLI de fixtures `.FIT`/`.GPX`, regras de migration (`prisma migrate deploy`), variáveis de ambiente e troubleshooting (`503`, `429`, timezone e `Plano_Semanal`). *(Documentação Viva)*

### Planejamento & Histórico (`roadmap/` e `plans/`)
- [`roadmap/01_roadmap_melhorias_futuras.md`](roadmap/01_roadmap_melhorias_futuras.md) — Mapeamento de persistência e histórico dos eixos concluídos + próximos passos (Auth, RLS, PWA, CI). *(Histórico & Backlog)*
- [`plans/executed/`](plans/executed) — Planos detalhados das sprints concluídas e arquivadas (`01` a `16`). *(Registro Histórico)*
- [`plans/`](plans) — Pasta para futuros planos de sprint (atualmente sem planos ativos em aberto).

---

## Governança ("Doc-as-Code")

Ao evoluir o sistema em futuras sprints, mantenha os guias vivos sincronizados na mesma entrega:
- Alterou [`prisma/schema.prisma`](../prisma/schema.prisma) ou rotas em `app/api/` → atualize [`architecture/03_modelo_de_dados_e_apis.md`](architecture/03_modelo_de_dados_e_apis.md) e [`lib/swagger/spec.ts`](../lib/swagger/spec.ts).
- Alterou estrutura ou reconciliação da planilha → atualize [`architecture/02_ecossistema_strava_pacelab_sheets_gemini.md`](architecture/02_ecossistema_strava_pacelab_sheets_gemini.md) e [`integrations/02_google_sheets_e_gemini_passo_a_passo.md`](integrations/02_google_sheets_e_gemini_passo_a_passo.md).
- Alterou telas, presets, gráficos ou fórmulas visuais → atualize os guias correspondentes em [`features/`](features).
