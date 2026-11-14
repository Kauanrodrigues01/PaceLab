# 📌 Plano de Execução: Importação Unificada `.FIT` (Prioritário) + `.GPX` (Complementar/Fallback) do Strava e Evolução do Schema Prisma

**Projeto:** PaceLab
**Módulos:** `prisma/schema.prisma`, `lib/fit/*` (novo — `@garmin/fitsdk`), `lib/gpx/*` (fallback/complemento), `lib/activityParser/*` (mesclagem `.FIT` + `.GPX`), `app/api/training-sessions/parse-activity` + `app/api/taf/trainings/*`, `app/api/taf/attempts/*`, Diário de Treinos (`/treinos`), Dashboard de Evolução, Swagger
**Data:** 14/11/2026
**Status:** ✅ **CONCLUÍDO E HOMOLOGADO (`PQ11`)** — Plano integralmente implementado (Fases 0 a 11 concluídas; Fase 5 marcada como `SKIP` em favor da Fase 5B `.FIT` Prioritário).
**Referência:** [docs/roadmap/01_roadmap_melhorias_futuras.md](../roadmap/01_roadmap_melhorias_futuras.md)

---

## 1. 🎯 Objetivo

Permitir importar arquivos de treino do Strava priorizando o arquivo original **`.FIT`** (decodificado com `@garmin/fitsdk`) e aceitando **`.GPX`** como fonte complementar (quando enviado junto com `.FIT`) ou fallback integral (quando enviado sozinho). O sistema suporta o envio de **1 ou 2 arquivos simultaneamente** (`.fit` isolado, `.gpx` isolado ou `.fit` + `.gpx` do mesmo treino), exibe um **Painel Somente Leitura** com a telemetria extraída e apresenta um **Formulário Pós-Upload Inteligente** que solicita apenas dados contextuais simples (nunca pedindo preenchimento manual de sensores ausentes).

Princípios do plano:

1. **Prioridade `.FIT` > `.GPX`:** o arquivo `.FIT` original entrega o resumo oficial pré-calculado pelo dispositivo/Strava (`sessionMesgs`, `lapMesgs`, `recordMesgs`), incluindo suporte a treinos indoor/esteira sem GPS; quando combinado com `.GPX`, o `.GPX` fornece apenas o que falta no `.FIT` (`<trk><name>` editado no Strava e `elevationGainM` quando `totalAscent` for nulo ou `0`).
2. **Mudanças aditivas** no banco (nada removido, tudo opcional ou com default; `ActivitySource` expandido com `fit_upload`).
3. **Parsers puros e isolados** (`lib/fit/*`, `lib/gpx/*`, `lib/activityParser/*` — sem I/O de banco ou React) → 100% testáveis.
4. **Formulário Pós-Upload Inteligente:** telemetria extraída é exibida como somente leitura (`"—"` para sensores ausentes), sem jamais exigir que o usuário digite FC, cadência, elevação ou splits manualmente.
5. **Nunca rodar `migrate dev`/`reset` contra o Supabase** (ver risco R1).

---

## 2. 🔎 Especificação do Adendo: Prioridade `.FIT`, Mesclagem `.FIT` + `.GPX` e Formulário Inteligente

### 2.1 Regra de Prioridade e Mesclagem (`.FIT` > `.GPX`)

O componente de upload e o endpoint de parsing (`POST /api/training-sessions/parse-activity` e rota espelho `POST /api/taf/trainings/gpx-preview`) aceitam **1 ou 2 arquivos simultaneamente** (`.fit` isolado, `.gpx` isolado ou **`.fit` + `.gpx` juntos** do mesmo treino):

1. **Quando apenas `.FIT` for enviado (`source = "fit_upload"`):**
   - Todos os dados de telemetria, tempo, distância, splits/laps, calorias e resumo vêm exclusivamente do `.FIT`.
2. **Quando apenas `.GPX` for enviado (`source = "gpx_upload"`):**
   - Usa o parser `.GPX` (`lib/gpx/*`) como fallback integral, aproveitando inclusive o título da atividade em `<trk><name>`.
3. **Quando `.FIT` e `.GPX` forem enviados juntos (`source = "fit_upload"`):**
   - **Validação de coerência:** Compara o timestamp inicial (`startedAt`) do `.FIT` com o do `.GPX`. Se a diferença absoluta for **maior que 5 minutos (`300 s`)**, retorna um aviso (`MISMATCHED_ACTIVITY_FILES`) alertando que os arquivos parecem ser de treinos diferentes.
   - **Prioridade absoluta do `.FIT`:** Distância (`distanceKm`), tempo em movimento (`durationSeconds`), tempo decorrido (`elapsedSeconds`), pace (`paceSeconds` / `paceFormatted`), velocidade (`speedKmh`), frequência cardíaca média/máxima (`avgHeartRate` / `maxHeartRate`), cadência (`avgCadence`), splits/laps e calorias (`activeCalories`) vêm **obrigatoriamente do `.FIT`**.
   - **Complemento do `.GPX` (apenas o que faltar no `.FIT`):**
     - **Nome/Título do treino (`name`):** Como o `.FIT` original do dispositivo não contém o título editado posteriormente no Strava, extrai `<trk><name>` do `.GPX` para preencher automaticamente o nome do treino.
     - **Elevação (`elevationGainM`):** Se `totalAscent` vier nulo ou `0` no `.FIT` (comum em gravações sem altímetro barométrico), utiliza o ganho de elevação corrigido calculado a partir do `<ele>` do `.GPX`.
