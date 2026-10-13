import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TreinosPage from "@/app/treinos/page";
import MeuTafPage from "@/app/meu-taf/page";
import IntervaladoPage from "@/app/intervalado/page";
import CalculadoraPage from "@/app/calculadora/page";
import { tafService } from "@/lib/services/tafService";
import { TafAttempt, TrainingSession } from "@/types";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";

describe("Resiliência de Navegação e Cache Otimista (Fase 3)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
    setupMockTafApi();
  });

  it("renderiza TreinosPage imediatamente a partir do cache de sessionStorage sem exibir spinner inicial", async () => {
    const mockTrainings: TrainingSession[] = [
      {
        id: "train-cached-1",
        sessionDate: "2026-10-12",
        distanceKm: 5.0,
        durationSeconds: 1500,
        paceSeconds: 300,
        paceFormatted: "5:00",
        speedKmh: 12.0,
        notes: "Treino em cache otimista",
        activityType: "corrida_continua",
        createdAt: "2026-10-12T10:00:00.000Z",
        updatedAt: "2026-10-12T10:00:00.000Z",
      },
    ];

    sessionStorage.setItem("pacelab_cache_trainings", JSON.stringify(mockTrainings));

    vi.spyOn(tafService, "getTrainings").mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(mockTrainings), 100);
        })
    );

    render(<TreinosPage />);

    // NÃO deve exibir o spinner de "Carregando seu histórico de treinos..."
    expect(
      screen.queryByText("Carregando seu histórico de treinos...")
    ).not.toBeInTheDocument();

    // Deve exibir o item em cache imediatamente
    expect(screen.getByText("Treino em cache otimista")).toBeInTheDocument();

    // Aguarda conclusão do background fetch
    await waitFor(() => {
      expect(screen.getByText("Treino em cache otimista")).toBeInTheDocument();
    });
  });

  it("renderiza MeuTafPage a partir do cache de sessionStorage sem o indicador pulsante", async () => {
    const mockAttempts: TafAttempt[] = [
      {
        id: "taf-attempt-cached-1",
        testDate: "2026-10-10",
        distanceMeters: 2400,
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "5:00",
        notes: "Simulado em cache",
        createdAt: "2026-10-10T10:00:00.000Z",
        updatedAt: "2026-10-10T10:00:00.000Z",
      },
    ];

    sessionStorage.setItem("pacelab_cache_taf_attempts", JSON.stringify(mockAttempts));

    vi.spyOn(tafService, "getAttempts").mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(mockAttempts), 100);
        })
    );

    render(<MeuTafPage />);

    // Não deve exibir o indicador de loading inicial pulsante
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

    // Os dados do cache devem estar disponíveis no histórico imediatamente
    expect(screen.getByText("Simulado em cache")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Simulado em cache")).toBeInTheDocument();
    });
  });

  it("restaura rascunho de inputs salvos em sessionStorage no simulador IntervaladoPage", () => {
    const draft = {
      warmupDuration: "3",
      warmupSpeed: "7.5",
      runDuration: "1.5",
      runSpeed: "14",
      walkDuration: "1",
      walkSpeed: "5.5",
      repetitions: "8",
      cooldownDuration: "4",
      cooldownSpeed: "6.5",
      limitType: "distance",
      limitDistance: "2.4",
      limitTime: "12",
    };

    sessionStorage.setItem("pacelab_draft_interval", JSON.stringify(draft));

    render(<IntervaladoPage />);

    // Deve restaurar repetições = 8 e limite de distância
    expect(screen.getByLabelText("Quantidade de Repetições")).toHaveValue("8");
    expect(screen.getByLabelText("Distância Máxima")).toHaveValue("2.4");
  });

  it("restaura rascunho de inputs salvos em sessionStorage na CalculadoraPage", () => {
    const draft = {
      mode: "distance-time",
      distanceInput: "7.5",
      timeInput: "35:00",
      paceInput: "4:40",
      speedInput: "12.8",
    };

    sessionStorage.setItem("pacelab_draft_calc", JSON.stringify(draft));

    render(<CalculadoraPage />);

    expect(screen.getByLabelText("Distância")).toHaveValue("7.5");
    expect(screen.getByLabelText("Tempo total")).toHaveValue("35:00");
  });
});
