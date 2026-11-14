#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Encoder, Profile } from "@garmin/fitsdk";

const METERS_PER_DEG_LAT = 111320;
const BASE_LAT = -23.58741; // Parque Ibirapuera (SP)
const BASE_LON = -46.65763;
const DEFAULT_START_ISO = "2026-11-10T09:00:00.000Z";

/**
 * Converte graus decimais para semicircles do protocolo Garmin FIT.
 */
export function degreesToSemicircles(degrees) {
  return Math.round(degrees * (Math.pow(2, 31) / 180));
}

/**
 * Converte string "5:00" ou segundos numéricos em segundos/km.
 */
export function parsePaceArgToSeconds(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "5:00").trim();
  if (s.includes(":")) {
    const [mStr, secStr] = s.split(":");
    return Number(mStr) * 60 + Number(secStr);
  }
  return Number(s);
}

/**
 * Normaliza enums em snake_case (ex.: "casual_walking") para o camelCase esperado pelo @garmin/fitsdk Encoder.
 */
function normalizeFitEnum(value) {
  if (typeof value !== "string") return value;
  return value.trim().replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

/**
 * Gera um arquivo binário .FIT sintético determinístico via `@garmin/fitsdk` Encoder.
 *
 * @param {object} options
 * @param {string} [options.startIso] ISO UTC de início
 * @param {string} [options.sport] "running" | "walking" | "cycling" | "generic"
 * @param {string} [options.subSport] "street" | "treadmill" | "track" | "casual_walking" | ...
 * @param {string|null} [options.workoutName] Nome do treino (session.workoutName + WORKOUT.wktName)
 * @param {number} [options.stepSeconds] Intervalo entre records em segundos (padrão: 1)
 * @param {Array<{distanceMeters: number, paceSecondsPerKm: number, hr?: number|null, cad?: number|null, ascentM?: number, descentM?: number, pauseBeforeSeconds?: number}>} [options.lapsSpec]
 * @param {boolean} [options.emitMultiLapMessages] Se true e lapsSpec tiver 1 item, emite apenas 1 lap global; se > 1 e emitMultiLapMessages=false, emite 1 lap global consolidada para testar `buildSplitsFromFitRecords`.
 * @param {boolean} [options.omitGps] Omite positionLat/positionLong (treino indoor/esteira)
 * @param {number|null} [options.hr] Frequência cardíaca padrão (bpm)
 * @param {number|null} [options.maxHr] FC máxima da sessão (bpm)
 * @param {number|null} [options.cad] Cadência FIT padrão (rpm — 1 pé, ex.: 85 -> 170 spm)
 * @param {number|null} [options.elevationGainMeters] Ganho total de elevação da sessão (m); `null` omite `totalAscent`
 * @param {number|null} [options.calories] Calorias ativas (`totalCalories`); `null` omite
 * @param {number|null} [options.temperatureC] Temperatura média (°C); `null` omite
 * @param {number|null} [options.overrideSessionDistanceM] Sobrescreve `session.totalDistance` (ex.: 0 para teste de erro)
 * @param {number|null} [options.overrideSessionTimerSec] Sobrescreve `session.totalTimerTime`
 * @param {number|null} [options.overrideSessionElapsedSec] Sobrescreve `session.totalElapsedTime`
 */
export function buildSyntheticFitBuffer(options = {}) {
  const {
    startIso = DEFAULT_START_ISO,
    sport = "running",
    subSport = "street",
    workoutName = null,
    stepSeconds = 1,
    lapsSpec = [{ distanceMeters: 5000, paceSecondsPerKm: 300 }],
    emitMultiLapMessages = true,
    omitGps = false,
    hr = 155,
    maxHr = null,
    cad = 85,
    elevationGainMeters = 0,
    calories = null,
    temperatureC = 22,
    overrideSessionDistanceM = null,
    overrideSessionTimerSec = null,
    overrideSessionElapsedSec = null,
  } = options;

  const startMs = Date.parse(startIso);
  const normalizedSport = normalizeFitEnum(sport);
  const normalizedSubSport = normalizeFitEnum(subSport);
  let currentMs = startMs;
  let cumulativeDistM = 0;
  let totalMovingSec = 0;
  let currentAltitudeM = 760;

  const totalSpecDistance = lapsSpec.reduce(
    (acc, l) => acc + Math.max(0, l.distanceMeters || 0),
    0
  );

  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, {
    type: "activity",
    manufacturer: "garmin",
    product: 3943, // Forerunner-style ID
    serialNumber: 12345678,
    timeCreated: new Date(startMs),
  });

  if (workoutName) {
    enc.onMesg(Profile.MesgNum.WORKOUT, {
      sport: normalizedSport,
      subSport: normalizedSubSport,
      wktName: workoutName,
    });
  }

  const recordMesgs = [];
  const generatedLaps = [];

  for (let lapIdx = 0; lapIdx < lapsSpec.length; lapIdx++) {
    const spec = lapsSpec[lapIdx];
    const pauseBefore = Math.max(0, spec.pauseBeforeSeconds || 0);
    if (pauseBefore > 0) {
      currentMs += Math.round(pauseBefore * 1000);
    }

    const lapStartMs = currentMs;
    const lapDistM = Math.max(0, spec.distanceMeters || 0);
    const lapDurSec =
      lapDistM > 0
        ? (lapDistM / 1000) * (spec.paceSecondsPerKm || 300)
        : 0;
    const lapHr = spec.hr !== undefined ? spec.hr : hr;
    const lapCad = spec.cad !== undefined ? spec.cad : cad;

    // Elevação proporcional caso não especificado na lap
    const lapAscent =
      spec.ascentM !== undefined
        ? spec.ascentM
        : elevationGainMeters !== null && totalSpecDistance > 0
          ? (elevationGainMeters * lapDistM) / totalSpecDistance
          : null;
    const lapDescent = spec.descentM !== undefined ? spec.descentM : 0;

    if (lapDurSec > 0) {
      const dt = Math.max(0.5, stepSeconds);
      const numSteps = Math.max(1, Math.round(lapDurSec / dt));
      const stepDist = lapDistM / numSteps;
      const stepTimeSec = lapDurSec / numSteps;
      const stepAsc =
        lapAscent !== null ? (lapAscent - lapDescent) / numSteps : 0;

      for (let s = 0; s <= numSteps; s++) {
        // Evita duplicar exatamente o último timestamp entre laps seguidas sem pausa
        if (lapIdx > 0 && pauseBefore === 0 && s === 0) {
          continue;
        }
        const recDist =
          s === 0 && lapIdx === 0
            ? 0
            : Number((cumulativeDistM + s * stepDist).toFixed(2));
        const recTimeMs =
          lapStartMs + Math.round(s * stepTimeSec * 1000);
        const recAlt =
          lapAscent !== null
            ? Number((currentAltitudeM + s * stepAsc).toFixed(2))
            : null;

        const rec = {
          timestamp: new Date(recTimeMs),
          distance: recDist,
          enhancedSpeed: lapDurSec > 0 ? lapDistM / lapDurSec : 0,
        };

        if (!omitGps) {
          const latDeg = BASE_LAT + recDist / METERS_PER_DEG_LAT;
          rec.positionLat = degreesToSemicircles(latDeg);
          rec.positionLong = degreesToSemicircles(BASE_LON);
        }
        if (recAlt !== null) {
          rec.enhancedAltitude = recAlt;
        }
        if (lapHr !== null && lapHr !== undefined) {
          rec.heartRate = Math.round(lapHr);
        }
        if (lapCad !== null && lapCad !== undefined) {
          rec.cadence = Math.round(lapCad);
        }
        if (temperatureC !== null && temperatureC !== undefined) {
          rec.temperature = Math.round(temperatureC);
        }

        recordMesgs.push(rec);
      }

      currentMs = lapStartMs + Math.round(lapDurSec * 1000);
      cumulativeDistM += lapDistM;
      totalMovingSec += lapDurSec;
      if (lapAscent !== null) {
        currentAltitudeM += lapAscent - lapDescent;
      }
    }

    const lapObj = {
      messageIndex: lapIdx,
      timestamp: new Date(currentMs),
      startTime: new Date(lapStartMs),
      totalElapsedTime: Number((lapDurSec + pauseBefore).toFixed(2)),
      totalTimerTime: Number(lapDurSec.toFixed(2)),
      totalDistance: Number(lapDistM.toFixed(2)),
      sport: normalizedSport,
      subSport: normalizedSubSport,
    };
    if (lapHr !== null && lapHr !== undefined) {
      lapObj.avgHeartRate = Math.round(lapHr);
      lapObj.maxHeartRate = Math.round(maxHr ?? lapHr + 8);
    }
    if (lapCad !== null && lapCad !== undefined) {
      lapObj.avgRunningCadence = Math.round(lapCad);
    }
    if (lapAscent !== null) {
      lapObj.totalAscent = Math.round(lapAscent);
      lapObj.totalDescent = Math.round(lapDescent);
    }
    generatedLaps.push(lapObj);
  }

  for (const rec of recordMesgs) {
    enc.onMesg(Profile.MesgNum.RECORD, rec);
  }

  const finalDistanceM =
    overrideSessionDistanceM !== null
      ? overrideSessionDistanceM
      : Number(cumulativeDistM.toFixed(2));
  const finalTimerSec =
    overrideSessionTimerSec !== null
      ? overrideSessionTimerSec
      : Number(totalMovingSec.toFixed(2));
  const computedElapsedSec = Math.max(
    finalTimerSec,
    Math.round((currentMs - startMs) / 1000)
  );
  const finalElapsedSec =
    overrideSessionElapsedSec !== null
      ? overrideSessionElapsedSec
      : computedElapsedSec;

  const lapsToEmit = emitMultiLapMessages
    ? generatedLaps
    : [
        {
          messageIndex: 0,
          timestamp: new Date(startMs + finalElapsedSec * 1000),
          startTime: new Date(startMs),
          totalElapsedTime: finalElapsedSec,
          totalTimerTime: finalTimerSec,
          totalDistance: finalDistanceM,
          sport: normalizedSport,
          subSport: normalizedSubSport,
          ...(hr !== null ? { avgHeartRate: Math.round(hr) } : {}),
          ...(cad !== null ? { avgRunningCadence: Math.round(cad) } : {}),
          ...(elevationGainMeters !== null
            ? { totalAscent: Math.round(elevationGainMeters) }
            : {}),
        },
      ];

  for (const lap of lapsToEmit) {
    enc.onMesg(Profile.MesgNum.LAP, lap);
  }

  // Calcula médias globais ponderadas por duração caso laps tenham FC/cadência distintos
  let avgSessionHr = null;
  let computedMaxHr = null;
  const hrs = recordMesgs
    .map((r) => r.heartRate)
    .filter((v) => typeof v === "number");
  if (hrs.length > 0) {
    avgSessionHr = Math.round(
      hrs.reduce((a, b) => a + b, 0) / hrs.length
    );
    computedMaxHr = Math.max(...hrs);
  } else if (hr !== null) {
    avgSessionHr = Math.round(hr);
    computedMaxHr = Math.round(maxHr ?? hr + 10);
  }

  const sessionMesg = {
    messageIndex: 0,
    timestamp: new Date(startMs + finalElapsedSec * 1000),
    startTime: new Date(startMs),
    totalElapsedTime: finalElapsedSec,
    totalTimerTime: finalTimerSec,
    totalDistance: finalDistanceM,
    sport: normalizedSport,
    subSport: normalizedSubSport,
    numLaps: lapsToEmit.length,
    firstLapIndex: 0,
  };

  if (workoutName) {
    sessionMesg.workoutName = workoutName;
  }
  if (avgSessionHr !== null) {
    sessionMesg.avgHeartRate = avgSessionHr;
    sessionMesg.maxHeartRate = maxHr ?? computedMaxHr ?? avgSessionHr;
  }
  if (cad !== null) {
    sessionMesg.avgRunningCadence = Math.round(cad);
  }
  if (elevationGainMeters !== null) {
    sessionMesg.totalAscent = Math.round(elevationGainMeters);
  }
  if (calories !== null) {
    sessionMesg.totalCalories = Math.round(calories);
  }
  if (temperatureC !== null) {
    sessionMesg.avgTemperature = Math.round(temperatureC);
  }

  enc.onMesg(Profile.MesgNum.SESSION, sessionMesg);
  enc.onMesg(Profile.MesgNum.ACTIVITY, {
    timestamp: new Date(startMs + finalElapsedSec * 1000),
    numSessions: 1,
  });

  return Buffer.from(enc.close());
}

