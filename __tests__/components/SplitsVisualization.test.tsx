import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { analyzeSplits } from "@/lib/math/splitsAnalysis";
import { SplitsInsights } from "@/components/treinos/SplitsInsights";
import { SplitsTable } from "@/components/treinos/SplitsTable";
import { SplitsPaceChart } from "@/components/treinos/SplitsPaceChart";
import { TrainingDetailModal } from "@/components/treinos/TrainingDetailModal";
import { GpxPreviewCard } from "@/components/treinos/GpxPreviewCard";
import { TrainingCard } from "@/components/meu-taf/TrainingCard";
import { TrainingList } from "@/components/meu-taf/TrainingList";
import { ACTIVITY_TYPES, ActivityParsePreview, SplitDetail, TrainingSession } from "@/types";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const richSplits: SplitDetail[] = [
  {
    kilometer: 1,
    distanceKm: 1.0,
    durationSeconds: 320,
    paceSeconds: 320,
    paceFormatted: "5:20",
    avgHeartRate: 145,
    elevationDiffM: 12,
  },
  {
    kilometer: 2,
    distanceKm: 1.0,
    durationSeconds: 310,
    paceSeconds: 310,
    paceFormatted: "5:10",
    avgHeartRate: 152,
    elevationDiffM: -4,
  },
  {
    kilometer: 3,
    distanceKm: 1.0,
    durationSeconds: 290,
    paceSeconds: 290,
    paceFormatted: "4:50",
    avgHeartRate: 162,
    elevationDiffM: 16,
  },
  {
    kilometer: 4,
    distanceKm: 0.4,
    durationSeconds: 112,
    paceSeconds: 280,
    paceFormatted: "4:40",
    avgHeartRate: 168,
    elevationDiffM: -6,
  },
];

const noSensorSplits: SplitDetail[] = [
  {
    kilometer: 1,
    distanceKm: 1.0,
    durationSeconds: 300,
    paceSeconds: 300,
    paceFormatted: "5:00",
    avgHeartRate: null,
    elevationDiffM: null,
  },
  {
    kilometer: 2,
    distanceKm: 1.0,
    durationSeconds: 305,
    paceSeconds: 305,
    paceFormatted: "5:05",
    avgHeartRate: null,
    elevationDiffM: null,
  },
];

const richTrainingSession: TrainingSession = {
  id: "train-rich-1",
  sessionDate: "2026-11-10T06:30:00.000Z",
  activityType: "corrida_continua",
  source: "fit_upload",
  externalId: "fit_987654321",
  distanceKm: 3.4,
  durationSeconds: 1032,
  elapsedSeconds: 1060,
  paceSeconds: 304,
  paceFormatted: "5:04",
  speedKmh: 11.86,
  avgHeartRate: 157,
  maxHeartRate: 171,
  elevationGainM: 28,
  avgCadence: 176,
  activeCalories: 265,
  totalCalories: 310,
  metValue: 11.5,
  perceivedEffort: 6,
  shoeName: "Asics Novablast 4",
  bodyWeightKg: 74.2,
  notes: "Treino progressivo matinal",
  splits: richSplits,
  createdAt: "2026-11-10T06:30:00.000Z",
  updatedAt: "2026-11-10T06:30:00.000Z",
};

const manualSessionNoSplits: TrainingSession = {
  id: "train-manual-2",
  sessionDate: "2026-11-12T18:00:00.000Z",
  activityType: "rodagem_leve",
  source: "manual",
  distanceKm: 5.0,
  durationSeconds: 1500,
  paceSeconds: 300,
  paceFormatted: "5:00",
  speedKmh: 12.0,
  perceivedEffort: 5,
  splits: [],
  createdAt: "2026-11-12T18:00:00.000Z",
  updatedAt: "2026-11-12T18:00:00.000Z",
};

