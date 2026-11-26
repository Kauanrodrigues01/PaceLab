import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TafAttemptList } from "@/components/meu-taf/TafAttemptList";
import { TafAttempt } from "@/types";

function makeAttempt(overrides: Partial<TafAttempt> & { id: string; testDate: string }): TafAttempt {
  return {
    targetDurationSeconds: 720,
    actualDurationSeconds: 720,
    distanceMeters: 2400,
    speedKmh: 12,
    paceSeconds: 300,
    paceFormatted: "5:00",
    createdAt: overrides.testDate,
    updatedAt: overrides.testDate,
    ...overrides,
  };
}

describe("TafAttemptList Component", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exibe estado vazio para 12 minutos e mensagem genérica ao trocar filtro", async () => {
    const user = userEvent.setup();
    render(
      <TafAttemptList
        attempts={[]}
        targetDistanceMeters={2400}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByTestId("taf-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/nenhum simulado de 12 minutos/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Outras durações/i }));
    expect(
      screen.getByText(/Nenhum teste encontrado para o filtro selecionado/i)
    ).toBeInTheDocument();
  });

  it("filtra por duração (12 Minutos, Todos, Outras durações) e por período (30d, 90d, Todo o período)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-30T12:00:00-03:00"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const attempts: TafAttempt[] = [
      makeAttempt({ id: "att-recent-12m", testDate: "2026-10-20T09:00:00-03:00", distanceMeters: 2500 }),
      makeAttempt({ id: "att-60d-12m", testDate: "2026-09-01T09:00:00-03:00", distanceMeters: 2350 }),
      makeAttempt({ id: "att-120d-12m", testDate: "2026-06-20T09:00:00-03:00", distanceMeters: 2200 }),
      makeAttempt({
        id: "att-other-dur",
        testDate: "2026-10-25T09:00:00-03:00",
        targetDurationSeconds: 900,
        actualDurationSeconds: 900,
        distanceMeters: 3000,
      }),
    ];

    render(
      <TafAttemptList
        attempts={attempts}
        targetDistanceMeters={2400}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Padrão: 12 Minutos (TAF) + Todo o período => 3 testes
    expect(screen.getByText("Histórico de Testes (3)")).toBeInTheDocument();

    // Filtro 30 dias => apenas 1 teste de 12 min
    await user.click(screen.getByRole("button", { name: "30 dias" }));
    expect(screen.getByText("Histórico de Testes (1)")).toBeInTheDocument();

    // Filtro 90 dias => 2 testes de 12 min
    await user.click(screen.getByRole("button", { name: "90 dias" }));
    expect(screen.getByText("Histórico de Testes (2)")).toBeInTheDocument();

    // Volta para Todo o período e seleciona "Todos" (durações) => 4 testes
    await user.click(screen.getByRole("button", { name: "Todo o período" }));
    await user.click(screen.getByRole("button", { name: "Todos" }));
    expect(screen.getByText("Histórico de Testes (4)")).toBeInTheDocument();

    // Seleciona "Outras durações" => 1 teste (900s)
    await user.click(screen.getByRole("button", { name: "Outras durações" }));
    expect(screen.getByText("Histórico de Testes (1)")).toBeInTheDocument();
    expect(screen.getByTestId("taf-card-att-other-dur")).toBeInTheDocument();
    expect(screen.getByText("3.000")).toBeInTheDocument();
  });

  it("propaga callbacks onEdit e onDelete através do TafAttemptCard", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const attempt = makeAttempt({
      id: "att-action-1",
      testDate: "2026-10-20T09:00:00-03:00",
      distanceMeters: 2450,
    });

    render(
      <TafAttemptList
        attempts={[attempt]}
        targetDistanceMeters={2400}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole("button", { name: /Editar este teste/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "att-action-1" }));

    await user.click(screen.getByRole("button", { name: /Excluir este teste/i }));
    await user.click(screen.getByRole("button", { name: /Sim, Excluir/i }));
    expect(onDelete).toHaveBeenCalledWith("att-action-1");
  });
});
