# 📌 Plano de Execução: Documentação Swagger, Metas TAF Dinâmicas & Multimodais e Revitalização Completa de UI/UX

**Projeto:** PaceLab  
**Módulos:** Documentação Swagger (`/docs`, `/api/docs/spec`), Metas TAF Multimodais (`prisma/schema.prisma`, `/api/taf/goals`, `/perfil`), Revitalização de UI/UX (`/`, `/calculadora`, `/taf`, `/intervalado`, `/meu-taf`, `/treinos`, `/metas`, `/historico`, Design System)  
**Data:** 13/10/2026  
**Status:** Proposto / Em Planejamento  
**Referência:** [docs/roadmap/01_roadmap_melhorias_futuras.md](../../roadmap/01_roadmap_melhorias_futuras.md)

---

## 1. 🎯 Diagnóstico, Avaliação Técnica e Especificação

### 1.1 Avaliação das 3 Sugestões do Usuário

#### A. Documentação das Rotas Backend via Swagger (OpenAPI 3.0 no Next.js)
* **Avaliação de Sentido/Viabilidade:** **Faz 100% de sentido e é altamente recomendada.**
* **Diagnóstico Atual:** O PaceLab conta hoje com mais de 10 endpoints REST com envelopes de resposta padronizados (`ApiResponse`) e validação estrita com Zod (`lib/validations/taf.ts`). No entanto, não há documentação interativa para desenvolvedores ou integradores testarem os payloads sem olhar o código-fonte.
* **Abordagem Profissional no Next.js 14 App Router:**
  1. **Especificação OpenAPI 3.0 Centralizada:** Criar `lib/swagger/spec.ts` contendo o schema OpenAPI 3.0 completo, documentando endpoints, parâmetros, schemas de request e response (alinhados com os Zod Schemas e Enums nativos) e status HTTP (200, 201, 400, 404, 500).
  2. **Route Handler JSON da Spec:** Expor `GET /api/docs/spec` retornando o JSON OpenAPI 3.0 para consumo por ferramentas externas ou Swagger UI.
  3. **Página Interativa `/docs`:** Interface elegante e moderna com Swagger UI renderizado via componente dinâmico (`ssr: false` com `next/dynamic`), evitando qualquer falha de hidratação no React 18, com suporte a tema escuro/claro e botão "Try it out" para testes em tempo real.
  4. **Atalho de Acesso:** Link discreto "API Docs (Swagger)" no rodapé da aplicação.

---

#### B. Metas TAF Unificadas, Dinâmicas e Multimodais (Perfil + Eliminação de Hardcoding)
* **Avaliação de Sentido/Viabilidade:** **Faz 100% de sentido e resolve um ponto cego crítico do sistema.**
* **Diagnóstico Atual:**
  - Existe divergência no projeto: em alguns cantos a meta é tida como `2.300m` (antigo default do banco de dados para Guarda Municipal), enquanto em outros atalhos e hints está cravado `2.400m` (padrão Polícia Militar / PF).
  - O sistema atualmente não diferencia o **Mínimo para Aprovação** (ex: 2.400m em 12 min) da **Meta Pessoal de Segurança do Atleta** (ex: 2.600m para ter margem no dia da prova).
  - Editais de concursos policiais/militares do Brasil NUNCA avaliam apenas corrida: quase todos exigem **Barra Fixa** (dinâmica ou isométrica), **Flexão de Braço** e **Abdominal**.
