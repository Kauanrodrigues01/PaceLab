import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TreinosPage from "@/app/treinos/page";
import { tafService } from "@/lib/services/tafService";
import { CROSS_PAGE_SHEETS_CACHE_KEYS } from "@/lib/sheetsSyncUi";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";
import { ACTIVITY_TYPES, ActivityParsePreview, TrainingSession } from "@/types";

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
    sessionStorage.clear();
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

  it("permite alternar entre as abas 'Diário & Registro' e 'Evolução & Gráficos'", async () => {
    setupMockTafApi({ trainings: [mockTrainingSession] });
    const user = userEvent.setup();
    render(<TreinosPage />);

    // Por padrão, a aba Diário está ativa
    expect(screen.getByTestId("tab-diario")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("kpi-weekly-volume")).toBeInTheDocument();

    // Clica na aba Evolução & Gráficos
    const tabGraficos = screen.getByTestId("tab-graficos");
    await user.click(tabGraficos);

    // Agora a aba Gráficos está ativa e o dashboard de evolução é exibido
    expect(tabGraficos).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("training-evolution-dashboard")).toBeInTheDocument();

    // Os cards de KPI rápidos do diário não devem mais estar visíveis na aba de gráficos
    expect(screen.queryByTestId("kpi-weekly-volume")).not.toBeInTheDocument();

    // Retorna para a aba Diário
    const tabDiario = screen.getByTestId("tab-diario");
    await user.click(tabDiario);

    expect(tabDiario).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("kpi-weekly-volume")).toBeInTheDocument();
  });

  it("abre diretamente na aba de gráficos quando a URL contém ?tab=graficos", async () => {
    setupMockTafApi({ trainings: [mockTrainingSession] });
    
    // Simula URL com ?tab=graficos
    window.history.replaceState({}, "", "/treinos?tab=graficos");

    try {
      render(<TreinosPage />);

      expect(screen.getByTestId("tab-graficos")).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("training-evolution-dashboard")).toBeInTheDocument();
      expect(screen.queryByTestId("kpi-weekly-volume")).not.toBeInTheDocument();
    } finally {
      window.history.replaceState({}, "", "/treinos");
    }
  });

  it("permite interagir com os filtros de sessões e personalizado na aba de gráficos de /treinos", async () => {
    setupMockTafApi({ trainings: [mockTrainingSession] });
    const user = userEvent.setup();
    render(<TreinosPage />);

    // Alterna para aba de análise/gráficos
    await user.click(screen.getByTestId("tab-graficos"));
    expect(screen.getByTestId("training-evolution-dashboard")).toBeInTheDocument();

    // Filtro de sessões presente
    const btn2Sessions = screen.getByRole("button", { name: "2 sessões" });
    await user.click(btn2Sessions);
    expect(screen.getByTestId("kpi-total-volume")).toBeInTheDocument();

    // Filtro personalizado presente
    const btnCustom = screen.getByRole("button", { name: /Personalizado/i });
    await user.click(btnCustom);
    expect(screen.getByTestId("filter-custom-date-panel")).toBeInTheDocument();
  });

  it("integra importação em massa (onBatchImported): limpa caches cross-page, recarrega treinos, fecha painel e exibe 1 toast consolidado", async () => {
    window.history.replaceState({}, "", "/treinos");
    const { store } = setupMockTafApi();
    sessionStorage.setItem(CROSS_PAGE_SHEETS_CACHE_KEYS.trainings, "[]");
    sessionStorage.setItem(CROSS_PAGE_SHEETS_CACHE_KEYS.tafAttempts, "stale");
    sessionStorage.setItem(CROSS_PAGE_SHEETS_CACHE_KEYS.tafTrainings, "stale");
    sessionStorage.setItem(CROSS_PAGE_SHEETS_CACHE_KEYS.tafGoal, "keep_goal");
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem");

    const buildPreview = (id: string, title: string): ActivityParsePreview => ({
      source: "fit_upload",
      filesUsed: ["fit"],
      name: title,
      rawType: "running",
      sourceActivityKind: "run",
      isIndoor: false,
      externalId: id,
      startedAt: new Date().toISOString(),
      distanceKm: 5.0,
      durationSeconds: 1500,
      elapsedSeconds: 1510,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12.0,
      elevationGainM: 25,
      avgHeartRate: 156,
      maxHeartRate: 170,
      avgCadence: 175,
      activeCalories: 350,
      avgTemperatureC: null,
      pointCount: 1500,
      splits: [],
      laps: [],
      warnings: [],
      alreadyExists: false,
      existingTrainingId: null,
      alreadyExistsAttempt: false,
      existingAttemptId: null,
      tafWindow: null,
      suggestedActivityType: "corrida_continua",
      suggestedNotes: "",
      allowedActivityTypes: [...ACTIVITY_TYPES],
    });

    vi.spyOn(tafService, "parseActivity")
      .mockResolvedValueOnce(buildPreview("ext_p_1", "Lote Treino 1"))
      .mockResolvedValueOnce(buildPreview("ext_p_2", "Lote Treino 2"))
      .mockResolvedValueOnce(buildPreview("ext_p_3", "Lote Treino 3"));

    const origSaveTraining = tafService.saveTraining.bind(tafService);
    const saveTrainingSpy = vi
      .spyOn(tafService, "saveTraining")
      .mockImplementation((tr, isUpd, opts) => origSaveTraining(tr, isUpd, opts));

    vi.spyOn(tafService, "getSheetsSyncStatus").mockResolvedValue({
      configured: true,
      pendingTrainingsCount: 0,
      pendingAttemptsCount: 0,
      totalPendingCount: 0,
    });
    const syncSpy = vi
      .spyOn(tafService, "syncGoogleSheets")
      .mockResolvedValue({
        direction: "push",
        forceFullResync: false,
        pushedAppended: 3,
        pushedUpdated: 0,
        pulledCreated: 0,
        pulledUpdated: 0,
        pulledLinked: 0,
        tafPushedAppended: 0,
        tafPushedUpdated: 0,
        tafPulledCreated: 0,
        tafPulledUpdated: 0,
        tafPulledLinked: 0,
        profileSynced: false,
        skipped: 0,
        warnings: [],
        durationMs: 100,
        syncedAt: new Date().toISOString(),
      });

    const user = userEvent.setup({ applyAccept: false });
    render(<TreinosPage />);

    await screen.findByTestId("training-list");
    await user.click(screen.getByRole("button", { name: /Registrar Treino/i }));
    await user.click(await screen.findByTestId("mode-import-btn"));

    const input = screen.getByTestId("activity-file-input") as HTMLInputElement;
    await user.upload(input, [
      new File([new Uint8Array(64)], "t1.fit", { lastModified: 1 }),
      new File([new Uint8Array(64)], "t2.fit", { lastModified: 2 }),
      new File([new Uint8Array(64)], "t3.fit", { lastModified: 3 }),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("batch-submit-btn")).toHaveTextContent(
        "Importar Lote (3 prontos)"
      );
    });

    await user.click(screen.getByTestId("batch-submit-btn"));

    // Fecha painel ao concluir sem falhas, exibe 1 único toast e recarrega os 3 treinos
    await waitFor(() => {
      expect(screen.queryByTestId("gpx-import-panel")).not.toBeInTheDocument();
    });

    expect(screen.getByTestId("toast-notification")).toHaveTextContent(
      /Lote importado: 3 novo\(s\) \(treino\(s\)\) • Google Sheets sincronizado!/i
    );
    expect(saveTrainingSpy).toHaveBeenCalledTimes(3);
    expect(saveTrainingSpy.mock.calls.every(([, , opts]) => opts?.skipSheetsSync === true)).toBe(true);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith({
      direction: "push",
      forceFullResync: false,
    });
    expect(store.trainings).toHaveLength(3);
    expect(screen.getByText("Lote Treino 1")).toBeInTheDocument();
    expect(screen.getByText("Lote Treino 3")).toBeInTheDocument();

    // Goal cache é preservado; caches de treinos/simulados são invalidados antes do reload
    expect(removeItemSpy).toHaveBeenCalledWith(CROSS_PAGE_SHEETS_CACHE_KEYS.trainings);
    expect(removeItemSpy).toHaveBeenCalledWith(CROSS_PAGE_SHEETS_CACHE_KEYS.tafAttempts);
    expect(removeItemSpy).toHaveBeenCalledWith(CROSS_PAGE_SHEETS_CACHE_KEYS.tafTrainings);
    expect(removeItemSpy).not.toHaveBeenCalledWith(CROSS_PAGE_SHEETS_CACHE_KEYS.tafGoal);
    expect(sessionStorage.getItem(CROSS_PAGE_SHEETS_CACHE_KEYS.tafGoal)).toBe("keep_goal");
  });

  it("mantém o painel aberto em /treinos quando o lote tem falha parcial e exibe toast de erro", async () => {
    window.history.replaceState({}, "", "/treinos");
    setupMockTafApi();

    const makeFitPreview = (id: string, title: string): ActivityParsePreview => ({
      source: "fit_upload",
      filesUsed: ["fit"],
      name: title,
      rawType: "running",
      sourceActivityKind: "run",
      isIndoor: false,
      externalId: id,
      startedAt: new Date().toISOString(),
      distanceKm: 6.0,
      durationSeconds: 1800,
      elapsedSeconds: 1800,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12.0,
      elevationGainM: 10,
      avgHeartRate: 150,
      maxHeartRate: 168,
      avgCadence: 174,
      activeCalories: 400,
      avgTemperatureC: null,
      pointCount: 1800,
      splits: [],
      laps: [],
      warnings: [],
      alreadyExists: false,
      existingTrainingId: null,
      alreadyExistsAttempt: false,
      existingAttemptId: null,
      tafWindow: null,
      suggestedActivityType: "corrida_continua",
      suggestedNotes: "",
      allowedActivityTypes: [...ACTIVITY_TYPES],
    });

    vi.spyOn(tafService, "parseActivity")
      .mockResolvedValueOnce(makeFitPreview("ext_ok_1", "Parcial Ok"))
      .mockRejectedValueOnce(new Error("FIT ilegível"));
    vi.spyOn(tafService, "getSheetsSyncStatus").mockResolvedValue({
      configured: false,
      pendingTrainingsCount: 0,
      pendingAttemptsCount: 0,
      totalPendingCount: 0,
    });

    const user = userEvent.setup({ applyAccept: false });
    render(<TreinosPage />);

    await screen.findByTestId("training-list");
    await user.click(screen.getByRole("button", { name: /Registrar Treino/i }));
    await user.click(await screen.findByTestId("mode-import-btn"));

    const input = screen.getByTestId("activity-file-input") as HTMLInputElement;
    await user.upload(input, [
      new File([new Uint8Array(64)], "ok.fit", { lastModified: 10 }),
      new File([new Uint8Array(64)], "quebrado.fit", { lastModified: 11 }),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("batch-submit-btn")).toHaveTextContent(
        "Importar Lote (1 pronto)"
      );
    });

    await user.click(screen.getByTestId("batch-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("toast-notification")).toHaveTextContent(
        /Lote concluído com 1 falha\(s\)/i
      );
    });

    // Painel continua aberto para retry e treino salvo já aparece na lista
    expect(screen.getByTestId("gpx-import-panel")).toBeInTheDocument();
    expect(screen.getByText("Parcial Ok")).toBeInTheDocument();
  });

  it("recarrega o WeeklyAdherenceCard automaticamente após registrar novo treino", async () => {
    const user = userEvent.setup();
    const { mockFetch } = setupMockTafApi({ trainings: [] });

    render(<TreinosPage />);

    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-card")).toBeInTheDocument();
    });

    const weeklyCallsBefore = mockFetch.mock.calls.filter(([input]) =>
      String(input).includes("/api/weekly-plan")
    ).length;
    expect(weeklyCallsBefore).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: /Registrar Treino/i }));
    await user.click(
      screen.getByRole("button", { name: /Registrar Treino no Diário/i })
    );

    await waitFor(() => {
      const weeklyCallsAfter = mockFetch.mock.calls.filter(([input]) =>
        String(input).includes("/api/weekly-plan")
      ).length;
      expect(weeklyCallsAfter).toBeGreaterThan(weeklyCallsBefore);
    });
  });

  it("abre o TrainingDetailModal automaticamente via ?trainingId= buscando GET /api/taf/trainings/{id} e limpa a query da URL", async () => {
    const deepLinkedTraining: TrainingSession = {
      ...mockTrainingSession,
      id: "trn-deep-link-99",
      notes: "Treino aberto via deep link Fase 5",
      distanceKm: 11.5,
      paceFormatted: "",
      paceSeconds: 0,
    };

    setupMockTafApi({ trainings: [deepLinkedTraining] });
    const prevUrl = window.location.href;
    window.history.replaceState({}, "", "/treinos?trainingId=trn-deep-link-99");

    try {
      render(<TreinosPage />);

      await waitFor(() => {
        const modal = screen.getByTestId("training-detail-modal");
        expect(
          within(modal).getByText("Treino aberto via deep link Fase 5")
        ).toBeInTheDocument();
        expect(within(modal).queryByText(/^\s*\/km$/)).not.toBeInTheDocument();
      });

      await waitFor(() => {
        expect(window.location.search).toBe("");
      });
    } finally {
      window.history.replaceState({}, "", prevUrl);
    }
  });

  it("exibe toast amigável quando ?trainingId= aponta para treino inexistente", async () => {
    setupMockTafApi({ trainings: [] });
    const prevUrl = window.location.href;
    window.history.replaceState({}, "", "/treinos?trainingId=nao-existe-999");

    try {
      render(<TreinosPage />);

      await waitFor(() => {
        expect(screen.getByTestId("toast-notification")).toHaveTextContent(
          /Treino selecionado não encontrado no diário/i
        );
      });
    } finally {
      window.history.replaceState({}, "", prevUrl);
    }
  });
});

