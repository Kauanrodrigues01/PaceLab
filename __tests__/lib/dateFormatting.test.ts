import { describe, it, expect } from "vitest";
import {
  FORTALEZA_TIMEZONE,
  formatCalendarDateFortaleza,
  formatDateFortaleza,
  formatDateTimeFortaleza,
  formatFortalezaDateTimeInput,
  formatShortDateFortaleza,
  fromFortalezaDateTimeInput,
  getAgeFromBirthDateFortaleza,
  getDaysDifferenceFortaleza,
  getFortalezaMonthKey,
  getFortalezaWeekInfo,
  toFortalezaNoonIso,
} from "@/lib/formatting/date";

describe("lib/formatting/date — Formatação Canônica em America/Fortaleza", () => {
  it("usa oficialmente o fuso America/Fortaleza (UTC-3)", () => {
    expect(FORTALEZA_TIMEZONE).toBe("America/Fortaleza");
  });

  it("ajusta corretamente fronteiras noturnas UTC para o dia civil em Fortaleza", () => {
    // 2026-10-16T01:30:00Z corresponde a 22:30 do dia 15/10 em America/Fortaleza (UTC-3)
    const lateNightUtc = "2026-10-16T01:30:00.000Z";
    expect(formatDateFortaleza(lateNightUtc)).toBe("15/10/2026");
    expect(formatShortDateFortaleza(lateNightUtc)).toBe("15/10");
    expect(formatDateTimeFortaleza(lateNightUtc)).toContain("15/10/2026");
    expect(formatDateTimeFortaleza(lateNightUtc)).toContain("22:30");

    // 2026-10-16T03:00:00Z corresponde a 00:00 do dia 16/10 em America/Fortaleza
    const midnightFortalezaUtc = "2026-10-16T03:00:00.000Z";
    expect(formatDateFortaleza(midnightFortalezaUtc)).toBe("16/10/2026");
    expect(formatShortDateFortaleza(midnightFortalezaUtc)).toBe("16/10");
  });

  it("preserva datas puras YYYY-MM-DD sem retroceder dia no fuso UTC-3", () => {
    expect(formatDateFortaleza("2026-12-15")).toBe("15/12/2026");
    expect(formatShortDateFortaleza("2026-12-15")).toBe("15/12");
    expect(formatCalendarDateFortaleza("2026-12-15T00:00:00.000Z")).toBe(
      "15/12/2026"
    );
  });

  it("suporta Date nativo, opções detalhadas e fallbacks para entradas inválidas", () => {
    const sampleDate = new Date("2026-10-15T15:45:00.000Z");
    expect(formatDateFortaleza(sampleDate)).toBe("15/10/2026");

    const detailed = formatDateTimeFortaleza(sampleDate, {
      includeWeekday: true,
      shortMonth: true,
    });
    expect(detailed).toContain("15");
    expect(detailed).toContain("2026");
    expect(detailed).toContain("12:45");

    const monthShort = formatShortDateFortaleza("2026-10-15", {
      monthStyle: "short",
    });
    expect(monthShort).toContain("15");

    expect(formatDateFortaleza(null)).toBe("--/--/----");
    expect(formatDateFortaleza(undefined, "Sem data")).toBe("Sem data");
    expect(formatDateFortaleza("data-invalida", "Inválida")).toBe("Inválida");
    expect(formatDateTimeFortaleza("")).toBe("--/--/----");
    expect(formatShortDateFortaleza("2026-02-31", "N/D")).toBe("N/D");
    expect(formatCalendarDateFortaleza(null, "Definida")).toBe("Definida");
    expect(formatCalendarDateFortaleza(new Date("2026-12-15"))).toBe("15/12/2026");
    expect(formatDateTimeFortaleza("2026-12-15")).toBe("15/12/2026");
    expect(formatDateFortaleza(123 as unknown as string, "Inv")).toBe("Inv");
    expect(formatDateFortaleza({} as unknown as string, "Inv")).toBe("Inv");
  });

  it("calcula diferenças civis, idade e agregação semanal/mensal em America/Fortaleza sem D-1", () => {
    expect(
      getDaysDifferenceFortaleza(
        "2026-12-15T00:00:00.000Z",
        new Date("2026-12-14T22:30:00-03:00")
      )
    ).toBe(1);

    expect(
      getAgeFromBirthDateFortaleza("2000-02-29T00:00:00.000Z", "2026-02-28T23:30:00-03:00")
    ).toBe(25);
    expect(
      getAgeFromBirthDateFortaleza("2000-02-29T00:00:00.000Z", "2026-03-01T00:30:00-03:00")
    ).toBe(26);

    expect(toFortalezaNoonIso("2026-10-15")).toBe("2026-10-15T15:00:00.000Z");

    const lateUtc = new Date("2026-10-16T01:30:00.000Z");
    expect(formatFortalezaDateTimeInput(lateUtc)).toBe("2026-10-15T22:30");
    expect(fromFortalezaDateTimeInput("2026-10-15T22:30")).toBe("2026-10-16T01:30:00.000Z");

    const sundayNight = getFortalezaWeekInfo("2026-10-11T23:30:00-03:00");
    expect(sundayNight?.weekKey).toBe("2026-10-05");
    expect(sundayNight?.weekRangeLabel).toBe("05/10 a 11/10");

    expect(getFortalezaMonthKey("2026-11-01T01:00:00Z")).toBe("2026-10");
  });
});
