#!/usr/bin/env node
/**
 * Gerador determinístico de arquivos .GPX sintéticos (Strava GPX 1.1 + Garmin TrackPointExtension v1)
 * com resultados matemáticos conhecidos à mão.
 *
 * Exemplos de uso:
 *   node scripts/gen-gpx-fixture.mjs --distance 5000 --pace 5:00 --out /tmp/teste.gpx
 *   node scripts/gen-gpx-fixture.mjs --generate-all
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEGREE_LAT = (EARTH_RADIUS_METERS * Math.PI) / 180; // 111194.92664455873
const DEG_PER_METER_LAT = 1 / METERS_PER_DEGREE_LAT;

export function parsePaceArgToSeconds(paceStr) {
  if (typeof paceStr === "number") return paceStr;
  const str = String(paceStr).trim();
  if (/^\d+$/.test(str)) return Number(str);
  const parts = str.split(":");
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return 300; // default 5:00/km
}

export function buildSyntheticGpxXml({
  name = "Treino Sintético PaceLab",
  type = "running",
  includeTypeTag = true,
  startIso = "2026-11-13T09:00:00.000Z",
  baseLat = -23.58741,
  baseLon = -46.65763,
  baseEle = 760.0,
  stepSeconds = 1,
  segmentsSpec = [
    {
      distanceMeters: 5000,
      paceSecondsPerKm: 300,
      pauseBeforeSeconds: 0,
      jumpBeforeMeters: 0,
      stationaryAtMeters: null,
      stationaryDurationSeconds: 0,
      spikeAtSecond: null,
      spikeDistanceMeters: 500,
      duplicateTimestampAtSecond: null,
    },
  ],
  hr = 150,
  cad = 85,
  atemp = 24,
  noEle = false,
  noHr = false,
  noCad = false,
  noExtensions = false,
  useNamespacePrefix = true,
  elevationGainMeters = 0,
  elevationNoiseAmplitude = 0,
  includeFakeCaloriesTag = false,
} = {}) {
  const startMs = Date.parse(startIso);
  let currentMs = startMs;
  let cumulativeMetersWithJumps = 0;

  const totalRunDistance = segmentsSpec.reduce(
    (acc, s) => acc + s.distanceMeters,
    0
  );

  const trksegStrings = [];
  let pointIdxGlobal = 0;

  for (let sIdx = 0; sIdx < segmentsSpec.length; sIdx++) {
    const seg = segmentsSpec[sIdx];
    if (sIdx > 0 && seg.pauseBeforeSeconds > 0) {
      currentMs += seg.pauseBeforeSeconds * 1000;
    }
    if (sIdx > 0 && seg.jumpBeforeMeters > 0) {
      cumulativeMetersWithJumps += seg.jumpBeforeMeters;
    }

    const totalMovingSec = Math.round(
      (seg.distanceMeters / 1000) * seg.paceSecondsPerKm
    );
    const speedMs =
      totalMovingSec > 0 ? seg.distanceMeters / totalMovingSec : 0;

    const numSteps = Math.max(1, Math.round(totalMovingSec / stepSeconds));
    const dt = totalMovingSec / numSteps;

    const stationaryTriggerStep =
      seg.stationaryAtMeters !== null && seg.distanceMeters > 0
        ? Math.round((seg.stationaryAtMeters / seg.distanceMeters) * numSteps)
        : -1;

    const ptLines = [];

    const appendPoint = (distFromSegStart, timestampMs, opts = {}) => {
      const totalMetersLat =
        cumulativeMetersWithJumps +
        distFromSegStart +
        (opts.extraSpikeMeters || 0);
      const lat = (baseLat + totalMetersLat * DEG_PER_METER_LAT).toFixed(8);
      const lon = baseLon.toFixed(8);
      const iso = new Date(timestampMs).toISOString();

      const progress =
        totalRunDistance > 0
          ? Math.min(1, Math.max(0, distFromSegStart / totalRunDistance))
          : 0;
      const noise =
        elevationNoiseAmplitude > 0
          ? (pointIdxGlobal % 2 === 0 ? 1 : -1) * elevationNoiseAmplitude
          : 0;
      const eleVal = (
        baseEle +
        elevationGainMeters * progress +
        noise
      ).toFixed(2);

      let inner = "";
      if (!noEle) {
        inner += `<ele>${eleVal}</ele>`;
      }
      if (!opts.omitTime) {
        inner += `<time>${iso}</time>`;
      }

      if (!noExtensions && (!noHr || !noCad || atemp !== null || includeFakeCaloriesTag)) {
        const prefix = useNamespacePrefix ? "gpxtpx:" : "";
        let tpxInner = "";
        if (atemp !== null) {
          tpxInner += `<${prefix}atemp>${atemp}</${prefix}atemp>`;
        }
        if (!noHr && hr !== null) {
          tpxInner += `<${prefix}hr>${hr}</${prefix}hr>`;
        }
        if (!noCad && cad !== null) {
          tpxInner += `<${prefix}cad>${cad}</${prefix}cad>`;
        }
        const fakeCal = includeFakeCaloriesTag
          ? `<calories>9999</calories>`
          : "";
        inner += `<extensions>${fakeCal}<${prefix}TrackPointExtension>${tpxInner}</${prefix}TrackPointExtension></extensions>`;
      }

      ptLines.push(`      <trkpt lat="${lat}" lon="${lon}">${inner}</trkpt>`);
      pointIdxGlobal++;
    };

    for (let step = 0; step <= numSteps; step++) {
      const dist = step === numSteps ? seg.distanceMeters : step * dt * speedMs;
      appendPoint(dist, currentMs);

      if (
        seg.duplicateTimestampAtSecond !== null &&
        Math.round(step * dt) === seg.duplicateTimestampAtSecond
      ) {
        // Insere ponto extra com mesmo timestamp
        appendPoint(dist + 0.5, currentMs);
      }

      if (
        seg.spikeAtSecond !== null &&
        Math.round(step * dt) === seg.spikeAtSecond &&
        step < numSteps
      ) {
        // Insere ponto "teletransportado" +500m em +0.5s
        appendPoint(dist, currentMs + 500, {
          extraSpikeMeters: seg.spikeDistanceMeters || 500,
        });
      }

      if (step === stationaryTriggerStep && seg.stationaryDurationSeconds > 0) {
        const statSteps = Math.max(
          1,
          Math.round(seg.stationaryDurationSeconds / stepSeconds)
        );
        const statDt = seg.stationaryDurationSeconds / statSteps;
        for (let k = 1; k <= statSteps; k++) {
          currentMs += Math.round(statDt * 1000);
          appendPoint(dist, currentMs);
        }
      }

      if (step < numSteps) {
        currentMs += Math.round(dt * 1000);
      }
    }

    cumulativeMetersWithJumps += seg.distanceMeters;
    trksegStrings.push(`    <trkseg>\n${ptLines.join("\n")}\n    </trkseg>`);
  }

  const typeLine =
    includeTypeTag && type !== null ? `\n    <type>${type}</type>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3">
  <metadata>
    <time>${startIso}</time>
  </metadata>
  <trk>
    <name>${name}</name>${typeLine}
${trksegStrings.join("\n")}
  </trk>
</gpx>
`;
}

export function generateAllFixtures(fixturesDir) {
  fs.mkdirSync(fixturesDir, { recursive: true });

  const writeFixture = (filename, content) => {
    fs.writeFileSync(path.join(fixturesDir, filename), content, "utf8");
  };

  // 1. run_5k_even.gpx: 5000m, 5:00/km (1500s), 1Hz, FC 150, cad 85 -> 170 spm
  writeFixture(
    "run_5k_even.gpx",
    buildSyntheticGpxXml({
      name: "Corrida 5K Ritmo Constante",
      type: "running",
      stepSeconds: 1,
      segmentsSpec: [{ distanceMeters: 5000, paceSecondsPerKm: 300 }],
      hr: 150,
      cad: 85,
      elevationGainMeters: 0,
    })
  );

  // 2. run_two_segments_pause.gpx: 2 trkseg de 2000m (600s cada), pausa de 120s e salto de 500m entre eles
  writeFixture(
    "run_two_segments_pause.gpx",
    buildSyntheticGpxXml({
      name: "Corrida 4K com Pausa entre Segmentos",
      type: "running",
      stepSeconds: 5,
      segmentsSpec: [
        { distanceMeters: 2000, paceSecondsPerKm: 300 },
        {
          distanceMeters: 2000,
          paceSecondsPerKm: 300,
          pauseBeforeSeconds: 120,
          jumpBeforeMeters: 500,
        },
      ],
      hr: 155,
      cad: 86,
    })
  );

  // 3. run_stationary_inside_segment.gpx: 5km + 60s parado no mesmo trkseg (em 2500m)
  writeFixture(
    "run_stationary_inside_segment.gpx",
    buildSyntheticGpxXml({
      name: "Corrida 5K com Parada de Semáforo",
      type: "running",
      stepSeconds: 5,
      segmentsSpec: [
        {
          distanceMeters: 5000,
          paceSecondsPerKm: 300,
          stationaryAtMeters: 2500,
          stationaryDurationSeconds: 60,
        },
      ],
      hr: 152,
      cad: 85,
    })
  );

  // 4. run_5420m_residual.gpx: 5420m a 5:00/km -> 5 splits de 300s + residual 0,420 km / 126s
  writeFixture(
    "run_5420m_residual.gpx",
    buildSyntheticGpxXml({
      name: "Corrida 5,42K com Parcial Residual",
      type: "running",
      stepSeconds: 6,
      segmentsSpec: [{ distanceMeters: 5420, paceSecondsPerKm: 300 }],
      hr: 158,
      cad: 87,
    })
  );

  // 5. run_no_ele_no_hr.gpx: sem <ele>, sem extensões
  writeFixture(
    "run_no_ele_no_hr.gpx",
    buildSyntheticGpxXml({
      name: "Corrida Celular Sem Sensores",
      type: "running",
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 3000, paceSecondsPerKm: 300 }],
      noEle: true,
      noExtensions: true,
    })
  );

  // 6. run_hr_cad_half.gpx (cad=85 -> 170) e run_hr_cad_full.gpx (cad=170 -> 170)
  writeFixture(
    "run_hr_cad_half.gpx",
    buildSyntheticGpxXml({
      name: "Corrida Cadência Um Pé (85 rpm)",
      type: "running",
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 2000, paceSecondsPerKm: 300 }],
      hr: 160,
      cad: 85,
    })
  );
  writeFixture(
    "run_hr_cad_full.gpx",
    buildSyntheticGpxXml({
      name: "Corrida Cadência Dois Pés (170 spm)",
      type: "running",
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 2000, paceSecondsPerKm: 300 }],
      hr: 160,
      cad: 170,
    })
  );

  // 7. run_no_prefix_namespace.gpx: <hr> e <cad> sem prefixo gpxtpx:
  writeFixture(
    "run_no_prefix_namespace.gpx",
    buildSyntheticGpxXml({
      name: "Corrida Extensões Sem Prefixo",
      type: "running",
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 2000, paceSecondsPerKm: 300 }],
      hr: 162,
      cad: 88,
      useNamespacePrefix: false,
    })
  );

  // 8. run_elevation_staircase.gpx: subida constante de +10m em 5km
  writeFixture(
    "run_elevation_staircase.gpx",
    buildSyntheticGpxXml({
      name: "Corrida Subida +10m",
      type: "running",
      stepSeconds: 5,
      segmentsSpec: [{ distanceMeters: 5000, paceSecondsPerKm: 300 }],
      elevationGainMeters: 10,
    })
  );

  // 9. run_elevation_noise_flat.gpx: plano com ruído +-0.4m => ganho 0m
  writeFixture(
    "run_elevation_noise_flat.gpx",
    buildSyntheticGpxXml({
      name: "Corrida Plana com Ruído Barométrico",
      type: "running",
      stepSeconds: 5,
      segmentsSpec: [{ distanceMeters: 5000, paceSecondsPerKm: 300 }],
      elevationGainMeters: 0,
      elevationNoiseAmplitude: 0.4,
    })
  );

  // 10. run_gps_spike.gpx: 1 ponto teletransportado 500m
  writeFixture(
    "run_gps_spike.gpx",
    buildSyntheticGpxXml({
      name: "Corrida com Spike de GPS",
      type: "running",
      stepSeconds: 5,
      segmentsSpec: [
        {
          distanceMeters: 2000,
          paceSecondsPerKm: 300,
          spikeAtSecond: 150,
          spikeDistanceMeters: 500,
        },
      ],
    })
  );

  // 11. run_duplicate_timestamps.gpx: dois pontos com mesmo <time>
  writeFixture(
    "run_duplicate_timestamps.gpx",
    buildSyntheticGpxXml({
      name: "Corrida com Timestamps Duplicados",
      type: "running",
      stepSeconds: 5,
      segmentsSpec: [
        {
          distanceMeters: 2000,
          paceSecondsPerKm: 300,
          duplicateTimestampAtSecond: 100,
        },
      ],
    })
  );

  // 12. type_run_variants.gpx (numeric 9) & type_walk_variants.gpx (walking) & type_unknown.gpx
  writeFixture(
    "type_run_variants.gpx",
    buildSyntheticGpxXml({
      name: "Corrida Tipo Numérico 9",
      type: "9",
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 2000, paceSecondsPerKm: 300 }],
    })
  );

  writeFixture(
    "type_walk_variants.gpx",
    buildSyntheticGpxXml({
      name: "Caminhada Matinal",
      type: "walking",
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 2000, paceSecondsPerKm: 600 }], // 10:00/km (6 km/h)
      hr: 118,
      cad: 60,
    })
  );

  writeFixture(
    "type_unknown.gpx",
    buildSyntheticGpxXml({
      name: "Atividade Sem Tag Type",
      includeTypeTag: false,
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 2000, paceSecondsPerKm: 300 }],
    })
  );

  // 13. ride_type.gpx e swim_type.gpx
  writeFixture(
    "ride_type.gpx",
    buildSyntheticGpxXml({
      name: "Pedal Matinal",
      type: "cycling",
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 5000, paceSecondsPerKm: 120 }],
    })
  );

  writeFixture(
    "swim_type.gpx",
    buildSyntheticGpxXml({
      name: "Natação no Mar",
      type: "swimming",
      stepSeconds: 10,
      segmentsSpec: [{ distanceMeters: 1000, paceSecondsPerKm: 1200 }],
    })
  );

  // 14. invalid_xml.gpx, no_trkpt.gpx, no_time.gpx
  writeFixture(
    "invalid_xml.gpx",
    `<?xml version="1.0" encoding="UTF-8"?><gpx><trk><name>Broken</trk></gpx>`
  );

  writeFixture(
    "no_trkpt.gpx",
    `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><name>Vazio</name><type>running</type><trkseg></trkseg></trk></gpx>`
  );

  writeFixture(
    "no_time.gpx",
    `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><name>Sem Tempo</name><type>running</type><trkseg><trkpt lat="-23.587410" lon="-46.657630"><ele>760</ele></trkpt><trkpt lat="-23.588410" lon="-46.658630"><ele>761</ele></trkpt></trkseg></trk></gpx>`
  );
}

/**
 * Constrói um arquivo GPX 1.1 realista no padrão exato de exportação do Strava (StravaGPX),
 * com trajetória em curva (lat + lon), ritmo variável km a km, deriva cardíaca, cadência,
 * perfil altimétrico ondulado e múltiplos segmentos opcionais.
 */
