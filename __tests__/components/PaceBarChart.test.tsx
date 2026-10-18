import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaceBarChart, PaceChartDataPoint } from "@/components/charts/PaceBarChart";

describe("PaceBarChart Component", () => {
  it("renderiza mensagem de estado vazio quando não há dados", () => {
    render(<PaceBarChart data={[]} />);
    expect(screen.getByText("Nenhum dado para exibir no gráfico")).toBeInTheDocument();
  });

  it("renderiza o gráfico com dados de pace de parciais", () => {
    const mockData: PaceChartDataPoint[] = [
      { label: "Km 1", paceSeconds: 300, formatted: "5:00" },
      { label: "Km 2", paceSeconds: 285, formatted: "4:45" },
      { label: "Km 3", paceSeconds: 310, formatted: "5:10" },
    ];

    const { container } = render(<PaceBarChart data={mockData} />);
    expect(container.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });
});
