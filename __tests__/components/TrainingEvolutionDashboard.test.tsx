import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrainingEvolutionDashboard } from "@/components/treinos/TrainingEvolutionDashboard";
import { TrainingSession } from "@/types";

const mockTrainings: TrainingSession[] = [
  {
    id: "trn-1",
    sessionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 dias atrás
    activityType: "corrida_continua",
    distanceKm: 10.0,
    durationSeconds: 3000, // 50 min, pace 5:00
    speedKmh: 12.0,
    paceSeconds: 300,
    paceFormatted: "05:00",
    perceivedEffort: 5, // Moderado. Carga = 50 * 5 = 250
    splits: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trn-2",
    sessionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 dias atrás
    activityType: "corrida_intervalada",
    distanceKm: 6.0,
    durationSeconds: 1440, // 24 min, pace 4:00
    speedKmh: 15.0,
    paceSeconds: 240,
    paceFormatted: "04:00",
    perceivedEffort: 8, // Intenso. Carga = 24 * 8 = 192
    splits: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trn-3",
    sessionDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 dias atrás
    activityType: "caminhada",
    distanceKm: 4.0,
    durationSeconds: 2400, // 40 min, pace 10:00
    speedKmh: 6.0,
    paceSeconds: 600,
    paceFormatted: "10:00",
    perceivedEffort: 2, // Leve. Carga = 40 * 2 = 80
    splits: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("TrainingEvolutionDashboard (Fase 4 & 5 - Gráficos Analíticos)", () => {
  it("renderiza o estado vazio amigável quando a lista de treinos está vazia", () => {
    render(<TrainingEvolutionDashboard trainings={[]} />);

    expect(screen.getByTestId("training-evolution-dashboard")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhum treino registrado no período selecionado")
    ).toBeInTheDocument();

    // KPIs zerados
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("0 km");
    expect(screen.getByTestId("kpi-total-time")).toHaveTextContent("0 min");
    expect(screen.getByTestId("kpi-avg-pace")).toHaveTextContent("--:--");
    expect(screen.getByTestId("kpi-training-load")).toHaveTextContent("0 pts");
    expect(screen.getByTestId("kpi-longest-run")).toHaveTextContent("0 km");

    // Botões de filtro presentes
    expect(screen.getByRole("button", { name: "30 dias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "90 dias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ano Atual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tudo" })).toBeInTheDocument();
  });

  it("calcula e renderiza os KPIs agregados corretamente para múltiplos treinos", () => {
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    // Volume total = 10 + 6 + 4 = 20 km
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("20 km");
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("3 sessões");

    // Tempo total = 3000s + 1440s + 2400s = 6840s = 114 min = 1h 54m
    expect(screen.getByTestId("kpi-total-time")).toHaveTextContent("1h 54m");

    // Pace médio ponderado = 6840s / 20km = 342s = 5:42
    expect(screen.getByTestId("kpi-avg-pace")).toHaveTextContent("5:42");

    // Carga TRIMP total = 250 + 192 + 80 = 522 pts
    expect(screen.getByTestId("kpi-training-load")).toHaveTextContent("522 pts");

    // Maior sessão = 10 km
    expect(screen.getByTestId("kpi-longest-run")).toHaveTextContent("10 km");
  });

  it("renderiza os 5 containers de gráficos analíticos quando há dados", () => {
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    expect(screen.getByTestId("chart-weekly-volume")).toBeInTheDocument();
    expect(screen.getByTestId("chart-pace-evolution")).toBeInTheDocument();
    expect(screen.getByTestId("chart-training-load")).toBeInTheDocument();
    expect(screen.getByTestId("chart-rpe-distribution")).toBeInTheDocument();
    expect(screen.getByTestId("chart-activity-distribution")).toBeInTheDocument();

    // Verifica textos explicativos e regra 80/20
    expect(screen.getByText(/Volume Semanal Acumulado \(km\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Evolução do Pace por Sessão/i)).toBeInTheDocument();
    expect(screen.getByText(/Carga de Treinamento \(TRIMP\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Pirâmide de Intensidade \(RPE\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Regra 80\/20/i)).toBeInTheDocument();
    expect(screen.getByText(/Volume por Modalidade/i)).toBeInTheDocument();
  });

  it("exibe a distribuição de modalidades por tipo de locomoção", () => {
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    const activityCard = screen.getByTestId("chart-activity-distribution");

    // Corrida Contínua: 10 km (50%)
    expect(within(activityCard).getByText("Corrida Contínua")).toBeInTheDocument();
    expect(within(activityCard).getByText(/10 km/)).toBeInTheDocument();

    // Intervalado / Tiros: 6 km (30%)
    expect(within(activityCard).getByText("Intervalado / Tiros")).toBeInTheDocument();
    expect(within(activityCard).getByText(/6 km/)).toBeInTheDocument();

    // Caminhada: 4 km (20%)
    expect(within(activityCard).getByText("Caminhada")).toBeInTheDocument();
    expect(within(activityCard).getByText(/4 km/)).toBeInTheDocument();
  });

  it("permite alternar entre os filtros de período temporal", async () => {
    const user = userEvent.setup();
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    const filter30d = screen.getByRole("button", { name: "30 dias" });
    const filterAll = screen.getByRole("button", { name: "Tudo" });

    // Alterna para 30 dias
    await user.click(filter30d);
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("20 km");

    // Alterna para Tudo
    await user.click(filterAll);
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("20 km");
  });

  it("permite filtrar pelas últimas 2 sessões mais recentes e reordena cronologicamente", async () => {
    const user = userEvent.setup();
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    const filter2Sessions = screen.getByRole("button", { name: "2 sessões" });
    await user.click(filter2Sessions);

    // As 2 sessões mais recentes são 10km e 6km -> Volume total = 16 km, 2 sessões
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("16 km");
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("2 sessões");
  });

  it("permite filtrar pelas últimas 4 e 6 sessões mesmo com quantidade menor disponível", async () => {
    const user = userEvent.setup();
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    const filter4Sessions = screen.getByRole("button", { name: "4 sessões" });
    await user.click(filter4Sessions);

    // mockTrainings possui apenas 3 sessões -> exibe todas as 3 sessões (20 km) sem quebras
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("20 km");
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("3 sessões");

    const filter6Sessions = screen.getByRole("button", { name: "6 sessões" });
    await user.click(filter6Sessions);
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("20 km");
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("3 sessões");
  });

  it("permite abrir o painel de período personalizado e filtrar por intervalo de 2 datas", async () => {
    const user = userEvent.setup();
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    // Clica no botão Personalizado
    const filterCustom = screen.getByRole("button", { name: /Personalizado/i });
    await user.click(filterCustom);

    // Verifica que o painel de datas abriu
    expect(screen.getByTestId("filter-custom-date-panel")).toBeInTheDocument();
    const inputStartDate = screen.getByTestId("input-filter-start-date") as HTMLInputElement;
    const inputEndDate = screen.getByTestId("input-filter-end-date") as HTMLInputElement;

    // Calcula strings de data para filtrar apenas os últimos 6 dias (trn-1 e trn-2, excluindo trn-3 que tem 10 dias)
    const startDateStr = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDateStr = new Date(Date.now()).toISOString().split("T")[0];

    await user.type(inputStartDate, startDateStr);
    await user.type(inputEndDate, endDateStr);

    // Volume deve ser 10 + 6 = 16 km (2 sessões filtradas)
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("16 km");
    expect(screen.getByText(/2 sessões filtradas/i)).toBeInTheDocument();

    // Botão Limpar período deve estar visível e funcional
    const clearButton = screen.getByRole("button", { name: /Limpar período/i });
    await user.click(clearButton);

    expect(inputStartDate.value).toBe("");
    expect(inputEndDate.value).toBe("");
    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("20 km");
  });

  it("permite filtrar apenas com data inicial e exibe estado vazio se nenhuma sessão estiver no período", async () => {
    const user = userEvent.setup();
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    const filterCustom = screen.getByRole("button", { name: /Personalizado/i });
    await user.click(filterCustom);

    const inputStartDate = screen.getByTestId("input-filter-start-date") as HTMLInputElement;

    // Filtra apenas a partir de 3 dias atrás (apenas trn-1 que foi há 2 dias)
    const startDateStr = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    await user.type(inputStartDate, startDateStr);

    expect(screen.getByTestId("kpi-total-volume")).toHaveTextContent("10 km");
    expect(screen.getByText(/1 sessão filtrada/i)).toBeInTheDocument();

    // Filtra em uma data futura onde não há treinos
    const futureDateStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    await user.clear(inputStartDate);
    await user.type(inputStartDate, futureDateStr);

    expect(screen.getByText("Nenhum treino registrado no período selecionado")).toBeInTheDocument();
  });

  it("renderiza os botões de filtro por modalidade no gráfico de evolução do pace", () => {
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    const paceCard = screen.getByTestId("chart-pace-evolution");
    expect(within(paceCard).getByTestId("filter-pace-activity-all")).toBeInTheDocument();
    expect(within(paceCard).getByTestId("filter-pace-activity-corrida_continua")).toBeInTheDocument();
    expect(within(paceCard).getByTestId("filter-pace-activity-corrida_intervalada")).toBeInTheDocument();
    expect(within(paceCard).getByTestId("filter-pace-activity-caminhada")).toBeInTheDocument();

    // "Todas" ativo por padrão
    const btnAll = within(paceCard).getByTestId("filter-pace-activity-all");
    expect(btnAll).toHaveClass("bg-[#B7F34A]");
  });

  it("permite filtrar o gráfico de pace por modalidade e alternar entre corrida, intervalado e caminhada", async () => {
    const user = userEvent.setup();
    render(<TrainingEvolutionDashboard trainings={mockTrainings} />);

    const paceCard = screen.getByTestId("chart-pace-evolution");
    const btnCorrida = within(paceCard).getByTestId("filter-pace-activity-corrida_continua");
    const btnIntervalado = within(paceCard).getByTestId("filter-pace-activity-corrida_intervalada");
    const btnCaminhada = within(paceCard).getByTestId("filter-pace-activity-caminhada");
    const btnAll = within(paceCard).getByTestId("filter-pace-activity-all");

    // Seleciona Corrida Contínua
    await user.click(btnCorrida);
    expect(btnCorrida).toHaveClass("bg-[#B7F34A]");
    expect(btnAll).not.toHaveClass("bg-[#B7F34A]");

    // Seleciona Intervalado
    await user.click(btnIntervalado);
    expect(btnIntervalado).toHaveClass("bg-[#B7F34A]");
    expect(btnCorrida).not.toHaveClass("bg-[#B7F34A]");

    // Seleciona Caminhada
    await user.click(btnCaminhada);
    expect(btnCaminhada).toHaveClass("bg-[#B7F34A]");

    // Retorna para Todas
    await user.click(btnAll);
    expect(btnAll).toHaveClass("bg-[#B7F34A]");
    expect(btnCaminhada).not.toHaveClass("bg-[#B7F34A]");
  });

  it("exibe mensagem amigável no gráfico de pace quando a modalidade selecionada não possui treinos", async () => {
    const user = userEvent.setup();
    // Treinos apenas de corrida contínua
    const onlyRunning: TrainingSession[] = [
      {
        id: "trn-run",
        sessionDate: new Date().toISOString(),
        activityType: "corrida_continua",
        distanceKm: 5.0,
        durationSeconds: 1500,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "05:00",
        splits: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    render(<TrainingEvolutionDashboard trainings={onlyRunning} />);

    const paceCard = screen.getByTestId("chart-pace-evolution");
    const btnCaminhada = within(paceCard).getByTestId("filter-pace-activity-caminhada");

    // Filtra por Caminhada (que não existe nessa lista)
    await user.click(btnCaminhada);

    expect(within(paceCard).getByTestId("pace-chart-empty")).toBeInTheDocument();
    expect(within(paceCard).getByText(/Nenhum treino de Caminhada no período/i)).toBeInTheDocument();

    // Clica no link para voltar para "Todas"
    const btnResetAll = within(paceCard).getByTestId("button-reset-pace-filter");
    await user.click(btnResetAll);

    // Estado vazio some
    expect(within(paceCard).queryByTestId("pace-chart-empty")).not.toBeInTheDocument();
  });
});

