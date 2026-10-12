import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TreinosPage from "@/app/treinos/page";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";
import { TrainingSession } from "@/types";

const mockTrainingSession: TrainingSession = {
  id: "trn_test_1",
  sessionDate: new Date().toISOString(),
  activityType: "corrida_continua",
  distanceKm: 5.0,
  durationSeconds: 1650,
  speedKmh: 10.91,
  paceSeconds: 330,
  paceFormatted: "05:30",
  perceivedEffort: 6,
  bodyWeightKg: 74.5,
  notes: "Treino moderado",
  splits: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("TreinosPage (Fase 4 - Diário de Treinos Completo)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    setupMockTafApi();
  });

  it("renderiza o cabeçalho, os KPIs de consistência e a lista inicial de treinos", async () => {
    render(<TreinosPage />);

    expect(
      screen.getByRole("heading", { name: "Diário de Treinos & Consistência" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Acompanhe a sua rotina semanal de treinos/i)
    ).toBeInTheDocument();

    // KPIs presentes
    expect(screen.getByText("Volume Semanal")).toBeInTheDocument();
    expect(screen.getByText("Volume Mensal")).toBeInTheDocument();
    expect(screen.getByText("Pace Médio")).toBeInTheDocument();
    expect(screen.getByText("Esforço (RPE)")).toBeInTheDocument();

    // Botão de registrar
    expect(
      screen.getByRole("button", { name: /Registrar Treino/i })
    ).toBeInTheDocument();

    // Lista de treinos renderizada
    expect(await screen.findByTestId("training-list")).toBeInTheDocument();
  });

  it("abre e fecha o formulário de treino ao clicar no botão de alternância", async () => {
    const user = userEvent.setup();
    render(<TreinosPage />);

    const openBtn = screen.getByRole("button", { name: /Registrar Treino/i });
    await user.click(openBtn);

    // Formulário aberto
    expect(await screen.findByTestId("training-form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registrar Novo Treino" })).toBeInTheDocument();

    // Botão muda para "Fechar Formulário"
    const closeBtn = screen.getByRole("button", { name: /Fechar Formulário/i });
    await user.click(closeBtn);

    expect(screen.queryByTestId("training-form")).not.toBeInTheDocument();
  });

  it("registra uma nova sessão de treino e exibe feedback de sucesso", async () => {
    const user = userEvent.setup();
    render(<TreinosPage />);

    const openBtn = screen.getByRole("button", { name: /Registrar Treino/i });
    await user.click(openBtn);

    // Seleciona modalidade "Intervalado / Tiros"
    const intervalBtn = await screen.findByRole("button", { name: /Intervalado \/ Tiros/i });
    await user.click(intervalBtn);

    // Clica no atalho de 5 km
    const shortcut5km = screen.getByRole("button", { name: "5 km" });
    await user.click(shortcut5km);

    // Clica no botão de registrar no diário
    const submitBtn = screen.getByRole("button", { name: /Registrar Treino no Diário/i });
    await user.click(submitBtn);

    // Notificação de sucesso
    expect(
      await screen.findByText(/Novo treino registrado no diário com sucesso!/i)
    ).toBeInTheDocument();
  });

  it("permite abrir o formulário para editar um treino existente", async () => {
    setupMockTafApi({ trainings: [mockTrainingSession] });
    const user = userEvent.setup();
    render(<TreinosPage />);

    // Aguarda carregar a lista de treinos mockados
    const editButtons = await screen.findAllByRole("button", { name: /Editar este treino/i });
    expect(editButtons.length).toBeGreaterThan(0);

    // Clica em editar no primeiro treino
    await user.click(editButtons[0]);

    // O formulário deve abrir em modo de edição
    expect(await screen.findByTestId("training-form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Editar Sessão de Treino" })).toBeInTheDocument();
  });

  it("permite excluir um treino da lista com confirmação", async () => {
    setupMockTafApi({ trainings: [mockTrainingSession] });
    const user = userEvent.setup();
    render(<TreinosPage />);

    const deleteButtons = await screen.findAllByRole("button", { name: /Excluir treino/i });
    expect(deleteButtons.length).toBeGreaterThan(0);

    // Clica no botão de excluir (primeiro clique pede confirmação)
    await user.click(deleteButtons[0]);

    // Clica no botão de confirmar exclusão
    const confirmBtn = await screen.findByRole("button", { name: /Sim, Excluir/i });
    await user.click(confirmBtn);

    expect(await screen.findByText(/Treino excluído com sucesso/i)).toBeInTheDocument();
  });

  it("calcula e exibe corretamente os valores dos KPIs com base nas sessões registradas", async () => {
    setupMockTafApi({ trainings: [mockTrainingSession] });
    render(<TreinosPage />);

    // Aguarda lista carregar
    expect(await screen.findByTestId("training-list")).toBeInTheDocument();

    // Volume semanal deve exibir 5 km
    const weeklyCard = screen.getByTestId("kpi-weekly-volume");
    expect(weeklyCard).toHaveTextContent("5");

    // Volume mensal deve exibir 5 km
    const monthlyCard = screen.getByTestId("kpi-monthly-volume");
    expect(monthlyCard).toHaveTextContent("5");

    // Pace médio da semana 5:30 /km
    const paceCard = screen.getByTestId("kpi-avg-pace");
    expect(paceCard).toHaveTextContent("5:30");

    // Esforço médio 6 / 10
    const rpeCard = screen.getByTestId("kpi-avg-rpe");
    expect(rpeCard).toHaveTextContent("6");
  });
});
