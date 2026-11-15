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
import { setupMockTafApi } from "@/test/helpers/mockTafApi";
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
    const errorFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Falha temporária"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: makePlanData(),
        }),
      } as Response);
    global.fetch = errorFetch as typeof fetch;

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
});