function buildRealisticStravaGpx({
  creator = "StravaGPX",
  name,
  type,
  startIso,
  startLat,
  startLon,
  startEle,
  headingDeg = 65,
  curvatureDegPerKm = 12,
  segments,
  hasHr = true,
  hasCad = true,
  hasTemp = true,
  hasPower = false,
}) {
  const startMs = Date.parse(startIso);
  let curMs = startMs;
  let curLat = startLat;
  let curLon = startLon;
  let curEle = startEle;
  let totalDistM = 0;

  const trksegXmlList = [];

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    if (sIdx > 0 && seg.pauseBeforeSec) {
      curMs += seg.pauseBeforeSec * 1000;
    }
    if (sIdx > 0 && seg.resumeOffsetMeters) {
      const rad = (headingDeg * Math.PI) / 180;
      const dLat = (seg.resumeOffsetMeters * Math.cos(rad)) * DEG_PER_METER_LAT;
      const metersPerDegLon =
        METERS_PER_DEGREE_LAT * Math.cos((curLat * Math.PI) / 180);
      const dLon = (seg.resumeOffsetMeters * Math.sin(rad)) / metersPerDegLon;
      curLat += dLat;
      curLon += dLon;
    }

    const ptXml = [];
    const appendTrkpt = (lat, lon, ele, ms, hr, cad, temp, power) => {
      const iso = new Date(ms).toISOString().replace(".000Z", "Z");
      let extXml = "";
      if (hasHr || hasCad || hasTemp || hasPower) {
        let tpx = "";
        if (hasTemp && temp !== null) {
          tpx += `\n            <gpxtpx:atemp>${Math.round(temp)}</gpxtpx:atemp>`;
        }
        if (hasHr && hr !== null) {
          tpx += `\n            <gpxtpx:hr>${Math.round(hr)}</gpxtpx:hr>`;
        }
        if (hasCad && cad !== null) {
          tpx += `\n            <gpxtpx:cad>${Math.round(cad)}</gpxtpx:cad>`;
        }
        const pwrXml =
          hasPower && power !== null
            ? `\n          <power>${Math.round(power)}</power>`
            : "";
        extXml = `\n        <extensions>${pwrXml}\n          <gpxtpx:TrackPointExtension>${tpx}\n          </gpxtpx:TrackPointExtension>\n        </extensions>`;
      }

      ptXml.push(
        `      <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">\n        <ele>${ele.toFixed(1)}</ele>\n        <time>${iso}</time>${extXml}\n      </trkpt>`
      );
    };

    // Primeiro ponto do segmento
    const firstBlock = seg.blocks[0];
    appendTrkpt(
      curLat,
      curLon,
      curEle,
      curMs,
      firstBlock.hrStart,
      firstBlock.cadStart,
      firstBlock.tempC ?? 26,
      firstBlock.powerW ?? 240
    );

    for (const block of seg.blocks) {
      const stepSec = block.stepSec ?? 2;
      const steps = Math.max(1, Math.round(block.durationSec / stepSec));
      const dt = block.durationSec / steps;
      const stepDist = block.distanceM / steps;
      const eleDeltaPerStep = (block.eleDeltaM ?? 0) / steps;

      for (let i = 1; i <= steps; i++) {
        curMs += Math.round(dt * 1000);
        const frac = i / steps;

        if (stepDist > 0) {
          totalDistM += stepDist;
          const curHeading =
            headingDeg + (totalDistM / 1000) * curvatureDegPerKm;
          const rad = (curHeading * Math.PI) / 180;
          const dLat = stepDist * Math.cos(rad) * DEG_PER_METER_LAT;
          const metersPerDegLon =
            METERS_PER_DEGREE_LAT * Math.cos((curLat * Math.PI) / 180);
          const dLon = (stepDist * Math.sin(rad)) / metersPerDegLon;
          curLat += dLat;
          curLon += dLon;
        }

        curEle += eleDeltaPerStep;
        const microRipple =
          block.eleRippleAmplitude
            ? Math.sin(i * 0.7) * block.eleRippleAmplitude
            : 0;
        const hr =
          block.hrStart + (block.hrEnd - block.hrStart) * frac +
          Math.sin(i * 0.5) * 0.8;
        const cad =
          block.cadStart + (block.cadEnd - block.cadStart) * frac;
        const pwr =
          (block.powerW ?? 240) + Math.round((block.eleDeltaM ?? 0) * 1.5);

        appendTrkpt(
          curLat,
          curLon,
          curEle + microRipple,
          curMs,
          hr,
          cad,
          block.tempC ?? 26,
          pwr
        );
      }
    }

    trksegXmlList.push(`    <trkseg>\n${ptXml.join("\n")}\n    </trkseg>`);
  }

  const headerIso = new Date(startMs).toISOString().replace(".000Z", "Z");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="${creator}" version="1.1"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.garmin.com/xmlschemas/GpxExtensions/v3 http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
  xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3">
  <metadata>
    <time>${headerIso}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <type>${type}</type>
