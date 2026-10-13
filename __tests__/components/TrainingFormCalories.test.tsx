import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrainingForm } from "@/components/meu-taf/TrainingForm";
import { TrainingCard } from "@/components/meu-taf/TrainingCard";
import { profileService } from "@/lib/services/profileService";
import { TrainingSession } from "@/types";

describe("Fase 4 - Integração de Calorias no Diário de Treinos e Cards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("TrainingForm com Cálculo em Tempo Real de Calorias", () => {
    it("pré-carrega o peso atual do perfil do atleta e calcula calorias estimadas", async () => {
      vi.spyOn(profileService, "getProfile").mockResolvedValue({
        id: "prof_1",
        userId: "user_default",
        name: "Corredor Teste",
        heightCm: 178,
        currentWeightKg: 75,
        birthDate: null,
        gender: "masculino",
        createdAt: "2026-10-10T10:00:00.000Z",
        updatedAt: "2026-10-10T10:00:00.000Z",
      });

      const handleSave = vi.fn().mockResolvedValue(undefined);
      render(<TrainingForm onSave={handleSave} />);

      // Aguarda o carregamento assíncrono do perfil
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Ex: 74.5/i)).toHaveValue("75");
      });

      // Deve exibir o card de calorias estimadas
      expect(screen.getByTestId("live-calories-card")).toBeInTheDocument();
      expect(screen.getByTestId("live-active-calories")).toBeInTheDocument();
      expect(screen.getByTestId("live-total-calories")).toBeInTheDocument();
    });

    const mockEmptyProfile = {
      id: "profile_empty",
      userId: "user_default",
      name: null,
      heightCm: null,
      currentWeightKg: null,
      birthDate: null,
      gender: null,
      createdAt: "2026-10-10T10:00:00.000Z",
      updatedAt: "2026-10-10T10:00:00.000Z",
    };

    it("exibe aviso quando o peso está vazio e calcula assim que o peso é digitado", async () => {
      vi.spyOn(profileService, "getProfile").mockResolvedValue(mockEmptyProfile);

      const user = userEvent.setup();
      const handleSave = vi.fn().mockResolvedValue(undefined);
      render(<TrainingForm onSave={handleSave} />);

      const weightInput = screen.getByPlaceholderText(/Ex: 74.5/i);
      expect(weightInput).toHaveValue("");

      // Deve exibir aviso para preencher peso
      expect(screen.getByTestId("calories-weight-hint")).toBeInTheDocument();
      expect(screen.queryByTestId("live-calories-card")).not.toBeInTheDocument();

      // Digita 70 kg
      await user.type(weightInput, "70");

      // Card de calorias deve aparecer
      expect(screen.getByTestId("live-calories-card")).toBeInTheDocument();
      expect(screen.queryByTestId("calories-weight-hint")).not.toBeInTheDocument();
    });

    it("salva no payload activeCalories, totalCalories e metValue ao registrar treino", async () => {
      vi.spyOn(profileService, "getProfile").mockResolvedValue({
        id: "prof_1",
        userId: "user_default",
        name: "Corredor",
        heightCm: 175,
        currentWeightKg: 70,
        birthDate: null,
        gender: "masculino",
        createdAt: "2026-10-10T10:00:00.000Z",
        updatedAt: "2026-10-10T10:00:00.000Z",
      });

      const user = userEvent.setup();
      const handleSave = vi.fn().mockResolvedValue(undefined);
      render(<TrainingForm onSave={handleSave} />);

      await waitFor(() => {
        expect(screen.getByTestId("live-calories-card")).toBeInTheDocument();
      });

      const submitBtn = screen.getByRole("button", { name: /Registrar Treino no Diário/i });
      await user.click(submitBtn);

      expect(handleSave).toHaveBeenCalledTimes(1);
      const saved = handleSave.mock.calls[0][0] as TrainingSession;

      expect(saved.bodyWeightKg).toBe(70);
      expect(saved.activeCalories).toBeGreaterThan(0);
      expect(saved.totalCalories).toBeGreaterThan(saved.activeCalories!);
      expect(saved.metValue).toBeGreaterThan(1);
      expect(saved.calorieMethod).toBe("compendium_2024_met");
      expect(saved.calorieSource).toBe("auto_calculated");
      expect(saved.calorieMetadata).toBeDefined();
    });

    it("permite submeter treino sem peso (calorias ficam nulas com segurança)", async () => {
      vi.spyOn(profileService, "getProfile").mockResolvedValue(mockEmptyProfile);

      const user = userEvent.setup();
      const handleSave = vi.fn().mockResolvedValue(undefined);
      render(<TrainingForm onSave={handleSave} />);

      const submitBtn = screen.getByRole("button", { name: /Registrar Treino no Diário/i });
      await user.click(submitBtn);

      expect(handleSave).toHaveBeenCalledTimes(1);
      const saved = handleSave.mock.calls[0][0] as TrainingSession;

      expect(saved.bodyWeightKg).toBeNull();
      expect(saved.activeCalories).toBeNull();
      expect(saved.totalCalories).toBeNull();
      expect(saved.metValue).toBeNull();
    });
  });

  describe("TrainingCard com Badges de Calorias e Retrocompatibilidade", () => {
    it("renderiza badge de calorias com calorias ativas e tooltip completo", () => {
      const mockTraining: TrainingSession = {
        id: "trn_101",
        sessionDate: "2026-10-12T08:00:00.000Z",
        activityType: "corrida_continua",
        distanceKm: 5.0,
        durationSeconds: 1650, // 27:30
        speedKmh: 10.91,
        paceSeconds: 330,
        paceFormatted: "05:30",
        perceivedEffort: 6,
        bodyWeightKg: 72.0,
        notes: "Treino matinal",
        splits: [],
        activeCalories: 385,
        totalCalories: 432,
        metValue: 10.5,
        calorieMethod: "compendium_2024_met",
        createdAt: "2026-10-12T08:00:00.000Z",
        updatedAt: "2026-10-12T08:00:00.000Z",
      };

      render(
        <TrainingCard
          training={mockTraining}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      const calorieBadge = screen.getByTestId("badge-calories");
      expect(calorieBadge).toBeInTheDocument();
      expect(calorieBadge).toHaveTextContent("385 kcal ativas");
      expect(calorieBadge.getAttribute("title")).toContain("Calorias Totais: 432 kcal");
      expect(calorieBadge.getAttribute("title")).toContain("MET: 10.5");
      expect(calorieBadge.getAttribute("title")).toContain("Compêndio 2024");
    });

    it("mantém retrocompatibilidade total com treinos antigos sem calorias gravadas", () => {
      const legacyTraining: TrainingSession = {
        id: "trn_legacy_99",
        sessionDate: "2026-09-01T08:00:00.000Z",
        activityType: "corrida_continua",
        distanceKm: 2.4,
        durationSeconds: 720,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "05:00",
        perceivedEffort: 7,
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
      };

      render(
        <TrainingCard
          training={legacyTraining}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByTestId("training-card-trn_legacy_99")).toBeInTheDocument();
      expect(screen.queryByTestId("badge-calories")).not.toBeInTheDocument();
      expect(screen.getByText("2.40")).toBeInTheDocument();
    });
  });
});