* **Solução Proposta:**
  1. **Expansão do Modelo `TafGoal` no Prisma:**
     - `institutionName`: Nome do concurso/edital (ex: "PM-SP", "Polícia Federal", "Guarda Civil", etc.).
     - `minDistanceMeters`: Distância mínima para não ser reprovado (ex: 2.400m).
     - `targetDistanceMeters`: Meta de segurança do atleta (ex: 2.600m).
     - `targetDurationMinutes`: Tempo limite da corrida (padrão 12 min, configurável).
     - **Exercícios Complementares (Prontos no schema):**
       - Barra Fixa: `pullupType` (`dinamica` | `isometria`), `pullupMinReps` ou `pullupMinSeconds`, `pullupTargetReps` ou `pullupTargetSeconds`.
       - Flexão: `pushupMinReps`, `pushupTargetReps`, `pushupDurationSeconds` (ex: 60s).
       - Abdominal: `absMinReps`, `absTargetReps`, `absDurationSeconds` (ex: 60s).
  2. **Configuração Unificada na Página `/perfil`:**
     - Nova seção dedicada "Metas & Edital do TAF" com formulário limpo, permitindo personalizar os índices do edital e as metas de segurança.
  3. **Propagação Dinâmica pelo Sistema:**
     - **No Simulado TAF (`TafAttemptForm.tsx`):** Duração Real preenchida automaticamente com o tempo configurado (12 min). Botões de atalho rápido destacados com `🟢 Mínimo Edital (${minDistanceMeters}m)` e `🎯 Meta de Segurança (${targetDistanceMeters}m)`.
     - **No Simulador Intervalado (`app/intervalado/page.tsx`):** Atalhos da trava rápida carregam as distâncias do edital do atleta.
     - **Na Calculadora TAF (`app/taf/page.tsx`):** Banner inteligente com o edital cadastrado e cálculo automático do pace de corte vs pace de segurança.
     - **No Meu TAF (`app/meu-taf/page.tsx`):** Alertas de aprovação avaliam tanto a nota de corte quanto a margem de segurança.

---

#### C. Melhoria Completa de UI & UX Página por Página
* **Avaliação de Sentido/Viabilidade:** **Faz 100% de sentido — o sistema amadureceu em dados e merece uma experiência visual e interativa de nível premium.**
* **Diagnóstico Página por Página e Melhorias Detalhadas:**