4. **Chave Anti-Duplicação (`externalId`):**
   - Quando a fonte prioritária for `.FIT` (`source = "fit_upload"`):
     `"fit_" + sha256("${startTimeIso}_${Math.round(distanceKm * 1000)}")`
   - Quando houver apenas `.GPX` (`source = "gpx_upload"`):
     prefixo `"gpx_"` sobre os dados do `.GPX`.

---

### 2.2 Especificação Técnica do Parser `.FIT` (`@garmin/fitsdk`)

Utiliza o SDK oficial da Garmin (`@garmin/fitsdk`) no backend Node.js para decodificar arquivos binários `.FIT`:

1. **Detecção do formato:**
   - Identifica o arquivo `.FIT` verificando a assinatura binária nos bytes `8..11` (`buffer.subarray(8, 12).toString("ascii") === ".FIT"`) e/ou via `Decoder.isFIT(stream)`.
2. **Extração das mensagens principais (`decoder.read()`):**
   - **`sessionMesgs[0]` (Resumo oficial pré-calculado pelo dispositivo/Strava):**
     - `startedAt` (`sessionDate`): `session.startTime` (ou `session.timestamp`) normalizado em ISO UTC.
     - `distanceKm`: `Number((session.totalDistance / 1000).toFixed(3))` (o SDK entrega `totalDistance` em metros).
     - `durationSeconds`: `Math.round(session.totalTimerTime)` (tempo em movimento real, já descontando pausas).
     - `elapsedSeconds`: `Math.round(session.totalElapsedTime)` (tempo total decorrido, garantido `>= durationSeconds`).
     - `speedKmh`: `Number((distanceKm / (durationSeconds / 3600)).toFixed(2))` (ou `enhancedAvgSpeed * 3.6`).
     - `paceSeconds` e `paceFormatted`: calculados a partir de `Math.round(durationSeconds / (session.totalDistance / 1000))`.
     - `avgHeartRate`: `session.avgHeartRate ?? null` (validado na faixa 30–250 bpm).
     - `maxHeartRate`: `session.maxHeartRate ?? null` (validado na faixa 30–250 bpm).
     - `elevationGainM`: `session.totalAscent ?? null`.
     - `avgCadence`: se `session.avgRunningCadence` (ou `session.avgCadence` em corrida/caminhada) existir, multiplica por `2` (`Math.round((session.avgRunningCadence + (session.avgFractionalCadence ?? 0)) * 2)` — padrão FIT grava ciclos de 1 pé; multiplicado por 2 = passos/min totais `spm`).
     - `activeCalories`: `session.totalCalories ?? null`.
   - **`lapMesgs` e `recordMesgs` (Voltas reais e Parciais por Km):**
     - Se `lapMesgs` tiver **2 ou mais voltas** (ex.: Auto-Lap de 1 km ou voltas manuais de treino intervalado/pista), mapeia cada `lap` (`totalDistance`, `totalTimerTime`, `avgHeartRate`, `totalAscent`) diretamente para o array `splits` (e `laps` no caso de `TafAttempt`).
     - Se `lapMesgs` tiver **apenas 1 volta única** (treino sem auto-lap), percorre `recordMesgs` acumulando `distance` e `timestamp` para gerar automaticamente o array `splits` km a km.
     - **Suporte a esteira (`indoor` / sem GPS):** Não exige coordenadas GPS (`positionLat` / `positionLong`) no `.FIT`, pois treinos indoor possuem `totalDistance`, `totalTimerTime`, `avgHeartRate` e `avgRunningCadence` mesmo sem GPS. Quando houver coordenadas, converte de *semicircles* para graus via `semicircles * (180 / Math.pow(2, 31))`.

---

### 2.3 Regra do Formulário Pós-Upload Inteligente (Apenas Campos Simples Faltantes)

Após o usuário subir o(s) arquivo(s) e o backend retornar o preview parseado, a interface exibe:

1. **Painel Somente Leitura (Telemetria Extraída):**
   - Exibe as métricas extraídas do(s) arquivo(s): **Distância, Tempo em Movimento, Tempo Decorrido, Pace, Velocidade, FC Média/Máx, Elevação, Cadência, Calorias e Splits**.
   - Se alguma métrica de sensor não existir no arquivo (ex.: treino gravado sem cinta cardíaca ou sem altímetro), exibe apenas `"—"` no painel visual.