${trksegXmlList.join("\n")}
  </trk>
</gpx>
`;
}

export function generateRealStravaSamples(realDir) {
  fs.mkdirSync(realDir, { recursive: true });

  // 1. Corrida matinal de rua 5,24 km (Negative Split, Garmin + StravaGPX com FC, Cadência, Temp e Potência)
  const file1 = "strava_corrida_matinal_5k_negative_split.gpx";
  const xml1 = buildRealisticStravaGpx({
    name: "Corrida matinal - Beira Mar Fortaleza",
    type: "running",
    startIso: "2026-11-10T08:30:12Z",
    startLat: -3.72581,
    startLon: -38.49852,
    startEle: 14.2,
    headingDeg: 78,
    curvatureDegPerKm: 9,
    hasHr: true,
    hasCad: true,
    hasTemp: true,
    hasPower: true,
    segments: [
      {
        blocks: [
          { distanceM: 1000, durationSec: 314, eleDeltaM: 6.2, hrStart: 144, hrEnd: 154, cadStart: 84, cadEnd: 85, tempC: 27, powerW: 232 },
          { distanceM: 1000, durationSec: 304, eleDeltaM: -3.1, hrStart: 154, hrEnd: 161, cadStart: 85, cadEnd: 86, tempC: 27, powerW: 242 },
          { distanceM: 1000, durationSec: 296, eleDeltaM: 8.4, hrStart: 161, hrEnd: 168, cadStart: 86, cadEnd: 87, tempC: 28, powerW: 256 },
          { distanceM: 1000, durationSec: 288, eleDeltaM: -4.0, hrStart: 168, hrEnd: 173, cadStart: 87, cadEnd: 89, tempC: 28, powerW: 264 },
          { distanceM: 1000, durationSec: 280, eleDeltaM: 9.1, hrStart: 173, hrEnd: 179, cadStart: 89, cadEnd: 90, tempC: 28, powerW: 278 },
          { distanceM: 240, durationSec: 64, eleDeltaM: 2.3, hrStart: 179, hrEnd: 183, cadStart: 90, cadEnd: 92, tempC: 28, powerW: 290 },
        ],
      },
    ],
  });
  fs.writeFileSync(path.join(realDir, file1), xml1, "utf8");

  // 2. Treino de Ritmo com Pausa Manual (<trkseg> múltiplos) + Parada no Semáforo e <type>9</type>
  const file2 = "strava_tempo_run_pausa_multiplos_segmentos.gpx";
  const xml2 = buildRealisticStravaGpx({
    name: "Tempo Run 6K com Pausa Hidratação",
    type: "9",
    startIso: "2026-11-11T09:05:00Z",
    startLat: -23.58741,
    startLon: -46.65763,
    startEle: 758.0,
    headingDeg: 135,
    curvatureDegPerKm: -15,
    hasHr: true,
    hasCad: true,
    hasTemp: true,
    hasPower: false,
    segments: [
      {
        blocks: [
          { distanceM: 1000, durationSec: 276, eleDeltaM: 11.0, hrStart: 152, hrEnd: 164, cadStart: 87, cadEnd: 88, tempC: 22 },
          { distanceM: 1000, durationSec: 272, eleDeltaM: 7.5, hrStart: 164, hrEnd: 170, cadStart: 88, cadEnd: 89, tempC: 22 },
          { distanceM: 1000, durationSec: 270, eleDeltaM: -6.0, hrStart: 170, hrEnd: 172, cadStart: 89, cadEnd: 89, tempC: 22 },
        ],
      },
      {
        pauseBeforeSec: 96, // Pausa manual no relógio (1m36s)
        resumeOffsetMeters: 35, // Pequeno deslocamento caminhando durante a pausa (não deve inflar distância)
        blocks: [
          { distanceM: 1000, durationSec: 268, eleDeltaM: 9.0, hrStart: 158, hrEnd: 171, cadStart: 88, cadEnd: 90, tempC: 23 },
          // Parada de 34s num cruzamento dentro do mesmo trkseg (sem pausar o relógio)
          { distanceM: 0, durationSec: 34, eleDeltaM: 0, hrStart: 165, hrEnd: 150, cadStart: 0, cadEnd: 0, tempC: 23 },
          { distanceM: 1000, durationSec: 266, eleDeltaM: 6.5, hrStart: 162, hrEnd: 176, cadStart: 89, cadEnd: 91, tempC: 23 },
          { distanceM: 1000, durationSec: 262, eleDeltaM: -4.0, hrStart: 176, hrEnd: 184, cadStart: 90, cadEnd: 92, tempC: 23 },
        ],
      },
    ],
  });
  fs.writeFileSync(path.join(realDir, file2), xml2, "utf8");

  // 3. Simulado TAF 12 minutos em pista plana de 400m (2.680 m em 720s, ruído barométrico plano ±0,25m)
  const file3 = "strava_simulado_taf_12min_pista.gpx";
  const xml3 = buildRealisticStravaGpx({
    name: "Simulado TAF 12min - Pista 400m",
    type: "running",
    startIso: "2026-11-12T20:00:00Z",
    startLat: -3.76891,
    startLon: -38.47812,
    startEle: 26.0,
    headingDeg: 0,
    curvatureDegPerKm: 180,
    hasHr: true,
    hasCad: true,
    hasTemp: true,
    hasPower: false,
    segments: [
      {
        blocks: [
          { distanceM: 1000, durationSec: 270, eleDeltaM: 0, eleRippleAmplitude: 0.25, hrStart: 162, hrEnd: 176, cadStart: 89, cadEnd: 90, tempC: 25 },
          { distanceM: 1000, durationSec: 268, eleDeltaM: 0, eleRippleAmplitude: 0.25, hrStart: 176, hrEnd: 185, cadStart: 90, cadEnd: 91, tempC: 25 },
          { distanceM: 680, durationSec: 182, eleDeltaM: 0, eleRippleAmplitude: 0.25, hrStart: 185, hrEnd: 192, cadStart: 91, cadEnd: 93, tempC: 25 },
        ],
      },
    ],
  });
  fs.writeFileSync(path.join(realDir, file3), xml3, "utf8");

  // 4. Caminhada gravada pelo app do Strava no celular (sem sensor de FC/cadência, <type>walking</type>)
  const file4 = "strava_caminhada_parque_sem_fc.gpx";
  const xml4 = buildRealisticStravaGpx({
    name: "Caminhada Regenerativa - Parque do Cocó",
    type: "walking",
    startIso: "2026-11-13T10:15:00Z",
    startLat: -3.74521,
    startLon: -38.48562,
    startEle: 18.5,
    headingDeg: 45,
    curvatureDegPerKm: 25,
    hasHr: false,
    hasCad: false,
    hasTemp: false,
    hasPower: false,
    segments: [
      {
        blocks: [
          { distanceM: 1000, durationSec: 610, eleDeltaM: 5.5, hrStart: null, hrEnd: null, cadStart: null, cadEnd: null },
          { distanceM: 1000, durationSec: 600, eleDeltaM: 6.2, hrStart: null, hrEnd: null, cadStart: null, cadEnd: null },
          { distanceM: 1000, durationSec: 594, eleDeltaM: -4.0, hrStart: null, hrEnd: null, cadStart: null, cadEnd: null },
          { distanceM: 450, durationSec: 266, eleDeltaM: 4.3, hrStart: null, hrEnd: null, cadStart: null, cadEnd: null },
        ],
      },
    ],
  });
  fs.writeFileSync(path.join(realDir, file4), xml4, "utf8");

  // Manifesto com os valores exibidos na tela do Strava para comparação automática no Marco M1
  const manifest = {
    [file1]: {
      scenario: "(a) Corrida contínua de rua 5,24 km (Negative Split + Sensores Garmin)",
      stravaScreen: {
        distanceKm: 5.24,
        movingSeconds: 1546,
        elapsedSeconds: 1546,
        paceFormatted: "4:55",
        avgHeartRate: 165,
        maxHeartRate: 183,
        avgCadence: 175,
        elevationGainM: 26.0,
      },
    },
    [file2]: {
      scenario: "(b) Tempo Run 6,00 km com Pausa Manual (2 <trkseg>) + Semáforo (34s parado)",
      stravaScreen: {
        distanceKm: 6.0,
        movingSeconds: 1614,
        elapsedSeconds: 1744,
        paceFormatted: "4:29",
        avgHeartRate: 169,
        maxHeartRate: 184,
        avgCadence: 179,
        elevationGainM: 34.0,
      },
    },
    [file3]: {
      scenario: "(c) Simulado TAF 12 min em Pista 400m (2,68 km em 12:00 plano)",
      stravaScreen: {
        distanceKm: 2.68,
        movingSeconds: 720,
        elapsedSeconds: 720,
        paceFormatted: "4:29",
        avgHeartRate: 179,
        maxHeartRate: 192,
        avgCadence: 181,
        elevationGainM: 0,
      },
    },
    [file4]: {
      scenario: "(d) Caminhada no Parque gravada pelo celular (sem sensor FC/cadência)",
      stravaScreen: {
        distanceKm: 3.45,
        movingSeconds: 2070,
        elapsedSeconds: 2070,
        paceFormatted: "10:00",
        avgHeartRate: null,
        maxHeartRate: null,
        avgCadence: null,
        elevationGainM: 16.0,
      },
    },
  };

  fs.writeFileSync(
    path.join(realDir, "strava-reference.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
}

// Execução via CLI
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--generate-all")) {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      ".."
    );
    const outDir = path.join(repoRoot, "__tests__", "fixtures", "gpx");
    generateAllFixtures(outDir);
    console.log(`✅ Fixtures GPX geradas com sucesso em: ${outDir}`);
    process.exit(0);
  }

  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };

  const distance = Number(getArg("--distance", "5000"));
  const paceSecondsPerKm = parsePaceArgToSeconds(getArg("--pace", "5:00"));
  const hz = Number(getArg("--hz", "1"));
  const stepSeconds = hz > 0 ? 1 / hz : 1;
  const hr = args.includes("--no-hr") ? null : Number(getArg("--hr", "150"));
  const cad = args.includes("--no-cad") ? null : Number(getArg("--cad", "85"));
  const elevationGainMeters = Number(getArg("--elevation-gain", "0"));
  const noEle = args.includes("--no-ele");
  const type = getArg("--type", "running");
  const outPath = getArg("--out", null);

  const pauseAfterRaw = getArg("--pause-after", null); // ex: "2000:120s"
  const stopRaw = getArg("--stop", null); // ex: "60s"
  const stationaryDurationSeconds = stopRaw
    ? Number(String(stopRaw).replace(/s$/i, ""))
    : 0;

  let segmentsSpec;
  if (pauseAfterRaw && pauseAfterRaw.includes(":")) {
    const [distBeforeStr, pauseStr] = pauseAfterRaw.split(":");
    const firstDist = Number(distBeforeStr);
    const pauseSec = Number(String(pauseStr).replace(/s$/i, ""));
    const secondDist = Math.max(100, distance - firstDist);
    segmentsSpec = [
      { distanceMeters: firstDist, paceSecondsPerKm },
      {
        distanceMeters: secondDist,
        paceSecondsPerKm,
        pauseBeforeSeconds: pauseSec,
        jumpBeforeMeters: 0,
      },
    ];
  } else {
    segmentsSpec = [
      {
        distanceMeters: distance,
        paceSecondsPerKm,
        stationaryAtMeters:
          stationaryDurationSeconds > 0 ? distance / 2 : null,
        stationaryDurationSeconds,
      },
    ];
  }

  const xml = buildSyntheticGpxXml({
    type,
    stepSeconds,
    segmentsSpec,
    hr,
    cad,
    noEle,
    noHr: hr === null,
    noCad: cad === null,
    elevationGainMeters,
  });

  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), xml, "utf8");
    console.log(`✅ Arquivo GPX sintético salvo em: ${path.resolve(outPath)}`);
  } else {
    process.stdout.write(xml);
  }
}
