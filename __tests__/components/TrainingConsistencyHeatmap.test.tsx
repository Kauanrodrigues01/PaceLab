import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TrainingConsistencyHeatmap } from "@/components/treinos/TrainingConsistencyHeatmap";
import { TrainingSession } from "@/types";

const mockTrainings: TrainingSession[] = [
  {
    id: "t1",
    sessionDate: "2026-10-10T10:00:00.000Z",
    activityType: "corrida_continua",
    distanceKm: 5,
    durationSeconds: 1500,
    speedKmh: 12,
    paceSeconds: 300,
    paceFormatted: "5:00",
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T10:00:00.000Z",
  },
  {
    id: "t2",
    sessionDate: "2026-10-11T10:00:00.000Z",
    activityType: "corrida_intervalada",
    distanceKm: 6.5,
    durationSeconds: 1800,
    speedKmh: 13,
    paceSeconds: 277,
    paceFormatted: "4:37",
    createdAt: "2026-10-11T10:00:00.000Z",
    updatedAt: "2026-10-11T10:00:00.000Z",
  },
];

describe("TrainingConsistencyHeatmap Component", () => {
  it("deve renderizar o container do heatmap e os dias treinados", () => {
    render(<TrainingConsistencyHeatmap trainings={mockTrainings} weeksCount={8} />);

    expect(screen.getByTestId("training-consistency-heatmap")).toBeDefined();
    expect(screen.getByText(/Consistência de Treinos \(Últimas 8 Semanas\)/i)).toBeDefined();
    expect(screen.getByText(/2 dias com treino/i)).toBeDefined();
    expect(screen.getByText(/11.5 km percorridos/i)).toBeDefined();
  });

  it("deve calcular o streak e o recorde de dias", () => {
    render(<TrainingConsistencyHeatmap trainings={mockTrainings} />);

    expect(screen.getByText(/Recorde: 2 dias/i)).toBeDefined();
  });
});