/**
 * Gera a bateria completa de 10 fixtures .FIT sintéticas determinísticas
 * em `__tests__/fixtures/fit/`, preservando `__tests__/fixtures/fit/strava-real/`.
 */
export function generateAllFitFixtures(fixturesDir) {
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.mkdirSync(path.join(fixturesDir, "strava-real"), { recursive: true });

  const writeFixture = (filename, buf) => {
    fs.writeFileSync(path.join(fixturesDir, filename), buf);
  };

  // 1. 5K outdoor com 5 auto-laps de 1 km + GPS + pausa 20s + sensores completos
  writeFixture(
    "fit_run_5k_autolap.fit",
    buildSyntheticFitBuffer({
      sport: "running",
      subSport: "street",
      stepSeconds: 2,
      lapsSpec: [
        { distanceMeters: 1000, paceSecondsPerKm: 300, hr: 152 },
        { distanceMeters: 1000, paceSecondsPerKm: 300, hr: 158 },
        {
          distanceMeters: 1000,
          paceSecondsPerKm: 300,
          hr: 160,
          pauseBeforeSeconds: 20,
        },
        { distanceMeters: 1000, paceSecondsPerKm: 300, hr: 164 },
        { distanceMeters: 1000, paceSecondsPerKm: 300, hr: 166 },
      ],
      maxHr: 175,
      cad: 86, // 172 spm após ×2
      elevationGainMeters: 35,
      calories: 390,
      temperatureC: 21,
    })
  );

  // 2. 5.420m sem auto-lap (1 lap única) -> força splits via recordMesgs + residual 0,420 km
  writeFixture(
    "fit_run_5420m_records.fit",
    buildSyntheticFitBuffer({
      sport: "running",
      subSport: "street",
      stepSeconds: 2,
      emitMultiLapMessages: false,
      lapsSpec: [{ distanceMeters: 5420, paceSecondsPerKm: 300 }],
      hr: 158,
      maxHr: 171,
      cad: 85, // 170 spm
      elevationGainMeters: 20,
      calories: 415,
      temperatureC: 23,
    })
  );

  // 3. Corrida indoor / Esteira sem GPS -> isIndoor = true + warning INDOOR_ACTIVITY_NO_GPS
  writeFixture(
    "fit_run_treadmill_indoor.fit",
    buildSyntheticFitBuffer({
      sport: "running",
      subSport: "treadmill",
      workoutName: "Rodagem na Esteira 4K",
      omitGps: true,
      stepSeconds: 5,
      lapsSpec: [{ distanceMeters: 4000, paceSecondsPerKm: 330 }], // 5:30/km -> 1320s
      hr: 154,
      maxHr: 168,
      cad: 84, // 168 spm
      elevationGainMeters: 0,
      calories: 320,
      temperatureC: 24,
    })
  );

  // 4. Intervalado em pista (4.200m em 1282s, 12 laps reais, melhor janela TAF 12 min > 2.400m)
  const intervalLaps = [
    { distanceMeters: 800, paceSecondsPerKm: 360, hr: 148 }, // 288s
  ];
  for (let rep = 0; rep < 5; rep++) {
    intervalLaps.push({
      distanceMeters: 400,
      paceSecondsPerKm: 225, // 3:45/km -> 90s
      hr: 182,
    });
    intervalLaps.push({
      distanceMeters: 200,
      paceSecondsPerKm: 400, // 6:40/km -> 80s
      hr: 162,
    });
  }
  intervalLaps.push({
    distanceMeters: 400,
    paceSecondsPerKm: 360, // 6:00/km -> 144s
    hr: 150,
  });

  writeFixture(
    "fit_run_intervalado_pista.fit",
    buildSyntheticFitBuffer({
      sport: "running",
      subSport: "track",
      workoutName: "Tiros Pista 5x400m + Aquecimento",
      stepSeconds: 2,
      lapsSpec: intervalLaps,
      maxHr: 190,
      cad: 89, // 178 spm
      elevationGainMeters: 4,
      calories: 365,
      temperatureC: 20,
    })
  );

  // 5. Caminhada 3K -> sourceActivityKind = "walk"
  writeFixture(
    "fit_walk_3k.fit",
    buildSyntheticFitBuffer({
      sport: "walking",
      subSport: "casual_walking",
      workoutName: "Caminhada Regenerativa",
      stepSeconds: 5,
      lapsSpec: [{ distanceMeters: 3000, paceSecondsPerKm: 600 }], // 10:00/km -> 1800s
      hr: 112,
      maxHr: 124,
      cad: 62, // 124 spm
      elevationGainMeters: 18,
      calories: 195,
      temperatureC: 22,
    })
  );

  // 6. Corrida com elevação 0 e sem nome, alinhada no timestamp de run_elevation_staircase.gpx
  writeFixture(
    "fit_run_zero_ascent_merge.fit",
    buildSyntheticFitBuffer({
      startIso: "2026-11-13T09:00:00.000Z",
      sport: "running",
      subSport: "street",
      workoutName: null,
      stepSeconds: 2,
      lapsSpec: [
        { distanceMeters: 1000, paceSecondsPerKm: 300 },
        { distanceMeters: 1000, paceSecondsPerKm: 300 },
        { distanceMeters: 1000, paceSecondsPerKm: 300 },
        { distanceMeters: 1000, paceSecondsPerKm: 300 },
        { distanceMeters: 1000, paceSecondsPerKm: 300 },
      ],
      hr: 156,
      maxHr: 170,
      cad: 86, // 172 spm
      elevationGainMeters: 0,
      calories: 380,
      temperatureC: 24,
    })
  );

  // 7. Sem sensores (sem FC, sem cadência, sem altimetria, sem calorias/temp)
  writeFixture(
    "fit_run_no_sensors.fit",
    buildSyntheticFitBuffer({
      sport: "running",
      subSport: "street",
      stepSeconds: 5,
      lapsSpec: [{ distanceMeters: 3000, paceSecondsPerKm: 320 }], // 5:20/km -> 960s
      hr: null,
      cad: null,
      elevationGainMeters: null,
      calories: null,
      temperatureC: null,
    })
  );

  // 8. Esporte não suportado (ciclismo) -> deve falhar com UNSUPPORTED_ACTIVITY
  writeFixture(
    "fit_cycling_unsupported.fit",
    buildSyntheticFitBuffer({
      sport: "cycling",
      subSport: "road",
      stepSeconds: 5,
      lapsSpec: [{ distanceMeters: 10000, paceSecondsPerKm: 120 }], // 30 km/h
      hr: 145,
      cad: 88,
      elevationGainMeters: 120,
      calories: 420,
    })
  );

  // 9. Distância zero -> deve falhar com ZERO_DISTANCE (nem session, nem laps nem records com distância > 0)
  writeFixture(
    "fit_zero_distance.fit",
    buildSyntheticFitBuffer({
      sport: "running",
      subSport: "street",
      lapsSpec: [{ distanceMeters: 0, paceSecondsPerKm: 300 }],
      emitMultiLapMessages: false,
      overrideSessionDistanceM: 0,
      overrideSessionTimerSec: 300,
      overrideSessionElapsedSec: 300,
      hr: 140,
      cad: 82,
    })
  );

  // 10. Binário .FIT truncado/corrompido -> deve falhar com INVALID_FIT
  writeFixture(
    "fit_corrupted.fit",
    Buffer.from([0x0e, 0x10, 0x90, 0x08, 0x20, 0x00, 0x00, 0x00, 0x2e, 0x46, 0x49, 0x54, 0xff, 0x00])
  );
}

