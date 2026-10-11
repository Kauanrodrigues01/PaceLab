import { describe, it, expect } from "vitest";
import {
  validateDistance,
  validatePaceString,
  validateSpeed,
  validateTime,
  validateTimeString,
} from "@/lib/validation/inputs";

describe("validateDistance", () => {
  it("aceita distâncias positivas normais", () => {
    expect(validateDistance(5).valid).toBe(true);
    expect(validateDistance(0.5).valid).toBe(true);
    expect(validateDistance(42.195).valid).toBe(true);
  });

  it("rejeita zero ou valores negativos", () => {
    expect(validateDistance(0).valid).toBe(false);
    expect(validateDistance(-1).valid).toBe(false);
  });

  it("rejeita NaN e infinito", () => {
    expect(validateDistance(NaN).valid).toBe(false);
    expect(validateDistance(Infinity).valid).toBe(false);
  });

  it("rejeita valores absurdos (> 1000 km)", () => {
    expect(validateDistance(1001).valid).toBe(false);
  });
});

describe("validateTime", () => {
  it("aceita tempos em segundos positivos", () => {
    expect(validateTime(60).valid).toBe(true);
    expect(validateTime(1200).valid).toBe(true);
  });

  it("rejeita zero ou tempos negativos", () => {
    expect(validateTime(0).valid).toBe(false);
    expect(validateTime(-50).valid).toBe(false);
  });
});

describe("validateSpeed", () => {
  it("aceita velocidades válidas", () => {
    expect(validateSpeed(9).valid).toBe(true);
    expect(validateSpeed(12.5).valid).toBe(true);
  });

  it("rejeita zero ou velocidades absurdas (> 100 km/h)", () => {
    expect(validateSpeed(0).valid).toBe(false);
    expect(validateSpeed(101).valid).toBe(false);
    expect(validateSpeed(-5).valid).toBe(false);
  });
});

describe("validatePaceString", () => {
  it("aceita formatos válidos MM:SS", () => {
    expect(validatePaceString("6:40").valid).toBe(true);
    expect(validatePaceString("06:40").valid).toBe(true);
    expect(validatePaceString("8:30").valid).toBe(true);
  });

  it("aceita minutos inteiros puros como '6' ou '5' sem precisar de ':00'", () => {
    expect(validatePaceString("6").valid).toBe(true);
    expect(validatePaceString("5").valid).toBe(true);
    expect(validatePaceString("12").valid).toBe(true);
  });

  it("rejeita 0:00 e 0", () => {
    expect(validatePaceString("0:00").valid).toBe(false);
    expect(validatePaceString("0").valid).toBe(false);
  });

  it("rejeita segundos >= 60", () => {
    expect(validatePaceString("6:60").valid).toBe(false);
    expect(validatePaceString("5:99").valid).toBe(false);
  });

  it("rejeita formatos malformados", () => {
    expect(validatePaceString("6.40").valid).toBe(false);
    expect(validatePaceString("abc").valid).toBe(false);
    expect(validatePaceString("").valid).toBe(false);
  });
});

describe("validateTimeString", () => {
  it("aceita minutos puros", () => {
    expect(validateTimeString("20").valid).toBe(true);
  });

  it("aceita MM:SS", () => {
    expect(validateTimeString("20:00").valid).toBe(true);
    expect(validateTimeString("05:30").valid).toBe(true);
  });

  it("aceita HH:MM:SS", () => {
    expect(validateTimeString("1:20:00").valid).toBe(true);
  });

  it("rejeita 0:00 e 0:00:00", () => {
    expect(validateTimeString("0:00").valid).toBe(false);
    expect(validateTimeString("0:00:00").valid).toBe(false);
  });

  it("rejeita caracteres inválidos", () => {
    expect(validateTimeString("abc").valid).toBe(false);
  });
});
