import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { Encoder, Profile } from "@garmin/fitsdk";
import {
  computeFitExternalId,
  FitParseError,
  fitParserService,
  isFitBuffer,
  isFitParseError,
  parseFit,
  semicirclesToDegrees,
} from "@/lib/fit";
import {
  hasExplicitTimerPauseEvents,
  motionStepsToSplitInputs,
} from "@/lib/fit/movingMetrics";

/**
 * Helper que codifica mensagens FIT reais em binário usando o `Encoder` oficial do `@garmin/fitsdk`.
 */
function buildFitBuffer(options: {
  session?: Record<string, unknown>;
  laps?: Array<Record<string, unknown>>;
  records?: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  sports?: Array<Record<string, unknown>>;
  workout?: Record<string, unknown>;
}): Buffer {
  const enc = new Encoder();
  enc.onMesg(
    Profile.MesgNum.FILE_ID,
    {
      type: "activity",
      manufacturer: "garmin",
      product: 1,
      timeCreated: new Date("2026-11-10T09:00:00Z"),
    } as never
  );

  if (options.workout) {
    enc.onMesg(Profile.MesgNum.WORKOUT, options.workout as never);
  }

  for (const sp of options.sports ?? []) {
    enc.onMesg(Profile.MesgNum.SPORT, sp as never);
  }

  for (const ev of options.events ?? []) {
    enc.onMesg(Profile.MesgNum.EVENT, ev as never);
  }

  for (const rec of options.records ?? []) {
    enc.onMesg(Profile.MesgNum.RECORD, rec as never);
  }

  for (const lap of options.laps ?? []) {
    enc.onMesg(Profile.MesgNum.LAP, lap as never);
  }

  if (options.session) {
    enc.onMesg(Profile.MesgNum.SESSION, options.session as never);
  }

  enc.onMesg(
    Profile.MesgNum.ACTIVITY,
    {
      timestamp: new Date("2026-11-10T09:30:00Z"),
      numSessions: options.session ? 1 : 0,
    } as never
  );

  return Buffer.from(enc.close());
}

