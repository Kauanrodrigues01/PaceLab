# 📋 Roadmap de Melhorias & Arquitetura — PaceLab

Este documento detalha o mapeamento da arquitetura atual de dados e um plano estruturado de melhorias de engenharia de software e produto para as próximas versões do **PaceLab**.

---

## 1. 💾 Estado Atual da Persistência de Dados

O PaceLab opera em um modelo híbrido bem delimitado e desacoplado, combinando a agilidade local para ferramentas públicas e a robustez relacional na nuvem para o acompanhamento do atleta:

### 1.1. Armazenamento Local (`localStorage`)
Dedicado exclusivamente a funcionalidades de conveniência no navegador, garantindo velocidade imediata e zero consumo de infraestrutura para visitantes casuais.

| Chave no `localStorage` | Tipo de Dado | Onde é Usado | O que Armazena |
| :--- | :--- | :--- | :--- |
| **`pacelab_history_v1`** | Array de `HistoryEntry` | `/historico`, `/calculadora`, `/medias`, `/taf`, `/intervalado`, `/metas` | Rascunho/bloco de notas de cálculos gerais feitos nas calculadoras (distância km, tempo total, pace médio, velocidade km/h, data e notas). |
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
  - Execução dos 309 testes automatizados (`npm test`).
  - Verificação de build de produção (`npm run build`).

#### 12. Seed Script do Prisma para Desenvolvimento Local
- **Solução proposta:** Criar `prisma/seed.ts` com dados representativos de teste para popular o banco local com 1 comando (`npx prisma db seed`).