2. **Formulário Inteligente (Somente Informações Simples e Contextuais):**
   - **NUNCA renderiza inputs pedindo para o usuário digitar dados de sensores ausentes** (não pede para preencher FC média/máxima, cadência, elevação ou splits manualmente caso o arquivo não os tenha).
   - **Exibe campos editáveis apenas para dados simples/contextuais e campos básicos eventualmente ausentes:**
     - **Nome / Título do Treino:** Se vier vazio (ex.: upload apenas de `.FIT`, que não traz o título do Strava), destaca este campo como principal para o usuário nomear a sessão (ex.: *"Rodagem leve 6 km"* ou *"Tiros 6x400m"*). Se vier preenchido pelo `.GPX` (`<trk><name>`), mostra-o já preenchido para confirmação/edição (armazenando no início de `notes` ou em campo dedicado conforme o schema).
     - **Tipo de Treino (`activityType`):** Select obrigatório (`rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`, `caminhada`; e opção de salvar como Simulado TAF na Fase 9).
     - **Esforço Percebido (`perceivedEffort` — RPE 1 a 10):** Seletor simples opcional.
     - **Tênis Utilizado (`shoeName`):** Input/autocomplete opcional.
     - **Peso Corporal (`bodyWeightKg`):** Pré-preenchido automaticamente com `UserProfile.currentWeightKg`.
     - **Observações (`notes`):** Campo de texto livre opcional.
     - **Fallback de dados básicos:** Apenas se o arquivo estiver incompleto e não trouxer `sessionDate`, `distanceKm` ou `durationSeconds`, libera esses inputs simples para preenchimento manual.

---

## 3. ✅ Decisões Consolidadas (D1–D9)

| ID | Tema | Decisão Consolidada |
|---|---|---|
| D1 | Rotas de Parsing | **`POST /api/training-sessions/parse-activity`** (rota principal do Adendo) e **`POST /api/taf/trainings/gpx-preview`** (alias compatível com o namespace `/api/taf/trainings/*`), aceitando 1 ou 2 arquivos (`.fit`, `.gpx` ou `.fit` + `.gpx`). Para salvar, usa-se `POST /api/taf/trainings`. |
| D2 | `ActivityType` | Enum no banco com 6 valores de treino (`rodagem_leve`, `corrida_continua`, `tempo_run`, `corrida_intervalada`, `longao`, `caminhada`). Simulados de 12 min vão para `TafAttempt` (ou seleção de Teste TAF no pós-upload redirecionando para `TafAttempt`). |
| D3 | Campo `source` | Enum nativo **`ActivitySource { manual, gpx_upload, fit_upload }`** (`@@map("activity_source")`). |
| D4 | Fórmula do `externalId` | Para `.FIT` (ou `.FIT` + `.GPX`): `"fit_" + sha256("${startTimeIso}_${Math.round(distanceKm * 1000)}")`. Para `.GPX` isolado: `"gpx_..."`. |
| D5 | Tipos aceitos no import | Corrida (rua, trilha, pista, esteira/indoor) e caminhada/trilha. Outros esportes (ciclismo, natação, etc.) retornam `422 UNSUPPORTED_ACTIVITY`. |
| D6 | Import como Simulado TAF | Fase 9 própria (`TafAttempt`), aproveitando `lapMesgs` ou recorte de janela de 12 min em `recordMesgs`/trackpoints. |
| D7 | Visualização de splits | Fase 8 dedicada (análise + tabela + gráfico + insights). |
| D8 | Calorias no import | Se o `.FIT` trouxer `session.totalCalories > 0`, expõe `activeCalories` do `.FIT` (`calorieSource: "device_fit"` / `"auto_calculated"`), mantendo o motor do Compêndio 2024 (`estimateTrainingCalories`) como cálculo padrão quando não houver calorias no arquivo (ex.: `.GPX` isolado) ou quando o usuário recalcular com peso corporal. |
| D9 | Prioridade `.FIT` > `.GPX` | No upload conjunto `.FIT` + `.GPX`, telemetria/tempos/distância/splits vêm 100% do `.FIT`; o `.GPX` fornece apenas `<trk><name>` e `elevationGainM` (se `totalAscent` no `.FIT` for `null` ou `0`), com alerta se `|startFit - startGpx| > 5 min`. |

---

## 4. 🧱 Fases de Execução

> Cada fase termina com um **Portão de Qualidade (PQ)**: `npx tsc --noEmit` + `npx next lint` + `npm test` verdes. Nenhuma fase começa com o PQ anterior vermelho.

---

### 🔹 Fase 0 — Preparação, decisões e rede de segurança (✅ Concluída)
- [x] **0.1** Criar branch `feat/gpx-import`.
- [x] **0.2** Confirmar baseline (`486/486` testes em `59` arquivos, `0` erros TypeScript, `0` avisos ESLint).
- [x] **0.3** Decisões iniciais fechadas.
- [x] **0.4** Subir Postgres local descartável (`pacelab-pg-test` na porta `5433`).
- [x] **0.5** Reproduzir o estado atual no Postgres local (`prisma migrate deploy` + `prisma migrate diff`).
- [x] **0.6** Backup dos dados reais do Supabase (`scratch/pacelab_supabase_backup_pre_plan11.json`).
- [x] **0.7** Instalar dependências iniciais (`fast-xml-parser`, `tsx`).
- [x] **0.8 [PQ0]** Baseline validado.