describe("lib/fit/parseFit — Parser Binário .FIT (@garmin/fitsdk)", () => {
  describe("Detecção binária e utilitários (isFitBuffer, semicirclesToDegrees, computeFitExternalId)", () => {
    it("identifica corretamente um buffer .FIT válido pelos bytes 8..11 ('.FIT') e Decoder.isFIT", () => {
      const validBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T09:00:00Z"),
          totalTimerTime: 1500,
          totalElapsedTime: 1520,
          totalDistance: 5000,
          sport: "running",
        },
      });

      expect(validBuf.subarray(8, 12).toString("ascii")).toBe(".FIT");
      expect(isFitBuffer(validBuf)).toBe(true);
      expect(isFitBuffer(new Uint8Array(validBuf))).toBe(true);
      expect(isFitBuffer(new Uint8Array(validBuf).buffer as ArrayBuffer)).toBe(true);
    });

    it("rejeita buffers vazios, XML GPX ou binários corrompidos em isFitBuffer", () => {
      expect(isFitBuffer(null)).toBe(false);
      expect(isFitBuffer(undefined)).toBe(false);
      expect(isFitBuffer(Buffer.alloc(0))).toBe(false);
      expect(isFitBuffer(Buffer.from("<gpx version='1.1'></gpx>", "utf8"))).toBe(false);
      expect(isFitBuffer(Buffer.from("0123456789ABCDEF", "ascii"))).toBe(false);
    });

    it("converte semicircles para graus decimais via semicircles * (180 / 2^31)", () => {
      // -23.55052° (São Paulo) em semicircles
      const spLatSemicircles = Math.round(-23.55052 * (Math.pow(2, 31) / 180));
      const deg = semicirclesToDegrees(spLatSemicircles);
      expect(deg).not.toBeNull();
      expect(deg!).toBeCloseTo(-23.55052, 5);

      // Valor sentinela inválido do protocolo FIT (0x7FFFFFFF)
      expect(semicirclesToDegrees(0x7fffffff)).toBeNull();
      expect(semicirclesToDegrees(null)).toBeNull();
      expect(semicirclesToDegrees(undefined)).toBeNull();
      expect(semicirclesToDegrees(Number.NaN)).toBeNull();
    });

    it("gera externalId determinístico com prefixo fit_ + sha256(startTimeIso_distanceMeters)", () => {
      const id1 = computeFitExternalId("2026-11-10T09:00:00.000Z", 5.0);
      const id2 = computeFitExternalId("2026-11-10T09:00:00.000Z", 5.0001);
      const idDiff = computeFitExternalId("2026-11-10T09:00:00.000Z", 5.01);

      expect(id1).toMatch(/^fit_[a-f0-9]{64}$/);
      expect(id1).toBe(id2); // ambos arredondam para 5000 m
      expect(id1).not.toBe(idDiff);
    });
  });

  describe("Extração de sessionMesgs[0] e lapMesgs (>= 2 voltas)", () => {
    it("extrai resumo oficial da sessão, multiplica avgRunningCadence por 2 e mapeia lapMesgs (>= 2) para splits e laps", () => {
      const start = new Date("2026-11-10T09:00:00Z");
      const latSemi = Math.round(-23.5505 * (Math.pow(2, 31) / 180));
      const lonSemi = Math.round(-46.6333 * (Math.pow(2, 31) / 180));

      const fitBuf = buildFitBuffer({
        records: [
          {
            timestamp: new Date("2026-11-10T09:00:00Z"),
            positionLat: latSemi,
            positionLong: lonSemi,
            distance: 0,
            altitude: 760,
            heartRate: 145,
            cadence: 85,
            temperature: 22,
          },
          {
            timestamp: new Date("2026-11-10T09:15:00Z"),
            positionLat: latSemi + 1000,
            positionLong: lonSemi + 1000,
            distance: 3000,
            altitude: 785,
            heartRate: 168,
            cadence: 87,
            temperature: 24,
          },
        ],
        laps: [
          {
            startTime: new Date("2026-11-10T09:00:00Z"),
            totalTimerTime: 300,
            totalElapsedTime: 302,
            totalDistance: 1000,
            avgHeartRate: 152,
            totalAscent: 8,
            totalDescent: 2,
          },
          {
            startTime: new Date("2026-11-10T09:05:00Z"),
            totalTimerTime: 295,
            totalElapsedTime: 295,
            totalDistance: 1000,
            avgHeartRate: 160,
            totalAscent: 10,
            totalDescent: 3,
          },
          {
            startTime: new Date("2026-11-10T09:10:00Z"),
            totalTimerTime: 305,
            totalElapsedTime: 313,
            totalDistance: 1000,
            avgHeartRate: 165,
            totalAscent: 7,
            totalDescent: 5,
          },
        ],
        session: {
          startTime: start,
          timestamp: new Date("2026-11-10T09:15:10Z"),
          totalTimerTime: 900, // 15:00 em movimento
          totalElapsedTime: 910, // 15:10 decorrido
          totalDistance: 3000, // 3,000 km
          sport: "running",
          subSport: "street",
          avgHeartRate: 159,
          maxHeartRate: 176,
          avgCadence: 86, // SDK expande avgRunningCadence = 86 (1 pé -> 172 spm)
          totalAscent: 25,
          totalCalories: 245,
          avgTemperature: 23,
        },
      });

      const parsed = parseFit(fitBuf);

      expect(parsed.source).toBe("fit_upload");
      expect(parsed.sourceActivityKind).toBe("run");
      expect(parsed.isIndoor).toBe(false);
      expect(parsed.startedAt).toBe("2026-11-10T09:00:00.000Z");
      expect(parsed.distanceKm).toBe(3);
      expect(parsed.durationSeconds).toBe(900);
      expect(parsed.elapsedSeconds).toBe(910);
      expect(parsed.speedKmh).toBe(12);
      expect(parsed.paceSeconds).toBe(300);
      expect(parsed.paceFormatted).toBe("5:00");
      expect(parsed.avgHeartRate).toBe(159);
      expect(parsed.maxHeartRate).toBe(176);
      expect(parsed.avgCadence).toBe(172); // 86 * 2
      expect(parsed.elevationGainM).toBe(25);
      expect(parsed.activeCalories).toBe(245);
      expect(parsed.avgTemperatureC).toBe(23);
      expect(parsed.lapCount).toBe(3);
      expect(parsed.splits).toHaveLength(3);
      expect(parsed.splits[0]).toEqual({
        kilometer: 1,
        distanceKm: 1,
        durationSeconds: 300,
        paceSeconds: 300,
        paceFormatted: "5:00",
        avgHeartRate: 152,
        elevationDiffM: 6,
      });
      expect(parsed.splits[1].paceFormatted).toBe("4:55");
      expect(parsed.splits[2].paceFormatted).toBe("5:05");
      expect(parsed.laps).toHaveLength(3);
      expect(parsed.laps[0]).toEqual({
        lapNumber: 1,
        distanceMeters: 1000,
        durationSeconds: 300,
        paceFormatted: "5:00",
      });
      expect(parsed.externalId).toBe(
        computeFitExternalId("2026-11-10T09:00:00.000Z", 3)
      );
      expect(parsed.warnings.some((w) => w.code === "CADENCE_DOUBLED")).toBe(true);
    });
  });

  describe("Geração de splits a partir de recordMesgs quando lapMesgs tem <= 1 volta", () => {
    it("acumula distância e tempo dos recordMesgs para gerar splits km a km quando há apenas 1 lap único", () => {
      const baseMs = Date.parse("2026-11-10T10:00:00Z");
      const records = [];
      // 2,5 km em 750s (300s/km = 5:00/km), 1 registro a cada 250m (75s)
      for (let i = 0; i <= 10; i++) {
        records.push({
          timestamp: new Date(baseMs + i * 75 * 1000),
          distance: i * 250,
          altitude: 700 + i * 2,
          heartRate: 150 + i,
          cadence: 85,
        });
      }

      const fitBuf = buildFitBuffer({
        records,
        laps: [
          {
            startTime: new Date(baseMs),
            totalTimerTime: 750,
            totalElapsedTime: 750,
            totalDistance: 2500,
          },
        ],
        session: {
          startTime: new Date(baseMs),
          totalTimerTime: 750,
          totalElapsedTime: 750,
          totalDistance: 2500,
          sport: "running",
          avgHeartRate: 155,
          maxHeartRate: 165,
          avgCadence: 85,
          totalAscent: 20,
        },
      });

      const parsed = parseFit(fitBuf);

      expect(parsed.distanceKm).toBe(2.5);
      expect(parsed.durationSeconds).toBe(750);
      expect(parsed.splits).toHaveLength(3);
      expect(parsed.splits[0].kilometer).toBe(1);
      expect(parsed.splits[0].distanceKm).toBe(1);
      expect(parsed.splits[0].paceFormatted).toBe("5:00");
      expect(parsed.splits[1].kilometer).toBe(2);
      expect(parsed.splits[1].distanceKm).toBe(1);
      expect(parsed.splits[1].paceFormatted).toBe("5:00");
      expect(parsed.splits[2].kilometer).toBe(3);
      expect(parsed.splits[2].distanceKm).toBe(0.5);
      expect(parsed.splits[2].durationSeconds).toBe(150);
      expect(parsed.splits[2].paceFormatted).toBe("5:00");
      expect(parsed.warnings.some((w) => w.code === "SPLITS_FROM_RECORDS")).toBe(true);
    });
  });

  describe("Suporte a esteira / treino indoor sem GPS (subSport = 'treadmill')", () => {
    it("extrai distância, tempo, pace, FC, cadência e calorias mesmo sem coordenadas GPS", () => {
      const fitBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T18:00:00Z"),
          totalTimerTime: 1800, // 30:00
          totalElapsedTime: 1800,
          totalDistance: 5000, // 5 km na esteira
          sport: "running",
          subSport: "treadmill",
          avgHeartRate: 162,
          maxHeartRate: 178,
          avgCadence: 88, // 176 spm
          totalCalories: 390,
        },
      });

      const parsed = parseFit(fitBuf);

      expect(parsed.isIndoor).toBe(true);
      expect(parsed.sourceActivityKind).toBe("run");
      expect(parsed.subSport).toBe("treadmill");
      expect(parsed.distanceKm).toBe(5);
      expect(parsed.durationSeconds).toBe(1800);
      expect(parsed.paceFormatted).toBe("6:00");
      expect(parsed.avgHeartRate).toBe(162);
      expect(parsed.maxHeartRate).toBe(178);
      expect(parsed.avgCadence).toBe(176);
      expect(parsed.activeCalories).toBe(390);
      expect(parsed.elevationGainM).toBeNull();
      expect(parsed.splits).toHaveLength(5);
      expect(parsed.warnings.some((w) => w.code === "INDOOR_ACTIVITY_NO_GPS")).toBe(true);
      expect(parsed.warnings.some((w) => w.code === "SPLITS_SYNTHESIZED_FROM_SESSION")).toBe(true);
    });
  });

  describe("Classificação de caminhada e bloqueio de esportes incompatíveis", () => {
    it("classifica sport='walking' como sourceActivityKind='walk'", () => {
      const fitBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T11:00:00Z"),
          totalTimerTime: 1200, // 20 min
          totalElapsedTime: 1220,
          totalDistance: 2000, // 2 km -> 6 km/h
          sport: "walking",
          avgHeartRate: 112,
          maxHeartRate: 125,
          totalAscent: 12,
        },
      });

      const parsed = fitParserService.parseFit(fitBuf);
      expect(parsed.sourceActivityKind).toBe("walk");
      expect(parsed.distanceKm).toBe(2);
      expect(parsed.paceFormatted).toBe("10:00");
    });

    it("classifica camelCase de caminhada (casualWalking, indoorWalking, speedWalking), caminhada em esteira/trilha (sport='walking' + subSport='treadmill') e sportMesgs", () => {
      const casualGenericBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T10:00:00Z"),
          totalTimerTime: 1800,
          totalElapsedTime: 1800,
          totalDistance: 2500,
          sport: "generic",
          subSport: "casualWalking",
        },
      });
      expect(parseFit(casualGenericBuf).sourceActivityKind).toBe("walk");

      const indoorFitnessBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T10:00:00Z"),
          totalTimerTime: 1800,
          totalElapsedTime: 1800,
          totalDistance: 2400,
          sport: "fitnessEquipment",
          subSport: "indoorWalking",
        },
      });
      const indoorWalk = parseFit(indoorFitnessBuf);
      expect(indoorWalk.sourceActivityKind).toBe("walk");
      expect(indoorWalk.isIndoor).toBe(true);

      // Caminhada explícita na esteira (sport='walking', subSport='treadmill') NÃO pode ser rebaixada para corrida
      const treadmillWalkBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T10:00:00Z"),
          totalTimerTime: 1500,
          totalElapsedTime: 1500,
          totalDistance: 2200,
          sport: "walking",
          subSport: "treadmill",
        },
      });
      const treadmillWalk = parseFit(treadmillWalkBuf);
      expect(treadmillWalk.sourceActivityKind).toBe("walk");
      expect(treadmillWalk.isIndoor).toBe(true);

      // Session genérica desambiguada por sportMesgs + código numérico FIT (11=walking, 1=running)
      const sportMesgWalkBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T10:00:00Z"),
          totalTimerTime: 1200,
          totalElapsedTime: 1200,
          totalDistance: 1600,
          sport: "generic",
        },
        sports: [{ sport: "walking", subSport: "casualWalking" }],
      });
      expect(parseFit(sportMesgWalkBuf).sourceActivityKind).toBe("walk");

      const numericWalkBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T10:00:00Z"),
          totalTimerTime: 1200,
          totalElapsedTime: 1200,
          totalDistance: 1700,
          sport: 11,
        },
      });
      expect(parseFit(numericWalkBuf).sourceActivityKind).toBe("walk");

      const numericRunBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T10:00:00Z"),
          totalTimerTime: 1200,
          totalElapsedTime: 1200,
          totalDistance: 4000,
          sport: 1,
        },
      });
      expect(parseFit(numericRunBuf).sourceActivityKind).toBe("run");
    });

    it("rejeita esporte incompatível (sport='cycling') com FitParseError UNSUPPORTED_ACTIVITY", () => {
      const fitBuf = buildFitBuffer({
        session: {
          startTime: new Date("2026-11-10T11:00:00Z"),
          totalTimerTime: 3600,
          totalElapsedTime: 3600,
          totalDistance: 30000,
          sport: "cycling",
        },
      });

      try {
        parseFit(fitBuf);
        expect.fail("Deveria ter lançado FitParseError UNSUPPORTED_ACTIVITY");
      } catch (err) {
        expect(isFitParseError(err)).toBe(true);
        expect((err as FitParseError).code).toBe("UNSUPPORTED_ACTIVITY");
      }
    });

    it("rejeita arquivo não-FIT com FitParseError INVALID_FIT", () => {
      expect(() => parseFit(Buffer.from("arquivo invalido", "utf8"))).toThrowError(
        FitParseError
      );
    });
  });

  describe("Precisão de movimento, parciais, pausas e elevação (Fase 1)", () => {
    it("detecta pausas estilo Strava Mobile em caminhada sem totalMovingTime, preserva elapsedSeconds, evita inflar Km 1 e calcula elevationDiffM", () => {
      const startMs = Date.parse("2026-11-10T10:00:00Z");
      const start = new Date(startMs);
      const records: Array<Record<string, unknown>> = [];

      let currentDist = 0;
      const dKm1 = 1000 / 587; // 588s totais, com 1s isolado parado no segundo 300 (deve coalescer como movimento)
      const dKm2 = 1000 / 804; // 809s totais, com pausa sustentada de 5s
      const dKm3 = 840 / 734; // 744s totais, com pausa sustentada de 10s

      const altitudeAtSecond = (sec: number): number => {
        if (sec <= 588) {
          // Desce gradualmente de 105m para 102m no Km 1
          return Number((105 - (3 * sec) / 588).toFixed(2));
        }
        if (sec <= 1397) {
          // Sobe suavemente de 102m para 105m no Km 2
          return Number((102 + (3 * (sec - 588)) / 809).toFixed(2));
        }
        // Sobe acentuadamente de 105m para 119m no Km 3
        return Number((105 + (14 * (sec - 1397)) / 744).toFixed(2));
      };

      records.push({
        timestamp: start,
        distance: 0,
        speed: dKm1,
        altitude: 105,
      });

      for (let sec = 1; sec <= 2141; sec++) {
        let stepDist = 0;
        let speed = 0;

        if (sec <= 588) {
          if (sec === 300) {
            // Oscilação isolada de 1s (< FIT_PAUSE_HYSTERESIS_MIN_SECONDS): não deve contar como pausa
            stepDist = 0;
            speed = 0;
          } else {
            stepDist = dKm1;
            speed = dKm1;
          }
        } else if (sec <= 1397) {
          if (sec >= 1001 && sec <= 1005) {
            // Pausa de 5s no Km 2
            stepDist = 0;
            speed = 0;
          } else {
            stepDist = dKm2;
            speed = dKm2;
          }
        } else {
          if (sec >= 1701 && sec <= 1710) {
            // Pausa de 10s no Km 3
            stepDist = 0;
            speed = 0;
          } else {
            stepDist = dKm3;
            speed = dKm3;
          }
        }

        currentDist += stepDist;
        records.push({
          timestamp: new Date(startMs + sec * 1000),
          distance: Number(currentDist.toFixed(3)),
          speed: Number(speed.toFixed(3)),
          altitude: altitudeAtSecond(sec),
        });
      }

      const fitBuf = buildFitBuffer({
        records,
        laps: [
          {
            startTime: start,
            totalElapsedTime: 588,
            totalTimerTime: 588,
            totalDistance: 1000,
          },
          {
            startTime: new Date(startMs + 588 * 1000),
            totalElapsedTime: 809,
            totalTimerTime: 809,
            totalDistance: 1000,
          },
          {
            startTime: new Date(startMs + 1397 * 1000),
            totalElapsedTime: 744,
            totalTimerTime: 744,
            totalDistance: 840,
          },
        ],
        session: {
          startTime: start,
          totalElapsedTime: 2141,
          totalTimerTime: 2141,
          totalDistance: 2840,
          sport: "walking",
        },
      });

      const parsed = parseFit(fitBuf);

      expect(parsed.sport).toBe("walking");
      expect(parsed.distanceKm).toBe(2.84);
      expect(parsed.durationSeconds).toBe(2126); // 35:26 sem os 15s parados
      expect(parsed.elapsedSeconds).toBe(2141); // 35:41 com pausas preservado
      expect(parsed.elevationGainM).toBeGreaterThan(0);
      expect(parsed.warnings.some((w) => w.code === "PAUSES_DETECTED_FROM_RECORDS")).toBe(true);

      expect(parsed.splits).toHaveLength(3);
      expect(parsed.splits[0].distanceKm).toBe(1);
      expect(parsed.splits[0].durationSeconds).toBe(588); // Km 1 não inflado (oscilação 1s ignorada)
      expect(parsed.splits[1].distanceKm).toBe(1);
      expect(parsed.splits[1].durationSeconds).toBe(804); // 809s - 5s parada
      expect(parsed.splits[2].distanceKm).toBe(0.84);
      expect(parsed.splits[2].durationSeconds).toBe(734); // 744s - 10s parada

      for (const split of parsed.splits) {
        expect(split.elevationDiffM).not.toBeNull();
      }
      expect(parsed.splits[2].elevationDiffM).toBeGreaterThan(10);
    });

    it("prioriza totalMovingTime da sessão/laps (Prioridade 1) sem aplicar duplo desconto de pausa", () => {
      const startMs = Date.parse("2026-11-10T10:30:00Z");
      const start = new Date(startMs);
      const records: Array<Record<string, unknown>> = [];

      // 200 steps de 5s (= 1000s). Nos passos 91..110 (100s) a velocidade nos records cai para 0.5 m/s (< 0.85 m/s):
      // Se rodasse detecção por records, descontaria 100s (caindo para 900s), mas com session.totalMovingTime=980 deve respeitar 980s e NÃO emitir PAUSES_DETECTED_FROM_RECORDS.
      let dist = 0;
      records.push({
        timestamp: start,
        distance: 0,
        speed: 2.1,
      });
      for (let i = 1; i <= 200; i++) {
        const isSlowZone = i >= 91 && i <= 110;
        const speed = isSlowZone ? 0.5 : 1950 / (180 * 5);
        dist += speed * 5;
        records.push({
          timestamp: new Date(startMs + i * 5000),
          distance: Number(dist.toFixed(2)),
          speed: Number(speed.toFixed(3)),
        });
      }

      const fitBuf = buildFitBuffer({
        records,
        laps: [
          {
            startTime: start,
            totalElapsedTime: 1050,
            totalTimerTime: 1000,
            totalMovingTime: 980,
            totalDistance: 2000,
            totalAscent: 12,
          },
        ],
        session: {
          startTime: start,
          totalElapsedTime: 1050,
          totalTimerTime: 1000,
          totalMovingTime: 980,
          totalDistance: 2000,
          totalAscent: 12,
          sport: "running",
        },
      });

      const parsed = parseFit(fitBuf);
      expect(parsed.durationSeconds).toBe(980);
      expect(parsed.elapsedSeconds).toBe(1050);
      expect(parsed.splits).toHaveLength(2);
      expect(parsed.warnings.some((w) => w.code === "PAUSES_DETECTED_FROM_RECORDS")).toBe(false);
    });

    it("respeita relógio com eventMesgs timer stop/start (Prioridade 2) sem descontar dos records", () => {
      const startMs = Date.parse("2026-11-10T11:00:00Z");
      const start = new Date(startMs);
      const records: Array<Record<string, unknown>> = [];

      for (let sec = 0; sec <= 300; sec++) {
        records.push({
          timestamp: new Date(startMs + sec * 1000),
          distance: Number(((sec * 1000) / 300).toFixed(2)),
          speed: sec >= 150 && sec <= 160 ? 0 : 3.33,
          enhancedAltitude: 500 + sec * 0.02,
        });
      }

      const fitBuf = buildFitBuffer({
        events: [
          { timestamp: start, event: "timer", eventType: "start" },
          { timestamp: new Date(startMs + 150 * 1000), event: "timer", eventType: "stop" },
          { timestamp: new Date(startMs + 160 * 1000), event: "timer", eventType: "start" },
        ],
        records,
        laps: [
          {
            startTime: start,
            totalElapsedTime: 300,
            totalTimerTime: 300,
            totalDistance: 1000,
          },
        ],
        session: {
          startTime: start,
          totalElapsedTime: 300,
          totalTimerTime: 300,
          totalDistance: 1000,
          sport: "running",
        },
      });

      const parsed = parseFit(fitBuf);
      expect(parsed.durationSeconds).toBe(300);
      expect(parsed.elapsedSeconds).toBe(300);
      expect(parsed.warnings.some((w) => w.code === "PAUSES_DETECTED_FROM_RECORDS")).toBe(false);
      expect(parsed.splits[0].elevationDiffM).not.toBeNull();
    });

    it("calcula pausas de corrida (< 0.85 m/s) e GPS com acurácia ruim (> 50m) em sessão single-lap estilo mobile", () => {
      const startMs = Date.parse("2026-11-10T12:00:00Z");
      const start = new Date(startMs);
      const records: Array<Record<string, unknown>> = [];
      let dist = 0;

      records.push({
        timestamp: start,
        distance: 0,
        enhancedSpeed: 3.33,
        enhancedAltitude: 100,
        gpsAccuracy: 5,
      });

      for (let sec = 1; sec <= 380; sec++) {
        let speed = 3.33;
        let accuracy = 5;
        let dStep = 800 / 240;

        if (sec > 240) {
          if (sec >= 300 && sec <= 309) {
            // 10s de drift lento (< 0.85 m/s para running) com acurácia GPS ruim (80m > 50m)
            speed = 0.6;
            dStep = 0.6;
            accuracy = 80;
          } else {
            dStep = 394 / 130;
            speed = dStep;
          }
        }
        dist += dStep;
        records.push({
          timestamp: new Date(startMs + sec * 1000),
          distance: Number(dist.toFixed(2)),
          enhancedSpeed: Number(speed.toFixed(3)),
          enhancedAltitude: sec <= 240 ? 100 + (15 * sec) / 240 : 115 - (8 * (sec - 240)) / 140,
          gpsAccuracy: accuracy,
        });
      }

      const fitBuf = buildFitBuffer({
        records,
        laps: [
          {
            startTime: start,
            totalElapsedTime: 380,
            totalTimerTime: 380,
            totalDistance: 1200,
          },
        ],
        session: {
          startTime: start,
          totalElapsedTime: 380,
          totalTimerTime: 380,
          totalDistance: 1200,
          sport: "running",
        },
      });

      const parsed = parseFit(fitBuf);
      expect(parsed.durationSeconds).toBe(370); // 380s - 10s pausa detectada
      expect(parsed.elapsedSeconds).toBe(380);
      expect(parsed.warnings.some((w) => w.code === "PAUSES_DETECTED_FROM_RECORDS")).toBe(true);
    });

    it("calcula elevationDiffM via records em laps estruturadas não-uniformes (800m + 400m) sem totalAscent preservando timer estruturado", () => {
      const startMs = Date.parse("2026-11-10T12:30:00Z");
      const start = new Date(startMs);
      const records: Array<Record<string, unknown>> = [];
      let dist = 0;

      records.push({
        timestamp: start,
        distance: 0,
        enhancedSpeed: 3.33,
        enhancedAltitude: 100,
      });

      for (let sec = 1; sec <= 380; sec++) {
        const dStep = sec <= 240 ? 800 / 240 : 400 / 140;
        dist += dStep;
        records.push({
          timestamp: new Date(startMs + sec * 1000),
          distance: Number(dist.toFixed(2)),
          enhancedSpeed: Number(dStep.toFixed(3)),
          enhancedAltitude: sec <= 240 ? 100 + (15 * sec) / 240 : 115 - (8 * (sec - 240)) / 140,
        });
      }

      const fitBuf = buildFitBuffer({
        records,
        laps: [
          {
            startTime: start,
            totalElapsedTime: 240,
            totalTimerTime: 240,
            totalDistance: 800,
          },
          {
            startTime: new Date(startMs + 240 * 1000),
            totalElapsedTime: 140,
            totalTimerTime: 140,
            totalDistance: 400,
          },
        ],
        session: {
          startTime: start,
          totalElapsedTime: 380,
          totalTimerTime: 380,
          totalDistance: 1200,
          sport: "running",
        },
      });

      const parsed = parseFit(fitBuf);
      expect(parsed.durationSeconds).toBe(380);
      expect(parsed.splits).toHaveLength(2);
      expect(parsed.splits[0].elevationDiffM).toBeGreaterThan(10);
      expect(parsed.splits[1].elevationDiffM).toBeLessThan(0);
    });

    it("usa fallback Haversine com filtragem de saltos GPS anômalos (> 12 m/s) quando record.distance está ausente", () => {
      const startMs = Date.parse("2026-11-10T13:00:00Z");
      const start = new Date(startMs);
      const degToSemicircle = (deg: number) => Math.round((deg * 2 ** 31) / 180);
      const lat0 = -23.5505;
      const lon0 = -46.6333;
      const records: Array<Record<string, unknown>> = [];

      // 100 pontos de 1s avançando ~3m/s para o norte (~0.000027 deg/s)
      for (let sec = 0; sec <= 100; sec++) {
        // No segundo 50 injeta um salto absurdo de GPS (> 12 m/s em 1s)
        const lat = sec === 50 ? lat0 + 0.01 : lat0 + sec * 0.000027;
        records.push({
          timestamp: new Date(startMs + sec * 1000),
          positionLat: degToSemicircle(lat),
          positionLong: degToSemicircle(lon0),
          altitude: 760 + sec * 0.1,
        });
      }

      const fitBuf = buildFitBuffer({
        records,
        laps: [
          {
            startTime: start,
            totalElapsedTime: 100,
            totalTimerTime: 100,
            totalDistance: 300,
          },
        ],
        session: {
          startTime: start,
          totalElapsedTime: 100,
          totalTimerTime: 100,
          totalDistance: 300,
          sport: "running",
        },
      });

      const parsed = parseFit(fitBuf);
      // Salto absurdo em sec=50 e sec=51 não deve inflar duração ou gerar distância anômala
      expect(parsed.durationSeconds).toBeLessThanOrEqual(100);
      expect(parsed.distanceKm).toBe(0.3);
      expect(parsed.elevationGainM).toBeGreaterThan(0);
    });

    it("mantém regressão 100% intacta das fixtures reais (autolap 5K, intervalado, walk 3K e records 5.42km)", () => {
      const fitDir = path.resolve(process.cwd(), "__tests__/fixtures/fit");

      const autolap5k = parseFit(fs.readFileSync(path.join(fitDir, "fit_run_5k_autolap.fit")));
      expect(autolap5k.distanceKm).toBe(5);
      expect(autolap5k.durationSeconds).toBe(1500);
      expect(autolap5k.elapsedSeconds).toBe(1520);
      expect(autolap5k.splits).toHaveLength(5);
      expect(autolap5k.splits.every((s) => s.durationSeconds === 300 && s.elevationDiffM === 7)).toBe(true);
      expect(autolap5k.warnings.some((w) => w.code === "PAUSES_DETECTED_FROM_RECORDS")).toBe(false);

      const intervalado = parseFit(
        fs.readFileSync(path.join(fitDir, "fit_run_intervalado_pista.fit"))
      );
      expect(intervalado.splits).toHaveLength(12);
      expect(intervalado.durationSeconds).toBe(intervalado.splits.reduce((a, s) => a + s.durationSeconds, 0));

      const walk3k = parseFit(fs.readFileSync(path.join(fitDir, "fit_walk_3k.fit")));
      expect(walk3k.sport).toBe("walking");
      expect(walk3k.distanceKm).toBe(3);
      expect(walk3k.durationSeconds).toBe(1800);
      expect(walk3k.elapsedSeconds).toBe(1800);

      const records5420 = parseFit(fs.readFileSync(path.join(fitDir, "fit_run_5420m_records.fit")));
      expect(records5420.distanceKm).toBe(5.42);
      expect(records5420.durationSeconds).toBe(1626);
      expect(records5420.splits).toHaveLength(6);
    });

    it("combina voltas com e sem totalMovingTime sem zerar voltas faltantes e ordena records fora de ordem", () => {
      const startMs = Date.parse("2026-11-10T15:00:00Z");
      const start = new Date(startMs);
      const fitBuf = buildFitBuffer({
        records: [
          { timestamp: new Date(startMs + 600 * 1000), distance: 2000, altitude: 755 },
          { timestamp: start, distance: 0, altitude: 750 },
          { timestamp: new Date(startMs + 300 * 1000), distance: 1000, altitude: 752 },
        ],
        laps: [
          {
            startTime: start,
            totalElapsedTime: 305,
            totalTimerTime: 300,
            totalMovingTime: 290,
            totalDistance: 1000,
            totalAscent: 2,
          },
          {
            startTime: new Date(startMs + 300 * 1000),
            totalElapsedTime: 300,
            totalTimerTime: 300,
            totalDistance: 1000,
            totalAscent: 3,
          },
        ],
        session: {
          startTime: start,
          totalElapsedTime: 605,
          totalTimerTime: 600,
          totalDistance: 2000,
          sport: "running",
        },
      });

      const parsed = parseFit(fitBuf);
      // Lap 1 (290s totalMovingTime) + Lap 2 (300s fallback totalTimerTime) = 590s (nunca 290s)
      expect(parsed.durationSeconds).toBe(590);
      expect(parsed.elapsedSeconds).toBe(605);
      expect(parsed.splits).toHaveLength(2);
      expect(parsed.splits[0].durationSeconds).toBe(290);
      expect(parsed.splits[1].durationSeconds).toBe(300);
    });

    it("mescla records alternados por timestamp (estilo Strava Mobile), ignora platôs do odômetro em degraus, detecta pausa real com timer/stop único e preserva soma exata das parciais", () => {
      const startMs = Date.parse("2026-10-29T20:24:17Z");
      const start = new Date(startMs);
      const degToSemi = (deg: number) => Math.round(deg * (Math.pow(2, 31) / 180));
      const records: Array<Record<string, unknown>> = [];

      let cumDistM = 0;
      const totalSpanSec = 1450;

      for (let sec = 0; sec <= totalSpanSec; sec++) {
        const ts = new Date(startMs + sec * 1000);
        const inPause = sec >= 600 && sec <= 614; // 15s reais parados (inclui drift de +3m em sec=610)
        const instSpeed = inPause ? 0.08 : 1.5;

        if (!inPause && sec > 0 && sec % 4 === 0) {
          cumDistM += 6; // odômetro atualizado em degraus de 4s (3s consecutivos dDist=0)
        } else if (sec === 610) {
          cumDistM += 3; // pequeno drift GPS durante pausa não deve ser perdido nas parciais
        }

        // Registro 1: apenas GPS + elevação + velocidade + acurácia (sem distance)
        records.push({
          timestamp: ts,
          positionLat: degToSemi(-4.222 + sec * 0.00001),
          positionLong: degToSemi(-38.723),
          enhancedAltitude: Number((90 + (sec / totalSpanSec) * 12).toFixed(1)),
          speed: instSpeed,
          gpsAccuracy: 4,
        });

        // Registro 2 no mesmo timestamp: apenas distance (sem GPS/speed/elevação)
        records.push({
          timestamp: ts,
          distance: Number(cumDistM.toFixed(2)),
        });
      }

      const fitBuf = buildFitBuffer({
        events: [
          { timestamp: start, event: "timer", eventType: "start" },
          { timestamp: new Date(startMs + totalSpanSec * 1000), event: "timer", eventType: "stop" },
        ],
        records,
        laps: [
          {
            startTime: start,
            timestamp: new Date(startMs + (totalSpanSec + 5) * 1000),
            totalElapsedTime: totalSpanSec + 5,
            totalTimerTime: totalSpanSec - 1, // Simula truncamento de 1s do Strava Android
            totalDistance: cumDistM,
          },
        ],
        session: {
          startTime: start,
          totalElapsedTime: totalSpanSec - 1, // Truncado 1s abaixo do span real dos records
          totalTimerTime: totalSpanSec - 1,
          totalDistance: cumDistM,
          totalAscent: 12,
          sport: "walking",
        },
      });

      const parsed = parseFit(fitBuf);
      const splitsDurSum = parsed.splits.reduce((acc, s) => acc + s.durationSeconds, 0);
      const splitsDistSum = Number(
        parsed.splits.reduce((acc, s) => acc + s.distanceKm, 0).toFixed(3)
      );

      expect(parsed.distanceKm).toBe(Number((cumDistM / 1000).toFixed(3)));
      expect(parsed.elapsedSeconds).toBe(totalSpanSec); // Preserva span real de 1450s
      expect(parsed.durationSeconds).toBe(totalSpanSec - 15); // Desconta só os 15s parados (sem falsos positivos!)
      expect(parsed.pointCount).toBe(totalSpanSec + 1); // 1 ponto consolidado por timestamp
      expect(parsed.warnings.some((w) => w.code === "PAUSES_DETECTED_FROM_RECORDS")).toBe(true);
      // Tolerância de <= 1s apenas por arredondamento individual Math.round de frações nos marcos de 1 km
      expect(Math.abs(splitsDurSum - parsed.durationSeconds)).toBeLessThanOrEqual(1);
      expect(splitsDistSum).toBe(parsed.distanceKm);
      expect(parsed.splits.every((s) => s.elevationDiffM !== null)).toBe(true);
    });

    it("hasExplicitTimerPauseEvents ignora stop único final e motionStepsToSplitInputs mantém coerência entre resumo e splits", () => {
      const startMs = Date.parse("2026-11-10T16:00:00Z");

      // Início + stop único no fim = NÃO houve pausa intermediária
      expect(
        hasExplicitTimerPauseEvents([
          { timestamp: new Date(startMs), event: "timer", eventType: "start" },
          { timestamp: new Date(startMs + 600_000), event: "timer", eventType: "stop" },
        ])
      ).toBe(false);

      // Pausa real no meio (stop seguido de retomada start)
      expect(
        hasExplicitTimerPauseEvents([
          { timestamp: new Date(startMs), event: "timer", eventType: "start" },
          { timestamp: new Date(startMs + 300_000), event: "timer", eventType: "stop" },
          { timestamp: new Date(startMs + 320_000), event: "timer", eventType: "start" },
          { timestamp: new Date(startMs + 600_000), event: "timer", eventType: "stop" },
        ])
      ).toBe(true);

      const sampleSteps = [
        { deltaDistM: 10, deltaTimeSec: 3, isCandidateStop: false, isMoving: true, hr: null, eleFrom: 100, eleTo: 101 },
        { deltaDistM: 0, deltaTimeSec: 2, isCandidateStop: false, isMoving: true, hr: null, eleFrom: 101, eleTo: 101 },
        { deltaDistM: 4, deltaTimeSec: 10, isCandidateStop: true, isMoving: false, hr: null, eleFrom: 101, eleTo: 101 },
        { deltaDistM: 20, deltaTimeSec: 6, isCandidateStop: false, isMoving: true, hr: null, eleFrom: 101, eleTo: 102 },
      ];

      const filtered = motionStepsToSplitInputs(sampleSteps, { filterPauses: true });
      expect(filtered.reduce((a, b) => a + b.deltaDistanceM, 0)).toBe(34);
      expect(filtered.reduce((a, b) => a + b.movingTimeSeconds, 0)).toBe(11);

      const unfiltered = motionStepsToSplitInputs(sampleSteps, { filterPauses: false });
      expect(unfiltered.reduce((a, b) => a + b.deltaDistanceM, 0)).toBe(34);
      expect(unfiltered.reduce((a, b) => a + b.movingTimeSeconds, 0)).toBe(21);
    });

    it("cobre desambiguação de sport genérico/fitnessEquipment, fallback de distância/tempo para laps/records e guardas de erro", () => {
      const start = new Date("2026-11-12T07:00:00Z");

      // 1) sport="generic" + subSport="street" -> run
      const genericRun = parseFit(
        buildFitBuffer({
          session: {
            startTime: start,
            totalTimerTime: 1500,
            totalElapsedTime: 1500,
            totalDistance: 5000,
            sport: "generic",
            subSport: "street",
          },
        })
      );
      expect(genericRun.sourceActivityKind).toBe("run");

      // 2) sport="generic" sem subSport -> unknown com warning UNKNOWN_ACTIVITY_TYPE
      const genericUnknown = parseFit(
        buildFitBuffer({
          session: {
            startTime: start,
            totalTimerTime: 1500,
            totalElapsedTime: 1500,
            totalDistance: 4500,
            sport: "generic",
          },
        })
      );
      expect(genericUnknown.sourceActivityKind).toBe("unknown");
      expect(
        genericUnknown.warnings.some((w) => w.code === "UNKNOWN_ACTIVITY_TYPE")
      ).toBe(true);

      // 3) sport="fitnessEquipment" + subSport incompatível (indoorCycling) -> UNSUPPORTED_ACTIVITY
      const cyclingFitnessBuf = buildFitBuffer({
        session: {
          startTime: start,
          totalTimerTime: 1800,
          totalElapsedTime: 1800,
          totalDistance: 10000,
          sport: "fitnessEquipment",
          subSport: "indoorCycling",
        },
      });
      expect(() => parseFit(cyclingFitnessBuf)).toThrowError(FitParseError);

      // 4) Fallback de startTime, totalDistance e totalTimerTime para records quando ausentes na session/laps
      const recordsOnlyStart = Date.parse("2026-11-12T08:00:00Z");
      const fallbackParsed = parseFit(
        buildFitBuffer({
          records: [
            { timestamp: new Date(recordsOnlyStart), distance: 0 },
            { timestamp: new Date(recordsOnlyStart + 300_000), distance: 1000 },
            { timestamp: new Date(recordsOnlyStart + 600_000), distance: 2000 },
          ],
          session: {
            sport: "running",
          },
        })
      );
      expect(fallbackParsed.startedAt).toBe("2026-11-12T08:00:00.000Z");
      expect(fallbackParsed.distanceKm).toBe(2);
      expect(fallbackParsed.durationSeconds).toBe(600);

      // 5) Erro NO_SESSION_DATA quando não há nenhum timestamp de início
      expect(() =>
        parseFit(
          buildFitBuffer({
            session: {
              sport: "running",
              totalDistance: 2000,
              totalTimerTime: 600,
            },
          })
        )
      ).toThrowError(FitParseError);

      // 6) Erro ZERO_MOVING_TIME quando totalTimerTime <= 0 e sem fallback
      expect(() =>
        parseFit(
          buildFitBuffer({
            session: {
              startTime: start,
              sport: "running",
              totalDistance: 2000,
              totalTimerTime: 0,
            },
          })
        )
      ).toThrowError(FitParseError);

      // 7) Guarda de plausibilidade de velocidade média (> 25 km/h) -> UNSUPPORTED_ACTIVITY
      expect(() =>
        parseFit(
          buildFitBuffer({
            session: {
              startTime: start,
              sport: "running",
              totalDistance: 10000, // 10 km em 600s = 60 km/h
              totalTimerTime: 600,
              totalElapsedTime: 600,
            },
          })
        )
      ).toThrowError(FitParseError);

      // 8) workoutMesgs.wktName, temperatura média via records, fallback de distância/tempo para laps (sem totalElapsedTime) e fitnessEquipment + treadmill
      const lapFallbackStart = Date.parse("2026-11-12T09:00:00Z");
      const lapFallbackParsed = parseFit(
        buildFitBuffer({
          workout: { wktName: "Treino de Ritmo na Esteira" },
          records: [
            { timestamp: new Date(lapFallbackStart), distance: 0, temperature: 24 },
            { timestamp: new Date(lapFallbackStart + 300_000), distance: 1000, temperature: 26 },
          ],
          laps: [
            {
              startTime: new Date(lapFallbackStart),
              totalTimerTime: 300,
              totalDistance: 1000,
            },
            {
              startTime: new Date(lapFallbackStart + 300_000),
              totalTimerTime: 300,
              totalDistance: 1000,
            },
          ],
          session: {
            sport: "fitnessEquipment",
            subSport: "treadmill",
          },
        })
      );
      expect(lapFallbackParsed.sourceActivityKind).toBe("run");
      expect(lapFallbackParsed.isIndoor).toBe(true);
      expect(lapFallbackParsed.name).toBe("Treino de Ritmo na Esteira");
      expect(lapFallbackParsed.avgTemperatureC).toBe(25);
      expect(lapFallbackParsed.distanceKm).toBe(2);
      expect(lapFallbackParsed.durationSeconds).toBe(600);
      expect(lapFallbackParsed.splits).toHaveLength(2);
    });
  });
});
