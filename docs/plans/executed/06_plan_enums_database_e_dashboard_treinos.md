# 📌 Plano de Execução: Tipagem Estrita com Enums (Banco & Domínio) e Dashboard de Evolução em Treinos

**Projeto:** PaceLab  
**Módulos:** Prisma ORM, Banco Supabase, Validações Zod, Diário de Treinos (`/treinos`) e Meu TAF (`/meu-taf`)  
**Data:** 11/10/2026  
**Status:** Executado com Sucesso (100% Homologado)  
**Referência:** [docs/roadmap/01_roadmap_melhorias_futuras.md](../../roadmap/01_roadmap_melhorias_futuras.md)

---

## 1. 🎯 Contexto e Motivação

Após a conclusão bem-sucedida da reestruturação de UX (Plano 05), que desacoplou o Diário de Treinos (`/treinos`) do módulo estrito de simulados de prova física (`/meu-taf`), foram identificadas duas necessidades cruciais para a maturidade do sistema:

1. **Tipagem Fraca no Banco de Dados (`String` solta):**  
   Atualmente, campos com valores categóricos finitos estão gravados como texto livre (`String`), como `activity_type` em `training_sessions` e `location_type` em `taf_attempts`.  
   - `activityType` permite opções legadas e vagas (`"teste_taf"`, `"outro"`), quando o escopo real do diário é puramente **locomoção**: corrida contínua, intervalado/tiros e caminhada.
   - `locationType` armazena strings arbitrárias como `"Pista de Atletismo (400m)"`, tornando filtros e queries suscetíveis a inconsistências de caracteres, acentuação e typos.
   - A expansão multimodal do TAF (preparando Barra Fixa, Flexão e Abdominal) requer um enum estruturado (`TafExerciseType`).

