import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PeriodComparator } from "@/components/meu-taf/PeriodComparator";
import { TrainingSession, TafAttempt } from "@/types";

function makeTraining(
  id: string,
  sessionDate: string,
  distanceKm: number,
  durationSeconds: number,
  perceivedEffort?: number
): TrainingSession {
  const paceSeconds = Math.round(durationSeconds / distanceKm);
  const mins = Math.floor(paceSeconds / 60);
  const secs = paceSeconds % 60;
  return {
    id,
    sessionDate,
    activityType: "corrida_continua",
    distanceKm,
    durationSeconds,
    speedKmh: Number((distanceKm / (durationSeconds / 3600)).toFixed(2)),
    paceSeconds,
    paceFormatted: `${mins}:${String(secs).padStart(2, "0")}`,
    perceivedEffort: perceivedEffort ?? null,
    createdAt: sessionDate,
    updatedAt: sessionDate,
  };
}

function makeAttempt(
  id: string,
  testDate: string,
  distanceMeters: number
): TafAttempt {
  return {
    id,
    testDate,
    targetDurationSeconds: 720,
    actualDurationSeconds: 720,
    distanceMeters,
    speedKmh: Number(((distanceMeters / 1000) / (720 / 3600)).toFixed(2)),
    paceSeconds: Math.round(720 / (distanceMeters / 1000)),
    paceFormatted: "5:00",
    createdAt: testDate,
    updatedAt: testDate,
  };
}

describe("PeriodComparator Component", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exibe aviso de amostragem reduzida com base vazia e texto padrão sem testes", () => {
    render(<PeriodComparator trainings={[]} attempts={[]} />);

    expect(screen.getByTestId("period-comparator")).toBeInTheDocument();
    expect(screen.getByTestId("low-sample-warning")).toBeInTheDocument();
    expect(screen.getByText(/Sem testes para comparar/i)).toBeInTheDocument();
    expect(screen.getByText(/= Mesmo ritmo/i)).toBeInTheDocument();
  });

  it("remove aviso de amostragem reduzida quando ambos os períodos têm >= 3 atividades e exibe evolução positiva", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-30T12:00:00-03:00"));

    const trainings: TrainingSession[] = [
      // Período A (31..60 dias atrás: set/2026)
      makeTraining("a1", "2026-09-10T09:00:00-03:00", 5, 1800, 7),
      makeTraining("a2", "2026-09-15T09:00:00-03:00", 5, 1800, 7),
      makeTraining("a3", "2026-09-20T09:00:00-03:00", 5, 1800, 8),
      // Período B (últimos 30 dias: out/2026)
      makeTraining("b1", "2026-10-05T09:00:00-03:00", 7, 2100, 6),
      makeTraining("b2", "2026-10-12T09:00:00-03:00", 7, 2100, 6),
      makeTraining("b3", "2026-10-20T09:00:00-03:00", 7, 2100, 7),
    ];

    const attempts: TafAttempt[] = [
      makeAttempt("taf-a", "2026-09-18T09:00:00-03:00", 2200),
      makeAttempt("taf-b", "2026-10-22T09:00:00-03:00", 2450),
    ];

    render(<PeriodComparator trainings={trainings} attempts={attempts} />);

    expect(screen.queryByTestId("low-sample-warning")).not.toBeInTheDocument();
    expect(screen.getByText("+250 m")).toBeInTheDocument();
    expect(screen.getByText(/mais rápido/i)).toBeInTheDocument();
    expect(screen.getByText("17.2 km")).toBeInTheDocument();
    expect(screen.getByText("23.45 km")).toBeInTheDocument();
  });

  it("atualiza datas pelos atalhos (14d, 30d, mensal) e por inputs manuais", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-01-20T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const { container } = render(<PeriodComparator trainings={[]} attempts={[]} />);
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs).toHaveLength(4);

    // Atalho "Este Mês vs Anterior" em janeiro deve virar para dezembro do ano anterior
    await user.click(screen.getByRole("button", { name: /Este Mês vs Anterior/i }));
    expect(dateInputs[0].value).toBe("2025-12-01");
    expect(dateInputs[1].value).toBe("2025-12-31");
    expect(dateInputs[2].value).toBe("2026-01-01");
    expect(dateInputs[3].value).toBe("2026-01-20");

    // Atalho 14d
    await user.click(screen.getByRole("button", { name: /Últimos 14 vs 14 dias/i }));
    expect(dateInputs[2].value).toBe("2026-01-06");
    expect(dateInputs[3].value).toBe("2026-01-20");

    // Atalho 30d
    await user.click(screen.getByRole("button", { name: /Últimos 30 vs 30 dias/i }));
    expect(dateInputs[2].value).toBe("2025-12-21");

    // Edição manual de cada input de data
    fireEvent.change(dateInputs[0], { target: { value: "2026-01-01" } });
    fireEvent.change(dateInputs[1], { target: { value: "2026-01-05" } });
    fireEvent.change(dateInputs[2], { target: { value: "2026-01-06" } });
    fireEvent.change(dateInputs[3], { target: { value: "2026-01-10" } });
    expect(dateInputs[0].value).toBe("2026-01-01");
    expect(dateInputs[3].value).toBe("2026-01-10");
  });

  it("exibe regressão de ritmo, queda no melhor TAF e igualdade de distância", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-30T12:00:00-03:00"));

    const trainings: TrainingSession[] = [
      makeTraining("a1", "2026-09-15T09:00:00-03:00", 10, 3000, 6), // 5:00/km
      makeTraining("b1", "2026-10-15T09:00:00-03:00", 5, 1800, 8),  // 6:00/km
    ];
    const attempts: TafAttempt[] = [
      makeAttempt("taf-a", "2026-09-18T09:00:00-03:00", 2400),
      makeAttempt("taf-b", "2026-10-22T09:00:00-03:00", 2300),
    ];

    const { rerender } = render(
      <PeriodComparator trainings={trainings} attempts={attempts} />
    );

    expect(screen.getByText(/-100 m/i)).toBeInTheDocument();
    expect(screen.getByText(/mais lento/i)).toBeInTheDocument();

    // Mesmo resultado de TAF nos dois períodos
    rerender(
      <PeriodComparator
        trainings={trainings}
        attempts={[
          makeAttempt("taf-a", "2026-09-18T09:00:00-03:00", 2400),
          makeAttempt("taf-b", "2026-10-22T09:00:00-03:00", 2400),
        ]}
      />
    );
    expect(screen.getByText(/= Mesma distância/i)).toBeInTheDocument();
  });
});
