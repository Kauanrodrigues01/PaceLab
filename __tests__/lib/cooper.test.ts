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
  });
});