2. **Ausência de Gráficos e Análise Visual em `/treinos`:**  
   Em produção ([pacelabd.vercel.app/treinos](https://pacelabd.vercel.app/treinos)), o usuário possui apenas 4 cards estáticos de KPI e uma lista cronológica de sessões. O corredor necessita de um **Dashboard de Evolução do Treinamento** (equivalente ao Strava/Garmin Connect) com:
   - Volume semanal acumulado ao longo das semanas;
   - Curva de ritmo e evolução de pace (`mm:ss /km`);
   - Monitoramento de Carga de Treino e Risco de Lesão (TRIMP = Duração × RPE);
   - Distribuição polarizada de esforço (Regra 80/20 de Stephen Seiler);
   - Proporção do volume por modalidade.

---

## 2. 🏗️ Arquitetura de Tipos e Modelagem Proposta

### 2.1 Enums no Prisma e PostgreSQL

```prisma
// 1. Modalidades de Locomoção do Diário de Treinos
enum ActivityType {
  corrida_continua
  corrida_intervalada
  caminhada

  @@map("activity_type")
}

// 2. Ambientes de Teste do TAF
enum LocationType {
  pista_400m
  rua_plana
  parque_praca
  esteira
  outro

  @@map("location_type")
}

// 3. Modalidades de Prova Física do TAF (Multimodal)
enum TafExerciseType {
  corrida_12m
  barra_fixa
  flexao_braco
  abdominal
  natacao

  @@map("taf_exercise_type")
}
```

### 2.2 Zonas de Intensidade de Esforço (Cálculo Analítico)
Baseado na escala RPE (1 a 10):
- **Zona 1 - Regenerativo/Fácil (RPE 1-3):** Base aeróbia pura, recuperação ativa.
- **Zona 2 - Confortável/Moderado (RPE 4-6):** Ritmo de rodagem e limiar aeróbio.
- **Zona 3 - Limiar/Intenso (RPE 7-8):** Fartleks, tempo run e tiros extensivos.
- **Zona 4 - Máximo/Extenuante (RPE 9-10):** Tiros curtos e esforço de simulação oficial.

---

## 3. 📋 Fases Detalhadas de Implementação

### 🔹 Fase 1: Modelagem de Dados com Enums no Prisma & Script de Migração SQL (✅ Concluída)
**Objetivo:** Introduzir os Enums nativos no `prisma/schema.prisma`, gerar scripts de migração seguros para o Supabase (garantindo conversão de dados legados) e rodar o `prisma generate`.

- [x] **1.1** Criar os Enums `ActivityType` e `LocationType` no `prisma/schema.prisma`.
- [x] **1.2** Atualizar o modelo `TrainingSession` para usar `ActivityType @default(corrida_continua)`.
- [x] **1.3** Atualizar o modelo `TafAttempt` para usar `LocationType?`.
- [x] **1.4** Criar script SQL de migração em `prisma/migrations/20261011_add_enums.sql` com:
  - Criação dos tipos `CREATE TYPE "activity_type" ...` e `CREATE TYPE "location_type" ...`.
  - Tratamento de registros existentes no banco com `UPDATE` de segurança.
  - Conversão de coluna com `ALTER TABLE ... USING ...`.
- [x] **1.5** Executar `npx prisma generate` para sincronizar os tipos do Prisma Client.

---

### 🔹 Fase 2: Alinhamento de Schemas Zod, Types e Rotas da API (✅ Concluída)
**Objetivo:** Adequar a camada de validação e tipos TypeScript para aceitar exclusivamente os valores dos novos Enums, atualizando testes de rota.

- [x] **2.1** Atualizar `types/index.ts`:
  - `ActivityType` restrito a `"corrida_continua" | "corrida_intervalada" | "caminhada"`.
  - `LocationType` tipado como `"pista_400m" | "rua_plana" | "parque_praca" | "esteira" | "outro"`.
  - Mapeamento bidirecional de labels amigáveis para UI (`LOCATION_LABELS`, `ACTIVITY_LABELS`).
- [x] **2.2** Atualizar `lib/validations/taf.ts`:
  - `ActivityTypeEnum = z.enum(["corrida_continua", "corrida_intervalada", "caminhada"])`.
  - `LocationTypeEnum = z.enum(["pista_400m", "rua_plana", "parque_praca", "esteira", "outro"]).optional().nullable()`.
- [x] **2.3** Atualizar rotas de API (`/api/taf/trainings` e `/api/taf/attempts`) e suas suítes de teste em `__tests__/api/taf-routes.test.ts`.

---

### 🔹 Fase 3: Higienização de Componentes Existentes (✅ Concluída)
**Objetivo:** Refatorar os formulários e cards do Diário de Treinos e do Meu TAF para consumir a nova estrutura padronizada de Enums.

- [x] **3.1** Atualizar `components/meu-taf/TrainingForm.tsx`:
  - Manter apenas as 3 opções de atividade (Corrida Contínua, Intervalado/Tiros e Caminhada).
- [x] **3.2** Atualizar `components/meu-taf/TrainingList.tsx`:
  - Simplificar o dropdown de filtro de modalidades para as 3 opções válidas.
- [x] **3.3** Atualizar `components/meu-taf/TrainingCard.tsx`:
  - Remover cores e badges de categorias legadas.
- [x] **3.4** Atualizar `components/meu-taf/TafAttemptForm.tsx` e `components/meu-taf/TafAttemptCard.tsx`:
  - Utilizar os valores de `LocationType` no `select` e renderizar os labels formatados nos cards.
- [x] **3.5** Higienizar `components/meu-taf/EvolutionDashboard.tsx`:
  - Focar os gráficos do Meu TAF estritamente em testes de 12 min (Gráficos A e E).

---

### 🔹 Fase 4: Desenvolvimento do Dashboard de Evolução em Treinos (`/treinos`) (✅ Concluída)
**Objetivo:** Criar um painel analítico interativo com Recharts para o Diário de Treinos, com filtros por período e métricas desportivas avançadas.

- [x] **4.1** Criar componente `components/treinos/TrainingEvolutionDashboard.tsx`:
  - **Filtro Temporal:** Seletor de período (Últimos 30 dias, Últimos 90 dias, Ano Atual, Todo o Histórico).
  - **KPIs Avançados do Período:**
    - Volume total e sessões ativas;
    - Tempo total em movimento (hh:mm);
    - Pace médio ponderado;
    - Carga de Treino Acumulada (TRIMP Score = $\sum \text{duração (min)} \times \text{RPE}$);
    - Maior distância registrada (Longão).
  - **Gráfico 1 (BarChart):** Volume Semanal Acumulado (km por semana com tooltips detalhados).
  - **Gráfico 2 (LineChart):** Curva de Ritmo / Evolução de Pace (`mm:ss /km`).
  - **Gráfico 3 (AreaChart):** Carga de Treino & Monitoramento de Fadiga (TRIMP por semana).
  - **Gráfico 4 (BarChart / Polarizado):** Distribuição de Intensidade por Zonas de RPE (Leve, Moderado, Intenso, Máximo).
  - **Gráfico 5 (PieChart / Donut):** Composição de Volume por Modalidade (Contínua vs Intervalado vs Caminhada).
- [x] **4.2** Atualizar a página `app/treinos/page.tsx`:
  - Implementar navegação interna por abas:
    - **Aba "Diário & Registro":** Formulário, KPIs rápidos e lista de sessões.
    - **Aba "Evolução & Gráficos":** O novo dashboard analítico completo.
  - Suporte a deep linking via query param (`/treinos?tab=graficos`).

---

### 🔹 Fase 5: Testes Automatizados, Homologação e Qualidade (✅ Concluída)
**Objetivo:** Validar a integridade de todas as camadas, prevenir regressões e assegurar build estático verde.

- [x] **5.1** Criar testes unitários para o novo dashboard de evolução em `__tests__/components/TrainingEvolutionDashboard.test.tsx`.
- [x] **5.2** Atualizar os testes existentes de validação e componentes (`treinos.test.tsx`, `tafValidations.test.ts`, `meu-taf.test.tsx`).
- [x] **5.3** Executar `npm test` garantindo 100% de sucesso.
- [x] **5.4** Executar `npx tsc --noEmit` garantindo zero erros de tipagem TypeScript.
- [x] **5.5** Executar `npm run build` garantindo compilação estática de produção.

---

## 4. 🛡️ Critérios de Aceite

1. **Integridade de Dados:** O banco e a camada Zod rejeitam qualquer valor fora dos enums `ActivityType` e `LocationType`.
2. **Experiência do Usuário (UX):** A página `/treinos` permite alternar com fluidez entre registro rápido de treino e visualização gráfica de evolução.
3. **Cálculos Desportivos Precisos:** Métricas de carga (TRIMP), volume semanal e distribuição RPE refletem a literatura esportiva.
4. **Zero Erros de Hidratação:** Todos os gráficos Recharts implementam guarda de montagem (`isMounted`) e dimensões responsivas.
5. **Cobertura de Testes:** Todas as suítes passam e o build de produção compila sem falhas.