---

### 🔹 Fase 1 — Schema Prisma e Migration (aditiva e ensaiada) (✅ Concluída)
- [x] **1.1–1.9 [PQ1]** Enum `ActivityType` expandido, `ActivitySource` criado, colunas de telemetria e `externalId` adicionadas em `TrainingSession` e `TafAttempt`, migration `20261113233500_add_gpx_import_fields` testada em banco limpo e com dados legados.

---

### 🔹 Fase 2 — Contratos: tipos, Zod, labels e propagação do `ActivityType` (✅ Concluída)
- [x] **2.1–2.9 [PQ2]** `types/index.ts`, `lib/activity.ts`, `lib/validations/taf.ts`, `lib/math/calories.ts` e componentes de listagem/gráficos atualizados para os 6 tipos de atividade (`60/60` suítes, `498/498` testes verdes).

---

### 🔹 Fase 3 — API de treinos e simulados (novos campos + duplicidade) (✅ Concluída)
- [x] **3.1–3.9 [PQ3]** `POST/PUT/GET /api/taf/trainings` e `/api/taf/attempts` com suporte a `source`, `externalId`, `409 Conflict`, `onDuplicate: "update"`, tratamento de `P2002` e Swagger (`61/61` suítes, `510/510` testes verdes).

---

### 🔹 Fase 4 — `gpxParserService` (núcleo puro `.GPX`, TDD) (✅ Concluída — atua como Fallback/Complemento)
- [x] **4.1–4.11 [PQ4]** Motor `lib/gpx/*` (`xml.ts`, `geo.ts`, `metrics.ts`, `elevation.ts`, `splits.ts`, `externalId.ts`, `parseGpx.ts`) implementado e testado com cobertura > 98% (`68/68` suítes verdes). Atua agora como fallback quando apenas `.GPX` é enviado e como extrator complementar de `<trk><name>` e `elevationGainM` quando enviado junto com `.FIT`.

---

### 🔹 Fase 5 — Validação manual exclusiva de `.GPX` (⏭️ PULADA / SKIP — Substituída pela Fase 5B)
> **Status: ⏭️ PULADA (SKIP)** por decisão de arquitetura: como o arquivo `.GPX` exportado do Strava é uma reconstrução simplificada (sem resumo oficial de sessão, sem voltas originais de autolap e sujeita a variações de pós-processamento da nuvem do Strava), adotamos o arquivo **`.FIT` (Strava Original / Garmin FIT SDK)** como fonte primária e deixamos o `.GPX` apenas como secundário/complementar.

- [x] ~~**5.1–5.5** Scripts auxiliares de `.GPX` criados anteriormente mantidos no repositório apenas para suporte ao fallback `.GPX`.~~ *(Fase encerrada/pulada em favor da Fase 5B)*.

---

### 🔹 Fase 5B — Motor Prioritário `.FIT` (`@garmin/fitsdk`), Mesclagem `.FIT` + `.GPX` e Evolução `fit_upload` (✅ Concluída)
**Objetivo:** implementar o parser binário `.FIT` com `@garmin/fitsdk`, o orquestrador de mesclagem `.FIT` + `.GPX` (`.FIT` > `.GPX`) e estender o enum `ActivitySource` com `"fit_upload"`.

#### **5B.1 Dependência e Evolução Aditiva de `ActivitySource` (`fit_upload`)**
- [x] **5B.1.1** Instalar `@garmin/fitsdk` no projeto.
- [x] **5B.1.2** Adicionar o valor `fit_upload` ao `enum ActivitySource` em `prisma/schema.prisma` (`manual`, `gpx_upload`, `fit_upload`) e criar migration aditiva (`ALTER TYPE "activity_source" ADD VALUE IF NOT EXISTS 'fit_upload'`), validando no Postgres local (`pacelab-pg-test`) e regenerando o Prisma Client (`npx prisma generate`).
- [x] **5B.1.3** Atualizar `types/index.ts` (`ActivitySource = "manual" | "gpx_upload" | "fit_upload"` e `SOURCE_LABELS`: `fit_upload: "Strava / Garmin FIT"`), `lib/validations/taf.ts` (`ActivitySourceEnum = z.enum(["manual", "gpx_upload", "fit_upload"])`), `app/api/taf/trainings/route.ts`, `app/api/taf/attempts/route.ts` e `lib/swagger/spec.ts`.

#### **5B.2 Parser Binário `.FIT` (`lib/fit/*` com `@garmin/fitsdk`, puro e determinístico — TDD)**
- [x] **5B.2.1 Detecção e Validação Binária (`lib/fit/parseFit.ts`):**
  - Verificar assinatura binária nos bytes `8..11` (`buffer.subarray(8, 12).toString("ascii") === ".FIT"`) e `Decoder.isFIT(stream)` via `Stream.fromBuffer(buffer)`.
  - Se o buffer estiver corrompido, vazio ou não for um arquivo `.FIT` válido, lançar erro tipado (`INVALID_FIT` -> `422` amigável em português).