| Página / Módulo | O que existe hoje | O que será aprimorado (UI / UX / Métricas) |
|---|---|---|
| **1. Home (`/`)** | Hero básico e cards estáticos das calculadoras. | • **Card de Status Ativo do Atleta:** Exibe último simulado, aprovação, peso atual, calorias da semana e contagem regressiva para a prova.<br>• **Quick Pace Widget:** Mini-calculadora no próprio hero para cálculo imediato de pace em 2 cliques.<br>• Micro-interações e badges dinâmicos de consistência. |
| **2. Calculadora (`/calculadora`)** | Abas de cálculo e presets estáticos de corrida de rua. | • **Preset TAF Dinâmico:** Botão TAF puxa a meta do edital cadastrado do atleta.<br>• **Visual Split Visualizer:** Gráfico de linha do tempo e tabela detalhada de parciais km a km com tempos acumulados.<br>• Botões rápidos de ajuste (+1 min, +5s, +1 km) para agilidade de digitação. |
| **3. Calculadora TAF (`/taf`)** | Calculadora rápida que calcula se aprovou em 12 minutos. | • **Banner do Edital Cadastrado:** Puxa a meta e o mínimo do perfil com 1 clique.<br>• **Régua Interativa de Aprovação:** Barra visual de progresso marcando a linha de corte (vermelho/verde) e a zona de segurança (azul).<br>• **Estratégia de Voltas na Pista (400m):** Projeção de ritmo sugerido por volta para evitar que o aluno quebre na largada. |
| **4. Intervalado (`/intervalado`)** | Formulário de séries com calorias Compêndio 2024 e travas. | • **Gráfico de Perfil de Velocidade (Timeline Stepped Area):** Linha visual alternando tiros em alta velocidade e pausas (estilo Garmin/Polar).<br>• **Atalhos Dinâmicos de Trava:** Botões de 1 clique com o Mínimo e a Meta do edital.<br>• **Cartão de Treino para Pista:** Botão para exportar/imprimir o treino formatado para visualização rápida no celular durante as séries. |
| **5. Meu TAF (`/meu-taf`)** | Histórico de simulados, comparador, parciais e gráficos. | • **Estimativa Científica de VO2 Máx (Teste de Cooper):** $\text{VO}_2 = \frac{\text{dist} - 504.9}{44.73}$ com tabela de classificação por idade/gênero.<br>• **Comparador Visual de Simulados:** Gráfico de sobreposição comparando o último simulado com o recorde pessoal (PB).<br>• **Módulo Multimodal Expansível:** Cards visuais prontos para registro e acompanhamento de Barra Fixa, Flexão e Abdominal. |
| **6. Diário de Treinos (`/treinos`)** | Diário de sessões, 5 KPIs e 6 gráficos analíticos. | • **Heatmap de Consistência (Streak de Treinos):** Calendário mensal destacando os dias treinados e volume (estilo GitHub/Strava).<br>• **Filtros Temporais Suaves:** Botões para filtrar período (7d, 30d, 90d, 1 ano, Tudo) atualizando todos os gráficos em tempo real.<br>• **Tooltips Dark Glassmorphism:** Melhor formatação visual nos gráficos do Recharts evitando cortes em telas mobile.<br>• **Campo de Busca:** Filtro rápido por notas, modalidade ou data no diário. |
| **7. Perfil (`/perfil`)** | Dados biométricos, IMC OMS, gráfico de peso e histórico. | • **Aba/Card de Metas TAF Multimodais:** Configuração completa do edital, corrida, barra, flexão e abdominal.<br>• **Resumo Físico Integrado:** Card combinando IMC + VO2 Máx + Status de Aprovação do TAF.<br>• **Exportar Laudo Técnico:** Botão para visualização de impressão/PDF com o relatório completo do aluno. |
| **8. Metas de Prova (`/metas`)** | Projeções de tempo para 5k, 10k, 21k e 42k. | • **Inclusão do TAF nos Presets:** TAF personalizado como distância selecionável.<br>• **Tabela de Estratégia de Prova:** Comparativo de ritmo constante, negative split (segunda metade mais forte) e ritmo conservador. |
| **9. Histórico Local (`/historico`)** | Tabela simples de rascunhos salvos no navegador. | • **Filtro por Categoria:** Separar cálculos de Pace, TAF, Intervalado e Metas.<br>• **Ação "Converter em Treino":** Botão para transformar um cálculo avulso em uma sessão oficial do diário na nuvem com 1 clique. |
| **10. Design System & Global** | Estilos Tailwind, dark mode e layout responsivo. | • Refinamento de contraste, micro-animações, foco acessível (WCAG), toasts aprimorados e navegação global coesa. |

---

## 2. 🏗️ Arquitetura Técnica e Modelagem de Dados

### 2.1 Expansão do Schema Prisma (`prisma/schema.prisma`)

```prisma
// Modelo TafGoal expandido com suporte a Mínimo do Edital, Meta de Segurança e Multimodal
model TafGoal {
  id                         String    @id @default(uuid())
  userId                     String?   @map("user_id")
  institutionName            String?   @default("Edital Padrão") @map("institution_name")
  
  // Corrida (Tempo e Distâncias)
  minDistanceMeters          Int       @default(2400) @map("min_distance_meters")
  targetDistanceMeters       Int       @default(2600) @map("target_distance_meters")
  targetDurationMinutes      Int       @default(12) @map("target_duration_minutes")
  targetExamDate             DateTime? @map("target_exam_date")
  
  // Barra Fixa
  pullupType                 String?   @default("dinamica") @map("pullup_type") // "dinamica" | "isometria"
  pullupMinReps              Int?      @default(3) @map("pullup_min_reps")
  pullupTargetReps           Int?      @default(5) @map("pullup_target_reps")
  pullupMinSeconds           Int?      @map("pullup_min_seconds")
  pullupTargetSeconds        Int?      @map("pullup_target_seconds")
  
  // Flexão de Braço
  pushupMinReps              Int?      @default(20) @map("pushup_min_reps")
  pushupTargetReps           Int?      @default(30) @map("pushup_target_reps")
  pushupDurationSeconds      Int?      @map("pushup_duration_seconds")
  
  // Abdominal
  absMinReps                 Int?      @default(30) @map("abs_min_reps")
  absTargetReps              Int?      @default(40) @map("abs_target_reps")
  absDurationSeconds         Int?      @map("abs_duration_seconds")

  createdAt                  DateTime  @default(now()) @map("created_at")
  updatedAt                  DateTime  @updatedAt @map("updated_at")

  @@map("taf_goals")
}
```

