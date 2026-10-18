import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntervalSpeedProfileChart } from "@/components/intervalado/IntervalSpeedProfileChart";
import { IntervalStage } from "@/types";

describe("IntervalSpeedProfileChart Component", () => {
  const mockStages: IntervalStage[] = [
    {
      index: 1,
      type: "warmup",
      durationSeconds: 300, // 5 min
      distanceKm: 0.67,
      speedKmh: 8,
      paceFormatted: "7:30",
    },
    {
      index: 1,
      type: "run",
      durationSeconds: 120, // 2 min
      distanceKm: 0.43,
      speedKmh: 13,
      paceFormatted: "4:37",
    },
    {
      index: 1,
      type: "walk",
      durationSeconds: 90, // 1.5 min
      distanceKm: 0.15,
      speedKmh: 6,
      paceFormatted: "10:00",
    },
    {
      index: 2,
      type: "run",
      durationSeconds: 120, // 2 min
      distanceKm: 0.43,
      speedKmh: 13,
      paceFormatted: "4:37",
    },
    {
      index: 2,
      type: "cooldown",
      durationSeconds: 300, // 5 min
      distanceKm: 0.58,
      speedKmh: 7,
      paceFormatted: "8:34",
    },
  ];

  it("renderiza o gráfico quando há etapas válidas", () => {
    render(<IntervalSpeedProfileChart stages={mockStages} />);

    expect(screen.getByTestId("interval-speed-profile-chart")).toBeInTheDocument();
    expect(screen.getByText("Perfil de Velocidade da Sessão")).toBeInTheDocument();
    expect(screen.getByText("Degraus Contínuos")).toBeInTheDocument();
    expect(screen.getByText(/Tiros \(2x\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Recuperação \/ Aquec\./i)).toBeInTheDocument();
  });

  it("exibe as métricas de resumo da sessão (velocidade máxima e tempos)", () => {
    render(<IntervalSpeedProfileChart stages={mockStages} />);

    // Velocidade máx: 13.0 km/h
    expect(screen.getByText("13.0 km/h")).toBeInTheDocument();
    // Tempo em Tiros: 2 + 2 = 4 min (4:00)
    expect(screen.getByText("4:00")).toBeInTheDocument();
    // Duração total: 5 + 2 + 1.5 + 2 + 5 = 15.5 min (15:30)
    expect(screen.getByText("15:30")).toBeInTheDocument();
  });

  it("retorna null e não renderiza nada quando a lista de etapas está vazia", () => {
    const { container } = render(<IntervalSpeedProfileChart stages={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