- [x] **5B.2.2 Extração de `sessionMesgs[0]` (Resumo Oficial do Dispositivo/Strava):**
  - Classificar esporte (`session.sport` / `session.subSport`): aceitar corrida (`running`, `trail`, `treadmill`, `track`, `virtual_activity`, `generic` com velocidade compatível) e caminhada (`walking`, `hiking`). Recusar ciclismo (`cycling`), natação (`swimming`), etc. com `UNSUPPORTED_ACTIVITY`.
  - Extrair do `sessionMesgs[0]` (com fallback para agregação de `lapMesgs`/`recordMesgs` caso algum campo escalar venha omitido):
    - `startedAt` (`sessionDate`): `session.startTime` (ou `session.timestamp` / 1º `record.timestamp`) em ISO UTC;
    - `distanceKm`: `Number((session.totalDistance / 1000).toFixed(3))` (`totalDistance` em metros);
    - `durationSeconds`: `Math.round(session.totalTimerTime)` (tempo em movimento real);
    - `elapsedSeconds`: `Math.max(durationSeconds, Math.round(session.totalElapsedTime ?? session.totalTimerTime))`;
    - `speedKmh`: `Number(((session.totalDistance / 1000) / (durationSeconds / 3600)).toFixed(2))` (ou `session.enhancedAvgSpeed * 3.6`);
    - `paceSeconds` e `paceFormatted`: a partir de `Math.round(durationSeconds / (session.totalDistance / 1000))`;
    - `avgHeartRate`: `session.avgHeartRate ?? null` (faixa válida 30–250 bpm);
    - `maxHeartRate`: `session.maxHeartRate ?? null` (faixa válida 30–250 bpm);
    - `elevationGainM`: `typeof session.totalAscent === "number" ? Math.round(session.totalAscent) : null`;
    - `avgCadence`: se `session.avgRunningCadence` (ou `session.avgCadence`) existir, multiplicar por `2` (`Math.round(( (session.avgRunningCadence ?? session.avgCadence) + (session.avgFractionalCadence ?? 0) ) * 2)` — ciclos de 1 pé $\times 2 =$ `spm` totais);
    - `activeCalories`: `typeof session.totalCalories === "number" && session.totalCalories > 0 ? Math.round(session.totalCalories) : null`.
- [x] **5B.2.3 Extração de `lapMesgs` e `recordMesgs` (Voltas Reais, Splits por Km e Esteira Sem GPS):**
  - **Caso 1 (`lapMesgs.length >= 2` — Auto-Lap de 1 km ou voltas manuais de pista/intervalado):** mapear cada `lap` (`totalDistance`, `totalTimerTime`, `avgHeartRate`, `totalAscent`) diretamente para o array `splits` (`kilometer`, `distanceKm`, `durationSeconds`, `paceSeconds`, `paceFormatted`, `avgHeartRate`, `elevationDiffM`).
  - **Caso 2 (`lapMesgs.length <= 1` — Treino sem auto-lap):** percorrer `recordMesgs` acumulando a distância (`record.distance`) e o tempo (`record.timestamp`, ajustado às pausas do timer) para gerar automaticamente o array `splits` km a km com interpolação linear nas marcas de `1.000 m`.
  - **Suporte integral a esteira (`indoor`):** não exigir `positionLat` / `positionLong` (treinos de esteira usam acelerômetro/footpod com `totalDistance`, `totalTimerTime`, `avgHeartRate` e `avgRunningCadence`). Quando `positionLat` / `positionLong` estiverem presentes em *semicircles*, converter para graus via `semicircles * (180 / Math.pow(2, 31))`.
- [x] **5B.2.4 Chave Anti-Duplicação (`externalId`) do `.FIT`:**
  - `"fit_" + sha256("${startTimeIso}_${Math.round(distanceKm * 1000)}")`.

#### **5B.3 Orquestrador de Prioridade e Mesclagem (`lib/activityParser/parseAndMergeActivity.ts` — TDD)**
- [x] **5B.3.1** Receber `{ fitBuffer?: Buffer, gpxXml?: string }` (1 ou 2 arquivos, detectando automaticamente pelo conteúdo/extensão mesmo se o usuário inverter a ordem no upload):
  1. **Apenas `.FIT`:** retorna resultado do `parseFit(fitBuffer)` com `source: "fit_upload"`.
  2. **Apenas `.GPX`:** retorna resultado do `parseGpx(gpxXml)` com `source: "gpx_upload"`.
  3. **`.FIT` + `.GPX` juntos:**
     - Executa `parseFit(fitBuffer)` como **fonte primária obrigatória** (`source: "fit_upload"`).
     - Executa `parseGpx(gpxXml)` em modo tolerante para extrair metadados complementares.
     - **Validação de coerência de horário:** compara `Date.parse(fit.startedAt)` com `Date.parse(gpx.startedAt)`. Se `|fitStartMs - gpxStartMs| > 5 * 60 * 1000` (`5 minutos`), adiciona warning `MISMATCHED_ACTIVITY_FILES` alertando que os dois arquivos parecem pertencer a treinos diferentes.
     - **Mesclagem (`.FIT` > `.GPX`):**
       - Mantém 100% de distância, tempo em movimento, tempo decorrido, pace, velocidade, FC média/máx, cadência, splits, calorias e `externalId` (`fit_<sha256>`) vindos do `.FIT`.
       - Preenche `name` com `gpx.name` (`<trk><name>`) caso o `.FIT` não possua título de atividade.
       - Se `fit.elevationGainM === null || fit.elevationGainM === 0` e `gpx.elevationGainM !== null && gpx.elevationGainM > 0`, utiliza `gpx.elevationGainM` (com warning informativo `ELEVATION_MERGED_FROM_GPX`).

