import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HistoricoPage from "@/app/historico/page";
import { historyStorage } from "@/lib/storage/localStorage";

describe("HistoricoPage (Fase 8)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();

    // Mock para download de blobs
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn(() => "blob:test");
    } else {
      vi.spyOn(window.URL, "createObjectURL").mockReturnValue("blob:test");
    }
  });

  it("renderiza o estado vazio inicial quando não há treinos", () => {
    render(<HistoricoPage />);

    expect(
      screen.getByRole("heading", { name: "Histórico de Treinos & Cálculos" })
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhuma atividade salva ainda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar Primeiro Treino" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carregar Dados de Exemplo" })).toBeInTheDocument();
  });

  it("carrega dados de exemplo ao clicar em 'Carregar Dados de Exemplo'", async () => {
    const user = userEvent.setup();
    render(<HistoricoPage />);

    const sampleBtn = screen.getByRole("button", { name: "Carregar Dados de Exemplo" });
    await user.click(sampleBtn);

    // Deve listar os dados de exemplo carregados
    expect(screen.getByText("5.00 km")).toBeInTheDocument();
    expect(screen.getByText("10.00 km")).toBeInTheDocument();
    expect(screen.getByText("5:00 min/km")).toBeInTheDocument();
    expect(screen.getByText("5:24 min/km")).toBeInTheDocument();
  });

  it("abre o formulário de novo treino e calcula pace em tempo real ao digitar", async () => {
    const user = userEvent.setup();
    render(<HistoricoPage />);

    const openFormBtn = screen.getByRole("button", { name: "Registrar Treino" });
    await user.click(openFormBtn);

    expect(screen.getByText("Novo Registro de Corrida")).toBeInTheDocument();

    const distInput = screen.getByLabelText("Distância");
    const timeInput = screen.getByLabelText("Tempo Total");

    await user.type(distInput, "5");
    await user.type(timeInput, "25:00");

    // Deve exibir o preview de ritmo calculado automaticamente
    await waitFor(() => {
      expect(screen.getByText(/Pace 5:00 min\/km • Velocidade 12.00 km\/h/i)).toBeInTheDocument();
    });
  });

  it("valida campos obrigatórios ao submeter formulário vazio", async () => {
    const user = userEvent.setup();
    render(<HistoricoPage />);

    const openFormBtn = screen.getByRole("button", { name: "Registrar Treino" });
    await user.click(openFormBtn);

    const submitBtn = screen.getByRole("button", { name: "Salvar no Histórico" });
    await user.click(submitBtn);

    expect(screen.getByText("A distância deve ser maior que zero.")).toBeInTheDocument();
    expect(screen.getByText(/Informe um tempo válido/i)).toBeInTheDocument();
  });

  it("adiciona um novo treino com sucesso e exibe na listagem", async () => {
    const user = userEvent.setup();
    render(<HistoricoPage />);

    const openFormBtn = screen.getByRole("button", { name: "Registrar Treino" });
    await user.click(openFormBtn);

    const distInput = screen.getByLabelText("Distância");
    const timeInput = screen.getByLabelText("Tempo Total");
    const notesInput = screen.getByLabelText("Notas e Observações (Opcional)");

    await user.type(distInput, "8");
    await user.type(timeInput, "40:00");
    await user.type(notesInput, "Treino progressivo no parque");

    const submitBtn = screen.getByRole("button", { name: "Salvar no Histórico" });
    await user.click(submitBtn);

    // Deve fechar o formulário e exibir a atividade
    expect(screen.queryByText("Novo Registro de Corrida")).not.toBeInTheDocument();
    expect(screen.getByText("8.00 km")).toBeInTheDocument();
    expect(screen.getByText("40:00")).toBeInTheDocument();
    expect(screen.getByText("5:00 min/km")).toBeInTheDocument();
    expect(screen.getByText(/Treino progressivo no parque/i)).toBeInTheDocument();
  });

  it("permite editar um registro existente e salvar alterações", async () => {
    // Insere um item prévio
    historyStorage.save({
      id: "test-edit-1",
      date: "2026-10-10",
      distanceKm: 5,
      timeSeconds: 1500,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      notes: "Nota inicial",
      createdAt: new Date().toISOString(),
    });

    const user = userEvent.setup();
    render(<HistoricoPage />);

    expect(screen.getByText("5.00 km")).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: /Editar treino/i });
    await user.click(editBtn);

    const editDistInput = screen.getByLabelText("Distância (km)");
    await user.clear(editDistInput);
    await user.type(editDistInput, "6");

    const saveEditBtn = screen.getByRole("button", { name: "Salvar Alterações" });
    await user.click(saveEditBtn);

    expect(screen.getByText("6.00 km")).toBeInTheDocument();
    expect(screen.queryByLabelText("Distância (km)")).not.toBeInTheDocument();
  });

  it("permite excluir um registro com confirmação", async () => {
    historyStorage.save({
      id: "test-del-1",
      date: "2026-10-10",
      distanceKm: 5,
      timeSeconds: 1500,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      notes: "Para deletar",
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    render(<HistoricoPage />);

    expect(screen.getByText("5.00 km")).toBeInTheDocument();

    const delBtn = screen.getByRole("button", { name: /Excluir treino/i });
    await user.click(delBtn);

    expect(window.confirm).toHaveBeenCalledWith(
      "Deseja realmente remover esta atividade do histórico?"
    );
    expect(screen.getByText("Nenhuma atividade salva ainda")).toBeInTheDocument();
  });

  it("permite limpar todo o histórico", async () => {
    historyStorage.save({
      id: "item-1",
      date: "2026-10-10",
      distanceKm: 5,
      timeSeconds: 1500,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    render(<HistoricoPage />);

    const clearAllBtn = screen.getByRole("button", { name: "Limpar Tudo" });
    await user.click(clearAllBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByText("Nenhuma atividade salva ainda")).toBeInTheDocument();
  });

  it("exporta arquivos CSV e JSON ao clicar nos respectivos botões", async () => {
    historyStorage.save({
      id: "item-1",
      date: "2026-10-10",
      distanceKm: 5,
      timeSeconds: 1500,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      createdAt: new Date().toISOString(),
    });

    const user = userEvent.setup();
    render(<HistoricoPage />);

    const csvBtn = screen.getByRole("button", { name: "Exportar CSV" });
    const jsonBtn = screen.getByRole("button", { name: "Exportar JSON" });

    await user.click(csvBtn);
    await user.click(jsonBtn);

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("não remove o registro se o usuário cancelar a confirmação", async () => {
    historyStorage.save({
      id: "item-keep",
      date: "2026-10-10",
      distanceKm: 5,
      timeSeconds: 1500,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      createdAt: new Date().toISOString(),
    });

    vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    render(<HistoricoPage />);

    expect(screen.getByText("5.00 km")).toBeInTheDocument();

    const delBtn = screen.getByRole("button", { name: /Excluir treino/i });
    await user.click(delBtn);

    // Deve permanecer na lista
    expect(screen.getByText("5.00 km")).toBeInTheDocument();
  });

  it("aceita distância com vírgula (ex: 5,5 km)", async () => {
    const user = userEvent.setup();
    render(<HistoricoPage />);

    const openFormBtn = screen.getByRole("button", { name: "Registrar Treino" });
    await user.click(openFormBtn);

    const distInput = screen.getByLabelText("Distância");
    const timeInput = screen.getByLabelText("Tempo Total");

    await user.type(distInput, "5,5");
    await user.type(timeInput, "33:00");

    const submitBtn = screen.getByRole("button", { name: "Salvar no Histórico" });
    await user.click(submitBtn);

    expect(screen.getByText("5.50 km")).toBeInTheDocument();
    expect(screen.getByText("6:00 min/km")).toBeInTheDocument();
  });

  it("filtra registros por categoria (Todas, Corridas, TAF, Metas)", async () => {
    historyStorage.save({
      id: "run-1",
      date: "2026-10-10",
      distanceKm: 5,
      timeSeconds: 1500,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      notes: "Rodagem leve matinal",
      createdAt: new Date().toISOString(),
    });
    historyStorage.save({
      id: "taf-1",
      date: "2026-10-11",
      distanceKm: 2.4,
      timeSeconds: 720,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      notes: "Simulado TAF PMPR",
      createdAt: new Date().toISOString(),
    });
    historyStorage.save({
      id: "goal-1",
      date: "2026-10-12",
      distanceKm: 10,
      timeSeconds: 3000,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      notes: "Planejamento Meta 10k sub-50",
      createdAt: new Date().toISOString(),
    });

    const user = userEvent.setup();
    render(<HistoricoPage />);

    // Todas as 3 devem aparecer inicialmente
    expect(screen.getByText(/Rodagem leve matinal/i)).toBeInTheDocument();
    expect(screen.getByText(/Simulado TAF PMPR/i)).toBeInTheDocument();
    expect(screen.getByText(/Planejamento Meta 10k sub-50/i)).toBeInTheDocument();

    // Filtra por TAF
    const tafFilterBtn = screen.getByRole("button", { name: /TAF/i });
    await user.click(tafFilterBtn);

    expect(screen.getByText(/Simulado TAF PMPR/i)).toBeInTheDocument();
    expect(screen.queryByText(/Rodagem leve matinal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Planejamento Meta 10k sub-50/i)).not.toBeInTheDocument();

    // Filtra por Metas
    const goalsFilterBtn = screen.getByRole("button", { name: /Metas/i });
    await user.click(goalsFilterBtn);

    expect(screen.getByText(/Planejamento Meta 10k sub-50/i)).toBeInTheDocument();
    expect(screen.queryByText(/Simulado TAF PMPR/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rodagem leve matinal/i)).not.toBeInTheDocument();

    // Filtra por Corridas
    const runsFilterBtn = screen.getByRole("button", { name: /Corridas/i });
    await user.click(runsFilterBtn);

    expect(screen.getByText(/Rodagem leve matinal/i)).toBeInTheDocument();
    expect(screen.queryByText(/Simulado TAF PMPR/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Planejamento Meta 10k sub-50/i)).not.toBeInTheDocument();

    // Retorna para Todas
    const allFilterBtn = screen.getByRole("button", { name: /Todas/i });
    await user.click(allFilterBtn);

    expect(screen.getByText(/Rodagem leve matinal/i)).toBeInTheDocument();
    expect(screen.getByText(/Simulado TAF PMPR/i)).toBeInTheDocument();
    expect(screen.getByText(/Planejamento Meta 10k sub-50/i)).toBeInTheDocument();
  });

  it("converte um registro do histórico em treino do diário com 1 clique", async () => {
    const { tafService } = await import("@/lib/services/tafService");
    const saveTrainingSpy = vi.spyOn(tafService, "saveTraining").mockResolvedValue({
      id: "training-123",
      sessionDate: "2026-10-10",
      activityType: "corrida_continua",
      distanceKm: 5,
      durationSeconds: 1500,
      speedKmh: 12,
      paceSeconds: 300,
      paceFormatted: "5:00",
      notes: "Convertido",
      totalCalories: 300,
      activeCalories: 260,
      metValue: 11.5,
      calorieMethod: "compendium_2024",
      calorieSource: "automatic",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    historyStorage.save({
      id: "entry-convert-1",
      date: "2026-10-10",
      distanceKm: 5,
      timeSeconds: 1500,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      notes: "Treino matinal",
      createdAt: new Date().toISOString(),
    });

    const user = userEvent.setup();
    render(<HistoricoPage />);

    const convertBtn = screen.getByRole("button", { name: "Converter em Treino do Diário" });
    await user.click(convertBtn);

    expect(saveTrainingSpy).toHaveBeenCalledTimes(1);
    expect(saveTrainingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionDate: "2026-10-10",
        activityType: "corrida_continua",
        distanceKm: 5,
        durationSeconds: 1500,
        speedKmh: 12,
        calorieMethod: "compendium_2024",
      })
    );

    // Deve substituir o botão pelo badge de sucesso
    expect(screen.getByText("Convertido para Treino!")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Converter em Treino do Diário" })).not.toBeInTheDocument();
  });
});

