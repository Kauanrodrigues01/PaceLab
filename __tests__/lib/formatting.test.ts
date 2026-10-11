import { describe, it, expect } from "vitest";
import {
  formatDecimal,
  formatPace,
  formatTime,
  parsePace,
  parseTime,
} from "@/lib/formatting/time";

describe("formatPace", () => {
  it("converte 400 segundos para '6:40'", () => {
    expect(formatPace(400)).toBe("6:40");
  });

  it("converte 510 segundos para '8:30'", () => {
    expect(formatPace(510)).toBe("8:30");
  });

  it("formata com zero à esquerda nos segundos (ex: 362s -> '6:02')", () => {
    expect(formatPace(362)).toBe("6:02");
  });

  it("lida com segundos com ponto flutuante arredondando corretamente", () => {
    expect(formatPace(400.4)).toBe("6:40");
    expect(formatPace(400.6)).toBe("6:41");
  });

  it("lança erro para valores negativos", () => {
    expect(() => formatPace(-10)).toThrow("Pace em segundos inválido ou negativo");
  });

  it("lança erro para valores não finitos", () => {
    expect(() => formatPace(Infinity)).toThrow();
    expect(() => formatPace(NaN)).toThrow();
  });
});

describe("parsePace", () => {
  it("converte '6:40' para 400 segundos", () => {
    expect(parsePace("6:40")).toBe(400);
  });

  it("converte '8:30' para 510 segundos", () => {
    expect(parsePace("8:30")).toBe(510);
  });

  it("converte '06:40' com zero à esquerda", () => {
    expect(parsePace("06:40")).toBe(400);
  });

  it("converte minutos inteiros como '6' para 360 segundos sem precisar de '6:00'", () => {
    expect(parsePace("6")).toBe(360);
    expect(parsePace("5")).toBe(300);
    expect(parsePace("10")).toBe(600);
  });

  it("rejeita strings com caracteres inválidos", () => {
    expect(() => parsePace("abc")).toThrow();
    expect(() => parsePace("6:xx")).toThrow();
  });

  it("rejeita zero ou valores negativos para minutos inteiros", () => {
    expect(() => parsePace("0")).toThrow();
    expect(() => parsePace("-5")).toThrow();
  });

  it("rejeita segundos >= 60", () => {
    expect(() => parsePace("6:60")).toThrow("Segundos devem ser entre 00 e 59");
    expect(() => parsePace("6:75")).toThrow();
  });

  it("rejeita strings vazias ou nulas", () => {
    expect(() => parsePace("")).toThrow();
    expect(() => parsePace("   ")).toThrow();
  });
});

describe("formatTime", () => {
  it("converte 1200 segundos em '20:00'", () => {
    expect(formatTime(1200)).toBe("20:00");
  });

  it("converte 3661 segundos em '1:01:01' (com horas)", () => {
    expect(formatTime(3661)).toBe("1:01:01");
  });

  it("converte 3600 segundos em '1:00:00'", () => {
    expect(formatTime(3600)).toBe("1:00:00");
  });

  it("converte 59 segundos em '0:59'", () => {
    expect(formatTime(59)).toBe("0:59");
  });

  it("força exibição de horas quando solicitado", () => {
    expect(formatTime(1200, { forceHours: true })).toBe("0:20:00");
  });

  it("lança erro para tempo negativo", () => {
    expect(() => formatTime(-1)).toThrow();
  });
});

describe("parseTime", () => {
  it("converte '20:00' para 1200", () => {
    expect(parseTime("20:00")).toBe(1200);
  });

  it("converte '1:01:01' para 3661", () => {
    expect(parseTime("1:01:01")).toBe(3661);
  });

  it("converte minutos puros '20' para 1200", () => {
    expect(parseTime("20")).toBe(1200);
  });

  it("rejeita tempo com segundos inválidos >= 60", () => {
    expect(() => parseTime("10:65")).toThrow();
  });

  it("rejeita caracteres não numéricos", () => {
    expect(() => parseTime("abc")).toThrow();
  });
});

describe("formatDecimal", () => {
  it("formata com casas padrão", () => {
    expect(formatDecimal(9, 1)).toBe("9.0");
    expect(formatDecimal(9.555, 2)).toBe("9.56");
  });

  it("retorna '0' para valor não finito", () => {
    expect(formatDecimal(NaN)).toBe("0");
    expect(formatDecimal(Infinity)).toBe("0");
  });
});
