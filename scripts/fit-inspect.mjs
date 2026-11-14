#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFit, isFitBuffer } from "../lib/fit/parseFit.ts";
import { isFitParseError } from "../lib/fit/types.ts";
import { parseAndMergeActivity } from "../lib/activityParser/parseAndMergeActivity.ts";
import { formatPaceSeconds } from "../lib/gpx/metrics.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIT_FIXTURES_DIR = path.join(REPO_ROOT, "__tests__", "fixtures", "fit");
const STRAVA_REAL_DIR = path.join(FIT_FIXTURES_DIR, "strava-real");

function formatSecondsHMS(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

function parseDurationToSeconds(str) {
  if (str === null || str === undefined) return null;
  const trimmed = String(str).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function padRight(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function printSeparator(ch = "─", len = 84) {
  console.log(ch.repeat(len));
}

function printHeader(title) {
  printSeparator("═", 84);
  console.log(title);
  printSeparator("═", 84);
}

function formatStravaRefFromFlags(args) {
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };
  const distStr = getArg("--strava-dist");
  const timeStr = getArg("--strava-time");
  const elapsedStr = getArg("--strava-elapsed");
  const hrStr = getArg("--strava-hr");
  const cadStr = getArg("--strava-cad");
  const elevStr = getArg("--strava-elev");
  const calStr = getArg("--strava-cal");

  if (!distStr && !timeStr && !elapsedStr && !hrStr && !cadStr && !elevStr && !calStr) {
    return null;
  }

  return {
    distanceKm: distStr !== null ? Number(distStr) : undefined,
    movingSeconds: timeStr !== null ? parseDurationToSeconds(timeStr) : undefined,
    elapsedSeconds: elapsedStr !== null ? parseDurationToSeconds(elapsedStr) : undefined,
    avgHeartRate: hrStr !== null ? Number(hrStr) : undefined,
    avgCadence: cadStr !== null ? Number(cadStr) : undefined,
    elevationGainM: elevStr !== null ? Number(elevStr) : undefined,
    activeCalories: calStr !== null ? Number(calStr) : undefined,
  };
}

function evaluateStravaTolerance(parsed, stravaRef) {
  if (!stravaRef) return { allOk: true, checks: [] };
  const checks = [];

  if (typeof stravaRef.distanceKm === "number") {
    const diff = Math.abs(parsed.distanceKm - stravaRef.distanceKm);
    const ok = diff <= 0.03;
    checks.push({
      metric: "Distância",
      strava: `${stravaRef.distanceKm.toFixed(2)} km`,
      pacelab: `${parsed.distanceKm.toFixed(3)} km`,
      delta: `${(parsed.distanceKm - stravaRef.distanceKm >= 0 ? "+" : "")}${(parsed.distanceKm - stravaRef.distanceKm).toFixed(3)} km`,
      tol: "±0.03 km",
      ok,
    });
  }

  if (typeof stravaRef.movingSeconds === "number") {
    const diff = Math.abs(parsed.durationSeconds - stravaRef.movingSeconds);
    const ok = diff <= 5;
    checks.push({
      metric: "Tempo em movimento",
      strava: formatSecondsHMS(stravaRef.movingSeconds),
      pacelab: formatSecondsHMS(parsed.durationSeconds),
      delta: `${parsed.durationSeconds - stravaRef.movingSeconds >= 0 ? "+" : ""}${parsed.durationSeconds - stravaRef.movingSeconds}s`,
      tol: "±5s",
      ok,
    });
  }

  if (typeof stravaRef.elapsedSeconds === "number") {
    const diff = Math.abs(parsed.elapsedSeconds - stravaRef.elapsedSeconds);
    const ok = diff <= 5;
    checks.push({
      metric: "Tempo decorrido",
      strava: formatSecondsHMS(stravaRef.elapsedSeconds),
      pacelab: formatSecondsHMS(parsed.elapsedSeconds),
      delta: `${parsed.elapsedSeconds - stravaRef.elapsedSeconds >= 0 ? "+" : ""}${parsed.elapsedSeconds - stravaRef.elapsedSeconds}s`,
      tol: "±5s",
      ok,
    });
  }

  if (typeof stravaRef.distanceKm === "number" && typeof stravaRef.movingSeconds === "number" && stravaRef.distanceKm > 0) {
    const refPaceSec = Math.round(stravaRef.movingSeconds / stravaRef.distanceKm);
    const diff = Math.abs(parsed.paceSeconds - refPaceSec);
    const ok = diff <= 2;
    checks.push({
      metric: "Pace médio",
      strava: `${stravaRef.paceFormatted ?? formatPaceSeconds(refPaceSec)} /km`,
      pacelab: `${parsed.paceFormatted} /km`,
      delta: `${parsed.paceSeconds - refPaceSec >= 0 ? "+" : ""}${parsed.paceSeconds - refPaceSec}s/km`,
      tol: "±2s/km",
      ok,
    });
  }

  if (typeof stravaRef.avgHeartRate === "number" && parsed.avgHeartRate !== null) {
    const diff = Math.abs(parsed.avgHeartRate - stravaRef.avgHeartRate);
    const ok = diff <= 2;
    checks.push({
      metric: "FC média",
      strava: `${stravaRef.avgHeartRate} bpm`,
      pacelab: `${parsed.avgHeartRate} bpm`,
      delta: `${parsed.avgHeartRate - stravaRef.avgHeartRate >= 0 ? "+" : ""}${parsed.avgHeartRate - stravaRef.avgHeartRate} bpm`,
      tol: "±2 bpm",
      ok,
    });
  }

  if (typeof stravaRef.avgCadence === "number" && parsed.avgCadence !== null) {
    const diff = Math.abs(parsed.avgCadence - stravaRef.avgCadence);
    const ok = diff <= 2;
    checks.push({
      metric: "Cadência média",
      strava: `${stravaRef.avgCadence} spm`,
      pacelab: `${parsed.avgCadence} spm`,
      delta: `${parsed.avgCadence - stravaRef.avgCadence >= 0 ? "+" : ""}${parsed.avgCadence - stravaRef.avgCadence} spm`,
      tol: "±2 spm",
      ok,
    });
  }

  if (typeof stravaRef.elevationGainM === "number" && parsed.elevationGainM !== null) {
    const tol = Math.max(10, Math.round(stravaRef.elevationGainM * 0.15));
    const diff = Math.abs(parsed.elevationGainM - stravaRef.elevationGainM);
    const ok = diff <= tol;
    checks.push({
      metric: "Elevação D+",
      strava: `${stravaRef.elevationGainM} m`,
      pacelab: `${parsed.elevationGainM} m`,
      delta: `${parsed.elevationGainM - stravaRef.elevationGainM >= 0 ? "+" : ""}${(parsed.elevationGainM - stravaRef.elevationGainM).toFixed(0)} m`,
      tol: `±${tol} m`,
      ok,
    });
  }

  if (typeof stravaRef.activeCalories === "number" && parsed.activeCalories !== null) {
    const tol = Math.max(25, Math.round(stravaRef.activeCalories * 0.1));
    const diff = Math.abs(parsed.activeCalories - stravaRef.activeCalories);
    const ok = diff <= tol;
    checks.push({
      metric: "Calorias ativas",
      strava: `${stravaRef.activeCalories} kcal`,
      pacelab: `${parsed.activeCalories} kcal`,
      delta: `${parsed.activeCalories - stravaRef.activeCalories >= 0 ? "+" : ""}${parsed.activeCalories - stravaRef.activeCalories} kcal`,
      tol: `±${tol} kcal`,
      ok,
    });
  }

  return {
    allOk: checks.every((c) => c.ok),
    checks,
  };
}

function inspectFitSource({ fitPath, gpxPath = null }) {
  const fitBuffer = fs.readFileSync(fitPath);
  const gpxXml = gpxPath ? fs.readFileSync(gpxPath, "utf8") : null;

  let fitMeta = null;
  if (isFitBuffer(fitBuffer)) {
    try {
      const rawFit = parseFit(fitBuffer);
      fitMeta = {
        sport: rawFit.sport,
        subSport: rawFit.subSport,
        lapCount: rawFit.lapCount,
      };
    } catch {
      // Será reportado pelo parser abaixo
    }
  }

  const parsed = gpxXml
    ? parseAndMergeActivity({ fitBuffer, gpxXml })
    : parseFit(fitBuffer);

  return { parsed, fitMeta };
}

function renderReport(label, parsed, fitMeta, options = {}) {
  const { showSplits = false, showTaf = false, showDebug = false, stravaRef = null, gpxPath = null } = options;

  console.log("");
  printHeader(`📦 INSPEÇÃO .FIT — ${label}`);
  if (gpxPath) {
    console.log(`🔗 Complemento .GPX : ${path.basename(gpxPath)} (Mesclagem .FIT + .GPX)`);
  }
  console.log(`🏷️  Nome do Treino  : ${parsed.name ?? "(sem nome)"}`);
  console.log(
    `🏃 Modalidade      : ${parsed.sourceActivityKind} (rawType: ${parsed.rawType ?? "null"})${parsed.isIndoor ? " [🏠 Indoor / Esteira]" : " [🛰️ Outdoor / GPS]"}`
  );
  console.log(`📅 Início (UTC)    : ${parsed.startedAt}`);
  console.log(
    `📏 Distância       : ${parsed.distanceKm.toFixed(3)} km (${Math.round(parsed.distanceKm * 1000)} m)`
  );
  console.log(
    `⏱️  Tempo Movimento : ${formatSecondsHMS(parsed.durationSeconds)} (${parsed.durationSeconds}s)`
  );
  console.log(
    `🕒 Tempo Decorrido : ${formatSecondsHMS(parsed.elapsedSeconds)} (${parsed.elapsedSeconds}s)`
  );
  console.log(
    `⚡ Pace / Vel.     : ${parsed.paceFormatted} /km  (${parsed.speedKmh.toFixed(2)} km/h)`
  );
  console.log(
    `❤️  Freq. Cardíaca  : Média ${parsed.avgHeartRate ?? "—"} bpm | Máx ${parsed.maxHeartRate ?? "—"} bpm`
  );
  console.log(`👟 Cadência Média  : ${parsed.avgCadence ?? "—"} spm`);
  console.log(
    `⛰️  Ganho Elevação  : ${parsed.elevationGainM !== null ? `+${parsed.elevationGainM} m` : "—"}`
  );
  console.log(
    `🔥 Calorias / Temp.: ${parsed.activeCalories !== null ? `${parsed.activeCalories} kcal` : "—"} | ${parsed.avgTemperatureC !== null ? `${parsed.avgTemperatureC} °C` : "—"}`
  );

  if (parsed.warnings.length > 0) {
    console.log("\n⚠️  Avisos do Parser:");
    for (const w of parsed.warnings) {
      console.log(`   - [${w.code}] ${w.message}`);
    }
  } else {
    console.log("\n✅ Nenhum aviso emitido.");
  }

  if (showSplits) {
    console.log(`\n📊 Parciais por Quilômetro (${parsed.splits.length} splits):`);
    if (parsed.splits.length === 0) {
      console.log("   (Nenhuma parcial gerada)");
    } else {
      printSeparator("─", 84);
      console.log(
        `  ${padRight("Km/Lap", 12)} | ${padRight("Distância", 11)} | ${padRight("Tempo", 8)} | ${padRight("Pace", 10)} | ${padRight("FC Média", 10)} | ${padRight("Elev Δ", 8)}`
      );
      printSeparator("─", 84);
      for (const s of parsed.splits) {
        const kmTag = s.distanceKm < 0.999 ? `#${s.kilometer} (res.)` : `#${s.kilometer}`;
        console.log(
          `  ${padRight(kmTag, 12)} | ${padRight(`${s.distanceKm.toFixed(3)} km`, 11)} | ${padRight(formatSecondsHMS(s.durationSeconds), 8)} | ${padRight(`${s.paceFormatted} /km`, 10)} | ${padRight(s.avgHeartRate !== null ? `${s.avgHeartRate} bpm` : "—", 10)} | ${padRight(s.elevationDiffM !== null ? `${s.elevationDiffM >= 0 ? "+" : ""}${s.elevationDiffM}m` : "—", 8)}`
        );
      }
      printSeparator("─", 84);
    }

    if (parsed.laps && parsed.laps.length > 0) {
      console.log(`\n🔁 Voltas Nativas do Relógio / .FIT (${parsed.laps.length} laps):`);
      printSeparator("─", 70);
      console.log(
        `  ${padRight("Lap", 8)} | ${padRight("Distância", 12)} | ${padRight("Duração", 10)} | ${padRight("Pace", 12)}`
      );
      printSeparator("─", 70);
      for (const lap of parsed.laps) {
        console.log(
          `  ${padRight(`#${lap.lapNumber}`, 8)} | ${padRight(`${lap.distanceMeters} m`, 12)} | ${padRight(formatSecondsHMS(lap.durationSeconds), 10)} | ${padRight(`${lap.paceFormatted ?? "—"} /km`, 12)}`
        );
      }
      printSeparator("─", 70);
    }
  }

  if (showTaf && parsed.tafWindow) {
    const w = parsed.tafWindow;
    console.log("\n🎯 Melhor Janela Contínua TAF (Teste de Cooper — 12 min):");
    printSeparator("─", 84);
    console.log(
      `  Distância na janela : ${w.distanceMeters} m (${(w.distanceMeters / 1000).toFixed(3)} km)`
    );
    console.log(
      `  Duração da janela   : ${formatSecondsHMS(w.actualDurationSeconds)} (alvo: ${formatSecondsHMS(w.targetDurationSeconds)})${w.isShorterThanTarget ? " [treino mais curto que 12 min]" : ""}`
    );
    console.log(
      `  Trecho do treino    : ${formatSecondsHMS(w.windowStartOffsetSeconds)} -> ${formatSecondsHMS(w.windowEndOffsetSeconds)}`
    );
    console.log(
      `  Ritmo / Velocidade  : ${w.paceFormatted} /km (${w.speedKmh.toFixed(2)} km/h) | FC: ${w.avgHeartRate ?? "—"} / máx ${w.maxHeartRate ?? "—"} bpm`
    );
    if (Array.isArray(w.laps) && w.laps.length > 0) {
      console.log(`  Projeção em pista 400m (${w.laps.length} parciais):`);
      for (const tl of w.laps) {
        console.log(
          `    Volta ${tl.lapNumber}: ${tl.distanceMeters} m em ${formatSecondsHMS(tl.durationSeconds)} (${tl.paceFormatted ?? "—"}/km)`
        );
      }
    }
    printSeparator("─", 84);
  }

  if (showDebug) {
    console.log("\n🔍 Debug Interno (.FIT):");
    console.log(
      JSON.stringify(
        {
          source: parsed.source,
          filesUsed: "filesUsed" in parsed ? parsed.filesUsed : ["fit"],
          sport: fitMeta?.sport ?? parsed.sport ?? null,
          subSport: fitMeta?.subSport ?? parsed.subSport ?? null,
          rawType: parsed.rawType,
          isIndoor: parsed.isIndoor,
          pointCount: parsed.pointCount,
          lapCount: fitMeta?.lapCount ?? parsed.laps?.length ?? 0,
          splitCount: parsed.splits.length,
          externalId: parsed.externalId,
        },
        null,
        2
      )
    );
  }

  const comparison = evaluateStravaTolerance(parsed, stravaRef);
  if (comparison.checks.length > 0) {
    console.log("\n📋 COMPARAÇÃO COM A TELA DO STRAVA:");
    printSeparator("─", 100);
    console.log(
      `  ${padRight("Métrica", 22)} | ${padRight("Tela Strava", 15)} | ${padRight("PaceLab .FIT", 15)} | ${padRight("Desvio", 13)} | ${padRight("Tolerância", 12)} | Status`
    );
    printSeparator("─", 100);
    for (const c of comparison.checks) {
      console.log(
        `  ${padRight(c.metric, 22)} | ${padRight(c.strava, 15)} | ${padRight(c.pacelab, 15)} | ${padRight(c.delta, 13)} | ${padRight(c.tol, 12)} | ${c.ok ? "✅ OK" : "❌ FORA"}`
      );
    }
    printSeparator("─", 100);
  }

  return comparison.allOk;
}

function runSyntheticSuite() {
  console.log("");
  printSeparator("═", 112);
  console.log("🧪 TESTE TIPO 1 — BATERIA COMPLETA DE .FIT SINTÉTICOS (GABARITO BINÁRIO DETERMINÍSTICO)");
  printSeparator("═", 112);

  if (!fs.existsSync(FIT_FIXTURES_DIR)) {
    console.error(`❌ Diretório não encontrado: ${FIT_FIXTURES_DIR}`);
    console.error("   Execute primeiro: npm run fit:gen-fixtures");
    process.exit(1);
  }

  const syntheticCases = [
    {
      file: "fit_run_5k_autolap.fit",
      desc: "5.000m @ 5:00/km, 5 auto-laps 1km, GPS, pausa 20s, cad 86, D+ 35m, 390 kcal",
      expected: "5,000 km | mov 1500s | elap 1520s | cad 172 spm | 5 laps / 5 splits | D+ 35m",
      verify: (r) => ({
        ok:
          r.distanceKm === 5 &&
          r.durationSeconds === 1500 &&
          r.elapsedSeconds === 1520 &&
          r.avgCadence === 172 &&
          r.lapCount === 5 &&
          r.splits.length === 5 &&
          r.elevationGainM === 35 &&
          r.activeCalories === 390 &&
          !r.isIndoor,
        actual: `${r.distanceKm.toFixed(3)} km | mov ${r.durationSeconds}s | elap ${r.elapsedSeconds}s | cad ${r.avgCadence} spm | ${r.lapCount} laps / ${r.splits.length} splits | D+ ${r.elevationGainM}m`,
      }),
    },
    {
      file: "fit_run_5420m_records.fit",
      desc: "5.420m sem auto-lap (1 lap) -> splits via recordMesgs + residual",
      expected: "5,420 km | mov 1626s | 6 splits (5x1km + #6 0,420km/126s/5:00) | SPLITS_FROM_RECORDS",
      verify: (r) => {
        const last = r.splits[5];
        const ok =
          r.distanceKm === 5.42 &&
          r.durationSeconds === 1626 &&
          r.lapCount === 1 &&
          r.splits.length === 6 &&
          last?.distanceKm === 0.42 &&
          last?.durationSeconds === 126 &&
          last?.paceFormatted === "5:00" &&
          r.warnings.some((w) => w.code === "SPLITS_FROM_RECORDS");
        return {
          ok,
          actual: `${r.distanceKm.toFixed(3)} km | mov ${r.durationSeconds}s | ${r.splits.length} splits (#6 ${last?.distanceKm?.toFixed(3)} km / ${last?.durationSeconds}s / ${last?.paceFormatted})`,
        };
      },
    },
    {
      file: "fit_run_treadmill_indoor.fit",
      desc: "Esteira indoor 4.000m @ 5:30/km sem GPS (subSport=treadmill)",
      expected: "4,000 km | isIndoor=true | INDOOR_ACTIVITY_NO_GPS | nome preservado",
      verify: (r) => ({
        ok:
          r.distanceKm === 4 &&
          r.durationSeconds === 1320 &&
          r.isIndoor === true &&
          r.name === "Rodagem na Esteira 4K" &&
          r.warnings.some((w) => w.code === "INDOOR_ACTIVITY_NO_GPS"),
        actual: `${r.distanceKm.toFixed(3)} km | isIndoor=${r.isIndoor} | nome="${r.name}"`,
      }),
    },
    {
      file: "fit_run_intervalado_pista.fit",
      desc: "Intervalado pista 5x400m (4.200m / 1282s / 12 laps / TAF 12 min)",
      expected: "4,200 km | 12 laps | TAF 12min > 2.400m | workoutName carregado",
      verify: (r) => ({
        ok:
          r.distanceKm === 4.2 &&
          r.durationSeconds === 1282 &&
          r.lapCount === 12 &&
          Boolean(r.tafWindow) &&
          r.tafWindow.distanceMeters > 2400 &&
          r.name === "Tiros Pista 5x400m + Aquecimento",
        actual: `${r.distanceKm.toFixed(3)} km | ${r.lapCount} laps | TAF 12min = ${r.tafWindow?.distanceMeters}m`,
      }),
    },
    {
      file: "fit_walk_3k.fit",
      desc: "Caminhada 3.000m @ 10:00/km (sport=walking)",
      expected: "sourceActivityKind='walk' | 3,000 km | pace 10:00/km",
      verify: (r) => ({
        ok:
          r.sourceActivityKind === "walk" &&
          r.distanceKm === 3 &&
          r.durationSeconds === 1800 &&
          r.paceFormatted === "10:00",
        actual: `kind=${r.sourceActivityKind} | ${r.distanceKm.toFixed(3)} km | ${r.paceFormatted}/km`,
      }),
    },
    {
      file: "fit_run_zero_ascent_merge.fit",
      desc: "Corrida .FIT (D+ 0, sem nome) isolada antes da mesclagem",
      expected: "5,000 km | name=null | elevationGainM=0",
      verify: (r) => ({
        ok:
          r.distanceKm === 5 &&
          r.name === null &&
          r.elevationGainM === 0,
        actual: `${r.distanceKm.toFixed(3)} km | name=${r.name} | D+=${r.elevationGainM}m`,
      }),
    },
    {
      file: "fit_run_no_sensors.fit",
      desc: "Corrida 3.000m sem FC, sem cadência e sem elevação",
      expected: "3,000 km | FC=null | cad=null | D+=null | 3 warnings",
      verify: (r) => ({
        ok:
          r.distanceKm === 3 &&
          r.avgHeartRate === null &&
          r.avgCadence === null &&
          r.elevationGainM === null &&
          r.warnings.some((w) => w.code === "NO_HEART_RATE_DATA") &&
          r.warnings.some((w) => w.code === "NO_CADENCE_DATA") &&
          r.warnings.some((w) => w.code === "NO_ELEVATION_DATA"),
        actual: `${r.distanceKm.toFixed(3)} km | FC=${r.avgHeartRate} | cad=${r.avgCadence} | D+=${r.elevationGainM}`,
      }),
    },
    {
      file: "fit_cycling_unsupported.fit",
      desc: "Ciclismo (sport=cycling) -> deve rejeitar",
      expectErrorCode: "UNSUPPORTED_ACTIVITY",
    },
    {
      file: "fit_zero_distance.fit",
      desc: "Sessão com totalDistance = 0 -> deve rejeitar",
      expectErrorCode: "ZERO_DISTANCE",
    },
    {
      file: "fit_corrupted.fit",
      desc: "Binário .FIT truncado/corrompido -> deve rejeitar",
      expectErrorCode: "INVALID_FIT",
    },
  ];

  let passed = 0;
  let total = 0;

  for (let i = 0; i < syntheticCases.length; i++) {
    const tc = syntheticCases[i];
    total++;
    const filePath = path.join(FIT_FIXTURES_DIR, tc.file);
    if (!fs.existsSync(filePath)) {
      console.log(`\n❌ [${i + 1}] ${tc.file} — ARQUIVO AUSENTE (rode: npm run fit:gen-fixtures)`);
      continue;
    }

    const buf = fs.readFileSync(filePath);
    if (tc.expectErrorCode) {
      try {
        parseFit(buf);
        console.log(`\n❌ [${i + 1}] ${tc.file} (${tc.desc})`);
        console.log(`   Esperado erro [${tc.expectErrorCode}], mas parseou sem erro!`);
      } catch (err) {
        const code = isFitParseError(err) ? err.code : "UNKNOWN";
        const ok = code === tc.expectErrorCode;
        if (ok) passed++;
        console.log(`\n${ok ? "✅" : "❌"} [${i + 1}] ${tc.file} — ${tc.desc}`);
        console.log(`   Esperado : Erro [${tc.expectErrorCode}]`);
        console.log(`   Obtido   : Erro [${code}] ("${err.message}")`);
      }
      continue;
    }

    try {
      const res = parseFit(buf);
      const check = tc.verify(res);
      if (check.ok) passed++;
      console.log(`\n${check.ok ? "✅" : "❌"} [${i + 1}] ${tc.file} — ${tc.desc}`);
      console.log(`   Esperado : ${tc.expected}`);
      console.log(`   Obtido   : ${check.actual}`);
    } catch (err) {
      console.log(`\n❌ [${i + 1}] ${tc.file} (${tc.desc}) — FALHA INESPERADA: ${err.message}`);
    }
  }

  // Caso 11: Mesclagem .FIT + .GPX complementar (D+ e nome do GPX mantendo 100% métricas do FIT)
  total++;
  const fitMergePath = path.join(FIT_FIXTURES_DIR, "fit_run_zero_ascent_merge.fit");
  const gpxMergePath = path.join(REPO_ROOT, "__tests__", "fixtures", "gpx", "run_elevation_staircase.gpx");
  if (fs.existsSync(fitMergePath) && fs.existsSync(gpxMergePath)) {
    try {
      const merged = parseAndMergeActivity({
        fitBuffer: fs.readFileSync(fitMergePath),
        gpxXml: fs.readFileSync(gpxMergePath, "utf8"),
      });
      const mergeOk =
        merged.filesUsed.join("+") === "fit+gpx" &&
        merged.name === "Corrida Subida +10m" &&
        merged.elevationGainM !== null &&
        merged.elevationGainM >= 9 &&
        merged.elevationGainM <= 11 &&
        merged.distanceKm === 5 &&
        merged.activeCalories === 380 &&
        merged.warnings.some((w) => w.code === "NAME_MERGED_FROM_GPX") &&
        merged.warnings.some((w) => w.code === "ELEVATION_MERGED_FROM_GPX") &&
        !merged.warnings.some((w) => w.code === "MISMATCHED_ACTIVITY_FILES");
      if (mergeOk) passed++;
      console.log(
        `\n${mergeOk ? "✅" : "❌"} [${total}] [MERGE] fit_run_zero_ascent_merge.fit + run_elevation_staircase.gpx`
      );
      console.log(
        "   Esperado : filesUsed=['fit','gpx'] | nome='Corrida Subida +10m' | D+ ~10m do GPX | 5,000km & 380kcal do FIT"
      );
      console.log(
        `   Obtido   : filesUsed=${JSON.stringify(merged.filesUsed)} | nome="${merged.name}" | D+=${merged.elevationGainM}m | ${merged.distanceKm.toFixed(3)}km | ${merged.activeCalories}kcal`
      );
    } catch (err) {
      console.log(`\n❌ [${total}] [MERGE] FALHA INESPERADA: ${err.message}`);
    }
  } else {
    console.log(
      `\n❌ [${total}] [MERGE] Arquivos ausentes (fit: ${fs.existsSync(fitMergePath)}, gpx: ${fs.existsSync(gpxMergePath)})`
    );
  }

  console.log("");
  printSeparator("═", 112);
  console.log(`🏁 RESUMO SUÍTE SINTÉTICA .FIT: ${passed}/${total} cenários aprovados.`);
  printSeparator("═", 112);

  if (passed < total) {
    process.exit(1);
  }
}

function printRealSuiteEmptyInstructions() {
  console.log("");
  printHeader("📂 NENHUM ARQUIVO .FIT REAL ENCONTRADO EM __tests__/fixtures/fit/strava-real/");
  console.log(`
Para testar com seus treinos REAIS exportados do Strava:

  1) Acesse o Strava na Web (https://www.strava.com) no computador e abra uma corrida sua.
  2) Clique no menu "..." (três pontinhos ao lado do ícone de editar) e selecione:
     -> "Exportar Original" (Export Original)
     Dica rápida: você também pode adicionar "/export_original" no final da URL do treino, ex.:
     https://www.strava.com/activities/1234567890/export_original
  3) O arquivo baixado pode vir como .fit ou .fit.gz (se vier .fit.gz, descompacte com gzip -d / duplo clique).
     OBS: se o treino foi gravado direto no app do Strava no celular sem relógio Garmin/Coros/Polar/Amazfit,
     o Strava pode baixar um .GPX em vez de .FIT — treinos de relógio sempre baixam o .FIT original!
  4) Salve o(s) arquivo(s) .fit dentro de:
     ${STRAVA_REAL_DIR}
  5) (Opcional) Para testar mesclagem .FIT + .GPX automática na suíte real, coloque também o .gpx com o mesmo nome:
     ex.: meu_treino_5k.fit + meu_treino_5k.gpx
  6) (Opcional) Copie strava-reference.example.json para strava-reference.json e preencha os valores da tela do Strava.
  7) Execute:
     npm run fit:test:real

Ou inspecione qualquer arquivo avulso sem mover de pasta:
  npm run fit:inspect -- "/caminho/para/seu_treino.fit" --splits --taf --debug
`);
}

function runRealSuite() {
  console.log("");
  printHeader("🏃 TESTE TIPO 2 — ARQUIVOS .FIT REAIS DO STRAVA (__tests__/fixtures/fit/strava-real/)");

  if (!fs.existsSync(STRAVA_REAL_DIR)) {
    fs.mkdirSync(STRAVA_REAL_DIR, { recursive: true });
  }

  const entries = fs.readdirSync(STRAVA_REAL_DIR, { withFileTypes: true });
  const fitFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".fit"))
    .map((e) => e.name)
    .sort();

  if (fitFiles.length === 0) {
    printRealSuiteEmptyInstructions();
    return;
  }

  const refPath = path.join(STRAVA_REAL_DIR, "strava-reference.json");
  let refMap = {};
  if (fs.existsSync(refPath)) {
    try {
      refMap = JSON.parse(fs.readFileSync(refPath, "utf8"));
    } catch (err) {
      console.warn(`⚠️  Não foi possível ler strava-reference.json: ${err.message}`);
    }
  }

  let okCount = 0;
  let errorCount = 0;

  for (const fitName of fitFiles) {
    const fitPath = path.join(STRAVA_REAL_DIR, fitName);
    const stem = fitName.replace(/\.fit$/i, "");
    const matchingGpx = path.join(STRAVA_REAL_DIR, `${stem}.gpx`);
    const gpxPath = fs.existsSync(matchingGpx) ? matchingGpx : null;
    const refEntry = refMap[fitName];
    const stravaRef = refEntry?.stravaScreen ?? null;

    try {
      const { parsed, fitMeta } = inspectFitSource({ fitPath, gpxPath });
      const title = refEntry?.scenario ? `${fitName} — ${refEntry.scenario}` : fitName;
      const withinTolerance = renderReport(title, parsed, fitMeta, {
        showSplits: true,
        showTaf: true,
        showDebug: true,
        stravaRef,
        gpxPath,
      });
      if (withinTolerance) {
        okCount++;
      } else {
        errorCount++;
      }
    } catch (err) {
      errorCount++;
      const code = isFitParseError(err) ? err.code : "ERROR";
      console.log("");
      printHeader(`❌ ERRO AO LER ${fitName}`);
      console.log(`   Código   : ${code}`);
      console.log(`   Mensagem : ${err.message}`);
    }
  }

  console.log("");
  printSeparator("═", 84);
  console.log(
    `🏁 RESUMO ARQUIVOS REAIS (.FIT): ${fitFiles.length} analisado(s) | ${okCount} OK | ${errorCount} falha(s)/fora da tolerância.`
  );
  printSeparator("═", 84);

  if (errorCount > 0) {
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Uso:
  npm run fit:inspect -- <arquivo.fit | diretorio> [opções]
  npm run fit:test:synthetic
  npm run fit:test:real

Opções para inspeção manual:
  --gpx <arquivo.gpx>       Mescla o .FIT com um arquivo .GPX complementar (parseAndMergeActivity)
  --splits                  Exibe tabela detalhada de parciais km a km e voltas nativas (.FIT laps)
  --taf                     Exibe análise da melhor janela contínua de 12 minutos (Simulado TAF)
  --debug                   Exibe metadados internos do .FIT (sport, subSport, points, laps, externalId)
  --json                    Imprime saída estruturada em JSON puro

Comparação manual com os números da tela do Strava:
  --strava-dist <km>        Distância exibida no Strava (ex.: 5.02)
  --strava-time <dur>       Tempo em movimento do Strava (ex.: 25:10 ou 1510)
  --strava-elapsed <dur>    Tempo decorrido do Strava (ex.: 26:05)
  --strava-hr <bpm>         FC média exibida no Strava (ex.: 162)
  --strava-cad <spm>        Cadência média exibida no Strava (ex.: 174)
  --strava-elev <m>         Ganho de elevação exibido no Strava (ex.: 42)
  --strava-cal <kcal>       Calorias exibidas no Strava (ex.: 385)

Modos de suíte:
  --synthetic-suite         Roda bateria determinística com os 10 .FIT sintéticos + teste de merge
  --real-suite              Lê todos os .fit em __tests__/fixtures/fit/strava-real/ e compara com strava-reference.json
  --help, -h                Exibe esta ajuda
`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--synthetic-suite")) {
    runSyntheticSuite();
    return;
  }

  if (args.includes("--real-suite")) {
    runRealSuite();
    return;
  }

  // Flags com valor para não confundi-las com o caminho posicional
  const valueFlags = new Set([
    "--gpx",
    "--strava-dist",
    "--strava-time",
    "--strava-elapsed",
    "--strava-hr",
    "--strava-cad",
    "--strava-elev",
    "--strava-cal",
  ]);

  let targetArg = null;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (valueFlags.has(token)) {
      i++;
      continue;
    }
    if (!token.startsWith("--")) {
      targetArg = token;
      break;
    }
  }

  if (!targetArg) {
    console.error("❌ Informe o caminho de um arquivo .fit ou diretório.");
    printHelp();
    process.exit(1);
  }

  const getFlagValue = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? path.resolve(args[idx + 1]) : null;
  };

  const resolvedTarget = path.resolve(targetArg);
  if (!fs.existsSync(resolvedTarget)) {
    console.error(`❌ Caminho não encontrado: ${resolvedTarget}`);
    process.exit(1);
  }

  const gpxFlagPath = getFlagValue("--gpx");
  if (gpxFlagPath && !fs.existsSync(gpxFlagPath)) {
    console.error(`❌ Arquivo .GPX complementar não encontrado: ${gpxFlagPath}`);
    process.exit(1);
  }

  const showSplits = args.includes("--splits");
  const showTaf = args.includes("--taf");
  const showDebug = args.includes("--debug");
  const outputJson = args.includes("--json");
  const stravaRef = formatStravaRefFromFlags(args);

  const stat = fs.statSync(resolvedTarget);
  const filesToInspect = stat.isDirectory()
    ? fs
        .readdirSync(resolvedTarget)
        .filter((f) => f.toLowerCase().endsWith(".fit"))
        .sort()
        .map((f) => path.join(resolvedTarget, f))
    : [resolvedTarget];

  if (filesToInspect.length === 0) {
    console.error(`❌ Nenhum arquivo .fit encontrado em: ${resolvedTarget}`);
    process.exit(1);
  }

  if (stat.isDirectory() && gpxFlagPath) {
    console.error("❌ A flag --gpx só pode ser usada ao inspecionar um único arquivo .fit.");
    process.exit(1);
  }

  const jsonResults = [];
  let hasFailures = false;

  for (const fitFile of filesToInspect) {
    const stemGpx = path.join(
      path.dirname(fitFile),
      `${path.basename(fitFile, path.extname(fitFile))}.gpx`
    );
    const effectiveGpx =
      gpxFlagPath ?? (stat.isDirectory() && fs.existsSync(stemGpx) ? stemGpx : null);

    try {
      const { parsed, fitMeta } = inspectFitSource({
        fitPath: fitFile,
        gpxPath: effectiveGpx,
      });

      if (outputJson) {
        jsonResults.push({
          file: path.basename(fitFile),
          gpxCompanion: effectiveGpx ? path.basename(effectiveGpx) : null,
          sport: fitMeta?.sport ?? null,
          subSport: fitMeta?.subSport ?? null,
          lapCount: fitMeta?.lapCount ?? parsed.laps?.length ?? 0,
          parsed,
        });
      } else {
        const ok = renderReport(path.basename(fitFile), parsed, fitMeta, {
          showSplits,
          showTaf,
          showDebug,
          stravaRef,
          gpxPath: effectiveGpx,
        });
        if (!ok) hasFailures = true;
      }
    } catch (err) {
      hasFailures = true;
      const code = isFitParseError(err) ? err.code : "ERROR";
      if (outputJson) {
        jsonResults.push({
          file: path.basename(fitFile),
          error: { code, message: err.message },
        });
      } else {
        console.error(`\n❌ Erro ao inspecionar ${path.basename(fitFile)}: [${code}] ${err.message}`);
      }
    }
  }

  if (outputJson) {
    console.log(JSON.stringify(jsonResults.length === 1 ? jsonResults[0] : jsonResults, null, 2));
  }

  if (hasFailures) {
    process.exit(1);
  }
}

main();