#### **5B.4 Testes Automatizados da Fase 5B (`__tests__/lib/fit/*.test.ts`)**
- [x] **5B.4.1** Construtor binário de fixtures `.FIT` reais/válidas para testes (ou encode de mensagens FIT padrão Garmin SDK) cobrindo:
  - Corrida de rua com `sessionMesgs` + `lapMesgs` (>= 2 voltas) + `recordMesgs` (semicircles, FC, cadência 1 pé $\times 2$, calorias, elevação);
  - Corrida sem auto-lap (`lapMesgs.length === 1`), gerando splits km a km a partir de `recordMesgs`;
  - Corrida indoor/esteira (`subSport: "treadmill"`) **sem coordenadas GPS** (`positionLat`/`positionLong` ausentes), validando extração completa de distância, tempo, pace, FC e cadência;
  - Caminhada (`sport: "walking"`);
  - Esporte não suportado (`sport: "cycling"`) $\rightarrow$ `UNSUPPORTED_ACTIVITY`;
  - Arquivo binário inválido $\rightarrow$ `INVALID_FIT`;
  - Mesclagem `.FIT` + `.GPX` do mesmo treino (prioridade absoluta do `.FIT` + `<trk><name>` do `.GPX` + fallback de `elevationGainM` quando `totalAscent === 0`);
  - Mesclagem `.FIT` + `.GPX` com horários divergentes (> 5 min) $\rightarrow$ warning `MISMATCHED_ACTIVITY_FILES`;
  - Determinismo do `externalId` (`fit_<sha256>`).
- [x] **5B.5 [PQ5B]** `npx tsc --noEmit` (0 erros), `npx next lint` (0 avisos) e `npx vitest run` 100% verdes.

---

### 🔹 Fase 6 — Endpoint Unificado `POST /api/training-sessions/parse-activity` (e alias `/api/taf/trainings/gpx-preview`) (✅ Concluída)
**Objetivo:** expor o parser unificado (`.FIT`, `.GPX` ou `.FIT` + `.GPX`) via HTTP multipart com segurança.

- [x] **6.1** Route Handler em `app/api/training-sessions/parse-activity/route.ts` (e re-export em `app/api/taf/trainings/gpx-preview/route.ts` para compatibilidade) com `runtime = "nodejs"` e `dynamic = "force-dynamic"`.
- [x] **6.2** Aceitar **1 ou 2 arquivos** no `request.formData()` (campos `files`, `file`, `fitFile`, `gpxFile`):
  - Validar presença de pelo menos 1 arquivo (`400`), no máximo 2 arquivos (1 `.fit` e/ou 1 `.gpx`), extensão (`.fit` ou `.gpx`) e tamanho individual ≤ 4 MB (`413`).
  - Detectar automaticamente qual arquivo é `.FIT` (assinatura binária `.FIT` nos bytes `8..11` / extensão `.fit`) e qual é `.GPX` (XML / extensão `.gpx`).
  - Erros do parser → `422` com `code` + mensagem clara em português; **nunca** vazar stack.
- [x] **6.3** Resposta unificada:
  `{ success: true, data: { ...ParsedActivity, source: "fit_upload" | "gpx_upload", filesUsed: ["fit"] | ["gpx"] | ["fit", "gpx"], alreadyExists, existingTrainingId?, suggestedActivityType, suggestedNotes, allowedActivityTypes } }`.
- [x] **6.4** Checagem `alreadyExists` via `prisma.trainingSession.findUnique({ where: { externalId }, select: { id: true } })`.
- [x] **6.5** `tafService.parseActivity(files)` (e alias `tafService.parseGpx(file)`) enviando `FormData` (sem `Content-Type` manual) + tipos TypeScript.
- [x] **6.6** Swagger (`lib/swagger/spec.ts`): documentar `POST /api/training-sessions/parse-activity` e `POST /api/taf/trainings/gpx-preview` com suporte a `.fit` e `.gpx`.
- [x] **6.7 Testes (`__tests__/api/activity-parse-routes.test.ts`):** upload só `.FIT`, upload só `.GPX`, upload combinado `.FIT` + `.GPX` (mesclando nome e elevação), warning de > 5 min de diferença, `alreadyExists` true/false, sem arquivo (`400`), extensão inválida (`422`), > 4 MB (`413`), esporte não suportado (`422`).
- [x] **6.8 [PQ6]** `tsc`, `next lint` e `vitest` 100% verdes.

