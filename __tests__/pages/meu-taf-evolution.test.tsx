import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MeuTafPage from "@/app/meu-taf/page";
import { tafService } from "@/lib/services/tafService";

describe("MeuTafPage - Fase E (Painel de Evolução & 5 Gráficos Recharts)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    global.fetch = vi.fn().mockRejectedValue(new Error("Offline Mode"));
  });

  it("navega para a aba Gráficos de Evolução e exibe os 4 KPIs e containers dos 5 gráficos em estado vazio", async () => {
    const user = userEvent.setup();
    render(<MeuTafPage />);

    // Clica na aba Gráficos de Evolução
    const tabGraficos = await screen.findByRole("button", { name: /Gráficos de Evolução/i });
    await user.click(tabGraficos);

    // Dashboard presente
    expect(screen.getByTestId("evolution-dashboard")).toBeInTheDocument();

    // Containers dos 5 gráficos presentes
    expect(screen.getByTestId("chart-a-container")).toBeInTheDocument();
    expect(screen.getByTestId("chart-b-container")).toBeInTheDocument();
    expect(screen.getByTestId("chart-c-container")).toBeInTheDocument();
    expect(screen.getByTestId("chart-d-container")).toBeInTheDocument();
    expect(screen.getByTestId("chart-e-container")).toBeInTheDocument();

    // Empty states exibidos amigavelmente
    expect(
      screen.getByText("Nenhum simulado de 12 minutos registrado")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum treino registrado no diário")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sem dados suficientes de pace")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sem volume semanal acumulado")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Necessário ao menos 2 simulados de 12 minutos")
    ).toBeInTheDocument();

    // Aviso da regra do pace presente
    expect(screen.getByText(/Regra do Pace:/i)).toBeInTheDocument();
  });

  it("renderiza KPIs com valores calculados quando há simulados e treinos registrados", async () => {
    const user = userEvent.setup();

    // Simulado 1: 2.200m
    await tafService.saveAttempt({
      id: "taf-evo-1",
      testDate: "2026-10-01T08:00:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2200,
      speedKmh: 11.0,
      paceSeconds: 327,
      paceFormatted: "5:27",
      createdAt: "2026-10-01T08:00:00.000Z",
      updatedAt: "2026-10-01T08:00:00.000Z",
    });

    // Simulado 2 (Novo Recorde): 2.350m (superando a meta de 2300m)
    await tafService.saveAttempt({
      id: "taf-evo-2",
      testDate: "2026-10-08T08:00:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2350,
      speedKmh: 11.75,
      paceSeconds: 306,
      paceFormatted: "5:06",
      createdAt: "2026-10-08T08:00:00.000Z",
      updatedAt: "2026-10-08T08:00:00.000Z",
    });

    // Treino 1: Corrida Contínua 6 km
    await tafService.saveTraining({
      id: "trn-evo-1",
      sessionDate: "2026-10-05T07:00:00.000Z",
      activityType: "corrida_continua",
      distanceKm: 6.0,
      durationSeconds: 1800,
      speedKmh: 12.0,
      paceSeconds: 300,
      paceFormatted: "5:00",
      createdAt: "2026-10-05T07:00:00.000Z",
      updatedAt: "2026-10-05T07:00:00.000Z",
    });

    // Treino 2: Intervalado 4 km
    await tafService.saveTraining({
      id: "trn-evo-2",
      sessionDate: "2026-10-07T07:00:00.000Z",
      activityType: "corrida_intervalada",
      distanceKm: 4.0,
      durationSeconds: 1120,
      speedKmh: 12.86,
      paceSeconds: 280,
      paceFormatted: "4:40",
      createdAt: "2026-10-07T07:00:00.000Z",
      updatedAt: "2026-10-07T07:00:00.000Z",
    });

    render(<MeuTafPage />);

    // Clica na aba Gráficos de Evolução
    const tabGraficos = await screen.findByRole("button", { name: /Gráficos de Evolução/i });
    await user.click(tabGraficos);

    const dashboard = await screen.findByTestId("evolution-dashboard");

    // KPI 1: Recorde Pessoal 12 Min
    expect(within(dashboard).getByText("2.350 m")).toBeInTheDocument();
    expect(within(dashboard).getByText(/Pace 5:06\/km/i)).toBeInTheDocument();
    expect(within(dashboard).getByText(/11.8 km\/h/i)).toBeInTheDocument();

    // KPI 2: Meta e Status
    expect(within(dashboard).getByText("Aprovado! 🎉")).toBeInTheDocument();
    expect(within(dashboard).getByText(/100% alcançado/i)).toBeInTheDocument();

    // KPI 4: Total de Atividades (2 simulados + 2 treinos = 4)
    expect(within(dashboard).getByText("4")).toBeInTheDocument();
    expect(
      within(dashboard).getByText("2 simulados TAF • 2 treinos no diário")
    ).toBeInTheDocument();

    // Gráficos A, B, C, D e E com dados populados (empty states desaparecem)
    const chartA = within(dashboard).getByTestId("chart-a-container");
    expect(
      within(chartA).queryByText("Nenhum simulado de 12 minutos registrado")
    ).not.toBeInTheDocument();

    const chartB = within(dashboard).getByTestId("chart-b-container");
    expect(
      within(chartB).queryByText("Nenhum treino registrado no diário")
    ).not.toBeInTheDocument();

    const chartC = within(dashboard).getByTestId("chart-c-container");
    expect(
      within(chartC).queryByText("Sem dados suficientes de pace")
    ).not.toBeInTheDocument();

    const chartE = within(dashboard).getByTestId("chart-e-container");
    expect(
      within(chartE).queryByText("Necessário ao menos 2 simulados de 12 minutos")
    ).not.toBeInTheDocument();
  });
});
