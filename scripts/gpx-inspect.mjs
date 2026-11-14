#!/usr/bin/env node
/**
 * CLI de Inspeção e Validação Manual do Parser GPX (Fase 5 — Marco M1)
 *
 * Modos de uso:
 *   1. Bateria de Teste 1 (.GPX Sintéticos — Gabarito Matemático):
 *      npm run gpx:test:synthetic
 *
 *   2. Bateria de Teste 2 (.GPX Reais do Strava — Inspeção Completa + Tolerâncias M1):
 *      npm run gpx:test:real
 *
 *   3. Inspeção de arquivo ou pasta específica:
 *      npm run gpx:inspect -- <arquivo_ou_pasta.gpx> [--splits] [--debug] [--json]
 *      npm run gpx:inspect -- <arquivo.gpx> --splits --debug --strava-dist 5.24 --strava-time 25:46 --strava-hr 165 --strava-cad 175 --strava-elev 26
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGpx } from "../lib/gpx/parseGpx.ts";
import { isGpxParseError } from "../lib/gpx/types.ts";
import { formatPaceSeconds } from "../lib/gpx/metrics.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES_DIR = path.join(REPO_ROOT, "__tests__", "fixtures", "gpx");
const REAL_STRAVA_DIR = path.join(FIXTURES_DIR, "strava-real");

function formatDurationHms(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) {
    return "—";
  }
  const sec = Math.max(0, Math.round(Number(totalSeconds)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} (${sec}s)`;
  }
  return `${m}:${String(s).padStart(2, "0")} (${sec}s)`;
}

function parseTimeArgToSeconds(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  const parts = s.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function padRight(str, width) {
  const s = String(str ?? "");
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(str, width) {
  const s = String(str ?? "");
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function printSeparator(char = "─", width = 104) {
  console.log(char.repeat(width));
}

function printActivityReport(filePath, parsed, options = {}) {
  const { showSplits = false, showDebug = false, stravaRef = null, scenarioTitle = null } = options;
  const fileName = path.basename(filePath);

  console.log("");
  printSeparator("═");
  if (scenarioTitle) {
    console.log(`🏃 ${scenarioTitle}`);
  }
  console.log(`📄 Arquivo: ${fileName}`);
  printSeparator("═");

  const familyLabel =
    parsed.sourceActivityKind === "run"
      ? "Corrida (permite: corrida_continua, rodagem_leve, tempo_run, corrida_intervalada, longao)"
      : parsed.sourceActivityKind === "walk"
        ? "Caminhada (permite apenas: caminhada)"
        : "Desconhecida (exige escolha manual do usuário)";

  const stravaTruncKm = (Math.floor(parsed.distanceKm * 100) / 100)
    .toFixed(2)
    .replace(".", ",");

  const summaryRows = [
    ["Título (<trk><name>)", parsed.name ?? "—"],
    ["Tag <trk><type> crua (rawType)", parsed.rawType !== null ? `"${parsed.rawType}"` : "(ausente)"],
    ["Família detectada (D5)", familyLabel],
    ["Início (1º trkpt UTC)", parsed.startedAt],
    ["Distância Total", `${parsed.distanceKm.toFixed(3)} km (exibição Strava 2 casas: ${stravaTruncKm} km)`],
    ["Tempo em Movimento", formatDurationHms(parsed.durationSeconds)],
    ["Tempo Decorrido (Elapsed)", formatDurationHms(parsed.elapsedSeconds)],
    ["Pace Médio (em movimento)", `${parsed.paceFormatted} /km (${parsed.paceSeconds}s/km)`],
    ["Velocidade Média", `${parsed.speedKmh.toFixed(2)} km/h`],
    [
      "Frequência Cardíaca (Méd / Máx)",
      parsed.avgHeartRate !== null
        ? `${parsed.avgHeartRate} bpm / ${parsed.maxHeartRate ?? "—"} bpm`
        : "— (sem sensor)",
    ],
    [
      "Cadência Média (spm totais)",
      parsed.avgCadence !== null ? `${parsed.avgCadence} spm` : "— (sem sensor)",
    ],
    [
      "Ganho de Elevação (D+)",
      parsed.elevationGainM !== null ? `+${Math.round(parsed.elevationGainM)} m` : "— (sem <ele>)",
    ],
    [
      "Temperatura Média",
      parsed.avgTemperatureC !== null ? `${parsed.avgTemperatureC.toFixed(1)} °C` : "—",
    ],
    ["Pontos Válidos / Segmentos", `${parsed.pointCount} pontos em ${parsed.debug.segmentCount} <trkseg>`],
    ["Hash Anti-Duplicação (externalId)", parsed.externalId],
  ];

  for (const [label, value] of summaryRows) {
    console.log(`  ${padRight(label + ":", 35)} ${value}`);
  }

  if (showSplits && parsed.splits.length > 0) {
    console.log("");
    console.log("  📊 PARCIAIS POR QUILÔMETRO (SPLITS — Mesma ordem visual do Strava: Pace primeiro):");
    printSeparator("─", 92);
    console.log(
      `  ${padRight("Km", 10)} | ${padRight("Pace (/km)", 11)} | ${padRight("Tempo Parcial", 14)} | ${padRight("Distância", 11)} | ${padRight("Velocidade", 11)} | ${padRight("FC Méd", 9)} | ${padRight("Desnível", 9)}`
    );
    printSeparator("─", 92);

    for (const sp of parsed.splits) {
      const isResidual = sp.distanceKm < 0.999;
      const kmLabel = isResidual ? `#${sp.kilometer} (res.)` : `Km ${sp.kilometer}`;
      const distStr = `${sp.distanceKm.toFixed(3)} km`;
      const timeStr = `${Math.floor(sp.durationSeconds / 60)}:${String(sp.durationSeconds % 60).padStart(2, "0")} (${sp.durationSeconds}s)`;
      const paceStr = `${sp.paceFormatted} /km`;
      const speedKmh =
        sp.durationSeconds > 0
          ? `${((sp.distanceKm / (sp.durationSeconds / 3600))).toFixed(2)} km/h`
          : "—";
      const hrStr = sp.avgHeartRate !== null && sp.avgHeartRate !== undefined ? `${sp.avgHeartRate} bpm` : "—";
      const eleStr =
        sp.elevationDiffM !== null && sp.elevationDiffM !== undefined
          ? `${sp.elevationDiffM > 0 ? "+" : ""}${sp.elevationDiffM} m`
          : "—";

      console.log(
        `  ${padRight(kmLabel, 10)} | ${padRight(paceStr, 11)} | ${padRight(timeStr, 14)} | ${padRight(distStr, 11)} | ${padRight(speedKmh, 11)} | ${padRight(hrStr, 9)} | ${padRight(eleStr, 9)}`
      );
    }
    printSeparator("─", 92);
  }

  if (parsed.warnings.length > 0) {
    console.log("");
    console.log("  ⚠️  AVISOS DO PARSER (WARNINGS):");
    for (const w of parsed.warnings) {
      console.log(`    • [${w.code}] ${w.message}`);
    }
  }

  if (showDebug) {
    console.log("");
    console.log("  🔍 DIAGNÓSTICO INTERNO (--debug):");
    console.log(
      `    • Segmentos (<trkseg>):          ${parsed.debug.segmentCount}`
    );
    console.log(
      `    • Trackpoints brutos / válidos:  ${parsed.debug.rawTrackPointCount} brutos / ${parsed.debug.validTrackPointCount} válidos`
    );
    console.log(
      `    • Pares avaliados nos segmentos: ${parsed.debug.totalPairsEvaluated}`
    );
    console.log(
      `    • Pares em movimento (>= v_min): ${parsed.debug.movingPairsCount}`
    );
    console.log(
      `    • Pares parados (< v_min):       ${parsed.debug.stationaryPairsCount}`
    );
    console.log(
      `    • Descartados por Δt <= 0:       ${parsed.debug.discardedNonPositiveDeltaCount}`
    );
    console.log(
      `    • Descartados por Spike GPS:     ${parsed.debug.discardedSpikeCount}`
    );
  }

  if (stravaRef) {
    console.log("");
    console.log("  ⚖️  CONFERÊNCIA STRAVA vs PACELAB (TOLERÂNCIAS MARCO M1):");
    printSeparator("─", 102);
    console.log(
      `  ${padRight("Métrica", 26)} | ${padRight("Tela Strava", 17)} | ${padRight("PaceLab GPX", 17)} | ${padRight("Desvio", 14)} | ${padRight("Tolerância", 11)} | Status`
    );
    printSeparator("─", 102);

    const checks = [];

    if (stravaRef.distanceKm !== undefined && stravaRef.distanceKm !== null) {
      const diffPct = Math.abs((parsed.distanceKm - stravaRef.distanceKm) / stravaRef.distanceKm) * 100;
      const ok = diffPct <= 1.0;
      const parsedStrava2Dec = (Math.floor(parsed.distanceKm * 100) / 100).toFixed(2);
      checks.push([
        "Distância (km)",
        `${stravaRef.distanceKm.toFixed(2)} km`,
        `${parsedStrava2Dec} (${parsed.distanceKm.toFixed(3)})`,
        `${diffPct.toFixed(2)}%`,
        "±1,0%",
        ok ? "✅ OK" : "❌ FORA",
      ]);
    }

    if (stravaRef.movingSeconds !== undefined && stravaRef.movingSeconds !== null) {
      const diffSec = Math.abs(parsed.durationSeconds - stravaRef.movingSeconds);
      const diffPct = (diffSec / stravaRef.movingSeconds) * 100;
      const ok = diffPct <= 2.0 || diffSec <= 5;
      checks.push([
        "Tempo em Movimento",
        formatPaceSeconds(stravaRef.movingSeconds) + ` (${stravaRef.movingSeconds}s)`,
        formatPaceSeconds(parsed.durationSeconds) + ` (${parsed.durationSeconds}s)`,
        `${diffSec}s (${diffPct.toFixed(2)}%)`,
        "±2,0%",
        ok ? "✅ OK" : "❌ FORA",
      ]);
    }

    if (stravaRef.elapsedSeconds !== undefined && stravaRef.elapsedSeconds !== null) {
      const diffSec = Math.abs(parsed.elapsedSeconds - stravaRef.elapsedSeconds);
      const ok = diffSec <= 2;
      checks.push([
        "Tempo Decorrido",
        `${formatPaceSeconds(stravaRef.elapsedSeconds)} (${stravaRef.elapsedSeconds}s)`,
        `${formatPaceSeconds(parsed.elapsedSeconds)} (${parsed.elapsedSeconds}s)`,
        `${diffSec}s`,
        "±2s",
        ok ? "✅ OK" : "❌ FORA",
      ]);
    }

    if (stravaRef.paceSeconds !== undefined && stravaRef.paceSeconds !== null) {
      const diffSec = Math.abs(parsed.paceSeconds - stravaRef.paceSeconds);
      const diffPct = (diffSec / stravaRef.paceSeconds) * 100;
      const ok = diffPct <= 2.0 || diffSec <= 5;
      checks.push([
        "Pace Médio (/km)",
        `${stravaRef.paceFormatted ?? formatPaceSeconds(stravaRef.paceSeconds)} /km`,
        `${parsed.paceFormatted} /km`,
        `${diffSec}s/km`,
        "±2,0%",
        ok ? "✅ OK" : "❌ FORA",
      ]);
    }

    if (stravaRef.avgHeartRate !== undefined) {
      if (stravaRef.avgHeartRate === null) {
        const ok = parsed.avgHeartRate === null;
        checks.push(["FC Média (bpm)", "—", parsed.avgHeartRate ?? "—", "0 bpm", "±2 bpm", ok ? "✅ OK" : "❌ FORA"]);
      } else {
        const diffBpm = Math.abs((parsed.avgHeartRate ?? 0) - stravaRef.avgHeartRate);
        const ok = parsed.avgHeartRate !== null && diffBpm <= 2;
        checks.push([
          "FC Média (bpm)",
          `${stravaRef.avgHeartRate} bpm`,
          `${parsed.avgHeartRate ?? "—"} bpm`,
          `${diffBpm} bpm`,
          "±2 bpm",
          ok ? "✅ OK" : "❌ FORA",
        ]);
      }
    }

    if (stravaRef.avgCadence !== undefined) {
      if (stravaRef.avgCadence === null) {
        const ok = parsed.avgCadence === null;
        checks.push(["Cadência Média (spm)", "—", parsed.avgCadence ?? "—", "0 spm", "±2 spm", ok ? "✅ OK" : "❌ FORA"]);
      } else {
        const diffSpm = Math.abs((parsed.avgCadence ?? 0) - stravaRef.avgCadence);
        const ok = parsed.avgCadence !== null && diffSpm <= 2;
        checks.push([
          "Cadência Média (spm)",
          `${stravaRef.avgCadence} spm`,
          `${parsed.avgCadence ?? "—"} spm`,
          `${diffSpm} spm`,
          "±2 spm",
          ok ? "✅ OK" : "❌ FORA",
        ]);
      }
    }

    if (stravaRef.elevationGainM !== undefined && stravaRef.elevationGainM !== null) {
      const actualEle = parsed.elevationGainM ?? 0;
      const diffM = Math.abs(actualEle - stravaRef.elevationGainM);
      const diffPct = stravaRef.elevationGainM > 0 ? (diffM / stravaRef.elevationGainM) * 100 : diffM * 100;
      const ok = stravaRef.elevationGainM === 0 ? diffM <= 1.0 : diffPct <= 10.0 || diffM <= 2.0;
      checks.push([
        "Ganho Elevação (m)",
        `+${Math.round(stravaRef.elevationGainM)} m`,
        `+${Math.round(actualEle)} m`,
        `${diffM.toFixed(0)} m`,
        "±10% / ±2m",
        ok ? "✅ OK" : "❌ FORA",
      ]);
    }

    if (Array.isArray(stravaRef.splits)) {
      for (const refSp of stravaRef.splits) {
        const actualSp = parsed.splits.find((s) => s.kilometer === refSp.kilometer);
        if (actualSp && refSp.paceSeconds !== undefined) {
          const diffSec = Math.abs(actualSp.paceSeconds - refSp.paceSeconds);
          const ok = diffSec <= 3;
          const isRes = actualSp.distanceKm < 0.999;
          checks.push([
            `Parcial Km ${refSp.kilometer}${isRes ? " (res.)" : ""} Pace`,
            `${refSp.paceFormatted} /km`,
            `${actualSp.paceFormatted} /km`,
            `${diffSec}s/km`,
            "±3s/km",
            ok ? "✅ OK" : "❌ FORA",
          ]);
        }
      }
    }

    for (const [m, sVal, pVal, dev, tol, st] of checks) {
      console.log(
        `  ${padRight(m, 26)} | ${padRight(sVal, 17)} | ${padRight(pVal, 17)} | ${padRight(dev, 14)} | ${padRight(tol, 11)} | ${st}`
      );
    }
    printSeparator("─", 102);
  }
}

function runSyntheticSuite() {
  console.log("");
  printSeparator("═", 112);
  console.log("🧪 TESTE TIPO 1 — BATERIA COMPLETA DE .GPX SINTÉTICOS (GABARITO MATEMÁTICO EXATO — SEÇÃO 6.2)");
  printSeparator("═", 112);

  const syntheticCases = [
    {
      file: "run_5k_even.gpx",
      desc: "5.000m @ 5:00/km (1 Hz), FC 150, cad 85",
      expectedSummary: "5,000 km | mov 1500s | elap 1500s | 5:00/km | FC 150 | cad 170 | 5 splits",
      verify: (r) => {
        const ok =
          r.distanceKm === 5 &&
          r.durationSeconds === 1500 &&
          r.elapsedSeconds === 1500 &&
          r.paceFormatted === "5:00" &&
          r.speedKmh === 12 &&
          r.avgHeartRate === 150 &&
          r.avgCadence === 170 &&
          r.splits.length === 5;
        return {
          ok,
          actual: `${r.distanceKm.toFixed(3)} km | mov ${r.durationSeconds}s | elap ${r.elapsedSeconds}s | ${r.paceFormatted}/km | FC ${r.avgHeartRate} | cad ${r.avgCadence} | ${r.splits.length} splits`,
        };
      },
    },
    {
      file: "run_two_segments_pause.gpx",
      desc: "2 trkseg de 2.000m + pausa 120s + salto 500m",
      expectedSummary: "4,000 km (salto ignorado) | mov 1200s | elap 1320s | pace 5:00",
      verify: (r) => ({
        ok:
          r.distanceKm === 4 &&
          r.durationSeconds === 1200 &&
          r.elapsedSeconds === 1320 &&
          r.paceFormatted === "5:00",
        actual: `${r.distanceKm.toFixed(3)} km | mov ${r.durationSeconds}s | elap ${r.elapsedSeconds}s | pace ${r.paceFormatted}`,
      }),
    },
    {
      file: "run_stationary_inside_segment.gpx",
      desc: "5.000m + 60s parado no mesmo trkseg",
      expectedSummary: "5,000 km | mov 1500s | elap 1560s | pace 5:00",
      verify: (r) => ({
        ok:
          r.distanceKm === 5 &&
          r.durationSeconds === 1500 &&
          r.elapsedSeconds === 1560 &&
          r.paceFormatted === "5:00",
        actual: `${r.distanceKm.toFixed(3)} km | mov ${r.durationSeconds}s | elap ${r.elapsedSeconds}s | pace ${r.paceFormatted}`,
      }),
    },
    {
      file: "run_5420m_residual.gpx",
      desc: "5.420m @ 5:00/km (parcial residual 0,420 km)",
      expectedSummary: "5,420 km | mov 1626s | 5 splits 1km + #6 (0,420 km / 126s / 5:00)",
      verify: (r) => {
        const last = r.splits[5];
        const ok =
          r.distanceKm === 5.42 &&
          r.durationSeconds === 1626 &&
          r.splits.length === 6 &&
          last?.distanceKm === 0.42 &&
          last?.durationSeconds === 126 &&
          last?.paceFormatted === "5:00";
        return {
          ok,
          actual: `${r.distanceKm.toFixed(3)} km | mov ${r.durationSeconds}s | 5 splits 1km + #6 (${last?.distanceKm.toFixed(3)} km / ${last?.durationSeconds}s / ${last?.paceFormatted})`,
        };
      },
    },
    {
      file: "run_no_ele_no_hr.gpx",
      desc: "Sem <ele> e sem extensões (<hr>/<cad>)",
      expectedSummary: "3,000 km | ele=null | FC=null | cad=null | sem erro",
      verify: (r) => ({
        ok:
          r.distanceKm === 3 &&
          r.elevationGainM === null &&
          r.avgHeartRate === null &&
          r.avgCadence === null,
        actual: `${r.distanceKm.toFixed(3)} km | ele=${r.elevationGainM} | FC=${r.avgHeartRate} | cad=${r.avgCadence}`,
      }),
    },
    {
      file: "run_hr_cad_half.gpx",
      desc: "Cadência de 1 pé (cad=85 < 130 => ×2)",
      expectedSummary: "avgCadence = 170 spm (dobrado) + warning CADENCE_DOUBLED",
      verify: (r) => ({
        ok: r.avgCadence === 170 && r.warnings.some((w) => w.code === "CADENCE_DOUBLED"),
        actual: `avgCadence = ${r.avgCadence} spm | warning=${r.warnings.some((w) => w.code === "CADENCE_DOUBLED")}`,
      }),
    },
    {
      file: "run_hr_cad_full.gpx",
      desc: "Cadência total (cad=170 >= 130 => mantém)",
      expectedSummary: "avgCadence = 170 spm (não dobra)",
      verify: (r) => ({
        ok: r.avgCadence === 170 && !r.warnings.some((w) => w.code === "CADENCE_DOUBLED"),
        actual: `avgCadence = ${r.avgCadence} spm | warning=${r.warnings.some((w) => w.code === "CADENCE_DOUBLED")}`,
      }),
    },
    {
      file: "run_no_prefix_namespace.gpx",
      desc: "Tags <hr>162</hr> e <cad>88</cad> sem prefixo",
      expectedSummary: "FC = 162 bpm | Cadência = 176 spm",
      verify: (r) => ({
        ok: r.avgHeartRate === 162 && r.avgCadence === 176,
        actual: `FC = ${r.avgHeartRate} bpm | Cadência = ${r.avgCadence} spm`,
      }),
    },
    {
      file: "run_elevation_staircase.gpx",
      desc: "Subida constante de +10m em 5km",
      expectedSummary: "Ganho de elevação ≈ +10,0 m (±1 m)",
      verify: (r) => ({
        ok: r.elevationGainM !== null && r.elevationGainM >= 9 && r.elevationGainM <= 11,
        actual: `Ganho de elevação = +${r.elevationGainM?.toFixed(1)} m`,
      }),
    },
    {
      file: "run_elevation_noise_flat.gpx",
      desc: "Plano com ruído vertical ±0,4m (< histerese 1m)",
      expectedSummary: "Ganho de elevação = 0 m",
      verify: (r) => ({
        ok: r.elevationGainM === 0,
        actual: `Ganho de elevação = ${r.elevationGainM} m`,
      }),
    },
    {
      file: "run_gps_spike.gpx",
      desc: "1 ponto teletransportado +500m em 0,5s (> 12m/s)",
      expectedSummary: "2,000 km | spike descartado (1) | distância não infla",
      verify: (r) => ({
        ok: r.distanceKm === 2 && r.debug.discardedSpikeCount === 1,
        actual: `${r.distanceKm.toFixed(3)} km | spikes descartados = ${r.debug.discardedSpikeCount}`,
      }),
    },
    {
      file: "run_duplicate_timestamps.gpx",
      desc: "Dois pontos consecutivos com mesmo <time>",
      expectedSummary: "2,000 km | Δt<=0 descartado (1) | sem NaN/Infinity",
      verify: (r) => ({
        ok: r.distanceKm === 2 && r.debug.discardedNonPositiveDeltaCount === 1,
        actual: `${r.distanceKm.toFixed(3)} km | Δt<=0 descartados = ${r.debug.discardedNonPositiveDeltaCount}`,
      }),
    },
    {
      file: "type_run_variants.gpx",
      desc: "<type>9</type> (código numérico Strava Run)",
      expectedSummary: "rawType='9' => sourceActivityKind='run'",
      verify: (r) => ({
        ok: r.rawType === "9" && r.sourceActivityKind === "run",
        actual: `rawType='${r.rawType}' => sourceActivityKind='${r.sourceActivityKind}'`,
      }),
    },
    {
      file: "type_walk_variants.gpx",
      desc: "<type>walking</type> @ 10:00/km",
      expectedSummary: "rawType='walking' => sourceActivityKind='walk' | pace 10:00",
      verify: (r) => ({
        ok: r.rawType === "walking" && r.sourceActivityKind === "walk" && r.paceFormatted === "10:00",
        actual: `rawType='${r.rawType}' => sourceActivityKind='${r.sourceActivityKind}' | pace ${r.paceFormatted}`,
      }),
    },
    {
      file: "type_unknown.gpx",
      desc: "<type> ausente em corrida válida",
      expectedSummary: "sourceActivityKind='unknown' + warning UNKNOWN_ACTIVITY_TYPE",
      verify: (r) => ({
        ok:
          r.sourceActivityKind === "unknown" &&
          r.warnings.some((w) => w.code === "UNKNOWN_ACTIVITY_TYPE"),
        actual: `sourceActivityKind='${r.sourceActivityKind}' | warning=${r.warnings.some((w) => w.code === "UNKNOWN_ACTIVITY_TYPE")}`,
      }),
    },
    {
      file: "ride_type.gpx",
      desc: "<type>cycling</type> (ciclismo recusado — D5)",
      expectedError: "UNSUPPORTED_ACTIVITY",
    },
    {
      file: "swim_type.gpx",
      desc: "<type>swimming</type> (natação recusada — D5)",
      expectedError: "UNSUPPORTED_ACTIVITY",
    },
    {
      file: "invalid_xml.gpx",
      desc: "XML malformado (tags não fechadas)",
      expectedError: "INVALID_XML",
    },
    {
      file: "no_trkpt.gpx",
      desc: "<trkseg> vazio sem <trkpt>",
      expectedError: "NO_TRACKPOINTS",
    },
    {
      file: "no_time.gpx",
      desc: "<trkpt> sem tags <time>",
      expectedError: "NO_TIMESTAMPS",
    },
  ];

  let passedCount = 0;

  for (const item of syntheticCases) {
    const fullPath = path.join(FIXTURES_DIR, item.file);
    const xml = fs.readFileSync(fullPath, "utf8");

    if (item.expectedError) {
      try {
        parseGpx(xml);
        console.log(`❌ ${padRight(item.file, 34)} | Deveria lançar ${item.expectedError}, mas passou`);
      } catch (err) {
        const code = isGpxParseError(err) ? err.code : "UNKNOWN_ERROR";
        const ok = code === item.expectedError;
        if (ok) passedCount++;
        console.log(
          `${ok ? "✅" : "❌"} ${padRight(item.file, 34)} | ${padRight(item.desc, 44)}`
        );
        console.log(
          `   ├─ Esperado (Erro):  code="${item.expectedError}"`
        );
        console.log(
          `   └─ Obtido (Parser):  code="${code}" (${err.message})`
        );
      }
    } else {
      const parsed = parseGpx(xml);
      const { ok, actual } = item.verify(parsed);
      if (ok) passedCount++;
      console.log(
        `${ok ? "✅" : "❌"} ${padRight(item.file, 34)} | ${padRight(item.desc, 44)}`
      );
      console.log(`   ├─ Esperado (Gabarito): ${item.expectedSummary}`);
      console.log(`   └─ Calculado (Parser):  ${actual}`);
    }
    printSeparator("─", 112);
  }

  console.log(
    `\n🎯 RESULTADO DA BATERIA SINTÉTICA: ${passedCount}/${syntheticCases.length} cenários validados com precisão exata!`
  );

  // Imprime também a inspeção detalhada do caso-base run_5k_even e do residual run_5420m_residual
  console.log("\n📌 DETALHAMENTO DE AMOSTRAS SINTÉTICAS (SPLITS + DEBUG):");
  const even5k = parseGpx(fs.readFileSync(path.join(FIXTURES_DIR, "run_5k_even.gpx"), "utf8"));
  printActivityReport(path.join(FIXTURES_DIR, "run_5k_even.gpx"), even5k, {
    showSplits: true,
    showDebug: true,
    scenarioTitle: "Amostra Sintética #1: run_5k_even.gpx (5.000m @ 5:00/km constante)",
  });

  const residual5420 = parseGpx(
    fs.readFileSync(path.join(FIXTURES_DIR, "run_5420m_residual.gpx"), "utf8")
  );
  printActivityReport(path.join(FIXTURES_DIR, "run_5420m_residual.gpx"), residual5420, {
    showSplits: true,
    showDebug: true,
    scenarioTitle: "Amostra Sintética #2: run_5420m_residual.gpx (5.420m com parcial residual 0,420 km)",
  });

  if (passedCount !== syntheticCases.length) {
    process.exit(1);
  }
}

function runRealStravaSuite() {
  console.log("");
  printSeparator("═", 112);
  console.log("🏃 TESTE TIPO 2 — BATERIA COM ARQUIVOS .GPX NO FORMATO REAL DO STRAVA (SEÇÃO 6.3 — MARCO M1)");
  printSeparator("═", 112);

  if (!fs.existsSync(REAL_STRAVA_DIR)) {
    console.error(`Diretório não encontrado: ${REAL_STRAVA_DIR}`);
    process.exit(1);
  }

  const refPath = path.join(REAL_STRAVA_DIR, "strava-reference.json");
  const manifest = fs.existsSync(refPath)
    ? JSON.parse(fs.readFileSync(refPath, "utf8"))
    : {};

  const gpxFiles = fs
    .readdirSync(REAL_STRAVA_DIR)
    .filter((f) => f.toLowerCase().endsWith(".gpx"))
    .sort();

  if (gpxFiles.length === 0) {
    console.log("Nenhum arquivo .gpx encontrado em __tests__/fixtures/gpx/strava-real/");
    return;
  }

  for (const file of gpxFiles) {
    const fullPath = path.join(REAL_STRAVA_DIR, file);
    const xml = fs.readFileSync(fullPath, "utf8");
    const parsed = parseGpx(xml);
    const meta = manifest[file] ?? null;

    printActivityReport(fullPath, parsed, {
      showSplits: true,
      showDebug: true,
      stravaRef: meta?.stravaScreen ?? null,
      scenarioTitle: meta?.scenario ?? `Arquivo .GPX Real do Strava: ${file}`,
    });
  }

  console.log("");
  printSeparator("═", 112);
  console.log(
    `✅ Total de arquivos .GPX reais do Strava inspecionados: ${gpxFiles.length} (em __tests__/fixtures/gpx/strava-real/)`
  );
  console.log(
    `💡 Dica: você também pode colocar qualquer .GPX exportado da sua conta do Strava em __tests__/fixtures/gpx/strava-real/`
  );
  console.log(
    `   ou executar: npm run gpx:inspect -- /caminho/do/seu_treino.gpx --splits --debug`
  );
  printSeparator("═", 112);
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--synthetic-suite")) {
  runSyntheticSuite();
  process.exit(0);
}

if (args.includes("--real-suite")) {
  runRealStravaSuite();
  process.exit(0);
}

const getFlagValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")
    ? args[idx + 1]
    : null;
};

const showJson = args.includes("--json");
const showSplits = args.includes("--splits");
const showDebug = args.includes("--debug");

const stravaDist = getFlagValue("--strava-dist");
const stravaTime = getFlagValue("--strava-time");
const stravaElapsed = getFlagValue("--strava-elapsed");
const stravaHr = getFlagValue("--strava-hr");
const stravaCad = getFlagValue("--strava-cad");
const stravaElev = getFlagValue("--strava-elev");

const hasCustomStravaRef =
  stravaDist !== null ||
  stravaTime !== null ||
  stravaElapsed !== null ||
  stravaHr !== null ||
  stravaCad !== null ||
  stravaElev !== null;

const customStravaRef = hasCustomStravaRef
  ? {
      distanceKm: stravaDist !== null ? Number(stravaDist) : undefined,
      movingSeconds: stravaTime !== null ? parseTimeArgToSeconds(stravaTime) : undefined,
      elapsedSeconds: stravaElapsed !== null ? parseTimeArgToSeconds(stravaElapsed) : undefined,
      avgHeartRate: stravaHr !== null ? Number(stravaHr) : undefined,
      avgCadence: stravaCad !== null ? Number(stravaCad) : undefined,
      elevationGainM: stravaElev !== null ? Number(stravaElev) : undefined,
    }
  : null;

const flagsWithValues = new Set([
  "--strava-dist",
  "--strava-time",
  "--strava-elapsed",
  "--strava-hr",
  "--strava-cad",
  "--strava-elev",
]);

const positionalArgs = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (flagsWithValues.has(arg)) {
    i++;
    continue;
  }
  if (arg.startsWith("--")) {
    continue;
  }
  positionalArgs.push(arg);
}

if (positionalArgs.length === 0) {
  console.log(`Uso:
  npm run gpx:test:synthetic                                       # Roda bateria de 20 .GPX sintéticos (Gabarito Matemático)
  npm run gpx:test:real                                            # Roda bateria de .GPX reais do Strava (Marco M1)
  npm run gpx:inspect -- <arquivo_ou_pasta.gpx> [--splits] [--debug] [--json]
  npm run gpx:inspect -- <arquivo.gpx> --splits --debug --strava-dist 5.02 --strava-time 25:10 --strava-hr 164 --strava-cad 172 --strava-elev 30`);
  process.exit(0);
}

for (const targetArg of positionalArgs) {
  const resolved = path.resolve(targetArg);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ Arquivo ou pasta não encontrado: ${resolved}`);
    process.exit(1);
  }

  const stat = fs.statSync(resolved);
  const files = stat.isDirectory()
    ? fs
        .readdirSync(resolved)
        .filter((f) => f.toLowerCase().endsWith(".gpx"))
        .sort()
        .map((f) => path.join(resolved, f))
    : [resolved];

  for (const filePath of files) {
    try {
      const xml = fs.readFileSync(filePath, "utf8");
      const parsed = parseGpx(xml);
      if (showJson) {
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        printActivityReport(filePath, parsed, {
          showSplits,
          showDebug,
          stravaRef: customStravaRef,
        });
      }
    } catch (err) {
      if (isGpxParseError(err)) {
        if (showJson) {
          console.log(
            JSON.stringify(
              { error: true, code: err.code, message: err.message, details: err.details },
              null,
              2
            )
          );
        } else {
          printSeparator("═");
          console.log(`📄 Arquivo: ${path.basename(filePath)}`);
          console.log(`❌ ERRO DE PARSING GPX [${err.code}]: ${err.message}`);
          if (err.details) {
            console.log(`   Detalhes: ${JSON.stringify(err.details)}`);
          }
          printSeparator("═");
        }
      } else {
        throw err;
      }
    }
  }
}