describe("Fase 8 — Componentes de Análise e Visualização de Splits", () => {
  it("1. SplitsInsights renderiza todos os cards com sensores e omite FC/Elevação quando ausentes", () => {
    const richAnalysis = analyzeSplits(richSplits);
    const { rerender } = render(<SplitsInsights analysis={richAnalysis} />);

    expect(screen.getByTestId("splits-insights")).toBeInTheDocument();
    expect(screen.getByTestId("split-insight-strategy")).toBeInTheDocument();
    expect(screen.getByTestId("split-insight-extremes")).toBeInTheDocument();
    expect(screen.getByTestId("split-insight-consistency")).toBeInTheDocument();
    expect(screen.getByTestId("split-insight-heart_rate")).toBeInTheDocument();
    expect(screen.getByTestId("split-insight-elevation")).toBeInTheDocument();

    const noSensorAnalysis = analyzeSplits(noSensorSplits);
    rerender(<SplitsInsights analysis={noSensorAnalysis} />);

    expect(screen.getByTestId("split-insight-strategy")).toBeInTheDocument();
    expect(screen.queryByTestId("split-insight-heart_rate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("split-insight-elevation")).not.toBeInTheDocument();
  });

  it("2. SplitsTable exibe linhas completas, badges de extremos/parcial, '—' sem sensores e coluna acumulada no modo completo", () => {
    const richAnalysis = analyzeSplits(richSplits);
    const { rerender } = render(<SplitsTable analysis={richAnalysis} />);

    expect(screen.getByTestId("splits-table")).toBeInTheDocument();
    expect(screen.getByText("Acumulado")).toBeInTheDocument();

    const row1 = screen.getByTestId("split-row-1");
    expect(within(row1).getByText("Km 1:")).toBeInTheDocument();
    expect(within(row1).getByText("Mais lento")).toBeInTheDocument();
    expect(within(row1).getByText("145 bpm")).toBeInTheDocument();
    expect(within(row1).getByText("+12 m")).toBeInTheDocument();

    const row3 = screen.getByTestId("split-row-3");
    expect(within(row3).getByText("Mais rápido")).toBeInTheDocument();

    const row4 = screen.getByTestId("split-row-4");
    expect(within(row4).getByText("Parcial")).toBeInTheDocument();

    expect(screen.getByText("Total / Média")).toBeInTheDocument();

    // Modo compacto com sensores ausentes usa "—" e testId customizado
    const noSensorAnalysis = analyzeSplits(noSensorSplits);
    rerender(
      <SplitsTable
        analysis={noSensorAnalysis}
        compact
        testId="custom-splits-table"
      />
    );
    expect(screen.getByTestId("custom-splits-table")).toBeInTheDocument();
    expect(screen.queryByText("Acumulado")).not.toBeInTheDocument();
    const row1NoSensor = screen.getByTestId("split-row-1");
    expect(within(row1NoSensor).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("3. SplitsPaceChart renderiza gráfico Recharts e controla camadas opcionais (+ FC e + Elevação)", async () => {
    const user = userEvent.setup();
    const richAnalysis = analyzeSplits(richSplits);
    const { container, rerender } = render(
      <SplitsPaceChart analysis={richAnalysis} />
    );

    expect(screen.getByTestId("splits-pace-chart")).toBeInTheDocument();
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();

    const hrBtn = screen.getByTestId("splits-layer-hr") as HTMLButtonElement;
    const elevBtn = screen.getByTestId("splits-layer-elevation") as HTMLButtonElement;
    const paceBtn = screen.getByTestId("splits-layer-pace") as HTMLButtonElement;

    expect(hrBtn.disabled).toBe(false);
    expect(elevBtn.disabled).toBe(false);
    expect(paceBtn).toHaveAttribute("aria-pressed", "true");
    expect(hrBtn).toHaveAttribute("aria-pressed", "false");
    expect(elevBtn).toHaveAttribute("aria-pressed", "false");

    await user.click(hrBtn);
    expect(hrBtn).toHaveAttribute("aria-pressed", "true");
    expect(paceBtn).toHaveAttribute("aria-pressed", "false");

    await user.click(elevBtn);
    expect(elevBtn).toHaveAttribute("aria-pressed", "true");

    await user.click(paceBtn);
    expect(paceBtn).toHaveAttribute("aria-pressed", "true");
    expect(hrBtn).toHaveAttribute("aria-pressed", "false");
    expect(elevBtn).toHaveAttribute("aria-pressed", "false");

    // Sem dados de sensores -> botões de camada ficam desabilitados com tooltip explicativo
    const noSensorAnalysis = analyzeSplits(noSensorSplits);
    rerender(<SplitsPaceChart analysis={noSensorAnalysis} />);

    const disabledHr = screen.getByTestId("splits-layer-hr") as HTMLButtonElement;
    const disabledElev = screen.getByTestId("splits-layer-elevation") as HTMLButtonElement;
    expect(disabledHr.disabled).toBe(true);
    expect(disabledElev.disabled).toBe(true);
    expect(disabledHr.title).toMatch(/Sem dados de frequência cardíaca/i);
    expect(disabledElev.title).toMatch(/Sem dados de elevação/i);
  });

  it("4. TrainingDetailModal exibe telemetria completa, splits ou fallback vazio, e fecha via botão/Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onEdit = vi.fn();

    const { rerender } = render(
      <TrainingDetailModal
        training={richTrainingSession}
        isOpen={true}
        onClose={onClose}
        onEdit={onEdit}
      />
    );

    expect(screen.getByTestId("training-detail-modal")).toBeInTheDocument();
    expect(screen.getByTestId("training-detail-external-id")).toHaveTextContent(
      "ID: fit_987654321"
    );
    expect(screen.getByText("Asics Novablast 4")).toBeInTheDocument();
    expect(screen.getByText(/Treino progressivo matinal/)).toBeInTheDocument();
    expect(screen.getByTestId("splits-insights")).toBeInTheDocument();
    expect(screen.getByTestId("splits-pace-chart")).toBeInTheDocument();
    expect(screen.getByTestId("splits-table")).toBeInTheDocument();

    await user.click(screen.getByTestId("training-detail-edit-btn"));
    expect(onEdit).toHaveBeenCalledWith(richTrainingSession);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("training-detail-modal"));
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.click(screen.getByTestId("training-detail-close-btn"));
    expect(onClose).toHaveBeenCalledTimes(3);

    // Treino manual sem splits exibe estado informativo sem erro
    rerender(
      <TrainingDetailModal
        training={manualSessionNoSplits}
        isOpen={true}
        onClose={onClose}
      />
    );
    expect(screen.getByTestId("training-detail-no-splits")).toBeInTheDocument();
  });

  it("5. TrainingCard expande parciais ricas mantendo rótulos 'Km X:' únicos e TrainingList abre o modal de detalhes", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    // Compatibilidade retroativa: TrainingCard standalone sem onViewDetails não exibe botão de detalhes
    // e tolera speedKmh nulo/ausente sem quebrar
    const legacyWithoutSpeed = {
      ...richTrainingSession,
      speedKmh: undefined,
    } as unknown as TrainingSession;
    const { unmount } = render(
      <TrainingCard
        training={legacyWithoutSpeed}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
    expect(screen.queryByTestId("training-details-btn")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    unmount();

    render(
      <TrainingList
        trainings={[richTrainingSession, manualSessionNoSplits]}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    const card = screen.getByTestId(`training-card-${richTrainingSession.id}`);
    await user.click(within(card).getByText(/Ver parciais de km \(4 km\)/i));

    const expandedPanel = within(card).getByTestId("training-card-splits-panel");
    expect(within(expandedPanel).getByTestId("splits-insights")).toBeInTheDocument();
    expect(within(expandedPanel).getByTestId("splits-pace-chart")).toBeInTheDocument();
    expect(within(expandedPanel).getByTestId("splits-table")).toBeInTheDocument();
    expect(within(expandedPanel).getByText("Km 1:")).toBeInTheDocument();
    expect(within(expandedPanel).getByText("Km 4:")).toBeInTheDocument();

    // Abre modal de detalhes a partir do botão no card
    await user.click(within(card).getByTestId("training-details-btn"));

    const modal = screen.getByTestId("training-detail-modal");
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByTestId("splits-table")).toBeInTheDocument();

    // Editar dentro do modal fecha o modal e chama onEdit da lista
    await user.click(within(modal).getByTestId("training-detail-edit-btn"));
    expect(onEdit).toHaveBeenCalledWith(richTrainingSession);
    expect(screen.queryByTestId("training-detail-modal")).not.toBeInTheDocument();
  });

  it("6. GpxPreviewCard integra análise, gráfico e tabela de splits preservando preview-splits-table", () => {
    const basePreview: ActivityParsePreview = {
      source: "fit_upload",
      filesUsed: ["fit"],
      name: null,
      rawType: "running",
      sourceActivityKind: "run",
      isIndoor: false,
      externalId: "fit_preview_splits_1",
      startedAt: "2026-11-10T06:30:00.000Z",
      distanceKm: 3.4,
      durationSeconds: 1032,
      elapsedSeconds: 1050,
      paceSeconds: 304,
      paceFormatted: "5:04",
      speedKmh: 11.86,
      elevationGainM: 28,
      avgHeartRate: 157,
      maxHeartRate: 171,
      avgCadence: 176,
      activeCalories: 265,
      avgTemperatureC: null,
      pointCount: 1032,
      splits: richSplits,
      laps: [],
      warnings: [],
      alreadyExists: false,
      existingTrainingId: null,
      suggestedActivityType: "corrida_continua",
      suggestedNotes: "",
      allowedActivityTypes: [...ACTIVITY_TYPES],
    };

    const { rerender } = render(<GpxPreviewCard preview={basePreview} />);
    const previewSection = screen.getByTestId("preview-splits-section");
    expect(within(previewSection).getByTestId("splits-insights")).toBeInTheDocument();
    expect(within(previewSection).getByTestId("splits-pace-chart")).toBeInTheDocument();
    expect(within(previewSection).getByTestId("preview-splits-table")).toBeInTheDocument();

    rerender(<GpxPreviewCard preview={{ ...basePreview, splits: [] }} />);
    expect(screen.queryByTestId("preview-splits-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("preview-splits-table")).not.toBeInTheDocument();
  });
});