---

### 🔹 Fase 7 — Frontend: Upload Unificado (`.FIT` + `.GPX`), Painel Somente Leitura e Formulário Pós-Upload Inteligente
**Objetivo:** fluxo completo de importação seguindo estritamente a regra da Seção 2.3 (Painel de Telemetria Somente Leitura + Formulário Pós-Upload Inteligente apenas com campos simples).

**7.A Formulário manual (sem regressão)**
- [x] **7.A.1** Seção expansível **"Dados Avançados / Telemetria"** (fechada por padrão) no `TrainingForm` manual; modo edição **preserva** `splits` e telemetria de treinos importados (A17); campos `source`/`externalId` somente leitura.
- [x] **7.A.2** Testes existentes de `TrainingFormInputs` e `TrainingFormCalories` continuam 100% verdes sem alterar os testes antigos.

**7.B Importação `.FIT` / `.GPX` e Formulário Pós-Upload Inteligente**
- [x] **7.B.1** Em `/treinos` → aba Diário: manter o botão `"Registrar Treino"` / `"Fechar Formulário"` abrindo o `TrainingForm` (`data-testid="training-form"`) por padrão, adicionar botão **"Importar .FIT / .GPX (Strava)"** ao lado e seletor interno acessível (`role="tablist"`).
- [x] **7.B.2** `GpxImportPanel` (Painel de Upload Unificado `.FIT` + `.GPX`):
  - Drag-and-drop e seletor de arquivo aceitando `accept=".fit,.gpx"` com `multiple` (1 ou 2 arquivos: `.fit` isolado, `.gpx` isolado ou `.fit` + `.gpx` juntos).
  - Exibe badges claros dos arquivos selecionados (`Arquivo Primário: .FIT`, `Complemento: .GPX`), validação client-side (extensão e ≤ 4 MB) e estados `idle → parsing → preview → saving → saved|error`.
- [x] **7.B.3** `GpxPreviewCard` (**Painel Somente Leitura de Telemetria Extraída**):
  - Exibe **somente leitura**: Data/Hora, Origem (`Strava FIT`, `Strava FIT + GPX` ou `Strava GPX`), Distância, Tempo em Movimento, Tempo Decorrido, Pace Médio, Velocidade Média, FC Média/Máx, Ganho de Elevação, Cadência, Calorias e Tabela de Splits.
  - Se alguma métrica de sensor não existir no arquivo (ex.: treino sem cinta cardíaca), exibe apenas **`"—"`** no painel visual.
  - Exibe avisos do parser (incluindo alerta destacado caso `.FIT` e `.GPX` tenham > 5 minutos de diferença).
- [x] **7.B.4** **Formulário Pós-Upload Inteligente (NUNCA pede sensores ausentes):**
  - **Regra estrita:** jamais renderizar inputs para o usuário digitar FC média/máx, cadência, elevação ou splits no fluxo de importação.
  - **Campos editáveis simples e contextuais:**
    1. **Nome / Título do Treino:** se vier vazio (upload apenas de `.FIT`), aparece em **destaque principal** para o usuário nomear a sessão (ex.: *"Rodagem leve 6 km"* ou *"Tiros 6x400m"*); se vier preenchido pelo `.GPX` (`<trk><name>`), vem pré-preenchido para confirmação/edição.
    2. **Tipo de Treino (`activityType`):** select obrigatório restrito pela família detectada (ou escolha livre se desconhecido).
    3. **Esforço Percebido (`perceivedEffort` — RPE 1 a 10):** seletor simples opcional.
    4. **Tênis Utilizado (`shoeName`):** input opcional.
    5. **Peso Corporal (`bodyWeightKg`):** pré-preenchido automaticamente com `UserProfile.currentWeightKg`.
    6. **Observações (`notes`):** campo de texto livre opcional (combinado de forma limpa com o título do treino ao salvar).
    7. **Fallback de dados básicos:** somente se um arquivo incompleto não trouxer `sessionDate`, `distanceKm` ou `durationSeconds`, libera esses inputs básicos.
- [x] **7.B.5** Se `alreadyExists`: alerta destacado ("Este treino já foi importado") + botão **"Atualizar treino existente"** (`onDuplicate: "update"`).
- [x] **7.B.6** **Calorias:** se o `.FIT` trouxer `activeCalories` do dispositivo, utiliza-o ou recalcula via helper compartilhado (`estimateTrainingCalories` + `buildCaloriePayload`) quando houver peso corporal.
- [x] **7.B.7** **Salvar Treino** ⇒ `tafService.saveTraining` com `source: "fit_upload" | "gpx_upload"`, `externalId`, `splits`, telemetria; atualiza lista/cache otimista e KPIs.

