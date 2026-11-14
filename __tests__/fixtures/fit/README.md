# Suíte de Testes e Inspeção Manual de Arquivos `.FIT` (PaceLab)

Este diretório contém fixtures determinísticas e a pasta dedicada para validar manualmente arquivos `.FIT` reais exportados do Strava ou de relógios GPS (Garmin, Coros, Polar, Amazfit, Suunto, Apple Watch via Strava).

---

## Como baixar arquivos `.FIT` REAIS do Strava

1. Abra o **Strava Web** (`https://www.strava.com`) no navegador do computador (o app mobile não oferece download do original).
2. Entre na atividade de corrida/caminhada que você deseja testar.
3. Clique no ícone **`...` (Mais)** ao lado do botão de editar e clique em **"Exportar Original"** (*Export Original*).
   - **Atalho direto na URL:** adicione `/export_original` ao final do link da atividade:
     `https://www.strava.com/activities/SEU_ID_AQUI/export_original`
4. Se o navegador baixar um `.fit.gz`, descompacte antes de testar (no Linux: `gzip -d arquivo.fit.gz`).
   > **Observação:** treinos gravados direto no app do celular no Strava geralmente vêm como `.gpx` em "Exportar Original". Já treinos sincronizados de relógios esportivos (Garmin, Coros, Polar, etc.) baixam o **`.fit` original completo**.

---

## Como testar manualmente via CLI

### 1. Inspecionar qualquer `.fit` avulso (sem mover de pasta)

```bash
npm run fit:inspect -- "/caminho/para/sua_corrida.fit" --splits --taf --debug
```

### 2. Testar mesclagem `.FIT + .GPX` da mesma atividade

```bash
npm run fit:inspect -- "/caminho/para/treino.fit" --gpx "/caminho/para/treino.gpx" --splits --taf --debug
```

### 3. Comparar com os números exibidos na tela do Strava

```bash
npm run fit:inspect -- "/caminho/para/treino.fit" \
  --splits \
  --strava-dist 5.02 \
  --strava-time 25:10 \
  --strava-elapsed 25:45 \
  --strava-hr 162 \
  --strava-cad 174 \
  --strava-elev 42 \
  --strava-cal 385
```

### 4. Suíte fixa para arquivos reais em `strava-real/`

1. Copie seus arquivos `.fit` reais para `__tests__/fixtures/fit/strava-real/`.
2. (Opcional) Para testar mesclagem automática, salve o `.gpx` correspondente com o **mesmo nome base** (ex.: `prova_10k.fit` e `prova_10k.gpx`).
3. (Opcional) Copie `strava-real/strava-reference.example.json` para `strava-real/strava-reference.json` com os valores vistos no Strava.
4. Execute:

```bash
npm run fit:test:real
```

---

## Catálogo das Fixtures `.FIT` Sintéticas (geradas por `npm run fit:gen-fixtures`)

Execute `npm run fit:test:synthetic` para validar todos os cenários abaixo (+ 1 teste de mesclagem `.FIT + .GPX`):

| Arquivo | Cenário |
|---|---|
| `fit_run_5k_autolap.fit` | 5.000 m @ 5:00/km, 5 auto-laps de 1 km, pausa 20s, GPS, FC 160/175, cad 86 -> 172 spm, D+ 35 m, 390 kcal |
| `fit_run_5420m_records.fit` | 5.420 m sem auto-lap (1 lap global) -> força splits km-a-km via `recordMesgs` + residual `0,420 km` |
| `fit_run_treadmill_indoor.fit` | Esteira (`subSport=treadmill`) sem GPS -> `isIndoor=true` e warning `INDOOR_ACTIVITY_NO_GPS` |
| `fit_run_intervalado_pista.fit` | Intervalado 5x400m + aquecimento/desaquecimento (12 laps reais, melhor janela TAF 12 min) |
| `fit_walk_3k.fit` | Caminhada 3 km @ 10:00/km (`sourceActivityKind='walk'`) |
| `fit_run_zero_ascent_merge.fit` | Corrida com `totalAscent=0` e sem nome para validar mesclagem com `run_elevation_staircase.gpx` |
| `fit_run_no_sensors.fit` | Corrida sem FC, sem cadência e sem elevação (`NO_HEART_RATE_DATA`, `NO_CADENCE_DATA`, `NO_ELEVATION_DATA`) |
| `fit_cycling_unsupported.fit` | Ciclismo (`sport=cycling`) -> rejeitado com `UNSUPPORTED_ACTIVITY` |
| `fit_zero_distance.fit` | Distância zero (`totalDistance=0`) -> rejeitado com `ZERO_DISTANCE` |
| `fit_corrupted.fit` | Binário `.FIT` truncado/inválido -> rejeitado com `INVALID_FIT` |

Para gerar um arquivo `.FIT` customizado sob medida:

```bash
node scripts/gen-fit-fixture.mjs --distance 10000 --pace 4:45 --laps 10 --hr 168 --out /tmp/meu_10k.fit
```
