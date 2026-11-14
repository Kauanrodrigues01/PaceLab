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

/**
 * Helper que codifica mensagens FIT reais em binário usando o `Encoder` oficial do `@garmin/fitsdk`.
 */
function buildFitBuffer(options: {
  session?: Record<string, unknown>;
  laps?: Array<Record<string, unknown>>;
  records?: Array<Record<string, unknown>>;
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
});
