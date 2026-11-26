/**
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import { WeeklyAdherenceCard } from "@/components/dashboard/WeeklyAdherenceCard";
import { getFortalezaWeekBounds, shiftFortalezaDays } from "@/lib/math/weeklyAdherence";
import { createMockJsonResponse, setupMockTafApi } from "@/__tests__/helpers/mockTafApi";
import type { TrainingSession, WeeklyPlanData } from "@/types";

function makeSession(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: "sess-1",
    source: "fit_upload",
    externalId: "fit-1",
    syncedToSheetsAt: null,
    sessionDate: "2026-10-12T09:00:00.000Z",
    activityType: "corrida_intervalada",
    distanceKm: 8.2,
    durationSeconds: 2220,
    elapsedSeconds: 2300,
    speedKmh: 13.3,
    paceSeconds: 271,
    paceFormatted: "4:31",
    avgHeartRate: 168,
    maxHeartRate: 184,
    elevationGainM: 42,
    avgCadence: 182,
    shoeName: "Vaporfly 3",
    perceivedEffort: 8,
    bodyWeightKg: 72.4,
    notes: "Treino forte na pista",
    splits: [],
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
    ...overrides,
  };
}

function makePlanData(overrides: Partial<WeeklyPlanData> = {}): WeeklyPlanData {
  const bounds = getFortalezaWeekBounds("2026-10-12");
  return {
    weekStart: bounds.weekStart,
    weekEnd: bounds.weekEnd,
    weekLabel: bounds.label,
    isCurrentWeek: true,
    hasNextPlannedWeek: false,
    items: [],
    summary: {
      totalPlanned: 0,
      completed: 0,
      adapted: 0,
      partial: 0,
      planned: 0,
      missed: 0,
      adherencePercent: null,
    },
    rollingFourWeeksAverage: {
      averagePercent: null,
      weeksCount: 0,
      weeks: [],
    },
    extraSessions: [],
    extraSummary: {
      count: 0,
      totalDistanceKm: 0,
    },
    ...overrides,
  };
}

describe("WeeklyAdherenceCard (Fase 5)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-14T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renderiza Estado 1 completo: aderência, barra de progresso, média móvel 4 semanas, badges semânticas, omissão de pace inválido e abertura do modal ao clicar no realizado/extra", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const matchedRun = makeSession({
      id: "sess-run-1",
      notes: "Treino forte na pista",
    });
    const matchedWalkNoPace = makeSession({
      id: "sess-walk-no-pace",
      activityType: "caminhada",
      distanceKm: 3.5,
      durationSeconds: 2100,
      speedKmh: 6,
      paceSeconds: 0,
      paceFormatted: "",
      notes: "Caminhada regenerativa sem pace",
    });
    const extraSession = makeSession({
      id: "sess-extra-1",
      sessionDate: "2026-10-16T11:00:00.000Z",
      activityType: "rodagem_leve",
      distanceKm: 5.0,
      durationSeconds: 1750,
      paceSeconds: 350,
      paceFormatted: "5:50",
      notes: "Rodagem extra de sexta",
    });

    const populatedWeek = makePlanData({
      items: [
        {
          id: "item-1",
          planExternalId: "p-1",
          plannedDate: "2026-10-12",
          dayOfWeek: "Segunda",
          activityType: "Intervalado",
          isRestDay: false,
          targetDistanceKm: 8,
          targetPaceFormatted: "4:30",
          description: "6x800m",
          status: "Concluído",
          matchedSessionId: matchedRun.id,
          matchedSession: matchedRun,
        },
        {
          id: "item-2",
          planExternalId: "p-2",
          plannedDate: "2026-10-13",
          dayOfWeek: "Terça",
          activityType: "Caminhada",
          isRestDay: false,
          targetDistanceKm: 4,
          targetPaceFormatted: null,
          description: "Solto sem meta de ritmo",
          status: "Parcial",
          matchedSessionId: matchedWalkNoPace.id,
          matchedSession: matchedWalkNoPace,
        },
        {
          id: "item-3",
          planExternalId: "p-3",
          plannedDate: "2026-10-14",
          dayOfWeek: "Quarta",
          activityType: "Corrida Contínua",
          isRestDay: false,
          targetDistanceKm: 6,
          targetPaceFormatted: "5:20",
          description: null,
          status: "Perdido",
          matchedSessionId: null,
          matchedSession: null,
        },
        {
          id: "item-4",
          planExternalId: "p-4",
          plannedDate: "2026-10-15",
          dayOfWeek: "Quinta",
          activityType: "Descanso",
          isRestDay: true,
          targetDistanceKm: null,
          targetPaceFormatted: null,
          description: "Dia off",
          status: "Concluído",
          matchedSessionId: null,
          matchedSession: null,
        },
        {
          id: "item-5",
          planExternalId: "p-5",
          plannedDate: "2026-10-17",
          dayOfWeek: "Sábado",
          activityType: "Longão",
          isRestDay: false,
          targetDistanceKm: 14,
          targetPaceFormatted: "5:45",
          description: "Ritmo confortável",
          status: "Planejado",
          matchedSessionId: null,
          matchedSession: null,
        },
      ],
      summary: {
        totalPlanned: 5,
        completed: 2,
        adapted: 0,
        partial: 1,
        planned: 1,
        missed: 1,
        adherencePercent: 60,
      },
      rollingFourWeeksAverage: {
        averagePercent: 40,
        weeksCount: 3,
        weeks: [],
      },
      extraSessions: [extraSession],
      extraSummary: {
        count: 1,
        totalDistanceKm: 5,
      },
    });

    setupMockTafApi({
      weeklyPlan: populatedWeek,
    });

    render(<WeeklyAdherenceCard />);

    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-populated")).toBeInTheDocument();
    });

    // Percentual e média móvel de 4 semanas
    expect(screen.getByTestId("weekly-adherence-percent")).toHaveTextContent("60%");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByTestId("weekly-rolling-average")).toHaveTextContent(
      "Média 3 sem: 40%"
    );
    expect(screen.getByTestId("weekly-rolling-average")).toHaveTextContent(
      "+20% vs. média"
    );

    // Todas as 4 badges semânticas visíveis e dia de descanso cumprido
    expect(screen.getAllByText("Concluído").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Parcial")).toBeInTheDocument();
    expect(screen.getByText("Perdido")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("weekly-plan-item-item-5")).getAllByText("Planejado")
        .length
    ).toBe(2);
    expect(screen.getByText("Descanso cumprido")).toBeInTheDocument();

    // Omissão segura de pace quando inválido/0 (não exibe "0:00 /km" nem "undefined /km")
    expect(screen.getByText("3.50 km")).toBeInTheDocument();
    expect(screen.queryByText(/0:00 \/km/i)).not.toBeInTheDocument();

    // Clicar no realizado abre TrainingDetailModal interno
    await user.click(
      screen.getByRole("button", {
        name: /Abrir detalhes do treino realizado de Segunda/i,
      })
    );

    await waitFor(() => {
      const modal = screen.getByTestId("training-detail-modal");
      expect(within(modal).getByText("Treino forte na pista")).toBeInTheDocument();
    });

    // Fecha modal pelo botão Fechar
    await user.click(screen.getByTestId("training-detail-close-btn"));
    await waitFor(() => {
      expect(screen.queryByTestId("training-detail-modal")).not.toBeInTheDocument();
    });

    // Clicar na sessão extra do rodapé também abre o modal
    expect(screen.getByTestId("weekly-extra-sessions")).toHaveTextContent(
      "1 sessão · 5.00 km"
    );
    await user.click(
      screen.getByRole("button", { name: /Abrir detalhes do treino extra de/i })
    );
    await waitFor(() => {
      const modal = screen.getByTestId("training-detail-modal");
      expect(within(modal).getByText("Rodagem extra de sexta")).toBeInTheDocument();
    });
  });

  it("renderiza Estado 2 (sem plano) sem NaN% e sem barra vermelha 0%, com textos exatos e extras opcionais", async () => {
    const onOpenSession = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const extraRun = makeSession({
      id: "sess-empty-extra",
      sessionDate: "2026-10-13T10:00:00.000Z",
      distanceKm: 6.2,
    });

    setupMockTafApi({
      trainings: [extraRun],
    });

    render(<WeeklyAdherenceCard onOpenSession={onOpenSession} />);

    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-empty")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Nenhum plano semanal registrado para este período")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Peça ao seu Treinador IA no Gemini para prescrever a semana na aba Plano_Semanal e clique em Sincronizar Planilha."
      )
    ).toBeInTheDocument();

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument();

    // Sessão avulsa clicável aciona callback onOpenSession quando fornecido
    await user.click(
      screen.getByRole("button", { name: /Abrir detalhes do treino extra/i })
    );
    expect(onOpenSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sess-empty-extra" })
    );
  });

  it("permite navegar entre semanas (< Semana Anterior, Próxima >, Semana Atual) respeitando o limite futuro", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const currentWeekStart = getFortalezaWeekBounds("2026-10-12").weekStart;
    const prevWeekStart = shiftFortalezaDays(currentWeekStart, -7);
    const nextWeekStart = shiftFortalezaDays(currentWeekStart, 7);
    const twoWeeksAhead = shiftFortalezaDays(currentWeekStart, 14);

    setupMockTafApi({
      weeklyPlan: (weekStart) => {
        const bounds = getFortalezaWeekBounds(weekStart);
        if (weekStart === prevWeekStart) {
          return makePlanData({
            weekStart: bounds.weekStart,
            weekEnd: bounds.weekEnd,
            weekLabel: bounds.label,
            isCurrentWeek: false,
            hasNextPlannedWeek: true,
          });
        }
        if (weekStart === nextWeekStart) {
          return makePlanData({
            weekStart: bounds.weekStart,
            weekEnd: bounds.weekEnd,
            weekLabel: bounds.label,
            isCurrentWeek: false,
            hasNextPlannedWeek: true,
          });
        }
        if (weekStart === twoWeeksAhead) {
          return makePlanData({
            weekStart: bounds.weekStart,
            weekEnd: bounds.weekEnd,
            weekLabel: bounds.label,
            isCurrentWeek: false,
            hasNextPlannedWeek: false,
          });
        }
        return makePlanData({
          weekStart: bounds.weekStart,
          weekEnd: bounds.weekEnd,
          weekLabel: bounds.label,
          isCurrentWeek: true,
          hasNextPlannedWeek: false,
        });
      },
    });

    render(<WeeklyAdherenceCard />);

    await waitFor(() => {
      expect(screen.getByText(/Semana Atual \(12\/10 – 18\/10\)/)).toBeInTheDocument();
    });

    // Não mostra botão rápido Semana Atual quando já está nela
    expect(screen.queryByTestId("weekly-current-btn")).not.toBeInTheDocument();

    // Vai para semana anterior
    await user.click(screen.getByTestId("weekly-prev-btn"));
    await waitFor(() => {
      expect(screen.getByText(/Semana \(05\/10 – 11\/10\)/)).toBeInTheDocument();
    });
    expect(screen.getByTestId("weekly-current-btn")).toBeInTheDocument();

    // Volta via botão rápido "Semana Atual"
    await user.click(screen.getByTestId("weekly-current-btn"));
    await waitFor(() => {
      expect(screen.getByText(/Semana Atual \(12\/10 – 18\/10\)/)).toBeInTheDocument();
    });

    // Próxima semana (+7d) fica habilitada até 1 semana à frente e depois respeita hasNextPlannedWeek
    await user.click(screen.getByTestId("weekly-next-btn"));
    await waitFor(() => {
      expect(screen.getByText(/Semana \(19\/10 – 25\/10\)/)).toBeInTheDocument();
    });

    // Como +7d retornou hasNextPlannedWeek=true, permite avançar para +14d
    expect(screen.getByTestId("weekly-next-btn")).not.toBeDisabled();
    await user.click(screen.getByTestId("weekly-next-btn"));
    await waitFor(() => {
      expect(screen.getByText(/Semana \(26\/10 – 01\/11\)/)).toBeInTheDocument();
    });

    // Agora beyond +7d e hasNextPlannedWeek=false => botão Próxima desabilitado
    expect(screen.getByTestId("weekly-next-btn")).toBeDisabled();
  });

  it("recarrega automaticamente quando refreshTrigger incrementa e exibe fallback amigável em erro de rede", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { mockFetch } = setupMockTafApi({
      weeklyPlan: makePlanData({
        summary: {
          totalPlanned: 1,
          completed: 0,
          adapted: 0,
          partial: 0,
          planned: 1,
          missed: 0,
          adherencePercent: 0,
        },
        items: [
          {
            id: "item-trig-1",
            planExternalId: "p-trig-1",
            plannedDate: "2026-10-14",
            dayOfWeek: "Quarta",
            activityType: "Rodagem Leve",
            isRestDay: false,
            targetDistanceKm: 6,
            targetPaceFormatted: "5:45",
            description: null,
            status: "Planejado",
            matchedSessionId: null,
            matchedSession: null,
          },
        ],
      }),
    });

    const { rerender, unmount } = render(<WeeklyAdherenceCard refreshTrigger={0} />);

    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-percent")).toHaveTextContent("0%");
    });

    const callsBefore = mockFetch.mock.calls.filter(([input]) =>
      String(input).includes("/api/weekly-plan")
    ).length;

    rerender(<WeeklyAdherenceCard refreshTrigger={1} />);

    await waitFor(() => {
      const callsAfter = mockFetch.mock.calls.filter(([input]) =>
        String(input).includes("/api/weekly-plan")
      ).length;
      expect(callsAfter).toBe(callsBefore + 1);
    });

    unmount();

    // Erro de API quando sem dados em memória exibe botão Tentar novamente e recupera
    sessionStorage.clear();
    mockFetch
      .mockRejectedValueOnce(new Error("Falha temporária"))
      .mockResolvedValueOnce(
        createMockJsonResponse({ success: true, data: makePlanData() })
      );

    render(<WeeklyAdherenceCard refreshTrigger={0} />);

    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-error")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-empty")).toBeInTheDocument();
    });
  });

  it("não vaza dados da semana anterior em tela se o carregamento da nova semana falhar e omite targetPaceFormatted placeholder", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const currentWeekData = makePlanData({
      summary: {
        totalPlanned: 1,
        completed: 1,
        adapted: 0,
        partial: 0,
        planned: 0,
        missed: 0,
        adherencePercent: 100,
      },
      items: [
        {
          id: "item-leak-check",
          planExternalId: "p-leak",
          plannedDate: "2026-10-14",
          dayOfWeek: "Quarta",
          activityType: "Rodagem Leve",
          isRestDay: false,
          targetDistanceKm: 7,
          targetPaceFormatted: "-",
          description: "Treino da semana atual",
          status: "Concluído",
          matchedSessionId: null,
          matchedSession: null,
        },
      ],
    });

    const prevWeekStart = getFortalezaWeekBounds("2026-10-05").weekStart;
    const prevWeekData = makePlanData({
      weekStart: prevWeekStart,
      weekEnd: getFortalezaWeekBounds("2026-10-05").weekEnd,
      weekLabel: getFortalezaWeekBounds("2026-10-05").label,
      isCurrentWeek: false,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: currentWeekData }),
      } as Response)
      .mockRejectedValueOnce(new Error("Erro ao buscar semana anterior"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: prevWeekData }),
      } as Response);

    global.fetch = fetchMock as typeof fetch;

    render(<WeeklyAdherenceCard />);

    await waitFor(() => {
      expect(screen.getByText("Treino da semana atual")).toBeInTheDocument();
    });

    // Placeholders inválidos no targetPaceFormatted não devem aparecer
    expect(screen.queryByText(/Alvo: -/i)).not.toBeInTheDocument();

    // Clica em Semana Anterior quando a API falha -> NÃO deve manter "Treino da semana atual" visível
    await user.click(screen.getByTestId("weekly-prev-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-error")).toBeInTheDocument();
    });
    expect(screen.queryByText("Treino da semana atual")).not.toBeInTheDocument();
    expect(screen.getByText(/Semana \(05\/10 – 11\/10\)/)).toBeInTheDocument();

    // Retry carrega corretamente a semana anterior vazia
    await user.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-empty")).toBeInTheDocument();
    });
  });

  it("ignora respostas fora de ordem quando usuário alterna rapidamente entre semanas", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const currentWeekData = makePlanData({
      summary: {
        totalPlanned: 1,
        completed: 1,
        adapted: 0,
        partial: 0,
        planned: 0,
        missed: 0,
        adherencePercent: 100,
      },
      items: [
        {
          id: "item-race-current",
          planExternalId: "p-race-cur",
          plannedDate: "2026-10-14",
          dayOfWeek: "Quarta",
          activityType: "Rodagem Leve",
          isRestDay: false,
          targetDistanceKm: 6,
          targetPaceFormatted: "5:45",
          description: "Treino Atual Fiel",
          status: "Concluído",
          matchedSessionId: null,
          matchedSession: null,
        },
      ],
    });

    const prevWeekBounds = getFortalezaWeekBounds("2026-10-05");
    const stalePrevWeekData = makePlanData({
      weekStart: prevWeekBounds.weekStart,
      weekEnd: prevWeekBounds.weekEnd,
      weekLabel: prevWeekBounds.label,
      isCurrentWeek: false,
      items: [
        {
          id: "item-race-stale",
          planExternalId: "p-race-stale",
          plannedDate: "2026-10-06",
          dayOfWeek: "Terça",
          activityType: "Tempo Run",
          isRestDay: false,
          targetDistanceKm: 9,
          targetPaceFormatted: "4:40",
          description: "Treino Antigo Atrasado",
          status: "Perdido",
          matchedSessionId: null,
          matchedSession: null,
        },
      ],
      summary: {
        totalPlanned: 1,
        completed: 0,
        adapted: 0,
        partial: 0,
        planned: 0,
        missed: 1,
        adherencePercent: 0,
      },
    });

    let resolveStalePrev!: (value: Response) => void;
    const stalePrevPromise = new Promise<Response>((resolve) => {
      resolveStalePrev = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: currentWeekData }),
      } as Response)
      .mockImplementationOnce(() => stalePrevPromise)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: currentWeekData }),
      } as Response);

    global.fetch = fetchMock as typeof fetch;

    render(<WeeklyAdherenceCard />);
    await waitFor(() => {
      expect(screen.getByText("Treino Atual Fiel")).toBeInTheDocument();
    });

    // Vai para a semana anterior (requisição lenta pendente) e volta imediatamente para Semana Atual
    await user.click(screen.getByTestId("weekly-prev-btn"));
    await user.click(screen.getByTestId("weekly-current-btn"));

    await waitFor(() => {
      expect(screen.getByText("Treino Atual Fiel")).toBeInTheDocument();
    });

    // Resposta obsoleta da semana anterior chega atrasada e NÃO pode sobrescrever a semana atual
    resolveStalePrev({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: stalePrevWeekData }),
    } as Response);

    await waitFor(() => {
      expect(screen.getByText("Treino Atual Fiel")).toBeInTheDocument();
    });
    expect(screen.queryByText("Treino Antigo Atrasado")).not.toBeInTheDocument();
  });

  it("renderiza badge Adaptado (índigo), motivo do desvio, rótulo humanizado da atividade, contador no resumo e botão Sincronizar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const adaptedSession = makeSession({
      id: "sess-adapted-1",
      activityType: "rodagem_leve",
      distanceKm: 11.2,
      paceSeconds: 310,
      paceFormatted: "5:10",
    });

    const adaptedWeek = makePlanData({
      items: [
        {
          id: "item-adapted-1",
          planExternalId: "PLAN-2026-10-12-1",
          plannedDate: "2026-10-12",
          dayOfWeek: "Segunda",
          activityType: "rodagem_leve",
          isRestDay: false,
          targetDistanceKm: 8,
          targetPaceFormatted: "5:45-6:00",
          description: "Rodagem Z2",
          status: "Adaptado",
          adaptationReason: "Volume acima do planejado · Ritmo mais forte que o alvo",
          adaptationReasons: [
            "Volume acima do planejado",
            "Ritmo mais forte que o alvo",
          ],
          matchedSessionId: "sess-adapted-1",
          matchedSession: adaptedSession,
        },
      ],
      summary: {
        totalPlanned: 1,
        completed: 0,
        adapted: 1,
        partial: 0,
        planned: 0,
        missed: 0,
        adherencePercent: 75,
      },
    });

    const { setRequestHandler } = setupMockTafApi({
      weeklyPlan: adaptedWeek,
    });
    setRequestHandler(async (url, init, defaultHandler) => {
      if (url.includes("/api/sync/sheets") && init?.method === "POST") {
        return createMockJsonResponse({
          success: true,
          data: {
            direction: "bidirectional",
            forceFullResync: false,
            pulledUpdated: 0,
            pulledCreated: 0,
            pulledLinked: 0,
            pushedAppended: 0,
            pushedUpdated: 0,
            tafPulledUpdated: 0,
            tafPulledCreated: 0,
            tafPulledLinked: 0,
            tafPushedAppended: 0,
            tafPushedUpdated: 0,
            profileSynced: false,
            weeklyPlan: {
              imported: 1,
              updated: 0,
              removed: 0,
              matched: 1,
              adapted: 1,
              missed: 0,
              pushed: 1,
              sheetMissingOrEmpty: false,
            },
            skipped: 0,
            warnings: [
              {
                tab: "Plano_Semanal",
                rowNumber: 4,
                message: "Linha 4 (Plano_Semanal): Data inválida",
              },
            ],
            durationMs: 120,
            syncedAt: "2026-10-14T12:00:00.000Z",
          },
        });
      }
      return defaultHandler();
    });

    render(<WeeklyAdherenceCard />);

    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-populated")).toBeInTheDocument();
    });

    const itemRow = screen.getByTestId("weekly-plan-item-item-adapted-1");
    // Rótulo humanizado ("Rodagem Leve") em vez de "rodagem_leve" cru
    expect(within(itemRow).getAllByText("Rodagem Leve").length).toBeGreaterThanOrEqual(1);
    expect(within(itemRow).queryByText("rodagem_leve")).not.toBeInTheDocument();

    // Badge Adaptado com estilização índigo e indicador do motivo do desvio
    const badge = within(itemRow).getByText("Adaptado");
    expect(badge).toHaveClass("bg-indigo-950/60", "text-indigo-300");
    expect(
      screen.getByTestId("weekly-plan-adaptation-reason-item-adapted-1")
    ).toHaveTextContent("Volume acima do planejado · Ritmo mais forte que o alvo");

    // Resumo inclui contagem de adaptados e 75%
    expect(screen.getByTestId("weekly-adherence-percent")).toHaveTextContent("75%");
    expect(screen.getByText(/1 adaptado/i)).toBeInTheDocument();

    // Botão Sincronizar autônomo dispara POST /api/sync/sheets e exibe aviso acionável
    await user.click(screen.getByTestId("weekly-sync-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("weekly-sync-feedback")).toHaveTextContent(
        "Linha 4 (Plano_Semanal): Data inválida"
      );
    });
  });

  it("exibe automaticamente a próxima semana na virada dominical >= 22h BRT mantendo navegação à semana anterior", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Domingo 18/10/2026 22:15 BRT === 19/10/2026 01:15Z
    vi.setSystemTime(new Date("2026-10-19T01:15:00.000Z"));

    const nextWeekBounds = getFortalezaWeekBounds("2026-10-19");
    const closedWeekBounds = getFortalezaWeekBounds("2026-10-12");

    const nextWeekPayload = makePlanData({
      weekStart: nextWeekBounds.weekStart,
      weekEnd: nextWeekBounds.weekEnd,
      weekLabel: nextWeekBounds.label,
      isCurrentWeek: true,
      isSundayRolloverWindow: true,
      hasNextPlannedWeek: false,
      items: [
        {
          id: "item-new-week",
          planExternalId: "PLAN-2026-10-19-1",
          plannedDate: "2026-10-19",
          dayOfWeek: "Segunda",
          activityType: "tempo_run",
          isRestDay: false,
          targetDistanceKm: 8,
          targetPaceFormatted: "4:55",
          description: "Treino da nova semana",
          status: "Planejado",
          matchedSessionId: null,
          matchedSession: null,
        },
      ],
      summary: {
        totalPlanned: 1,
        completed: 0,
        adapted: 0,
        partial: 0,
        planned: 1,
        missed: 0,
        adherencePercent: 0,
      },
    });

    const closedWeekPayload = makePlanData({
      weekStart: closedWeekBounds.weekStart,
      weekEnd: closedWeekBounds.weekEnd,
      weekLabel: closedWeekBounds.label,
      isCurrentWeek: false,
      isSundayRolloverWindow: true,
      hasNextPlannedWeek: true,
    });

    const { setRequestHandler } = setupMockTafApi();
    setRequestHandler(async (url, _init, defaultHandler) => {
      if (url.includes("/api/weekly-plan")) {
        const parsed = new URL(url, "http://localhost");
        const ws = parsed.searchParams.get("weekStart");
        if (!ws || ws === "2026-10-19") {
          return createMockJsonResponse({ success: true, data: nextWeekPayload });
        }
        if (ws === "2026-10-12") {
          return createMockJsonResponse({ success: true, data: closedWeekPayload });
        }
      }
      return defaultHandler();
    });

    render(<WeeklyAdherenceCard />);

    await waitFor(() => {
      expect(screen.getByText("Treino da nova semana")).toBeInTheDocument();
    });
    expect(screen.getByText(/Semana Atual \(19\/10 – 25\/10\)/)).toBeInTheDocument();
    expect(screen.getByText("Tempo Run / Ritmo")).toBeInTheDocument();

    // 1 clique em Semana Anterior abre a semana encerrada (12/10 – 18/10)
    await user.click(screen.getByTestId("weekly-prev-btn"));
    await waitFor(() => {
      expect(screen.getByText(/Semana \(12\/10 – 18\/10\)/)).toBeInTheDocument();
    });
  });

  it("delega onSyncSheets quando fornecido, trata erro no sync autônomo e recarrega ao cruzar virada dominical no foco da aba", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSyncSheets = vi.fn();

    // Cache legado sem summary.adapted deve ser ignorado com segurança
    sessionStorage.setItem(
      "pacelab_cache_weekly_plan",
      JSON.stringify({
        weekStart: "2026-10-12",
        items: [],
        summary: { totalPlanned: 0, completed: 0, partial: 0, planned: 0, missed: 0, adherencePercent: null },
      })
    );

    // 1) Com onSyncSheets fornecido pelo pai: clicar no botão delega sem chamar /api/sync/sheets
    const { setRequestHandler } = setupMockTafApi({
      weeklyPlan: makePlanData(),
    });
    const { unmount } = render(<WeeklyAdherenceCard onSyncSheets={onSyncSheets} />);
    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-empty")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("weekly-sync-btn"));
    expect(onSyncSheets).toHaveBeenCalledTimes(1);
    unmount();

    // 2) Modo autônomo com erro no sync exibe banner de erro fechável + recarga ao focar aba após 22h de domingo
    vi.setSystemTime(new Date("2026-10-19T00:55:00.000Z")); // Dom 18/10 21:55 BRT
    let weeklyCalls = 0;
    setRequestHandler(async (url, init, defaultHandler) => {
      if (url.includes("/api/sync/sheets") && init?.method === "POST") {
        return createMockJsonResponse(
          { success: false, error: "Integração não configurada", code: "SHEETS_NOT_CONFIGURED" },
          503
        );
      }
      if (url.includes("/api/weekly-plan")) {
        weeklyCalls += 1;
        return createMockJsonResponse({ success: true, data: makePlanData() });
      }
      return defaultHandler();
    });

    render(<WeeklyAdherenceCard />);
    await waitFor(() => {
      expect(screen.getByTestId("weekly-adherence-empty")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("weekly-sync-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("weekly-sync-feedback")).toHaveTextContent(
        /não configurada/i
      );
    });
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByTestId("weekly-sync-feedback")).not.toBeInTheDocument();

    const callsBeforeRollover = weeklyCalls;
    // Avança para domingo 22:05 BRT e dispara focus da aba
    vi.setSystemTime(new Date("2026-10-19T01:05:00.000Z"));
    window.dispatchEvent(new Event("focus"));

    await waitFor(() => {
      expect(weeklyCalls).toBeGreaterThan(callsBeforeRollover);
    });
  });
});
