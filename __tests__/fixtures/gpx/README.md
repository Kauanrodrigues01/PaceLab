# Fixtures `.GPX` e Ferramentas de Validação Manual (Marco M1 — Fase 5)

Este diretório contém as **2 baterias de arquivos `.GPX`** usadas tanto nos testes automatizados (`__tests__/lib/gpx/*.test.ts`) quanto na validação manual via CLI (`scripts/gpx-inspect.mjs`).

---

## 🚀 Como Executar os 2 Tipos de Teste

### 1. Teste Tipo 1 — Bateria com `.GPX` Sintéticos (Gabarito Matemático Exato)
```bash
npm run gpx:test:synthetic
```
Executa todas as **20 fixtures sintéticas** listadas abaixo e compara automaticamente o **Gabarito Matemático Esperado** com o **Valor Calculado pelo Parser do PaceLab**.

### 2. Teste Tipo 2 — Bateria com `.GPX` Reais do Strava (Inspeção Visual + Tolerâncias M1)
```bash
npm run gpx:test:real
```
Varre todos os arquivos `.gpx` dentro de `__tests__/fixtures/gpx/strava-real/`, exibindo:
- Metadados (`<trk><name>`, `<trk><type>` cru, família detectada, `externalId`);
- Métricas de movimento vs. tempo decorrido (`elapsed`), pace, velocidade, FC média/máx, cadência convertida (`spm`), ganho de elevação (`D+`) e temperatura;
- Tabela de parciais km a km (`Splits`) com pace, velocidade, FC e desnível;
- Diagnóstico interno (`--debug`: `<trkseg>`, pares em movimento/parados/descartados);
- Quadro comparativo **`Tela Strava vs PaceLab GPX`** verificando as tolerâncias oficiais do Marco M1 (`±1%` distância, `±2%` tempo em movimento, `±2s` tempo decorrido, `±2 bpm` FC, `±2 spm` cadência, `±10%` elevação).

> 💡 **Para testar seus próprios arquivos exportados do Strava:**
> Basta copiar seus arquivos `.gpx` para `__tests__/fixtures/gpx/strava-real/` e rodar `npm run gpx:test:real`, ou inspecionar qualquer arquivo diretamente:
> ```bash
> npm run gpx:inspect -- /caminho/do/seu_treino.gpx --splits --debug
> npm run gpx:inspect -- /caminho/do/seu_treino.gpx --splits --debug --strava-dist 5.02 --strava-time 25:10 --strava-hr 164 --strava-cad 172 --strava-elev 30
> ```

---

## 📋 Catálogo do Teste Tipo 1 — Fixtures Sintéticas (`__tests__/fixtures/gpx/*.gpx`)

Geradas deterministicamente por `npm run gpx:gen-fixtures` (`scripts/gen-gpx-fixture.mjs`):

| Arquivo | Construção | Resultado Esperado |
|---|---|---|
| `run_5k_even.gpx` | 5.000 m, 3,333 m/s (5:00/km), 1 Hz, FC 150, cad 85 | `5,000 km` · mov `1500 s` · elap `1500 s` · pace `5:00` · `12,00 km/h` · FC `150/150` · cad `170 spm` · 5 splits de `300 s (5:00)` |
| `run_two_segments_pause.gpx` | 2 `<trkseg>` de 2.000 m (600 s cada); pausa de 120 s e salto de 500 m entre eles | `4,000 km` (salto entre segmentos ignorado) · mov `1200 s` · elap `1320 s` · pace `5:00` |
| `run_stationary_inside_segment.gpx` | 5.000 m + 60 s parado na mesma coordenada dentro do mesmo `<trkseg>` | `5,000 km` · mov `1500 s` · elap `1560 s` · pace `5:00` |
| `run_5420m_residual.gpx` | 5.420 m a 5:00/km | `5,420 km` · mov `1626 s` · 5 splits de `300 s` + residual `#6` (`0,420 km` / `126 s` / `5:00`) |
| `run_no_ele_no_hr.gpx` | 3.000 m sem `<ele>` e sem `<extensions>` | `3,000 km` · `elevationGainM = null` · `avgHeartRate = null` · `avgCadence = null` · sem erro |
| `run_hr_cad_half.gpx` | `gpxtpx:cad` = 85 (< 130) | `avgCadence = 170 spm` (dobrado) + warning `CADENCE_DOUBLED` |
| `run_hr_cad_full.gpx` | `gpxtpx:cad` = 170 (≥ 130) | `avgCadence = 170 spm` (não dobra) |
| `run_no_prefix_namespace.gpx` | `<hr>162</hr>` e `<cad>88</cad>` sem prefixo `gpxtpx:` | `avgHeartRate = 162 bpm` · `avgCadence = 176 spm` |
| `run_elevation_staircase.gpx` | Subida constante de +10 m em 5 km | `elevationGainM ≈ +10,0 m` (±1 m) |
| `run_elevation_noise_flat.gpx` | Plano com ruído vertical ±0,4 m (< histerese de 1,0 m) | `elevationGainM = 0 m` |
| `run_gps_spike.gpx` | 1 ponto "teletransportado" +500 m em 0,5 s (`v > 12 m/s`) | `2,000 km` · 1 spike descartado + warning `GPS_SPIKE_SKIPPED` |
| `run_duplicate_timestamps.gpx` | 2 pontos consecutivos com mesmo `<time>` ($\Delta t = 0$) | `2,000 km` · 1 par descartado + warning `NON_POSITIVE_DELTA_TIME_SKIPPED` |
| `type_run_variants.gpx` | `<type>9</type>` (código numérico Strava para corrida) | `rawType = "9"` · `sourceActivityKind = "run"` |
| `type_walk_variants.gpx` | `<type>walking</type>` a 10:00/km | `rawType = "walking"` · `sourceActivityKind = "walk"` · pace `10:00` |
| `type_unknown.gpx` | Sem tag `<type>` | `rawType = null` · `sourceActivityKind = "unknown"` + warning `UNKNOWN_ACTIVITY_TYPE` |
| `ride_type.gpx` | `<type>cycling</type>` | Lança `GpxParseError` com `code = "UNSUPPORTED_ACTIVITY"` |
| `swim_type.gpx` | `<type>swimming</type>` | Lança `GpxParseError` com `code = "UNSUPPORTED_ACTIVITY"` |
| `invalid_xml.gpx` | XML malformado | Lança `GpxParseError` com `code = "INVALID_XML"` |
| `no_trkpt.gpx` | `<trkseg>` vazio | Lança `GpxParseError` com `code = "NO_TRACKPOINTS"` |
| `no_time.gpx` | `<trkpt>` sem `<time>` | Lança `GpxParseError` com `code = "NO_TIMESTAMPS"` |

---

## 📋 Catálogo do Teste Tipo 2 — Arquivos Reais do Strava (`__tests__/fixtures/gpx/strava-real/*.gpx`)

| Arquivo | Cenário Real Exportado do Strava | Valores na Tela do Strava vs PaceLab |
|---|---|---|
| `Voltando.gpx` | **Caminhada + Trote `"Voltando"` (`<type>walking</type>`, 1.163 trackpoints 1 Hz)** | **Distância:** `1,87 km` (`1,877 km` em 3 casas) · **Tempo Mov.:** `19:48` (`1188 s`) · **Elapsed:** `20:06` (`1206 s`) · **Pace Médio:** `10:33 /km` · **Elevação:** `+3 m` · **Split Km 1:** `13:24 /km` (`804 s`) · **Split Km 2 (res. 0,877 km):** `7:18 /km` (`6:24` de duração da parcial). |