**7.C Listagem, detalhes e Testes**
- [x] **7.C.1** `TrainingCard`: badge de origem (`Strava FIT` / `Strava GPX` / `Manual`), tênis, FC média/máx, elevação, cadência — exibidos só quando houver dado.
- [x] **7.C.2** `TrainingList`: filtro por origem e por novos tipos; busca inclui tênis.
- [x] **7.D Testes:** `GpxImportPanel` (upload `.fit`, `.gpx`, `.fit + .gpx`, erro, preview, duplicado, salvar; verificação de que **não existem** inputs de FC/cadência/elevação no pós-upload), `GpxPreviewCard`, `TrainingCard`, `TrainingForm`.
- [x] **7.E [PQ7]** `tsc`, `next lint`, `vitest` e `next build` 100% verdes (pronto para inspeção visual do usuário / Marco M2).

---

### 🔹 Fase 8 — Análise e Visualização de Splits (D7)
- [x] **8.1** Motor `lib/math/splitsAnalysis.ts` (`analyzeSplits(splits)`).
- [x] **8.2** `SplitsTable` completa.
- [x] **8.3** `SplitsPaceChart` (Recharts com eixo Y invertido).
- [x] **8.4** Camadas opcionais (`Pace | + FC | + Elevação`).
- [x] **8.5** `SplitsInsights` (cards-resumo em português).
- [x] **8.6** Integração no preview de upload, `TrainingCard` expandido e `TrainingDetailModal`.
- [x] **8.7–8.10 [PQ8]** Testes e **Marco M3 — validação visual.**

---

### 🔹 Fase 9 — Importar `.FIT` / `.GPX` como Simulado TAF (`TafAttempt`) (D6)
- [x] **9.1** No preview pós-upload: seletor **"Salvar como: ( ) Treino do Diário ( ) Simulado TAF"** (ou quando o usuário selecionar Teste TAF).
- [x] **9.2** Recorte da janela de 12 min (`lib/activityParser/window.ts`) sobre `recordMesgs` do `.FIT` ou trackpoints do `.GPX`, gerando `distanceMeters`, `speedKmh`, `paceSeconds`, FC média/máx e voltas de 400 m (`laps`).
- [x] **9.3–9.10 [PQ9]** Gravação em `POST /api/taf/attempts` com `source: "fit_upload" | "gpx_upload"`, `externalId`, checagem cruzada de duplicidade e exibição no `TafAttemptCard`.

---

### 🔹 Fase 10 — Backup, exportações, segurança e documentação
- [x] **10.1** `exportBackupJson` → `version: 3` (suportando `fit_upload` e `gpx_upload`); `importBackupJson` retrocompatível e tolerante a `externalId` já existente.
- [x] **10.2** `exportTrainingsCsv` e `exportAttemptsCsv`: novas colunas mantendo as antigas na mesma ordem.
- [x] **10.3–10.6 [PQ10]** Testes de segurança, performance e atualização do `README.md` / roadmap.

---

### 🔹 Fase 11 — Homologação final e entrega (✅ Concluída)
- [x] **11.1–11.5 [PQ11]** Quality Gate final (`tsc`, `lint`, `vitest`, `coverage >= 90%`, `prisma validate`, `next build`), ensaio ponta a ponta, deploy de migrations no Supabase e entrega.

---

## 5. 📊 Resumo das Fases Atualizado

| Fase | Entrega | Status / Marco |
|---|---|---|
| 0 | Branch, Postgres local, backup | ✅ Concluída (`PQ0`) |
| 1 | Schema + migration inicial ensaiada | ✅ Concluída (`PQ1`) |
| 2 | Tipos, Zod, labels, `ActivityType` propagado | ✅ Concluída (`PQ2`) |
| 3 | API de treinos/simulados + 409 + Swagger | ✅ Concluída (`PQ3`) |
| 4 | `gpxParserService` (TDD — Fallback/Complemento) | ✅ Concluída (`PQ4`) |
| 5 | Ferramentas CLI exclusivas de `.GPX` | ⏭️ **PULADA (SKIP)** |
| **5B** | **Motor Prioritário `.FIT` (`@garmin/fitsdk`) + Mesclagem `.FIT` + `.GPX` + `fit_upload`** | ✅ **Concluída (`PQ5B`)** |
| 6 | Endpoint unificado `POST /api/training-sessions/parse-activity` (`.FIT` / `.GPX`) | ✅ **Concluída (`PQ6`)** |
| 7 | Upload `.FIT`+`.GPX`, Painel Somente Leitura e Formulário Pós-Upload Inteligente | ✅ **Concluída (`PQ7`) — Marco M2** |
| 8 | Análise e visualização de splits (`SplitsTable`, `SplitsPaceChart`, `SplitsInsights`) | ✅ **Concluída (`PQ8`) — Marco M3** |
| 9 | Importar `.FIT` / `.GPX` como Simulado TAF (`TafAttempt` — janela de 12 min) | ✅ **Concluída (`PQ9`)** |
| 10 | Backup v3, CSV, segurança, documentação | ✅ **Concluída (`PQ10`)** |
| 11 | Homologação final, migration em produção, entrega | ✅ **Concluída (`PQ11`) — Entregue** |
