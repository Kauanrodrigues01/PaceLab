# PaceLab — Plano de Evolução: Módulo "Meu TAF" com Prisma ORM, Banco SQL (PostgreSQL), Registro de Treinos e Gráficos

> **Objetivo:** Evoluir o PaceLab para um sistema completo de acompanhamento e preparação física para o **TAF da Guarda Municipal de Fortaleza**, preservando todas as calculadoras existentes e implementando persistência relacional com **Prisma ORM** e **Banco de Dados SQL (PostgreSQL / Supabase)**, histórico de testes de 12 minutos, diário de treinos, recordes pessoais, 5 gráficos de evolução e comparação de períodos.

---

## 1. Diagnóstico do Estado Atual do Projeto & Arquitetura com Prisma ORM

| Dimensão | Situação Atual no PaceLab | Nova Estratégia com Prisma ORM + PostgreSQL |
|---|---|---|
| **Tecnologias** | Next.js 14 (App Router), TypeScript strict, Tailwind CSS v3, Recharts 2.12, Lucide React, Vitest. | **Preservar 100% da stack.** Adicionar **Prisma ORM** (`@prisma/client` e `prisma`) para acesso tipado ao banco de dados SQL. |
| **Persistência** | `localStorage` isolado no navegador via `LocalStorageAdapter<T>` (`pacelab_history_v1`). | **Banco Relacional SQL gerenciado via Prisma ORM (PostgreSQL / Supabase):** Modelos fortemente tipados (`TafGoal`, `TafAttempt`, `TrainingSession`), migrações versionadas e consultas geradas automaticamente via `prisma.<model>`. |
| **Camada de Dados** | Acesso direto ao Storage local. | **Next.js Server Actions / API Routes + Prisma Client:** O servidor executa as consultas do Prisma de forma segura com variáveis `DATABASE_URL` e `DIRECT_URL`. |
| **Resiliência** | 100% local. | **Offline-First com Fallback:** Se o atleta estiver na pista sem internet no celular ou durante setup inicial, a camada de serviço armazena localmente e sincroniza via Prisma assim que houver conexão. Ferramenta de migração do histórico antigo do `localStorage` para o Prisma com 1 clique. |
| **Matemática** | `lib/math/` (`pace.ts`, `taf.ts`, `averages.ts`, `intervals.ts`, `goals.ts`). | Adicionar `lib/math/evolution.ts` para cálculos de recordes de mesma duração, deltas, volume semanal e comparação estatística de períodos. |
| **Interface** | Rotas isoladas: `/`, `/calculadora`, `/medias`, `/taf`, `/metas`, `/intervalado`, `/historico`. | Criar o hub dedicado `/meu-taf` estruturado em abas interativas limpas (Visão Geral, Testes 12 Min, Treinos, Gráficos, Comparador e Configuração/Banco). Atualizar Navbar e BottomNav. |

---

## 2. Esquema do Prisma ORM (`prisma/schema.prisma`)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// 1. Metas do TAF
model TafGoal {
  id                    String    @id @default(uuid())
  userId                String?   @map("user_id")
  targetDistanceMeters  Int       @default(2300) @map("target_distance_meters")
  targetDurationMinutes Int       @default(12) @map("target_duration_minutes")
  targetExamDate        DateTime? @map("target_exam_date")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  @@map("taf_goals")
}

// 2. Tentativas de Teste do TAF (12 minutos ou duração personalizada)
model TafAttempt {
  id                    String   @id @default(uuid())
  userId                String?  @map("user_id")
  testDate              DateTime @default(now()) @map("test_date")
  targetDurationSeconds Int      @default(720) @map("target_duration_seconds")
  actualDurationSeconds Int      @map("actual_duration_seconds")
  distanceMeters        Int      @map("distance_meters")
  speedKmh              Float    @map("speed_kmh")
  paceSeconds           Int      @map("pace_seconds")
  paceFormatted         String   @map("pace_formatted")
  locationType          String?  @map("location_type")
  notes                 String?  @map("notes")
  laps                  Json?    @default("[]")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@index([userId, testDate(sort: Desc)])
  @@index([userId, targetDurationSeconds])
  @@map("taf_attempts")
}

