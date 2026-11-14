import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  ACTIVITY_TYPES,
  ACTIVITY_LABELS,
  ACTIVITY_COLORS,
  ACTIVITY_CONFIG,
  ACTIVITY_FORM_OPTIONS,
  PACE_ACTIVITY_OPTIONS,
  ACTIVITY_SOURCES,
  SOURCE_LABELS,
} from "@/lib/activity";
import { ActivityTypeEnum, ActivitySourceEnum } from "@/lib/validations/taf";
import { TrainingCard } from "@/components/meu-taf/TrainingCard";
import { TrainingForm } from "@/components/meu-taf/TrainingForm";
import { TrainingList } from "@/components/meu-taf/TrainingList";
import { EvolutionDashboard } from "@/components/meu-taf/EvolutionDashboard";
import { TrainingEvolutionDashboard } from "@/components/treinos/TrainingEvolutionDashboard";
import { TrainingSession } from "@/types";

describe("Completude de Contratos e Dicionários de ActivityType & ActivitySource (Fase 2)", () => {
  it("mantém exatamente os 6 valores de ActivityType alinhados entre TypeScript e Zod (sem teste_taf)", () => {
    expect(ACTIVITY_TYPES).toEqual([
      "rodagem_leve",
      "corrida_continua",
      "tempo_run",
      "corrida_intervalada",
      "longao",
      "caminhada",
    ]);
    expect(ActivityTypeEnum.options).toEqual([...ACTIVITY_TYPES]);
    expect(ACTIVITY_TYPES).not.toContain("teste_taf");
  });

  it("mantém ActivitySource alinhado entre TypeScript, Zod e SOURCE_LABELS", () => {
    expect(ACTIVITY_SOURCES).toEqual(["manual", "gpx_upload", "fit_upload", "sheets"]);
    expect(ActivitySourceEnum.options).toEqual([...ACTIVITY_SOURCES]);

    for (const src of ACTIVITY_SOURCES) {
      expect(typeof SOURCE_LABELS[src]).toBe("string");
      expect(SOURCE_LABELS[src].length).toBeGreaterThan(0);
    }
  });

  it("garante que para cada ActivityType existe label, cor hexadecimal, ícone, badgeClass e borderClass", () => {
    for (const type of ACTIVITY_TYPES) {
      expect(typeof ACTIVITY_LABELS[type]).toBe("string");
      expect(ACTIVITY_LABELS[type].trim().length).toBeGreaterThan(0);

      expect(ACTIVITY_COLORS[type]).toMatch(/^#[0-9a-fA-F]{6}$/);

      const cfg = ACTIVITY_CONFIG[type];
      expect(cfg).toBeDefined();
      expect(cfg.type).toBe(type);
      expect(cfg.label).toBe(ACTIVITY_LABELS[type]);
      expect(cfg.shortLabel.trim().length).toBeGreaterThan(0);
      expect(cfg.icon).toBeDefined();
      expect(cfg.badgeClass.length).toBeGreaterThan(0);
      expect(cfg.borderClass.length).toBeGreaterThan(0);
      expect(cfg.color).toBe(ACTIVITY_COLORS[type]);
      expect(["run", "walk"]).toContain(cfg.family);
    }

    expect(ACTIVITY_CONFIG.caminhada.family).toBe("walk");
    expect(ACTIVITY_FORM_OPTIONS).toHaveLength(ACTIVITY_TYPES.length);
    expect(PACE_ACTIVITY_OPTIONS).toHaveLength(ACTIVITY_TYPES.length + 1);
  });

  it("renderiza todas as 6 opções de ActivityType no formulário TrainingForm e no filtro de TrainingList", () => {
    render(<TrainingForm onSave={vi.fn()} />);
    for (const type of ACTIVITY_TYPES) {
      expect(
        screen.getByRole("button", { name: ACTIVITY_LABELS[type] })
      ).toBeInTheDocument();
    }

    render(<TrainingList trainings={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    const select = screen.getByRole("combobox");
    for (const type of ACTIVITY_TYPES) {
      expect(
        within(select).getByRole("option", { name: ACTIVITY_LABELS[type] })
      ).toBeInTheDocument();
    }
  });

  it("renderiza TrainingCard e TrainingEvolutionDashboard para todos os 6 tipos de atividade", () => {
    const allSixTrainings: TrainingSession[] = ACTIVITY_TYPES.map((type, idx) => ({
      id: `trn-${type}`,
      sessionDate: new Date(Date.now() - idx * 86400000).toISOString(),
      activityType: type,
      distanceKm: 5 + idx,
      durationSeconds: 1500 + idx * 300,
      speedKmh: 12,
      paceSeconds: 300,
      paceFormatted: "5:00",
      activeCalories: 350 + idx * 40,
      totalCalories: 400 + idx * 45,
      splits: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    for (const trn of allSixTrainings) {
      const { unmount } = render(
        <TrainingCard training={trn} onEdit={vi.fn()} onDelete={vi.fn()} />
      );
      expect(screen.getByText(ACTIVITY_LABELS[trn.activityType])).toBeInTheDocument();
      unmount();
    }

    render(<TrainingEvolutionDashboard trainings={allSixTrainings} />);
    const distChart = screen.getByTestId("chart-activity-distribution");
    const calChart = screen.getByTestId("chart-activity-calories");
    const paceCard = screen.getByTestId("chart-pace-evolution");

    for (const type of ACTIVITY_TYPES) {
      expect(within(distChart).getByText(ACTIVITY_LABELS[type])).toBeInTheDocument();
      expect(within(calChart).getByText(ACTIVITY_LABELS[type])).toBeInTheDocument();
      expect(
        within(paceCard).getByTestId(`filter-pace-activity-${type}`)
      ).toBeInTheDocument();
    }

    render(
      <EvolutionDashboard
        attempts={[]}
        trainings={allSixTrainings}
        goal={{ targetDistanceMeters: 2400, targetDurationMinutes: 12 }}
      />
    );
    const chartB = screen.getByTestId("chart-b-container");
    for (const type of ACTIVITY_TYPES) {
      expect(
        within(chartB).getByText(ACTIVITY_CONFIG[type].shortLabel)
      ).toBeInTheDocument();
    }
  });
});
