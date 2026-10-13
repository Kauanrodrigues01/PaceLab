import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TrackWorkoutCardModal } from "@/components/intervalado/TrackWorkoutCardModal";
import { IntervalSession } from "@/types";

const mockSession: IntervalSession = {
  totalTimeSeconds: 1200,
  totalDistanceKm: 3.5,
  averagePaceSeconds: 342,
  averagePaceFormatted: "5:42",
  averageSpeedKmh: 10.5,
  stages: [
    {
      index: 1,
      type: "warmup",
      durationSeconds: 300,
      speedKmh: 8,
      paceFormatted: "7:30",
      distanceKm: 0.67,
    },
    {
      index: 2,
      type: "run",
      durationSeconds: 120,
      speedKmh: 13,
      paceFormatted: "4:37",
      distanceKm: 0.43,
    },
    {
      index: 3,
      type: "walk",
      durationSeconds: 90,
      speedKmh: 6,
      paceFormatted: "10:00",
      distanceKm: 0.15,
    },
  ],
};

describe("TrackWorkoutCardModal Component", () => {
  it("não deve renderizar se isOpen for falso", () => {
    const { container } = render(
      <TrackWorkoutCardModal
        session={mockSession}
        isOpen={false}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("deve renderizar o modal com os dados da sessão quando isOpen for verdadeiro", () => {
    render(
      <TrackWorkoutCardModal
        session={mockSession}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId("track-workout-card-modal")).toBeDefined();
    expect(screen.getByText("Modo Pista de Atletismo")).toBeDefined();
    expect(screen.getByText("Cartão de Treino")).toBeDefined();
    expect(screen.getByText("3.50")).toBeDefined();
  });

  it("deve permitir marcar séries no checklist interativo", () => {
    render(
      <TrackWorkoutCardModal
        session={mockSession}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("0 de 1 concluídas")).toBeDefined();

    const repButton = screen.getByRole("button", { name: /Tiro #1/i });
    fireEvent.click(repButton);

    expect(screen.getByText("1 de 1 concluídas")).toBeDefined();
  });

  it("deve chamar onClose ao clicar no botão de fechar", () => {
    const handleClose = vi.fn();
    render(
      <TrackWorkoutCardModal
        session={mockSession}
        isOpen={true}
        onClose={handleClose}
      />
    );

    const closeButton = screen.getByRole("button", { name: "Fechar" });
    fireEvent.click(closeButton);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