---

## 3. 📋 Fases Detalhadas de Implementação

### 🔹 Fase 1: Metas TAF Multimodais no Banco, Schemas Zod & APIs REST
**Objetivo:** Evoluir a modelagem de dados no Prisma com migração padronizada, atualizar validações Zod e rotas da API com total retrocompatibilidade com registros existentes.

- [x] **1.1** Atualizar o modelo `TafGoal` no `prisma/schema.prisma` com `institutionName`, `minDistanceMeters`, `targetDistanceMeters`, e campos complementares de barra, flexão e abdominal com defaults seguros.
- [x] **1.2** Criar migração oficial padronizada do Prisma em `prisma/migrations/20261013150000_expand_taf_goals_multimodal/migration.sql` com comandos SQL defensivos (`ADD COLUMN IF NOT EXISTS`) e marcar como aplicada via `npx prisma migrate resolve --applied`.
- [x] **1.3** Atualizar os schemas Zod em `lib/validations/taf.ts` (`TafGoalInputSchema`, `TafGoalResponseSchema`) com suporte aos novos campos e validações de coerência (ex: meta de segurança $\ge$ mínimo do edital).
- [x] **1.4** Atualizar `app/api/taf/goals/route.ts` (GET e POST) e a tipagem em `types/index.ts` e serviços em `lib/services/tafService.ts`.
- [x] **1.5** Atualizar e expandir testes unitários em `__tests__/api/taf-routes.test.ts` e `__tests__/services/tafService.test.ts`.
- [x] **1.6 [Portão de Qualidade Fase 1]**: `npm test`, `npx tsc --noEmit` e `npx eslint .` 100% verdes.

---

### 🔹 Fase 2: Documentação Interativa com Swagger / OpenAPI 3.0 no Next.js
**Objetivo:** Implementar documentação completa de todas as APIs do sistema com especificação OpenAPI 3.0 oficial e interface Swagger UI interativa.

- [x] **2.1** Criar módulo de especificação OpenAPI 3.0 em `lib/swagger/spec.ts` documentando 100% dos endpoints:
  - `/api/taf/goals` (GET, POST);
  - `/api/taf/attempts` (GET, POST);
  - `/api/taf/attempts/[id]` (GET, PUT, DELETE);
  - `/api/taf/trainings` (GET, POST);
  - `/api/taf/trainings/[id]` (GET, PUT, DELETE);
  - `/api/taf/health` (GET);
  - `/api/profile` (GET, PUT);
  - `/api/profile/weight` (GET, POST);
  - `/api/profile/weight/[id]` (DELETE).
- [x] **2.2** Criar Route Handler `app/api/docs/spec/route.ts` que serve o documento JSON oficial da especificação OpenAPI 3.0.
- [x] **2.3** Criar a página interativa `/docs` em `app/docs/page.tsx` utilizando renderização Swagger UI via `swagger-ui-dist` em container isolado no cliente (`"use client"` sem conflitos de hidratação no React 18), com suporte a tema escuro/claro e teste de requisições "Try it out".
- [x] **2.4** Adicionar link "Documentação da API (Swagger)" no rodapé e menu de utilidades.
- [x] **2.5** Criar testes automatizados para a rota da especificação em `__tests__/api/docs.test.ts`.
- [x] **2.6 [Portão de Qualidade Fase 2]**: `npm test`, `npx tsc --noEmit` e `npx eslint .` 100% verdes.

