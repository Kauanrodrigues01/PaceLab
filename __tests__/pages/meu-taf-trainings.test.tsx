import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TreinosPage from "@/app/treinos/page";
import { tafService } from "@/lib/services/tafService";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";

describe("Diário de Treinos - CRUD Completo (RPE, Peso, Splits e Filtros)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    setupMockTafApi();
  });

  it("exibe formulário e estado vazio inicial na tela de treinos", async () => {
    const user = userEvent.setup();
    render(<TreinosPage />);

    // Clica para abrir o formulário
    const openBtn = screen.getByRole("button", { name: /Registrar Treino/i });
    await user.click(openBtn);

    // Formulário do Diário presente
    expect(screen.getByTestId("training-form")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Registrar Novo Treino" })
    ).toBeInTheDocument();

    // Seletor de modalidades
    expect(screen.getByRole("button", { name: /Corrida Contínua/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Intervalado \/ Tiros/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Caminhada/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Simulado TAF/i })).not.toBeInTheDocument();

    // Empty state inicial da lista
    expect(screen.getByTestId("training-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/Seu diário de treinos está vazio/i)).toBeInTheDocument();
  });

  it("registra uma sessão de treino com RPE e peso corporal e atualiza a listagem", async () => {
    const user = userEvent.setup();
    render(<TreinosPage />);

    const openBtn = screen.getByRole("button", { name: /Registrar Treino/i });
    await user.click(openBtn);

    // Seleciona modalidade "Intervalado / Tiros"
    const intervalBtn = screen.getByRole("button", { name: /Intervalado \/ Tiros/i });
    await user.click(intervalBtn);

    // Clica no atalho de 5 km
    const shortcut5km = screen.getByRole("button", { name: "5 km" });
    await user.click(shortcut5km);

    // Seleciona RPE 8 (Muito Difícil)
    const rpe8Btn = screen.getByRole("button", { name: "8" });
    await user.click(rpe8Btn);
    expect(screen.getByText(/RPE 8:/i)).toBeInTheDocument();

    // Preenche peso corporal: 73.5 kg
    const weightInput = screen.getByPlaceholderText(/Ex: 74.5/i);
    await user.clear(weightInput);
    await user.type(weightInput, "73.5");

    // Submete o formulário
    const submitBtn = screen.getByTestId("submit-training-btn");
    await user.click(submitBtn);

    // Toast de sucesso
    expect(
      await screen.findByText("Novo treino registrado no diário com sucesso!")
    ).toBeInTheDocument();

    // Card de treino criado na lista
    expect(screen.getByText("5.00")).toBeInTheDocument();
    expect(screen.getAllByText("Intervalado / Tiros")[0]).toBeInTheDocument();
    expect(screen.getByTestId("badge-rpe")).toHaveTextContent("RPE 8 • Intenso");
    expect(screen.getByTestId("badge-weight")).toHaveTextContent("73.5 kg");
  });

  it("registra treino sem peso corporal (salvando como null, não exibindo badge de peso e não gravando 0)", async () => {
    const user = userEvent.setup();
    render(<TreinosPage />);

    const openBtn = screen.getByRole("button", { name: /Registrar Treino/i });
    await user.click(openBtn);

    // Clica no atalho de 3 km
    const shortcut3km = screen.getByRole("button", { name: "3 km" });
    await user.click(shortcut3km);

    // Garante campo de peso em branco
    const weightInput = screen.getByPlaceholderText(/Ex: 74.5/i);
    await user.clear(weightInput);

    // Submete
    const submitBtn = screen.getByTestId("submit-training-btn");
    await user.click(submitBtn);

    await screen.findByText("Novo treino registrado no diário com sucesso!");

    // Card exibido
    expect(screen.getByText("3.00")).toBeInTheDocument();
    // Badge de peso NÃO deve existir
    expect(screen.queryByTestId("badge-weight")).not.toBeInTheDocument();

    // Verifica persistência no tafService
    const stored = await tafService.getTrainings();
    expect(stored).toHaveLength(1);
    expect(stored[0].bodyWeightKg).toBeNull();
  });

  it("permite registrar parciais de quilômetro (splits) e visualizá-las no card", async () => {
    const user = userEvent.setup();
    render(<TreinosPage />);

    const openBtn = screen.getByRole("button", { name: /Registrar Treino/i });
    await user.click(openBtn);

    // Seleciona 3 km
    const shortcut3km = screen.getByRole("button", { name: "3 km" });
    await user.click(shortcut3km);

    // Ativa checkbox de splits
    const splitsCheckbox = screen.getByLabelText(/Registrar parciais por quilômetro/i);
    await user.click(splitsCheckbox);

    // Verifica que 3 km foram gerados
    expect(screen.getByText("Km 1")).toBeInTheDocument();
    expect(screen.getByText("Km 2")).toBeInTheDocument();
    expect(screen.getByText("Km 3")).toBeInTheDocument();

    // Submete
    const submitBtn = screen.getByTestId("submit-training-btn");
    await user.click(submitBtn);

    await screen.findByText("Novo treino registrado no diário com sucesso!");

    // Botão de expandir parciais no card
    const toggleSplitsBtn = screen.getByRole("button", {
      name: /Ver parciais de km \(3 km\)/i,
    });
    expect(toggleSplitsBtn).toBeInTheDocument();

    await user.click(toggleSplitsBtn);
    expect(screen.getByText("Km 1:")).toBeInTheDocument();
    expect(screen.getByText("Km 2:")).toBeInTheDocument();
    expect(screen.getByText("Km 3:")).toBeInTheDocument();
  });

  it("permite editar um treino existente", async () => {
    const user = userEvent.setup();

    // Pré-popula um treino
    await tafService.saveTraining({
      id: "trn-edit-1",
      sessionDate: "2026-10-10T07:00:00.000Z",
      activityType: "corrida_continua",
      distanceKm: 4.0,
      durationSeconds: 1200, // 20 min
      speedKmh: 12.0,
      paceSeconds: 300,
      paceFormatted: "5:00",
      perceivedEffort: 5,
      bodyWeightKg: 75.0,
      createdAt: "2026-10-10T07:00:00.000Z",
      updatedAt: "2026-10-10T07:00:00.000Z",
    });

    render(<TreinosPage />);

    await screen.findByText("4.00");

    // Clica no botão de edição
    const editBtn = screen.getByTitle("Editar este treino");
    await user.click(editBtn);

    // Formulário em modo de edição
    expect(
      screen.getByRole("heading", { name: "Editar Sessão de Treino" })
    ).toBeInTheDocument();

    // Altera para 8 km
    const shortcut8km = screen.getByRole("button", { name: "8 km" });
    await user.click(shortcut8km);

    // Salva alterações
    const saveBtn = screen.getByTestId("submit-training-btn");
    await user.click(saveBtn);

    expect(
      await screen.findByText("Treino atualizado com sucesso!")
    ).toBeInTheDocument();
    expect(screen.getByText("8.00")).toBeInTheDocument();
  });

  it("permite excluir um treino com confirmação", async () => {
    const user = userEvent.setup();

    await tafService.saveTraining({
      id: "trn-del-1",
      sessionDate: "2026-10-10T07:00:00.000Z",
      activityType: "caminhada",
      distanceKm: 3.5,
      durationSeconds: 2100,
      speedKmh: 6.0,
      paceSeconds: 600,
      paceFormatted: "10:00",
      createdAt: "2026-10-10T07:00:00.000Z",
      updatedAt: "2026-10-10T07:00:00.000Z",
    });

    render(<TreinosPage />);

    await screen.findByText("3.50");

    // Clica em excluir
    const deleteBtn = screen.getByTitle("Excluir treino");
    await user.click(deleteBtn);

    expect(screen.getByText(/Excluir este treino de 3\.50 km\?/i)).toBeInTheDocument();

    // Confirma
    const confirmDeleteBtn = screen.getByRole("button", { name: "Sim, Excluir" });
    await user.click(confirmDeleteBtn);

    expect(await screen.findByText("Treino excluído com sucesso.")).toBeInTheDocument();
    expect(screen.getByTestId("training-empty-state")).toBeInTheDocument();
  });

  it("filtra treinos por modalidade e calcula resumo de volume", async () => {
    const user = userEvent.setup();

    // Treino 1: Corrida Contínua (5 km, 1500s)
    await tafService.saveTraining({
      id: "trn-filter-1",
      sessionDate: "2026-10-09T07:00:00.000Z",
      activityType: "corrida_continua",
      distanceKm: 5.0,
      durationSeconds: 1500,
      speedKmh: 12.0,
      paceSeconds: 300,
      paceFormatted: "5:00",
      createdAt: "2026-10-09T07:00:00.000Z",
      updatedAt: "2026-10-09T07:00:00.000Z",
    });

    // Treino 2: Caminhada (3 km, 1800s)
    await tafService.saveTraining({
      id: "trn-filter-2",
      sessionDate: "2026-10-10T07:00:00.000Z",
      activityType: "caminhada",
      distanceKm: 3.0,
      durationSeconds: 1800,
      speedKmh: 6.0,
      paceSeconds: 600,
      paceFormatted: "10:00",
      createdAt: "2026-10-10T07:00:00.000Z",
      updatedAt: "2026-10-10T07:00:00.000Z",
    });

    render(<TreinosPage />);

    // Aguarda a lista de treinos carregar os 2 treinos salvos
    const list = await screen.findByTestId("training-list");
    expect(within(list).getByText("8 km")).toBeInTheDocument();
    expect(within(list).getByText("5.00")).toBeInTheDocument();
    expect(within(list).getByText("3.00")).toBeInTheDocument();

    // Filtra por 'Caminhada'
    const select = within(list).getByRole("combobox");
    await user.selectOptions(select, "caminhada");

    // Apenas a caminhada permanece
    expect(within(list).getByText("3.00")).toBeInTheDocument();
    expect(within(list).queryByText("5.00")).not.toBeInTheDocument();
    expect(within(list).getByText("3 km")).toBeInTheDocument(); // volume atualizado
  });

  it("exibe mensagem de erro e não reseta campos se a API do Supabase falhar ao salvar treino", async () => {
    const user = userEvent.setup();
    render(<TreinosPage />);

    const openBtn = screen.getByRole("button", { name: /Registrar Treino/i });
    await user.click(openBtn);

    // Força a API a retornar erro 500 no POST de treino
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/taf/trainings") && init?.method === "POST") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Erro de gravação no Supabase" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    const shortcut5km = screen.getByRole("button", { name: "5 km" });
    await user.click(shortcut5km);

    const submitBtn = screen.getByRole("button", { name: /Registrar Treino no Diário/i });
    await user.click(submitBtn);

    // Mensagem de erro exibida no formulário e no toast
    expect(await screen.findByTestId("form-error-message")).toHaveTextContent(
      "Erro de gravação no Supabase"
    );
    expect(screen.getByTestId("toast-notification")).toHaveTextContent(
      "Erro de gravação no Supabase"
    );

    // Distância continua mantida
    const distInput = screen.getByLabelText(/Distância Percorrida/i) as HTMLInputElement;
    expect(distInput.value).toBe("5");
  });
});