// 3. Diário de Treinos
model TrainingSession {
  id              String   @id @default(uuid())
  userId          String?  @map("user_id")
  sessionDate     DateTime @default(now()) @map("session_date")
  activityType    String   @map("activity_type") // 'corrida_continua', 'corrida_intervalada', 'caminhada', 'teste_taf', 'outro'
  distanceKm      Float    @map("distance_km")
  durationSeconds Int      @map("duration_seconds")
  speedKmh        Float    @map("speed_kmh")
  paceSeconds     Int      @map("pace_seconds")
  paceFormatted   String   @map("pace_formatted")
  perceivedEffort Int?     @map("perceived_effort") // RPE 1 a 10
  bodyWeightKg    Float?   @map("body_weight_kg")
  notes           String?  @map("notes")
  splits          Json?    @default("[]")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@index([userId, sessionDate(sort: Desc)])
  @@index([userId, activityType])
  @@map("training_sessions")
}
```

---

## 3. Arquitetura da Informação e Organização da Interface

Para proporcionar uma experiência fluida, sem poluição visual e otimizada para celular Android e desktop:

```
/meu-taf (Hub de Acompanhamento TAF Fortaleza)
├── Tab 1: [Resumo & Recordes]       -> Cards de KPI: Recorde 12m, Meta 2.300m, Diferença, Volume Semanal/Mensal
├── Tab 2: [Testes de 12 Min]        -> Novo Teste Rápido + Lista com Parciais, Deltas e Badges de Recorde
├── Tab 3: [Diário de Treinos]       -> Registro de Corridas/Caminhadas/Intervalados + Filtros por Tipo e Data
├── Tab 4: [Gráficos de Evolução]    -> 5 Gráficos com Recharts (Alternáveis e com Filtros de Período)
├── Tab 5: [Comparar Períodos]       -> Comparador Intervalo A vs B com métricas e avisos estatísticos
└── Tab 6: [Configurações & Banco]   -> Meta de Prova, Status do Prisma/Banco e Backup JSON/CSV
```

---

> 🛑 **REGRA OBRIGATÓRIA DE CONTROLE DE VERSÃO (GIT COMMITS):**
> - O assistente de IA **NUNCA DEVE EXECUTAR** os comandos `git commit` ou `git push`.
> - Todos os commits serão executados **EXCLUSIVAMENTE PELO USUÁRIO**.
> - Ao término de cada fase, o assistente apresentará o comando pronto com a mensagem formatada para que o usuário revise e rode no seu próprio terminal.

---

## 4. Fases de Implementação com Prisma ORM

### Fase A — Instalação do Prisma ORM, Esquema SQL e Camada de Acesso a Dados

1. **Instalação do Prisma:**
   - Instalar `prisma` (devDependencies) e `@prisma/client` (dependencies).
   - Gerar `prisma/schema.prisma` com os modelos `TafGoal`, `TafAttempt` e `TrainingSession`.
   - Criar cliente singleton `lib/prisma.ts`.
   - Criar `.env.example` com `DATABASE_URL` e `DIRECT_URL`.
2. **Tipagem TypeScript em `types/index.ts`:**
   - Tipos de negócio sincronizados com os modelos Prisma: `TafAttempt`, `TrainingSession`, `TafGoalConfig`, `PeriodComparisonResult`.
3. **Serviços de Persistência Híbrida (`lib/services/tafService.ts`):**
   - Endpoints em `app/api/taf/` para `attempts`, `trainings` e `goals` consumindo o Prisma Client.
   - Camada de serviço no client que consome a API do Prisma e mantém cache/fallback local offline caso o banco esteja inacessível.
   - Ferramenta de migração do histórico antigo do `localStorage` para o Prisma com 1 clique.
   - Exportação e importação de backup completo (JSON/CSV).

#### 📌 Commit da Fase A (Executado apenas pelo Usuário):
```bash
git add . && git commit -m "feat(banco): configurar prisma orm, schema postgresql, rotas de api e servico taf offline-first"
```

---

### Fase B — Motor de Cálculo, Recordes e Estatísticas (`lib/math/evolution.ts`)

- **Regra de Recorde de 12 Minutos:**
  - Filtrar testes elegíveis que possuam a mesma `targetDurationSeconds` (ex: 720s).
  - Identificar o recorde pela maior distância percorrida.
  - Testes com durações diferentes (ex: teste de 10 min ou 15 min) NÃO disputam o mesmo recorde e recebem classificação isolada.
- **Deltas de Evolução:**
  - Calcular a evolução em metros em relação à tentativa imediatamente anterior de mesma duração.
  - Calcular a distância faltante até a meta configurada e o percentual alcançado.
- **Agregações Temporais:**
  - Agrupamento de volume por semana (`getWeeklyVolume`) e por mês (`getMonthlyVolume`).
  - Cálculo de pace ponderado pela distância para evitar médias aritméticas distorcidas.
- **Comparador de Períodos:**
  - Filtro por intervalos de datas.
  - Tratamento de pouca amostragem: exibir aviso metodológico quando houver menos de 3 treinos no período.
- **Testes Unitários:**
  - Criar `__tests__/lib/evolution.test.ts` cobrindo 100% dos cenários (primeiro teste, novo recorde, teste pior, durações diferentes, edição e exclusão).

#### 📌 Commit da Fase B (Executado apenas pelo Usuário):
```bash
git add . && git commit -m "feat(matematica): implementar motor de evolucao, recordes de 12min, deltas e testes unitarios"
```

---

### Fase C — Interface: Seção "Meu TAF" (Histórico de 12 Minutos)

- **Formulário Rápido de Teste:**
  - Campos: Data/hora, duração (min e seg, padrão 12:00), distância em metros (atalhos rápidos de 100 em 100m), local/percurso e notas.
  - Subform expansível para parciais/voltas de 400m com validação de soma.
- **Cálculo Imediato:**
  - Velocidade média, pace em min/km, diferença para a meta (2.300m) e delta para o teste anterior.
- **Cards de Histórico:**
  - Selo visual de Recorde Pessoal ("🏆 Recorde Pessoal").
  - Ações inline de edição e exclusão com diálogo de confirmação.
  - Recálculo dinâmico automático do histórico completo ao editar/excluir.

#### 📌 Commit da Fase C (Executado apenas pelo Usuário):
```bash
git add . && git commit -m "feat(meu-taf): criar historico de testes de 12 minutos, formulario rapido, parciais e badges de recorde"
```

---

### Fase D — Interface: Diário de Treinos

- **Formulário de Sessão:**
  - Seletor visual de atividade: Corrida Contínua, Intervalado/Tiros, Caminhada, Teste de TAF, Outro.
  - Distância em km e tempo total com suporte a digitação flexível (minutos inteiros, decimais ou MM:SS).
  - Escala de esforço subjetivo RPE (1 = Muito Leve a 10 = Exaustão Máxima) com cores graduadas.
  - Peso corporal opcional (diferenciando `null` de `0`).
- **Listagem e Filtros:**
  - Filtro por tipo de atividade e intervalo de datas.
  - Badges coloridos por modalidade.
  - Edição e exclusão seguras com confirmação.

#### 📌 Commit da Fase D (Executado apenas pelo Usuário):
```bash
git add . && git commit -m "feat(treinos): implementar diario de treinos com esforco rpe, peso corporal, filtros e crud"
```

---

### Fase E — Painel de Evolução & 5 Gráficos com Recharts

- **Painel de Indicadores (KPIs):**
  - 1. Recorde Pessoal de 12 min (distância, data, pace e km/h).
  - 2. Status da Meta (ex: 2.300 m) com barra de progresso e déficit em metros.
  - 3. Volume da semana atual vs semana anterior.
  - 4. Total de testes e total de treinos registrados.
- **Implementação dos 5 Gráficos:**
  - **Gráfico A (Testes de 12 Min):** Linha/Pontos com data no eixo X e distância em metros no eixo Y, com linha de referência da Meta.
  - **Gráfico B (Distância por Treino):** Barras com altura da distância, colorido por modalidade e filtrável.
  - **Gráfico C (Pace Médio por Treino):** Linha com escala de tempo (MM:SS), tooltip formatado e aviso explicativo de que pace menor = maior velocidade.
  - **Gráfico D (Volume Semanal):** Barras com soma de km por semana do calendário.
  - **Gráfico E (Evolução dos Recordes):** Degrau (Step Line) comparando o recorde histórico acumulado contra as tentativas individuais.
- **Empty States:**
  - Telas amigáveis quando houver 0 ou 1 registro, orientando o usuário a fazer o primeiro lançamento sem inventar dados falsos.

#### 📌 Commit da Fase E (Executado apenas pelo Usuário):
```bash
git add . && git commit -m "feat(graficos): construir painel de evolucao com graficos recharts e cards de kpis"
```

---

### Fase F — Comparador de Períodos e Central de Configurações, Banco & Backup

- **Comparador:**
  - Seletores de data para Período 1 e Período 2.
  - Tabela comparativa lado a lado com deltas absolutos e percentuais.
  - Explicação textual da base de comparação.
- **Configuração da Meta:**
  - Ajuste da distância da prova (ex: 2.300 m), tempo (12 min) e data prevista do concurso.
  - Ritmo necessário para passar (min/km e km/h).
  - Aviso ético: parâmetro de treino, sem promessa de aprovação automática.
- **Central de Banco & Backup:**
  - Status da conexão com o Prisma / PostgreSQL (indicador de banco conectado).
  - Botão de sincronização e migração de dados do localStorage para o Prisma.
  - Botão de exportar backup completo (`pacelab-backup-YYYY-MM-DD.json`) e CSVs.

#### 📌 Commit da Fase F (Executado apenas pelo Usuário):
```bash
git add . && git commit -m "feat(comparador): adicionar comparador de periodos, configuracao de meta e backup json e csv"
```

---

### Fase G — Navegação Global, Otimização Mobile e Validação Final

- **Navegação:**
  - Adicionar atalho "Meu TAF" com destaque na `Navbar` desktop e na `BottomNav` mobile.
  - Atualizar a Home (`app/page.tsx`) com card de destaque principal para a preparação do TAF.
- **Mobile Android:**
  - Testar ergonomia de toques, inputs com teclado numérico correto, rolagem de tabelas e gráficos responsivos.
- **Testes Automatizados (Vitest):**
  - Criar testes de integração para as novas telas em `__tests__/pages/meu-taf.test.tsx`.
  - Executar suíte completa garantindo que todos os testes existentes continuem passando com 100% de sucesso.
- **Build & Lint:**
  - `npm run lint` com 0 erros.
  - `npx tsc --noEmit` com 0 erros.
  - `npm run build` gerando todas as rotas estáticas e dinâmicas perfeitamente.

#### 📌 Commit da Fase G (Executado apenas pelo Usuário):
```bash
git add . && git commit -m "feat(navegacao): integrar modulo meu-taf na navbar e bottomnav e homologacao final"
```

---

## 5. Ordem de Execução & Fluxo de Commits do Usuário

1. **Etapa 1 (Fase A):** Instalar Prisma ORM, models, singleton `lib/prisma.ts`, rotas de API, offline-first `tafService` e testes.
   👉 *Usuário realiza o commit da Fase A.*
2. **Etapa 2 (Fase B):** Motor matemático de recordes de 12 min, deltas e comparações em `lib/math/evolution.ts` com suíte de testes unitários.
   👉 *Usuário realiza o commit da Fase B.*
3. **Etapa 3 (Fase C):** Tela de Testes de 12 minutos e Meta (cálculos em tempo real, badges de recorde, CRUD).
   👉 *Usuário realiza o commit da Fase C.*
4. **Etapa 4 (Fase D):** Diário de Treinos completo com filtros e CRUD.
   👉 *Usuário realiza o commit da Fase D.*
5. **Etapa 5 (Fase E):** Painel de Evolução com os 5 gráficos no Recharts e KPIs.
   👉 *Usuário realiza o commit da Fase E.*
6. **Etapa 6 (Fase F):** Comparador de Períodos, Central de Banco/Prisma e Backup.
   👉 *Usuário realiza o commit da Fase F.*
7. **Etapa 7 (Fase G):** Navegação global (Navbar, BottomNav, Home), acessibilidade mobile Android e testes de homologação final.
   👉 *Usuário realiza o commit da Fase G.*