---

### 🔹 Fase 3: Gestão de Metas TAF no Perfil e Eliminação Definitiva de Valores Hardcoded
**Objetivo:** Permitir ao usuário configurar seu edital e metas no perfil e propagar dinamicamente os valores por todo o aplicativo, eliminando divergências de números fixos.

- [x] **3.1** Criar componente `components/profile/TafGoalConfigCard.tsx` e integrá-lo à página `app/perfil/page.tsx` permitindo editar o edital, distância mínima, meta de segurança, tempo e exercícios complementares.
- [x] **3.2** Atualizar `components/meu-taf/TafAttemptForm.tsx`:
  - Pré-preenchimento automático da duração alvo e real com o tempo da meta (ex: 12 min).
  - Preservar a lista numérica de atalhos para manter 100% de compatibilidade com os testes existentes, adicionando destaque visual e badges dinâmicos para `🟢 Mínimo Edital (${min}m)` e `🎯 Meta Segurança (${target}m)`.
- [x] **3.3** Atualizar o simulador intervalado em `app/intervalado/page.tsx`:
  - Os seletores de trava rápida por distância puxam dinamicamente a distância mínima e a meta do usuário.
- [x] **3.4** Atualizar a calculadora TAF em `app/taf/page.tsx`:
  - Adicionar banner contextual com a meta cadastrada do aluno e atalho para preencher os valores em 1 clique.
- [x] **3.5** Criar testes de integração em `__tests__/components/TafGoalConfig.test.tsx` e atualizar testes existentes.
- [x] **3.6 [Portão de Qualidade Fase 3]**: `npm test`, `npx tsc --noEmit` e `npx eslint .` 100% verdes.

---

### 🔹 Fase 4: Revitalização de UI/UX — Módulos Centrais (Meu TAF, Treinos e Intervalado)
**Objetivo:** Modernizar profundamente a experiência visual, dashboards e gráficos das principais páginas de treino e acompanhamento do atleta.

- [x] **4.1** Implementar motor matemático de VO2 Máx em `lib/math/cooper.ts` com testes unitários em `__tests__/lib/cooper.test.ts`, e adicionar card de **VO2 Máx Estimado (Teste de Cooper)** com classificação cardiorrespiratória por idade/sexo em `app/meu-taf/page.tsx`.
- [x] **4.2** Aprimorar `app/meu-taf/page.tsx`:
  - Adicionar **Régua Visual de Aprovação** nos simulados (zona de corte vs zona de segurança).
  - Adicionar seção expansível de **Exercícios Complementares do TAF** (Barra Fixa, Flexão e Abdominal).
  - Implementar filtro temporal nos simulados (30 dias, 90 dias, Todos).
- [x] **4.3** Aprimorar `app/treinos/page.tsx` e `components/treinos/TrainingEvolutionDashboard.tsx`:
  - Adicionar **Heatmap/Streak Mensal de Consistência** (calendário com intensidade de dias treinados).
  - Adicionar seletores de período nos gráficos (7d, 30d, 90d, 1 ano, Tudo) com atualização fluida.
  - Estilizar tooltips do Recharts com tema dark glassmorphism e padding seguro para mobile.
  - Adicionar campo de busca textual no diário por notas ou modalidade.
- [x] **4.4** Aprimorar `app/intervalado/page.tsx`:
  - Adicionar **Gráfico de Perfil de Velocidade em Linha do Tempo** (alternância visual de tiros vs descansos).
  - Adicionar botão **Cartão de Treino para Pista** (visão condensada para acompanhamento durante a corrida).
- [x] **4.5** Criar e atualizar testes de componentes para os novos gráficos e cards.
- [x] **4.6 [Portão de Qualidade Fase 4]**: `npm test`, `npx tsc --noEmit` e `npx eslint .` 100% verdes.

