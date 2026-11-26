import { describe, it, expect } from "vitest";
import {
  calculateCooperVo2Max,
  classifyCooperVo2Max,
  calculateAge,
} from "@/lib/math/cooper";

describe("Teste de Cooper - Estimativa de VO2 Máx e Classificação", () => {
  describe("calculateCooperVo2Max", () => {
    it("deve calcular o VO2 Máx corretamente para 2400 metros", () => {
      // (2400 - 504.9) / 44.73 = 1895.1 / 44.73 = 42.3675... -> 42.4
      const vo2 = calculateCooperVo2Max(2400);
      expect(vo2).toBe(42.4);
    });

    it("deve calcular o VO2 Máx corretamente para 2800 metros", () => {
      // (2800 - 504.9) / 44.73 = 2295.1 / 44.73 = 51.31... -> 51.3
      const vo2 = calculateCooperVo2Max(2800);
      expect(vo2).toBe(51.3);
    });

    it("deve retornar 0 para distâncias nulas ou abaixo de 504.9 metros", () => {
      expect(calculateCooperVo2Max(0)).toBe(0);
      expect(calculateCooperVo2Max(500)).toBe(0);
      expect(calculateCooperVo2Max(-100)).toBe(0);
    });
  });

  describe("calculateAge", () => {
    it("deve calcular a idade corretamente a partir de string ISO", () => {
      // Considerando que o ano atual é 2026
      const age = calculateAge("2000-01-01");
      expect(age).toBe(26);
    });

    it("deve retornar null para datas inválidas ou vazias", () => {
      expect(calculateAge(null)).toBeNull();
      expect(calculateAge("")).toBeNull();
      expect(calculateAge("data-invalida")).toBeNull();
    });
  });

  describe("classifyCooperVo2Max", () => {
    it("deve classificar homem jovem de 25 anos com 2400m (VO2 42.4) como 'Médio'", () => {
      const result = classifyCooperVo2Max(2400, 25, "M");
      expect(result.classification).toBe("Médio");
      expect(result.vo2Max).toBe(42.4);
      expect(result.genderLabel).toBe("Masculino");
      expect(result.ageGroupLabel).toBe("20-29 anos");
    });

    it("deve classificar homem de 25 anos com 2800m (VO2 51.3) como 'Muito Bom'", () => {
      const result = classifyCooperVo2Max(2800, 25, "masculino");
      expect(result.classification).toBe("Muito Bom");
      expect(result.vo2Max).toBe(51.3);
    });

    it("deve classificar homem de 25 anos com 3000m (VO2 55.8) como 'Excelente'", () => {
      const result = classifyCooperVo2Max(3000, 25, "M");
      expect(result.classification).toBe("Excelente");
    });

    it("deve classificar mulher de 28 anos com 2400m (VO2 42.4) como 'Excelente'", () => {
      const result = classifyCooperVo2Max(2400, 28, "F");
      expect(result.classification).toBe("Excelente");
      expect(result.genderLabel).toBe("Feminino");
    });

    it("deve classificar homem de 45 anos com 2400m (VO2 42.4) como 'Bom'", () => {
      const result = classifyCooperVo2Max(2400, 45, "M");
      expect(result.classification).toBe("Bom");
      expect(result.ageGroupLabel).toBe("40-49 anos");
    });

    it("deve aplicar fallbacks seguros quando idade e gênero forem omitidos", () => {
      const result = classifyCooperVo2Max(2200);
      expect(result.vo2Max).toBeGreaterThan(0);
      expect(result.genderLabel).toBe("Masculino");
      expect(result.classification).toBeDefined();
    });

    it.each([
      // Masculino 20-29 anos (cortes VO2: 33.0 / 36.5 / 42.5 / 46.5 / 52.5)
      { gender: "M", age: 25, distance: 1800, expected: "Muito Fraco", group: "20-29 anos" },
      { gender: "M", age: 25, distance: 2050, expected: "Fraco", group: "20-29 anos" },
      { gender: "M", age: 25, distance: 2350, expected: "Médio", group: "20-29 anos" },
      { gender: "M", age: 25, distance: 2500, expected: "Bom", group: "20-29 anos" },
      { gender: "M", age: 25, distance: 2750, expected: "Muito Bom", group: "20-29 anos" },
      { gender: "M", age: 25, distance: 3000, expected: "Excelente", group: "20-29 anos" },
      // Masculino 30-39 anos (cortes VO2: 31.5 / 35.5 / 41.0 / 45.0 / 49.5)
      { gender: "M", age: 35, distance: 1800, expected: "Muito Fraco", group: "30-39 anos" },
      { gender: "M", age: 35, distance: 2000, expected: "Fraco", group: "30-39 anos" },
      { gender: "M", age: 35, distance: 2250, expected: "Médio", group: "30-39 anos" },
      { gender: "M", age: 35, distance: 2450, expected: "Bom", group: "30-39 anos" },
      { gender: "M", age: 35, distance: 2650, expected: "Muito Bom", group: "30-39 anos" },
      { gender: "M", age: 35, distance: 2850, expected: "Excelente", group: "30-39 anos" },
      // Masculino 40-49 anos (cortes VO2: 30.2 / 33.6 / 39.0 / 43.8 / 48.1)
      { gender: "M", age: 45, distance: 1800, expected: "Muito Fraco", group: "40-49 anos" },
      { gender: "M", age: 45, distance: 1950, expected: "Fraco", group: "40-49 anos" },
      { gender: "M", age: 45, distance: 2150, expected: "Médio", group: "40-49 anos" },
      { gender: "M", age: 45, distance: 2400, expected: "Bom", group: "40-49 anos" },
      { gender: "M", age: 45, distance: 2550, expected: "Muito Bom", group: "40-49 anos" },
      { gender: "M", age: 45, distance: 2800, expected: "Excelente", group: "40-49 anos" },
      // Masculino 50+ anos (cortes VO2: 26.1 / 31.0 / 35.8 / 41.0 / 45.4)
      { gender: "M", age: 55, distance: 1600, expected: "Muito Fraco", group: "50+ anos" },
      { gender: "M", age: 55, distance: 1800, expected: "Fraco", group: "50+ anos" },
      { gender: "M", age: 55, distance: 2000, expected: "Médio", group: "50+ anos" },
      { gender: "M", age: 55, distance: 2250, expected: "Bom", group: "50+ anos" },
      { gender: "M", age: 55, distance: 2450, expected: "Muito Bom", group: "50+ anos" },
      { gender: "M", age: 55, distance: 2700, expected: "Excelente", group: "50+ anos" },
      // Feminino 20-29 anos (cortes VO2: 23.6 / 29.0 / 33.0 / 37.0 / 41.1)
      { gender: "F", age: 25, distance: 1500, expected: "Muito Fraco", group: "20-29 anos" },
      { gender: "F", age: 25, distance: 1700, expected: "Fraco", group: "20-29 anos" },
      { gender: "F", age: 25, distance: 1900, expected: "Médio", group: "20-29 anos" },
      { gender: "F", age: 25, distance: 2070, expected: "Bom", group: "20-29 anos" },
      { gender: "F", age: 25, distance: 2250, expected: "Muito Bom", group: "20-29 anos" },
      { gender: "F", age: 25, distance: 2450, expected: "Excelente", group: "20-29 anos" },
      // Feminino 30-39 anos (cortes VO2: 22.8 / 27.0 / 31.5 / 35.7 / 40.1)
      { gender: "F", age: 35, distance: 1450, expected: "Muito Fraco", group: "30-39 anos" },
      { gender: "F", age: 35, distance: 1650, expected: "Fraco", group: "30-39 anos" },
      { gender: "F", age: 35, distance: 1850, expected: "Médio", group: "30-39 anos" },
      { gender: "F", age: 35, distance: 2020, expected: "Bom", group: "30-39 anos" },
      { gender: "F", age: 35, distance: 2200, expected: "Muito Bom", group: "30-39 anos" },
      { gender: "F", age: 35, distance: 2400, expected: "Excelente", group: "30-39 anos" },
      // Feminino 40-49 anos (cortes VO2: 21.0 / 24.5 / 29.0 / 32.9 / 37.0)
      { gender: "F", age: 45, distance: 1400, expected: "Muito Fraco", group: "40-49 anos" },
      { gender: "F", age: 45, distance: 1550, expected: "Fraco", group: "40-49 anos" },
      { gender: "F", age: 45, distance: 1700, expected: "Médio", group: "40-49 anos" },
      { gender: "F", age: 45, distance: 1900, expected: "Bom", group: "40-49 anos" },
      { gender: "F", age: 45, distance: 2080, expected: "Muito Bom", group: "40-49 anos" },
      { gender: "F", age: 45, distance: 2250, expected: "Excelente", group: "40-49 anos" },
      // Feminino 50+ anos (cortes VO2: 20.2 / 22.8 / 27.0 / 31.5 / 35.8)
      { gender: "F", age: 55, distance: 1350, expected: "Muito Fraco", group: "50+ anos" },
      { gender: "F", age: 55, distance: 1470, expected: "Fraco", group: "50+ anos" },
      { gender: "F", age: 55, distance: 1620, expected: "Médio", group: "50+ anos" },
      { gender: "F", age: 55, distance: 1820, expected: "Bom", group: "50+ anos" },
      { gender: "F", age: 55, distance: 2000, expected: "Muito Bom", group: "50+ anos" },
      { gender: "F", age: 55, distance: 2200, expected: "Excelente", group: "50+ anos" },
    ])(
      "classifica corretamente $gender ($age anos, $distance m) como '$expected' ($group)",
      ({ gender, age, distance, expected, group }) => {
        const result = classifyCooperVo2Max(distance, age, gender);
        expect(result.classification).toBe(expected);
        expect(result.ageGroupLabel).toBe(group);
        expect(result.genderLabel).toBe(gender === "F" ? "Feminino" : "Masculino");
        expect(result.vo2MaxFormatted).toMatch(/ml\/kg\/min$/);
        expect(result.description.length).toBeGreaterThan(10);
      }
    );
  });
});
