import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrainingList } from "@/components/meu-taf/TrainingList";
import { TrainingSession } from "@/types";

const mockTrainings: TrainingSession[] = [
  {
    id: "trn-1",
    sessionDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 dia atrás
    activityType: "corrida_continua",
    distanceKm: 10.0,
    durationSeconds: 3000, // 50 min, pace 5:00
    speedKmh: 12.0,
    paceSeconds: 300,
    paceFormatted: "05:00",
    perceivedEffort: 4, // Moderado
    splits: [],
    notes: "Treino longo de domingo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trn-2",
    sessionDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 dias atrás
    activityType: "corrida_intervalada",
    distanceKm: 6.0,
    durationSeconds: 1440, // 24 min, pace 4:00
    speedKmh: 15.0,
    paceSeconds: 240,
    paceFormatted: "04:00",
    perceivedEffort: 8, // Intenso
    splits: [],
    notes: "Tiros na pista",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trn-3",
    sessionDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(), // 12 dias atrás
    activityType: "caminhada",
    distanceKm: 4.0,
    durationSeconds: 2400, // 40 min, pace 10:00
    speedKmh: 6.0,
    paceSeconds: 600,
    paceFormatted: "10:00",
    perceivedEffort: 2, // Leve
    splits: [],
    notes: "Regenerativo leve",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("TrainingList Component - Filtros Avançados", () => {
  it("permite filtrar a lista pelas últimas 2 sessões mais recentes", async () => {
    const user = userEvent.setup();
    render(
      <TrainingList
        trainings={mockTrainings}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Inicialmente exibe todos os 3 treinos (10km + 6km + 4km = 20 km)
    expect(screen.getByText("Diário de Treinos (3)")).toBeInTheDocument();
    expect(screen.getByText("20 km")).toBeInTheDocument();

    // Clica no filtro de 2 sessões
    const btn2Sessions = screen.getByRole("button", { name: "2 sessões" });
    await user.click(btn2Sessions);

    // Agora exibe apenas os 2 mais recentes (10 km e 6 km = 16 km)
    expect(screen.getByText("Diário de Treinos (2)")).toBeInTheDocument();
    expect(screen.getByText("16 km")).toBeInTheDocument();
    expect(screen.getByText("10.00")).toBeInTheDocument();
    expect(screen.getByText("6.00")).toBeInTheDocument();
    expect(screen.queryByText("4.00")).not.toBeInTheDocument();
  });

  it("permite filtrar por período específico com 2 datas (De / Até)", async () => {
    const user = userEvent.setup();
    render(
      <TrainingList
        trainings={mockTrainings}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Clica no botão Personalizado
    const btnCustom = screen.getByRole("button", { name: /Personalizado/i });
    await user.click(btnCustom);

    // Painel de datas aberto
    expect(screen.getByTestId("list-custom-date-panel")).toBeInTheDocument();

    const inputStart = screen.getByTestId("list-filter-start-date") as HTMLInputElement;
    const inputEnd = screen.getByTestId("list-filter-end-date") as HTMLInputElement;

    // Filtra entre 6 dias atrás e hoje (trn-1 e trn-2, excluindo trn-3 de 12 dias atrás)
    const startDateStr = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDateStr = new Date().toISOString().split("T")[0];

    await user.type(inputStart, startDateStr);
    await user.type(inputEnd, endDateStr);

    expect(screen.getByText("Diário de Treinos (2)")).toBeInTheDocument();
    expect(screen.getByText("16 km")).toBeInTheDocument();
  });

  it("permite filtrar por faixa de intensidade RPE", async () => {
    const user = userEvent.setup();
    render(
      <TrainingList
        trainings={mockTrainings}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Filtra por 'Intenso (7-8)' (apenas trn-2 tem RPE 8)
    const btnIntenso = screen.getByRole("button", { name: "Intenso (7-8)" });
    await user.click(btnIntenso);

    expect(screen.getByText("Diário de Treinos (1)")).toBeInTheDocument();
    expect(screen.getByText("6.00")).toBeInTheDocument();
    expect(screen.queryByText("10.00")).not.toBeInTheDocument();
    expect(screen.queryByText("4.00")).not.toBeInTheDocument();
  });

  it("permite ordenar por maior distância e menor pace", async () => {
    const user = userEvent.setup();
    render(
      <TrainingList
        trainings={mockTrainings}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Clica para ordenar por 'Mais rápidos' (menor pace primeiro)
    const btnPace = screen.getByRole("button", { name: "Mais rápidos" });
    await user.click(btnPace);

    // O treino mais rápido é o de pace 4:00 (trn-2 de 6km)
    const cards = screen.getAllByTestId(/^training-card-/);
    expect(cards[0]).toHaveTextContent("6.00");
  });

  it("permite limpar todos os filtros simultaneamente e restaurar a lista completa", async () => {
    const user = userEvent.setup();
    render(
      <TrainingList
        trainings={mockTrainings}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Aplica um filtro de RPE Leve (1-3)
    await user.click(screen.getByRole("button", { name: "Leve (1-3)" }));
    expect(screen.getByText("Diário de Treinos (1)")).toBeInTheDocument();

    // Botão Limpar todos os filtros visível
    const resetBtn = screen.getByRole("button", { name: /Limpar todos os filtros/i });
    await user.click(resetBtn);

    // Restaura para 3 treinos
    expect(screen.getByText("Diário de Treinos (3)")).toBeInTheDocument();
    expect(screen.getByText("20 km")).toBeInTheDocument();
  });
});
