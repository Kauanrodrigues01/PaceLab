import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

    // Corrida Contínua: 10 km (50%)
    expect(screen.getByText("Corrida Contínua")).toBeInTheDocument();
    expect(screen.getByText(/10 km/)).toBeInTheDocument();

    // Intervalado / Tiros: 6 km (30%)
    expect(screen.getByText("Intervalado / Tiros")).toBeInTheDocument();
    expect(screen.getByText(/6 km/)).toBeInTheDocument();

    // Caminhada: 4 km (20%)
    expect(screen.getByText("Caminhada")).toBeInTheDocument();
    expect(screen.getByText(/4 km/)).toBeInTheDocument();
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
});