---

### 🔹 Fase 5: Revitalização de UI/UX — Calculadoras, Home, Histórico e Design System
**Objetivo:** Elevar o nível de acabamento das calculadoras públicas, landing page, histórico e consistência global do design system.

- [ ] **5.1** Aprimorar `app/page.tsx` (Home):
  - Criar **Card de Status Ativo do Atleta** (último simulado, peso, calorias semanais e contagem regressiva para a prova).
  - Criar **Quick Pace Widget** integrado no hero para cálculo em 2 cliques.
- [ ] **5.2** Aprimorar `app/calculadora/page.tsx` e `app/metas/page.tsx`:
  - Gerador visual de parciais km a km com tempos acumulados e pace ponderado.
  - Adicionar preset TAF dinâmico com o edital do usuário.
  - Estratégias de ritmo (pacing: constante, conservador e progressivo).
- [ ] **5.3** Aprimorar `app/taf/page.tsx`:
  - Régua interativa de pontuação/distância com feedback visual imediato de aprovação.
  - Tabela de parciais recomendadas por volta de 400m na pista.
- [ ] **5.4** Aprimorar `app/historico/page.tsx`:
  - Filtro por categoria de cálculo e botão "Converter em Treino do Diário" com 1 clique.
- [ ] **5.5** Polimento do Design System global:
  - Micro-animações em botões e badges, anéis de foco acessíveis (WCAG), paleta dark mode uniforme.
- [ ] **5.6 [Portão de Qualidade Fase 5]**: `npm test`, `npx tsc --noEmit` e `npx eslint .` 100% verdes.

---

### 🔹 Fase 6: Homologação Final, Qualidade, Build e Atualização de Roadmap
**Objetivo:** Garantir 100% de testes verdes, compilação de produção limpa, retrocompatibilidade absoluta e documentação no roadmap oficial.

- [ ] **6.1** Executar suíte completa de testes (`npm test`) -> 100% aprovados.
- [ ] **6.2** Verificar tipagem estrita com TypeScript (`npx tsc --noEmit`) -> 0 erros.
- [ ] **6.3** Executar linter (`npx eslint .`) -> 0 erros e 0 warnings.
- [ ] **6.4** Validar compilação de produção (`npm run build`) -> todas as páginas estáticas e rotas dinâmicas compiladas.
- [ ] **6.5** Atualizar roadmap oficial em `docs/roadmap/01_roadmap_melhorias_futuras.md`.
- [ ] **6.6** Mover plano para `docs/plans/executed/` e sugerir commit semântico.

---

## 4. 🎯 Critérios de Aceite

| Requisito | Critério de Aceite |
|---|---|
| **Documentação Swagger** | Rota interativa `/docs` acessível com Swagger UI completo, suporte a tema escuro e endpoint JSON `/api/docs/spec` cobrindo 100% das rotas da API. |
| **Metas Dinâmicas** | O usuário pode configurar a distância mínima do edital e sua meta de segurança; todos os formulários e atalhos rápidos passam a carregar esses valores automaticamente. |
| **Suporte Multimodal** | O schema e o perfil suportam configuração de Barra Fixa, Flexão e Abdominal, permitindo acompanhamento completo do edital. |
| **Zero Hardcoding** | Nenhum valor de TAF permanece fixado estaticamente em 2.3km ou 2.4km; todos os cálculos e atalhos utilizam os dados do edital cadastrado do atleta. |
| **UI/UX e Métricas** | Home com card de status ativo e mini-widget; gráficos com tooltips glassmorphism e filtros temporais; simulador com gráfico de perfil de tiros; Cooper VO2 máx integrado. |
| **Estabilidade & Qualidade** | 100% dos testes unitários e de integração verdes, zero erros de compilação TypeScript, zero warnings de lint e build limpo. |
