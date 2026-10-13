import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TrainingEvolutionDashboard } from "@/components/treinos/TrainingEvolutionDashboard";
import TreinosPage from "@/app/treinos/page";
import { tafService } from "@/lib/services/tafService";
import { TrainingSession } from "@/types";

const mockTrainingsWithCalories: TrainingSession[] = [
  {
    id: "trn-cal-1",
    sessionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 dias atrás (nesta semana)
    activityType: "corrida_continua",
    distanceKm: 10.0,
    durationSeconds: 3000,
    speedKmh: 12.0,
    paceSeconds: 300,
    paceFormatted: "05:00",
    perceivedEffort: 6,
    activeCalories: 650,
    totalCalories: 720,
    metValue: 11.0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trn-cal-2",
    sessionDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 dias atrás (nesta semana)
    activityType: "corrida_intervalada",
    distanceKm: 5.0,
    durationSeconds: 1500,
    speedKmh: 12.0,
    paceSeconds: 300,
    paceFormatted: "05:00",
    perceivedEffort: 8,
    activeCalories: 380,
    totalCalories: 420,
    metValue: 12.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trn-cal-3",
    sessionDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 dias atrás (semana anterior)
    activityType: "caminhada",
    distanceKm: 4.0,
    durationSeconds: 2400,
    speedKmh: 6.0,
    paceSeconds: 600,
    paceFormatted: "10:00",
    perceivedEffort: 3,
    activeCalories: 180,
    totalCalories: 230,
    metValue: 4.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("Fase 5 - Dashboard Analítico de Calorias Semanal e Mensal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("TrainingEvolutionDashboard (Gráficos e KPIs de Período)", () => {
    it("calcula e renderiza o KPI de Gasto Calórico Ativo e Totais do período", () => {
      render(<TrainingEvolutionDashboard trainings={mockTrainingsWithCalories} />);

      const caloriesKpi = screen.getByTestId("kpi-total-calories");
      expect(caloriesKpi).toBeInTheDocument();
      // Total ativas = 650 + 380 + 180 = 1210 kcal
      expect(caloriesKpi).toHaveTextContent("1210");
      expect(caloriesKpi).toHaveTextContent("kcal");
      // Total brutas = 720 + 420 + 230 = 1370 kcal totais
      expect(caloriesKpi).toHaveTextContent("1370 kcal totais");
    });

    it("renderiza o gráfico de Gasto Calórico Semanal Acumulado (BarChart)", () => {
      render(<TrainingEvolutionDashboard trainings={mockTrainingsWithCalories} />);

      const weeklyChart = screen.getByTestId("chart-weekly-calories");
      expect(weeklyChart).toBeInTheDocument();
      expect(screen.getByText("Gasto Calórico Semanal Acumulado (kcal)")).toBeInTheDocument();
      expect(screen.getByText(/Calorias ativas queimadas durante as sessões de cada semana/i)).toBeInTheDocument();
    });

    it("renderiza o gráfico de Calorias por Modalidade com percentuais", () => {
      render(<TrainingEvolutionDashboard trainings={mockTrainingsWithCalories} />);

      const activityChart = screen.getByTestId("chart-activity-calories");
      expect(activityChart).toBeInTheDocument();
      expect(screen.getByText("Calorias por Modalidade")).toBeInTheDocument();

      // Corrida Contínua: 650 kcal (~54%)
      expect(activityChart).toHaveTextContent("Corrida Contínua");
      expect(activityChart).toHaveTextContent("650 kcal");

      // Intervalado / Tiros: 380 kcal (~31%)
      expect(activityChart).toHaveTextContent("Intervalado / Tiros");
      expect(activityChart).toHaveTextContent("380 kcal");

      // Caminhada: 180 kcal (~15%)
      expect(activityChart).toHaveTextContent("Caminhada");
      expect(activityChart).toHaveTextContent("180 kcal");
    });

    it("lida graciosamente com treinos legados sem campos de calorias", () => {
      const legacyTrainings: TrainingSession[] = [
        {
          id: "trn-legacy-1",
          sessionDate: new Date().toISOString(),
          activityType: "corrida_continua",
          distanceKm: 5.0,
          durationSeconds: 1500,
          speedKmh: 12.0,
          paceSeconds: 300,
          paceFormatted: "05:00",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      render(<TrainingEvolutionDashboard trainings={legacyTrainings} />);

      const caloriesKpi = screen.getByTestId("kpi-total-calories");
      expect(caloriesKpi).toBeInTheDocument();
      expect(caloriesKpi).toHaveTextContent("0 kcal");
      expect(screen.getByTestId("chart-weekly-calories")).toBeInTheDocument();
      expect(screen.getByTestId("chart-activity-calories")).toBeInTheDocument();
    });
  });

  describe("TreinosPage (KPI de Calorias Semanais no Topo do Diário)", () => {
    it("exibe o card de KPI de Calorias Semanais com comparativo e totalizadores", async () => {
      vi.spyOn(tafService, "getTrainings").mockResolvedValue(mockTrainingsWithCalories);

      render(<TreinosPage />);

      const weeklyCaloriesCard = await screen.findByTestId("kpi-weekly-calories");
      expect(weeklyCaloriesCard).toBeInTheDocument();
      expect(weeklyCaloriesCard).toHaveTextContent("Calorias Semanais");

      // Semana atual = trn-cal-1 (650) + trn-cal-2 (380) = 1030 kcal
      expect(weeklyCaloriesCard).toHaveTextContent("1030 kcal");

      // Semana anterior = trn-cal-3 (180 kcal) -> diff = 1030 - 180 = +850 kcal
      expect(weeklyCaloriesCard).toHaveTextContent("+850 kcal vs anterior");

      // Totalizador do mês = 1210 kcal
      expect(weeklyCaloriesCard).toHaveTextContent("Mês: 1210");
    });
  });
});
