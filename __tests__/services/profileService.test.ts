import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  profileService,
  calcBmi,
  isWeeklyWeightDue,
  isWeightPromptDismissed,
  dismissWeightPrompt,
  PROFILE_CACHE_KEY,
  WEIGHTS_CACHE_KEY,
  DISMISSED_PROMPT_KEY,
} from "@/lib/services/profileService";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";

describe("profileService e Funções Biométricas", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setupMockTafApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── calcBmi ───────────────────────────────────────────────────────────────
  describe("calcBmi", () => {
    it("calcula IMC com precisão e classifica peso normal", () => {
      // 70 kg, 175 cm -> 70 / (1.75^2) = 22.86 -> 22.9
      const result = calcBmi(70, 175);
      expect(result).not.toBeNull();
      expect(result?.bmi).toBe(22.9);
      expect(result?.category).toBe("peso_normal");
      expect(result?.categoryLabel).toBe("Peso normal");
    });

    it("classifica abaixo do peso (< 18.5)", () => {
      // 50 kg, 175 cm -> 50 / (1.75^2) = 16.3
      const result = calcBmi(50, 175);
      expect(result?.category).toBe("abaixo_do_peso");
      expect(result?.categoryLabel).toBe("Abaixo do peso");
    });

    it("classifica sobrepeso (25.0 a 29.9)", () => {
      // 80 kg, 175 cm -> 80 / (1.75^2) = 26.1
      const result = calcBmi(80, 175);
      expect(result?.category).toBe("sobrepeso");
      expect(result?.categoryLabel).toBe("Sobrepeso");
    });

    it("classifica obesidade (>= 30.0)", () => {
      // 100 kg, 175 cm -> 100 / (1.75^2) = 32.7
      const result = calcBmi(100, 175);
      expect(result?.category).toBe("obesidade");
      expect(result?.categoryLabel).toBe("Obesidade");
    });

    it("retorna null se altura ou peso forem inválidos ou zero", () => {
      expect(calcBmi(null, 175)).toBeNull();
      expect(calcBmi(70, null)).toBeNull();
      expect(calcBmi(0, 175)).toBeNull();
      expect(calcBmi(70, 0)).toBeNull();
      expect(calcBmi(-70, 175)).toBeNull();
    });
  });

  // ─── isWeeklyWeightDue ────────────────────────────────────────────────────
  describe("isWeeklyWeightDue", () => {
    it("retorna true se nunca se pesou (null ou undefined)", () => {
      expect(isWeeklyWeightDue(null)).toBe(true);
      expect(isWeeklyWeightDue(undefined)).toBe(true);
    });

    it("retorna true se a última pesagem foi há mais de 7 dias", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      expect(isWeeklyWeightDue(pastDate.toISOString())).toBe(true);
    });

    it("retorna true se for segunda-feira", () => {
      // Mock de segunda-feira (day 1)
      const fakeMonday = new Date(2026, 9, 12); // 12 de outubro de 2026 é segunda-feira
      vi.useFakeTimers();
      vi.setSystemTime(fakeMonday);

      const recentDate = new Date(2026, 9, 11); // Ontem
      expect(isWeeklyWeightDue(recentDate.toISOString())).toBe(true);

      vi.useRealTimers();
    });

    it("retorna false se foi pesado há 2 dias e não é segunda-feira", () => {
      // Mock de quarta-feira (14 de outubro de 2026)
      const fakeWednesday = new Date(2026, 9, 14);
      vi.useFakeTimers();
      vi.setSystemTime(fakeWednesday);

      const recentDate = new Date(2026, 9, 12); // 2 dias atrás
      expect(isWeeklyWeightDue(recentDate.toISOString())).toBe(false);

      vi.useRealTimers();
    });

    it("retorna false se já se pesou hoje (mesmo sendo segunda-feira)", () => {
      // Mock de segunda-feira (12 de outubro de 2026)
      const fakeMonday = new Date(2026, 9, 12, 14, 0, 0);
      vi.useFakeTimers();
      vi.setSystemTime(fakeMonday);

      const todayMorning = new Date(2026, 9, 12, 8, 30, 0); // Pesou hoje pela manhã
      expect(isWeeklyWeightDue(todayMorning.toISOString())).toBe(false);

      vi.useRealTimers();
    });
  });

  // ─── Prompt Dismissal ─────────────────────────────────────────────────────
  describe("isWeightPromptDismissed & dismissWeightPrompt", () => {
    it("gerencia o adiamento do prompt por 24h", () => {
      expect(isWeightPromptDismissed()).toBe(false);

      dismissWeightPrompt(24);
      expect(isWeightPromptDismissed()).toBe(true);

      // Simula passagem de 25 horas
      const currentExpiry = Number(localStorage.getItem(DISMISSED_PROMPT_KEY));
      localStorage.setItem(DISMISSED_PROMPT_KEY, String(currentExpiry - 25 * 3600 * 1000));
      expect(isWeightPromptDismissed()).toBe(false);
    });
  });

  // ─── profileService CRUD & Cache ──────────────────────────────────────────
  describe("profileService", () => {
    it("busca perfil via API e atualiza cache em sessionStorage", async () => {
      const profile = await profileService.getProfile();
      expect(profile).toBeDefined();
      expect(profile.currentWeightKg).toBe(70);

      const cachedRaw = sessionStorage.getItem(PROFILE_CACHE_KEY);
      expect(cachedRaw).not.toBeNull();
      expect(JSON.parse(cachedRaw!).currentWeightKg).toBe(70);
    });

    it("salva perfil via PUT e atualiza cache", async () => {
      const updated = await profileService.saveProfile({
        name: "Carlos Atleta",
        currentWeightKg: 73.5,
        heightCm: 180,
      });

      expect(updated.name).toBe("Carlos Atleta");
      expect(updated.currentWeightKg).toBe(73.5);

      const cachedRaw = sessionStorage.getItem(PROFILE_CACHE_KEY);
      expect(JSON.parse(cachedRaw!).name).toBe("Carlos Atleta");
    });

    it("lista histórico de pesagens e grava cache", async () => {
      const weights = await profileService.getWeightHistory();
      expect(Array.isArray(weights)).toBe(true);

      const cachedRaw = sessionStorage.getItem(WEIGHTS_CACHE_KEY);
      expect(cachedRaw).not.toBeNull();
    });

    it("adiciona nova pesagem e atualiza o peso do perfil no cache", async () => {
      await profileService.getProfile();
      const newWeight = await profileService.addWeightRecord({
        weightKg: 69.8,
        recordedAt: new Date().toISOString(),
        source: "weekly_prompt",
        notes: "Segunda-feira pós-treino",
      });

      expect(newWeight.weightKg).toBe(69.8);

      const cachedProfile = JSON.parse(sessionStorage.getItem(PROFILE_CACHE_KEY)!);
      expect(cachedProfile.currentWeightKg).toBe(69.8);
    });

    it("exclui registro de pesagem", async () => {
      const created = await profileService.addWeightRecord({
        id: "w_to_remove",
        weightKg: 75.0,
        recordedAt: new Date().toISOString(),
      });

      await profileService.deleteWeightRecord(created.id);
      const weights = await profileService.getWeightHistory();
      expect(weights.find((w) => w.id === created.id)).toBeUndefined();
    });
  });
});