function printHelp() {
  console.log(`
Uso: node scripts/gen-fit-fixture.mjs [opções]

Opções:
  --generate-all           Gera todas as 10 fixtures .FIT sintéticas em __tests__/fixtures/fit/
  --out <caminho.fit>      Salva um arquivo .FIT sintético no caminho indicado
  --distance <metros>      Distância total em metros (padrão: 5000)
  --pace <min:seg>         Ritmo por km, ex.: 4:45 ou 300 (padrão: 5:00)
  --hz <freq>              Frequência de amostragem dos records em Hz (padrão: 1)
  --laps <qtd>             Quantidade de voltas/auto-laps (0 = apenas 1 lap global; >=2 = laps separadas)
  --sport <tipo>           running | walking | cycling (padrão: running)
  --sub-sport <sub>        street | treadmill | track | casual_walking | generic (padrão: street)
  --indoor                 Omite coordenadas GPS dos records (simula esteira/indoor)
  --workout-name <texto>   Define nome do treino em session.workoutName e WORKOUT.wktName
  --hr <bpm>               Frequência cardíaca média (padrão: 155)
  --no-hr                  Omite dados de frequência cardíaca
  --cad <rpm>              Cadência FIT de um pé em rpm, ex.: 85 -> 170 spm (padrão: 85)
  --no-cad                 Omite dados de cadência
  --elevation-gain <m>     Ganho total de elevação D+ em metros (padrão: 0)
  --no-ele                 Omite ganho de elevação e altitude
  --calories <kcal>        Define calorias ativas (totalCalories)
  --no-calories            Omite calorias
  --temp <celsius>         Temperatura média em °C (padrão: 22)
  --no-temp                Omite temperatura
  --start-time <ISO>       Data/hora ISO UTC de início (padrão: ${DEFAULT_START_ISO})
  --help, -h               Exibe esta ajuda
`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--generate-all")) {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      ".."
    );
    const outDir = path.join(repoRoot, "__tests__", "fixtures", "fit");
    generateAllFitFixtures(outDir);
    console.log(`✅ 10 fixtures .FIT geradas com sucesso em: ${outDir}`);
    process.exit(0);
  }

  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };

  const outPath = getArg("--out", null);
  if (!outPath) {
    console.error(
      "❌ Informe --out <caminho.fit> para salvar um arquivo individual ou --generate-all para gerar a suíte padrão."
    );
    printHelp();
    process.exit(1);
  }

  const distance = Number(getArg("--distance", "5000"));
  const paceSecondsPerKm = parsePaceArgToSeconds(getArg("--pace", "5:00"));
  const hz = Number(getArg("--hz", "1"));
  const stepSeconds = hz > 0 ? 1 / hz : 1;
  const lapsCount = Math.max(0, Math.round(Number(getArg("--laps", "0"))));
  const sport = getArg("--sport", "running");
  const subSport = getArg("--sub-sport", args.includes("--indoor") ? "treadmill" : "street");
  const omitGps = args.includes("--indoor");
  const workoutName = getArg("--workout-name", null);
  const startIso = getArg("--start-time", DEFAULT_START_ISO);
  const hr = args.includes("--no-hr") ? null : Number(getArg("--hr", "155"));
  const cad = args.includes("--no-cad") ? null : Number(getArg("--cad", "85"));
  const elevationGainMeters = args.includes("--no-ele")
    ? null
    : Number(getArg("--elevation-gain", "0"));
  const calories = args.includes("--no-calories")
    ? null
    : getArg("--calories", null) !== null
      ? Number(getArg("--calories", "0"))
      : null;
  const temperatureC = args.includes("--no-temp")
    ? null
    : Number(getArg("--temp", "22"));

  let lapsSpec = [{ distanceMeters: distance, paceSecondsPerKm }];
  let emitMultiLapMessages = true;

  if (lapsCount >= 2) {
    const perLap = Math.floor(distance / lapsCount);
    const remainder = distance - perLap * (lapsCount - 1);
    lapsSpec = [];
    for (let i = 0; i < lapsCount; i++) {
      lapsSpec.push({
        distanceMeters: i === lapsCount - 1 ? remainder : perLap,
        paceSecondsPerKm,
      });
    }
  } else {
    emitMultiLapMessages = false;
  }

  const buf = buildSyntheticFitBuffer({
    startIso,
    sport,
    subSport,
    workoutName,
    stepSeconds,
    lapsSpec,
    emitMultiLapMessages,
    omitGps,
    hr,
    cad,
    elevationGainMeters,
    calories,
    temperatureC,
  });

  const absOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, buf);
  console.log(
    `✅ Arquivo .FIT sintético salvo em: ${absOut} (${buf.length} bytes)`
  );
}
