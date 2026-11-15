import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SHEET_TABS,
  SHEET_RANGES,
  SHEET_HEADERS,
  formatDateFortaleza,
  formatDurationHHMMSS,
  formatSheetPace,
  sanitizeSheetText,
  computeTafStatusMeta,
  mapTrainingSessionToRow,
  mapTafAttemptToRow,
  mapProfileAndGoalToRow,
  isBlankSheetRow,
  parseSheetDate,
  parseSheetNumber,
  parseSheetDurationSeconds,
  parseSheetPaceFormatted,
  normalizeSheetActivityType,
  normalizeSheetActivitySource,
  normalizeSheetLocationType,
  parseTrainingRowFromSheet,
  parseTafAttemptRowFromSheet,
  parseWeeklyPlanTargetPace,
  parseWeeklyPlanRowFromSheet,
  hasTrainingRowDivergence,
  hasTafAttemptRowDivergence,
  hasProfileGoalRowDivergence,
} from "@/lib/googleSheets/mapper";

describe("Google Sheets Mapper Bidirecional (lib/googleSheets/mapper.ts)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Contratos de Abas e Cabeçalhos", () => {
    it("define exatamente as 4 abas, ranges e cabeçalhos oficiais", () => {
      expect(SHEET_TABS).toEqual({
        LOG_TREINOS: "Log_Treinos",
        SIMULADOS_TAF: "Simulados_TAF",
        PERFIL_E_METAS: "Perfil_e_Metas",
        PLANO_SEMANAL: "Plano_Semanal",
      });
      expect(SHEET_RANGES.LOG_TREINOS_DATA).toBe("Log_Treinos!A:O");
      expect(SHEET_RANGES.SIMULADOS_TAF_DATA).toBe("Simulados_TAF!A:J");
      expect(SHEET_RANGES.PERFIL_E_METAS_ROW).toBe("Perfil_e_Metas!A2:I2");
      expect(SHEET_RANGES.PLANO_SEMANAL_DATA).toBe("Plano_Semanal!A2:I");
      expect(SHEET_RANGES.PLANO_SEMANAL_ALL).toBe("Plano_Semanal!A1:I");
      expect(SHEET_HEADERS.LOG_TREINOS).toHaveLength(15);
      expect(SHEET_HEADERS.SIMULADOS_TAF).toHaveLength(10);
      expect(SHEET_HEADERS.PERFIL_E_METAS).toHaveLength(9);
      expect(SHEET_HEADERS.PLANO_SEMANAL).toHaveLength(9);
    });
  });

  describe("Formatadores & Sanitizadores (Banco -> Planilha)", () => {
    it("formata datas no fuso America/Fortaleza sem desvio perto da meia-noite", () => {
      // 2026-11-14T23:30:00-03:00 === 2026-11-15T02:30:00Z -> continua 2026-11-14 em Fortaleza
      expect(formatDateFortaleza("2026-11-14T23:30:00-03:00")).toBe("2026-11-14");
      // 2026-11-15T01:00:00Z === 22:00 de 2026-11-14 em Fortaleza
      expect(formatDateFortaleza(new Date("2026-11-15T01:00:00.000Z"))).toBe("2026-11-14");
      // String data pura YYYY-MM-DD mantém dia civil
      expect(formatDateFortaleza("2026-11-14")).toBe("2026-11-14");
      expect(formatDateFortaleza(null)).toBe("");
      expect(formatDateFortaleza("data-invalida")).toBe("");
    });

    it("formata duração sempre como HH:MM:SS com 2 dígitos na hora", () => {
      expect(formatDurationHHMMSS(0)).toBe("00:00:00");
      expect(formatDurationHHMMSS(2052)).toBe("00:34:12");
      expect(formatDurationHHMMSS(3599)).toBe("00:59:59");
      expect(formatDurationHHMMSS(3661)).toBe("01:01:01");
      expect(formatDurationHHMMSS(-10)).toBe("00:00:00");
      expect(formatDurationHHMMSS(Number.NaN)).toBe("00:00:00");
    });

    it("protege pace contra auto-conversão de hora no USER_ENTERED", () => {
      expect(formatSheetPace("5:13")).toBe("'5:13");
      expect(formatSheetPace(" 4:50 ")).toBe("'4:50");
      expect(formatSheetPace("'5:13")).toBe("'5:13");
      expect(formatSheetPace(null)).toBe("");
      expect(formatSheetPace("")).toBe("");
    });

    it("sanitiza textos substituindo quebras de linha e neutralizando Formula Injection", () => {
      expect(sanitizeSheetText("Treino forte\nSubida\r\nFinal")).toBe(
        "Treino forte | Subida | Final"
      );
      expect(sanitizeSheetText("=CMD|'/C calc'!A0")).toBe("'=CMD|'/C calc'!A0");
      expect(sanitizeSheetText("+1+2")).toBe("'+1+2");
      expect(sanitizeSheetText("-10km")).toBe("'-10km");
      expect(sanitizeSheetText("@SUM(A1:A2)")).toBe("'@SUM(A1:A2)");
      expect(sanitizeSheetText(null)).toBe("");
      expect(sanitizeSheetText("   ")).toBe("");
      expect(sanitizeSheetText("abcdef", 4)).toBe("abcd");
    });

    it("calcula os 3 estados de Status Meta em Simulados_TAF", () => {
      const goal = { minDistanceMeters: 2400, targetDistanceMeters: 2600 };
      expect(computeTafStatusMeta(2600, goal)).toBe("Meta Segurança Atingida");
      expect(computeTafStatusMeta(2750, goal)).toBe("Meta Segurança Atingida");
      expect(computeTafStatusMeta(2400, goal)).toBe("Aprovado (Mínimo)");
      expect(computeTafStatusMeta(2599, goal)).toBe("Aprovado (Mínimo)");
      expect(computeTafStatusMeta(2399, goal)).toBe("Abaixo do Mínimo");
      expect(computeTafStatusMeta(2500, null)).toBe("Aprovado (Mínimo)");
    });

    it("mapeia TrainingSession para linha exata A:O (15 colunas)", () => {
      const row = mapTrainingSessionToRow({
        id: "uuid-trn-1",
        sessionDate: new Date("2026-11-14T23:30:00-03:00"),
        source: "fit_upload",
        activityType: "tempo_run",
        distanceKm: 10.256,
        durationSeconds: 3075,
        speedKmh: 12.01,
        paceSeconds: 300,
        paceFormatted: "5:00",
        avgHeartRate: 168,
        maxHeartRate: 185,
        elevationGainM: 42.6,
        avgCadence: 176,
        perceivedEffort: 8,
        bodyWeightKg: 74.5,
        shoeName: "Olympikus Corre 3",
        notes: "[Ritmo Matinal]\nExcelente controle",
      });

      expect(row).toEqual([
        "uuid-trn-1",
        "2026-11-14",
        "fit_upload",
        "tempo_run",
        10.26,
        "00:51:15",
        "'5:00",
        168,
        185,
        43,
        176,
        8,
        74.5,
        "Olympikus Corre 3",
        "[Ritmo Matinal] | Excelente controle",
      ]);
      expect(row).toHaveLength(15);

      const minimalRow = mapTrainingSessionToRow({
        id: "uuid-trn-2",
        sessionDate: "2026-11-10T10:00:00.000Z",
        activityType: "rodagem_leve",
        distanceKm: 5,
        durationSeconds: 1800,
        paceFormatted: "6:00",
      });
      expect(minimalRow[2]).toBe("manual");
      expect(minimalRow.slice(7)).toEqual(["", "", "", "", "", "", "", ""]);
    });

    it("mapeia TafAttempt para linha exata A:J (10 colunas)", () => {
      const row = mapTafAttemptToRow(
        {
          id: "uuid-att-1",
          testDate: "2026-11-12T10:00:00.000Z",
          locationType: "pista_400m",
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 2650,
          paceFormatted: "4:32",
          speedKmh: 13.254,
          notes: "=HYPERLINK()\nOK",
        },
        { minDistanceMeters: 2400, targetDistanceMeters: 2600 }
      );

      expect(row).toEqual([
        "uuid-att-1",
        "2026-11-12",
        "pista_400m",
        720,
        720,
        2650,
        "'4:32",
        13.25,
        "Meta Segurança Atingida",
        "'=HYPERLINK() | OK",
      ]);
      expect(row).toHaveLength(10);
    });

    it("mapeia Perfil_e_Metas!A2:I2 calculando idade e priorizando pesagem mais recente", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-14T15:00:00.000Z"));

      const row = mapProfileAndGoalToRow(
        {
          name: "Kauan Silva",
          birthDate: new Date("1998-11-14T00:00:00.000Z"),
          heightCm: 178,
          currentWeightKg: 76.2,
          updatedAt: new Date("2026-11-01T12:00:00.000Z"),
        },
        {
          institutionName: "PF Agente",
          minDistanceMeters: 2400,
          targetDistanceMeters: 2700,
          targetDurationMinutes: 12,
          targetExamDate: new Date("2027-03-20T00:00:00.000Z"),
        },
        {
          weightKg: 74.8,
          recordedAt: new Date("2026-11-14T09:00:00.000Z"),
        }
      );

      expect(row).toEqual([
        "Kauan Silva",
        28,
        178,
        74.8,
        "PF Agente",
        2400,
        2700,
        12,
        "2027-03-20",
      ]);

      // Quando profile.updatedAt é mais novo que latestWeight.recordedAt, prevalece profile.currentWeightKg
      const profileNewerRow = mapProfileAndGoalToRow(
        {
          name: "=Atleta",
          birthDate: "1998-11-14",
          heightCm: null,
          currentWeightKg: 75.5,
          updatedAt: "2026-11-14T14:00:00.000Z",
        },
        {
          institutionName: "PRF",
          minDistanceMeters: 2200,
          targetDistanceMeters: 2500,
          targetDurationMinutes: 12,
          targetExamDate: "2027-06-10T23:30:00-03:00",
        },
        {
          weightKg: 78.0,
          recordedAt: "2026-11-01T10:00:00.000Z",
        }
      );

      expect(profileNewerRow).toEqual([
        "'=Atleta",
        28,
        "",
        75.5,
        "PRF",
        2200,
        2500,
        12,
        "2027-06-10",
      ]);

      // Quando profile não tem peso e latestWeight vem sem timestamp, usa latestWeight; quando nada vem, ""
      const onlyWeightRecord = mapProfileAndGoalToRow(
        { currentWeightKg: null, birthDate: null },
        {
          institutionName: "Edital X",
          minDistanceMeters: 2400,
          targetDistanceMeters: 2600,
          targetDurationMinutes: 12,
          targetExamDate: "invalida",
        },
        { weightKg: 71.2 }
      );
      expect(onlyWeightRecord[3]).toBe(71.2);
      expect(onlyWeightRecord[8]).toBe("");

      const emptyProfileAndGoal = mapProfileAndGoalToRow(
        { currentWeightKg: 70 },
        {
          institutionName: "Edital",
          minDistanceMeters: 2400,
          targetDistanceMeters: 2600,
          targetDurationMinutes: 12,
          targetExamDate: "2027-01-15",
        },
        { weightKg: 69.5 }
      );
      expect(emptyProfileAndGoal[3]).toBe(69.5);
      expect(emptyProfileAndGoal[8]).toBe("2027-01-15");

      expect(mapProfileAndGoalToRow(null, null, null)[3]).toBe("");
    });
  });

  describe("Parsers & Normalizadores (Planilha -> Banco)", () => {
    it("detecta linhas totalmente em branco", () => {
      expect(isBlankSheetRow([])).toBe(true);
      expect(isBlankSheetRow(["", "   ", null, undefined])).toBe(true);
      expect(isBlankSheetRow(["", "2026-11-14"])).toBe(false);
    });

    it("faz parse estrito de data YYYY-MM-DD e DD/MM/YYYY para meio-dia UTC", () => {
      expect(parseSheetDate("2026-11-14")?.toISOString()).toBe("2026-11-14T12:00:00.000Z");
      expect(parseSheetDate("14/11/2026")?.toISOString()).toBe("2026-11-14T12:00:00.000Z");
      expect(parseSheetDate("'2026-11-14")?.toISOString()).toBe("2026-11-14T12:00:00.000Z");
      expect(parseSheetDate(new Date("2026-11-14T23:30:00-03:00"))?.toISOString()).toBe(
        "2026-11-14T12:00:00.000Z"
      );
      expect(parseSheetDate(new Date("invalid"))).toBeNull();
      expect(parseSheetDate("2026-13-01")).toBeNull();
      expect(parseSheetDate("1800-01-01")).toBeNull();
      expect(parseSheetDate("2026-02-31")).toBeNull();
      expect(parseSheetDate("31/02/2026")).toBeNull();
      expect(parseSheetDate("")).toBeNull();
      expect(parseSheetDate("texto")).toBeNull();
    });

    it("faz parse tolerante de números pt-BR, en-US e unidades", () => {
      expect(parseSheetNumber(10.25)).toBe(10.25);
      expect(parseSheetNumber("10,25")).toBe(10.25);
      expect(parseSheetNumber("10,50 km")).toBe(10.5);
      expect(parseSheetNumber("1.234,56")).toBe(1234.56);
      expect(parseSheetNumber("1,234.56")).toBe(1234.56);
      expect(parseSheetNumber("74,5 kg")).toBe(74.5);
      expect(parseSheetNumber("2450 m")).toBe(2450);
      expect(parseSheetNumber("10abc")).toBeNull();
      expect(parseSheetNumber("")).toBeNull();
    });

    it("faz parse de duração em HH:MM:SS, MM:SS e segundos puros", () => {
      expect(parseSheetDurationSeconds("00:34:12")).toBe(2052);
      expect(parseSheetDurationSeconds("34:12")).toBe(2052);
      expect(parseSheetDurationSeconds("01:01:01")).toBe(3661);
      expect(parseSheetDurationSeconds(720)).toBe(720);
      expect(parseSheetDurationSeconds("720")).toBe(720);
      expect(parseSheetDurationSeconds("720s")).toBe(720);
      expect(parseSheetDurationSeconds("00:00:00")).toBeNull();
      expect(parseSheetDurationSeconds("99:99")).toBeNull();
      expect(parseSheetDurationSeconds("")).toBeNull();
    });

    it("recupera pace com ou sem apóstrofo e corrige conversão acidental HH:MM:00", () => {
      expect(parseSheetPaceFormatted("'5:13")).toBe("5:13");
      expect(parseSheetPaceFormatted("05:13")).toBe("5:13");
      expect(parseSheetPaceFormatted("05:13:00")).toBe("5:13");
      expect(parseSheetPaceFormatted("", 5, 1500)).toBe("5:00");
      expect(parseSheetPaceFormatted("invalido", 5, 1500)).toBe("5:00");
      expect(parseSheetPaceFormatted("")).toBeNull();
    });

    it("normaliza activityType (incluindo teste_taf -> tempo_run), source e locationType", () => {
      expect(normalizeSheetActivityType("rodagem_leve")).toEqual({
        activityType: "rodagem_leve",
        matched: true,
        raw: "rodagem_leve",
      });
      expect(normalizeSheetActivityType("Rodagem Leve")).toEqual({
        activityType: "rodagem_leve",
        matched: true,
        raw: "Rodagem Leve",
      });
      expect(normalizeSheetActivityType("teste_taf")).toEqual({
        activityType: "tempo_run",
        matched: true,
        raw: "teste_taf",
      });
      expect(normalizeSheetActivityType("Intervalado / Tiros")).toEqual({
        activityType: "corrida_intervalada",
        matched: true,
        raw: "Intervalado / Tiros",
      });
      expect(normalizeSheetActivityType("tiro")).toEqual({
        activityType: "corrida_intervalada",
        matched: true,
        raw: "tiro",
      });
      expect(normalizeSheetActivityType("esteira")).toEqual({
        activityType: "corrida_continua",
        matched: true,
        raw: "esteira",
      });
      expect(normalizeSheetActivityType("Modalidade Desconhecida")).toEqual({
        activityType: "corrida_continua",
        matched: false,
        raw: "Modalidade Desconhecida",
      });
      expect(normalizeSheetActivityType("")).toEqual({
        activityType: "corrida_continua",
        matched: false,
        raw: "",
      });
      expect(normalizeSheetActivitySource(null)).toBe("sheets");

      expect(normalizeSheetActivitySource("fit_upload")).toBe("fit_upload");
      expect(normalizeSheetActivitySource("GPX_UPLOAD")).toBe("gpx_upload");
      expect(normalizeSheetActivitySource("origem_estranha")).toBe("sheets");

      expect(normalizeSheetLocationType("pista_400m")).toBe("pista_400m");
      expect(normalizeSheetLocationType("Pista de Atletismo (400m)")).toBe("pista_400m");
      expect(normalizeSheetLocationType("Parque / Praça")).toBe("parque_praca");
      expect(normalizeSheetLocationType("local_desconhecido")).toBeNull();
    });

    it("faz parse completo de linha válida de Log_Treinos e recalcula pace/speed determinísticos", () => {
      const result = parseTrainingRowFromSheet(
        [
          "",
          "14/11/2026",
          "",
          "teste_taf",
          "5,00",
          "00:25:00",
          "'05:00:00",
          "168",
          "184",
          "45",
          "176",
          "8",
          "74,5",
          "Nike Pegasus 40",
          "'=Observação de teste",
        ],
        4
      );

      expect(result.valid).toBe(true);
      if (!result.valid) return;

      expect(result.warnings).toEqual([]);
      expect(result.data).toMatchObject({
        rowNumber: 4,
        id: null,
        source: "sheets",
        activityType: "tempo_run",
        distanceKm: 5,
        durationSeconds: 1500,
        speedKmh: 12,
        paceSeconds: 300,
        paceFormatted: "5:00",
        avgHeartRate: 168,
        maxHeartRate: 184,
        elevationGainM: 45,
        avgCadence: 176,
        perceivedEffort: 8,
        bodyWeightKg: 74.5,
        shoeName: "Nike Pegasus 40",
        notes: "=Observação de teste",
      });
      expect(result.data.sessionDate.toISOString()).toBe("2026-11-14T12:00:00.000Z");
    });

    it("rejeita linha inválida de Log_Treinos com aviso legível e emite warning em tipo desconhecido", () => {
      const badDate = parseTrainingRowFromSheet(["id-1", "invalida", "manual", "longao", "10", "00:50:00"], 2);
      expect(badDate.valid).toBe(false);
      if (!badDate.valid) {
        expect(badDate.warning).toContain("Linha 2");
      }

      const badDist = parseTrainingRowFromSheet(["id-1", "2026-11-14", "manual", "longao", "0.01", "00:50:00"], 3);
      expect(badDist.valid).toBe(false);

      const badDuration = parseTrainingRowFromSheet(["id-1", "2026-11-14", "manual", "longao", "10", "00:00:10"], 4);
      expect(badDuration.valid).toBe(false);

      const hrInvertedAndUnknownType = parseTrainingRowFromSheet(
        ["id-2", "2026-11-14", "sheets", "trilha_radical", "6", "00:36:00", "", "170", "150"],
        5
      );
      expect(hrInvertedAndUnknownType.valid).toBe(true);
      if (hrInvertedAndUnknownType.valid) {
        expect(hrInvertedAndUnknownType.data.activityType).toBe("corrida_continua");
        expect(hrInvertedAndUnknownType.data.maxHeartRate).toBe(170);
        expect(hrInvertedAndUnknownType.warnings.length).toBe(2);
      }
    });

    it("faz parse completo de linha de Simulados_TAF e ignora coluna Status Meta", () => {
      const parsed = parseTafAttemptRowFromSheet(
        [
          "att-uuid-1",
          "2026-11-13",
          "Pista de Atletismo (400m)",
          "720",
          "12:00",
          "2600",
          "'4:37",
          "13,0",
          "Qualquer Status Ignorado",
          "Simulado oficial",
        ],
        5
      );

      expect(parsed.valid).toBe(true);
      if (!parsed.valid) return;

      expect(parsed.data).toMatchObject({
        rowNumber: 5,
        id: "att-uuid-1",
        locationType: "pista_400m",
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2600,
        speedKmh: 13,
        paceSeconds: 277,
        paceFormatted: "4:37",
        notes: "Simulado oficial",
      });

      const badTafDate = parseTafAttemptRowFromSheet(["att-x", "invalida", "rua_plana", "720", "720", "2400"], 4);
      expect(badTafDate.valid).toBe(false);

      const badTafDur = parseTafAttemptRowFromSheet(["att-x", "2026-11-13", "rua_plana", "720", "10", "2400"], 5);
      expect(badTafDur.valid).toBe(false);

      const defaultTargetTaf = parseTafAttemptRowFromSheet(["", "2026-11-13", "", "", "720", "2400"], 6);
      expect(defaultTargetTaf.valid).toBe(true);
      if (defaultTargetTaf.valid) {
        expect(defaultTargetTaf.data.targetDurationSeconds).toBe(720);
        expect(defaultTargetTaf.data.id).toBeNull();
      }

      const invalidDist = parseTafAttemptRowFromSheet(
        ["att-2", "2026-11-13", "rua_plana", "720", "720", "50"],
        7
      );
      expect(invalidDist.valid).toBe(false);
    });
  });

  describe("Idempotência e Detecção de Divergência", () => {
    it("não detecta divergência quando banco e planilha representam os mesmos dados após arredondamento/sanitização", () => {
      const dbSession = {
        id: "uuid-1",
        sessionDate: new Date("2026-11-14T23:30:00-03:00"),
        source: "manual" as const,
        activityType: "tempo_run" as const,
        distanceKm: 5.423,
        durationSeconds: 1500,
        paceFormatted: "4:37",
        avgHeartRate: 164,
        maxHeartRate: 180,
        elevationGainM: 42.4,
        avgCadence: 174,
        perceivedEffort: 7,
        bodyWeightKg: 74.5,
        shoeName: "=Tênis",
        notes: "Linha 1\nLinha 2",
      };

      const exportedRow = mapTrainingSessionToRow(dbSession);
      // Simula retorno do Sheets com FORMATTED_VALUE (remove apóstrofo inicial)
      const formattedFromSheets = exportedRow.map((cell) => {
        if (typeof cell === "string" && cell.startsWith("'")) {
          return cell.slice(1);
        }
        return String(cell);
      });

      const parsed = parseTrainingRowFromSheet(formattedFromSheets, 2);
      expect(parsed.valid).toBe(true);
      if (!parsed.valid) return;

      expect(hasTrainingRowDivergence(dbSession, parsed.data)).toBe(false);

      // Detecta cada campo divergente isoladamente em sessão editável (manual/sheets)
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, activityType: "longao" })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, perceivedEffort: 9 })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, bodyWeightKg: 73 })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, shoeName: "Outro Tênis" })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, notes: "Observação editada" })).toBe(
        true
      );
      expect(
        hasTrainingRowDivergence(dbSession, {
          ...parsed.data,
          sessionDate: new Date("2026-11-15T12:00:00.000Z"),
        })
      ).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, distanceKm: 6.0 })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, durationSeconds: 1600 })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, avgHeartRate: 170 })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, maxHeartRate: 185 })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, elevationGainM: 80 })).toBe(true);
      expect(hasTrainingRowDivergence(dbSession, { ...parsed.data, avgCadence: 182 })).toBe(true);
    });

    it("protege telemetria de treinos .FIT/.GPX contra falso-positivo e detecta mudança em campos contextuais", () => {
      const dbFitSession = {
        id: "uuid-fit-1",
        sessionDate: new Date("2026-11-14T09:00:00-03:00"),
        source: "fit_upload" as const,
        activityType: "corrida_continua" as const,
        distanceKm: 10.123,
        durationSeconds: 3000,
        paceFormatted: "4:56",
        avgHeartRate: 162,
        maxHeartRate: 179,
        elevationGainM: 50,
        avgCadence: 178,
        perceivedEffort: 7,
        bodyWeightKg: 75,
        shoeName: "Corre 3",
        notes: "Treino FIT",
      };

      const sameContextEditedTelemetry = parseTrainingRowFromSheet(
        ["uuid-fit-1", "2026-11-14", "sheets", "corrida_continua", "10.12", "00:50:00", "4:56", "", "", "", "", "7", "75", "Corre 3", "Treino FIT"],
        2
      );
      expect(sameContextEditedTelemetry.valid).toBe(true);
      if (sameContextEditedTelemetry.valid) {
        expect(hasTrainingRowDivergence(dbFitSession, sameContextEditedTelemetry.data)).toBe(false);
      }

      const editedNotes = parseTrainingRowFromSheet(
        ["uuid-fit-1", "2026-11-14", "fit_upload", "corrida_continua", "10.12", "00:50:00", "4:56", "162", "179", "50", "178", "9", "75", "Corre 3", "Treino forte"],
        2
      );
      expect(editedNotes.valid).toBe(true);
      if (editedNotes.valid) {
        expect(hasTrainingRowDivergence(dbFitSession, editedNotes.data)).toBe(true);
      }
    });

    it("detecta divergência e idempotência para Simulados_TAF", () => {
      const dbAttempt = {
        id: "att-1",
        source: "manual" as const,
        testDate: new Date("2026-11-12T08:00:00-03:00"),
        locationType: "pista_400m" as const,
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2550,
        paceFormatted: "4:42",
        speedKmh: 12.75,
        notes: "Controle\nBom",
      };

      const row = mapTafAttemptToRow(dbAttempt).map((c) =>
        typeof c === "string" && c.startsWith("'") ? c.slice(1) : String(c)
      );
      const parsed = parseTafAttemptRowFromSheet(row, 2);
      expect(parsed.valid).toBe(true);
      if (!parsed.valid) return;

      expect(hasTafAttemptRowDivergence(dbAttempt, parsed.data)).toBe(false);

      const edited = parseTafAttemptRowFromSheet(
        ["att-1", "2026-11-12", "pista_400m", "720", "720", "2600", "4:37", "13.0", "", "Controle | Bom"],
        2
      );
      expect(edited.valid).toBe(true);
      if (edited.valid) {
        expect(hasTafAttemptRowDivergence(dbAttempt, edited.data)).toBe(true);
        expect(hasTafAttemptRowDivergence({ ...dbAttempt, source: "fit_upload" }, edited.data)).toBe(
          false
        );
        expect(
          hasTafAttemptRowDivergence(dbAttempt, { ...parsed.data, locationType: "rua_plana" })
        ).toBe(true);
        expect(
          hasTafAttemptRowDivergence(dbAttempt, {
            ...parsed.data,
            testDate: new Date("2026-11-15T12:00:00.000Z"),
          })
        ).toBe(true);
        expect(
          hasTafAttemptRowDivergence(dbAttempt, { ...parsed.data, targetDurationSeconds: 900 })
        ).toBe(true);
        expect(
          hasTafAttemptRowDivergence(dbAttempt, { ...parsed.data, actualDurationSeconds: 700 })
        ).toBe(true);
        expect(
          hasTafAttemptRowDivergence(dbAttempt, { ...parsed.data, notes: "Nota editada no Sheets" })
        ).toBe(true);
      }
    });

    it("compara Perfil_e_Metas tolerando formatação pt-BR e células finais vazias", () => {
      const expected = mapProfileAndGoalToRow(
        {
          name: "Atleta PaceLab",
          birthDate: "1996-05-10",
          heightCm: 178,
          currentWeightKg: 74.5,
        },
        {
          institutionName: "PF - Agente",
          minDistanceMeters: 2400,
          targetDistanceMeters: 2600,
          targetDurationMinutes: 12,
          targetExamDate: "2026-12-01",
        },
        null
      );

      expect(hasProfileGoalRowDivergence(undefined, expected)).toBe(true);
      expect(hasProfileGoalRowDivergence([], expected)).toBe(true);

      // Linha equivalente formatada pelo Google Sheets em pt-BR (vírgula decimal, milhar pontuado e data DD/MM/YYYY)
      const ptBrSameRow = [
        "Atleta PaceLab",
        String(expected[1]),
        "178",
        "74,5",
        "PF - Agente",
        "2.400",
        "2.600",
        "12",
        "01/12/2026",
      ];
      expect(hasProfileGoalRowDivergence(ptBrSameRow, expected)).toBe(false);

      // Tolera remoção de apóstrofo anti-fórmula pela API ao ler valor formatado
      const formulaExpected = mapProfileAndGoalToRow(
        { name: "=Atleta", currentWeightKg: 70 },
        {
          institutionName: "Edital Padrão",
          minDistanceMeters: 2400,
          targetDistanceMeters: 2600,
          targetDurationMinutes: 12,
        },
        null
      );
      expect(
        hasProfileGoalRowDivergence(
          ["=Atleta", "", "", "70", "Edital Padrão", "2400", "2600", "12", ""],
          formulaExpected
        )
      ).toBe(false);

      // Divergência de peso ou meta
      expect(
        hasProfileGoalRowDivergence([...ptBrSameRow.slice(0, 3), "73,0", ...ptBrSameRow.slice(4)], expected)
      ).toBe(true);
      expect(
        hasProfileGoalRowDivergence([...ptBrSameRow.slice(0, 6), "2700", ...ptBrSameRow.slice(7)], expected)
      ).toBe(true);
      expect(hasProfileGoalRowDivergence(ptBrSameRow.slice(0, 8), expected)).toBe(true);

      // Quando não há data da prova e API omite última célula vazia
      const expectedNoDate = mapProfileAndGoalToRow(
        { name: "Atleta", currentWeightKg: 70 },
        {
          institutionName: "Edital Padrão",
          minDistanceMeters: 2400,
          targetDistanceMeters: 2600,
          targetDurationMinutes: 12,
          targetExamDate: null,
        },
        null
      );
      expect(
        hasProfileGoalRowDivergence(
          ["Atleta", "", "", "70", "Edital Padrão", "2400", "2600", "12"],
          expectedNoDate
        )
      ).toBe(false);
    });
  });

  describe("Plano_Semanal (A2:I) — Parsers pt-BR, Pace Alvo e Linhas de Descanso", () => {
    it("faz parse tolerante de números pt-BR e en-US e pace alvo (simples, :00 e faixas)", () => {
      expect(parseSheetNumber("5,0")).toBe(5);
      expect(parseSheetNumber("5,0 km")).toBe(5);
      expect(parseSheetNumber("1.200,5")).toBe(1200.5);
      expect(parseSheetNumber("")).toBeNull();
      expect(parseSheetNumber("invalido")).toBeNull();

      expect(parseWeeklyPlanTargetPace(" '5:45-6:00 ")).toBe("5:45-6:00");
      expect(parseWeeklyPlanTargetPace("'5:45–6:00 /km")).toBe("5:45–6:00");
      expect(parseWeeklyPlanTargetPace("5:45/km - 6:00/km")).toBe("5:45-6:00");
      expect(parseWeeklyPlanTargetPace("05:45:00 - 06:00:00 min/km")).toBe("5:45-6:00");
      expect(parseWeeklyPlanTargetPace("5:45 a 6:00")).toBe("5:45–6:00");
      expect(parseWeeklyPlanTargetPace("'05:50:00 /km")).toBe("5:50");
      expect(parseWeeklyPlanTargetPace("05:13")).toBe("5:13");
      expect(parseWeeklyPlanTargetPace("")).toBeNull();
      expect(parseWeeklyPlanTargetPace("-")).toBeNull();
      expect(parseWeeklyPlanTargetPace("—")).toBeNull();
      expect(parseWeeklyPlanTargetPace("99:99")).toBeNull();
      expect(parseWeeklyPlanTargetPace("5:45-99:99")).toBeNull();
      expect(parseWeeklyPlanTargetPace("invalido")).toBeNull();
      expect(parseWeeklyPlanTargetPace(null)).toBeNull();
    });

    it("faz parse de linha válida da aba Plano_Semanal com fallback de dia da semana e unidades pt-BR", () => {
      const res = parseWeeklyPlanRowFromSheet(
        [
          "PLAN-2026-11-16-1",
          "16/11/2026",
          "",
          "tiro",
          "5,0 km",
          " '4:30-4:45 ",
          "6x400m na pista",
          "",
          "",
        ],
        2
      );

      expect(res.valid).toBe(true);
      if (res.valid && res.kind === "item") {
        expect(res.warnings).toEqual([]);
        expect(res.data.planExternalId).toBe("PLAN-2026-11-16-1");
        expect(res.data.plannedDate.toISOString()).toBe("2026-11-16T12:00:00.000Z");
        expect(res.data.dayOfWeek).toBe("Segunda");
        expect(res.data.activityType).toBe("corrida_intervalada");
        expect(res.data.targetDistanceKm).toBe(5);
        expect(res.data.targetPaceFormatted).toBe("4:30-4:45");
        expect(res.data.description).toBe("6x400m na pista");
        expect(res.data.status).toBe("Planejado");
        expect(res.data.matchedSessionId).toBeNull();
      }

      const bigAndTimeOnly = parseWeeklyPlanRowFromSheet(
        [
          "PLAN-2026-11-17-2",
          "2026-11-17",
          "Terça",
          "esteira",
          "1.200,5",
          "05:50:00",
          "Treino longo",
          "concluido",
          "sess-1",
        ],
        3
      );
      expect(bigAndTimeOnly.valid).toBe(true);
      if (bigAndTimeOnly.valid && bigAndTimeOnly.kind === "item") {
        expect(bigAndTimeOnly.data.activityType).toBe("corrida_continua");
        expect(bigAndTimeOnly.data.targetDistanceKm).toBe(1200.5);
        expect(bigAndTimeOnly.data.targetPaceFormatted).toBe("5:50");
        expect(bigAndTimeOnly.data.status).toBe("Concluído");
        expect(bigAndTimeOnly.data.matchedSessionId).toBe("sess-1");
      }

      const timeOnly = parseWeeklyPlanRowFromSheet(
        ["PLAN-2026-11-18-3", "2026-11-18", "Quarta", "rodagem_leve", "0", "", "30 min Z2"],
        4
      );
      expect(timeOnly.valid).toBe(true);
      if (timeOnly.valid && timeOnly.kind === "item") {
        expect(timeOnly.warnings).toEqual([]);
        expect(timeOnly.data.targetDistanceKm).toBeNull();
        expect(timeOnly.data.targetPaceFormatted).toBeNull();
      }
    });

    it("ignora linhas de descanso (Descanso / Off / Rest / Folga) sem warnings espúrios", () => {
      for (const label of ["Descanso", "OFF", "Rest", "folga", "Dia de Descanso"]) {
        const res = parseWeeklyPlanRowFromSheet(
          ["PLAN-2026-11-22-7", "22/11/2026", "Domingo", label, "-", "", "Recuperação"],
          8
        );
        expect(res).toEqual({
          valid: true,
          kind: "rest",
          planExternalId: "PLAN-2026-11-22-7",
          rawActivityType: label,
        });
      }

      const restWithoutId = parseWeeklyPlanRowFromSheet(["", "2026-11-22", "", "Descanso"], 9);
      expect(restWithoutId.valid).toBe(true);
      if (restWithoutId.valid) {
        expect(restWithoutId.kind).toBe("rest");
      }
    });

    it("gera warning estruturado para linhas sem ID ou sem Data válida e tolera distância/tipo incomuns", () => {
      const noId = parseWeeklyPlanRowFromSheet(["", "2026-11-16", "Segunda", "rodagem_leve", "5"], 2);
      expect(noId).toEqual({
        valid: false,
        warning: "Linha 2 (Plano_Semanal): ID ausente.",
      });

      const badDate = parseWeeklyPlanRowFromSheet(["PLAN-X", "31/02/2026", "Segunda", "rodagem_leve"], 3);
      expect(badDate).toEqual({
        valid: false,
        warning: "Linha 3 (Plano_Semanal): Data inválida ou ausente.",
      });

      const customWithBadDist = parseWeeklyPlanRowFromSheet(
        ["PLAN-CUSTOM", "2026-11-19", "Quinta", "Subida Técnica", "abc", "", "Rampa"],
        5
      );
      expect(customWithBadDist.valid).toBe(true);
      if (customWithBadDist.valid && customWithBadDist.kind === "item") {
        expect(customWithBadDist.data.activityType).toBe("Subida Técnica");
        expect(customWithBadDist.data.targetDistanceKm).toBeNull();
        expect(customWithBadDist.warnings).toHaveLength(2);
      }

      const emptyType = parseWeeklyPlanRowFromSheet(["PLAN-EMPTY", "2026-11-20", "", "", "5"], 6);
      expect(emptyType.valid).toBe(true);
      if (emptyType.valid && emptyType.kind === "item") {
        expect(emptyType.data.activityType).toBe("corrida_continua");
        expect(emptyType.data.dayOfWeek).toBe("Sexta");
        expect(emptyType.warnings).toHaveLength(1);
      }

      // Simetria de placeholders ('-' e 'na' sem warning) vs distância negativa (com warning) e pace com 'até'/numérico
      const apostropheAndNa = parseWeeklyPlanRowFromSheet(
        ["PLAN-SYM", "2026-11-20", "Sexta", "fartlek", "'-", "'5:10 até 5:30/km", "Fartlek"],
        7
      );
      expect(apostropheAndNa.valid).toBe(true);
      if (apostropheAndNa.valid && apostropheAndNa.kind === "item") {
        expect(apostropheAndNa.data.activityType).toBe("corrida_intervalada");
        expect(apostropheAndNa.data.targetDistanceKm).toBeNull();
        expect(apostropheAndNa.data.targetPaceFormatted).toBe("5:10–5:30");
        expect(apostropheAndNa.warnings).toEqual([]);
      }

      const naDistAndNegative = parseWeeklyPlanRowFromSheet(
        ["PLAN-NEG", "2026-11-20", "Sexta", "simulado_taf", "-5", "na"],
        8
      );
      expect(naDistAndNegative.valid).toBe(true);
      if (naDistAndNegative.valid && naDistAndNegative.kind === "item") {
        expect(naDistAndNegative.data.activityType).toBe("tempo_run");
        expect(naDistAndNegative.data.targetDistanceKm).toBeNull();
        expect(naDistAndNegative.data.targetPaceFormatted).toBeNull();
        expect(naDistAndNegative.warnings).toHaveLength(1);
      }

      expect(parseWeeklyPlanTargetPace(5.3)).toBeNull();
      expect(parseWeeklyPlanTargetPace("N/A")).toBeNull();
    });
  });
});
