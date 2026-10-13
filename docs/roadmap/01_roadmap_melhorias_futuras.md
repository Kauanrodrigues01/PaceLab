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
| **`theme`** | String (`"light"` \| `"dark"` \| `"system"`) | Todo o site (`ThemeProvider`) | Preferência visual de tema (modo claro ou modo escuro). |

### 1.2. Armazenamento na Nuvem (`Supabase • PostgreSQL via Prisma ORM`)
Dedicado exclusivamente ao módulo **Meu TAF** (`/meu-taf`). Todos os dados são persistidos de forma segura e relacional, sem cópias locais em `localStorage` e sem rotas de sincronização legadas.

| Tabela no Banco | Modelo Prisma | Onde é Usado | O que Armazena |
| :--- | :--- | :--- | :--- |
| **`taf_goals`** | `TafGoal` | `/meu-taf` (Configurações e KPIs) | Meta oficial do concurso (distância alvo: ex. 2.300 m, tempo limite: 12 min e data prevista do edital). |
| **`taf_attempts`** | `TafAttempt` | `/meu-taf` (Simulados 12 Min, Gráficos e Comparador) | Histórico completo de simulados de 12 min (metros percorridos, tempo real, pace, velocidade, parciais em voltas de 400m e notas de pista). |
| **`training_sessions`** | `TrainingSession` | `/meu-taf` (Diário de Treinos, Gráficos e Comparador) | Diário de treinos (quilômetros, tempo, pace, modalidade, esforço percebido na escala RPE de 1 a 10, peso corporal em kg e parciais por km). |

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
- **Solução proposta:** Ativar políticas de RLS nas tabelas `taf_goals`, `taf_attempts` e `training_sessions` garantindo que cada usuário só possa ler, alterar ou excluir seus próprios dados.

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

### Eixo C: Recursos de Produto para o Atleta na Pista

#### 6. Transformação em PWA Completo (Progressive Web App)
- **Solução proposta:** Configurar `manifest.json`, ícones nativos e service worker para cache estático da interface:
  - Botão *"Instalar PaceLab"* na tela inicial do Android e iOS.
  - Execução em tela cheia (standalone) sem barra de navegação do browser.

#### 7. Wake Lock API (Manter Tela Ativa na Pista)
- **Solução proposta:** Integrar a API nativa `navigator.wakeLock.request("screen")` durante a navegação no módulo Meu TAF ou durante cronometragem, impedindo que a tela do celular bloqueie no meio do treino.

#### 8. Cronômetro Interativo com Bip Sonoro de Parciais de Volta (400m)
- **Solução proposta:** Adicionar cronômetro nativo na aba de simulados que emite sinal sonoro a cada volta de 400m projetada, orientando o atleta auditivamente sobre estar à frente ou atrás do ritmo da aprovação.

---

### Eixo D: Relatórios, Estimativas e Compartilhamento

#### 9. Exportação de Laudo Técnico do TAF em PDF
- **Solução proposta:** Gerar laudo formatado para impressão ou envio via WhatsApp contendo:
  - Evolução gráfica dos 12 minutos.
  - Projeção de aprovação segundo o edital da Guarda Municipal.
  - Histórico de parciais e recorde pessoal para apresentação a preparadores físicos e instrutores.

#### 10. Estimativa de VO2 Máx (Teste de Cooper)
- **Solução proposta:** Adicionar cálculo estimativo de VO2 Máx baseado na fórmula clássica de Cooper a partir da distância atingida nos 12 minutos:
  $$\text{VO}_2\text{ Máx} = \frac{\text{Distância (m)} - 504.9}{44.73}$$
- **Benefícios:** Agrega valor fisiológico e científico à preparação física do aluno.

---

### Eixo E: Qualidade de Engenharia & CI/CD

#### 11. Pipeline de CI no GitHub Actions
- **Solução proposta:** Workflow automatizado disparado em todo push/pull request:
  - Validação de tipos (`npx tsc --noEmit`).
  - Linter (`npx eslint`).
  - Execução dos 349 testes automatizados (`npm test`).
  - Verificação de build de produção (`npm run build`).

#### 12. Seed Script do Prisma para Desenvolvimento Local
- **Solução proposta:** Criar `prisma/seed.ts` com dados representativos de teste para popular o banco local com 1 comando (`npx prisma db seed`).
