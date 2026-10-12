import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaceSpeedTable } from "@/components/calculadora/PaceSpeedTable";

describe("PaceSpeedTable Component", () => {
  it("renderiza o cabeçalho e todas as linhas de referência de pace e velocidade", () => {
    render(<PaceSpeedTable />);

    expect(screen.getByText("Tabela de Correspondência Pace ↔ Velocidade")).toBeInTheDocument();
    expect(screen.getByText("Pace (min/km)")).toBeInTheDocument();
    expect(screen.getByText("Velocidade (km/h)")).toBeInTheDocument();
    expect(screen.getByText("Volta 400m (Pista)")).toBeInTheDocument();

    // Verifica que contém linhas chave da tabela
    expect(screen.getAllByText("3:00")[0]).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("5:13")).toBeInTheDocument();
    expect(screen.getByText("8:00")).toBeInTheDocument();
  });

  it("destaca metas oficiais do TAF com badge específico", () => {
    render(<PaceSpeedTable />);

    expect(screen.getByText("Meta TAF (2.400m)")).toBeInTheDocument();
    expect(screen.getByText("Meta TAF (2.300m)")).toBeInTheDocument();
  });

  it("chama onSelectPace ao clicar em uma linha da tabela", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();

    render(<PaceSpeedTable onSelectPace={handleSelect} />);

    const row5m = screen.getByTestId("pace-row-5-00");
    await user.click(row5m);

    expect(handleSelect).toHaveBeenCalledWith("5:00", 12.0);
  });

  it("destaca visualmente a linha correspondente ao pace atual fornecido", () => {
    render(<PaceSpeedTable currentPaceSeconds={300} />); // 300s = 5:00

    const row = screen.getByTestId("pace-row-5-00");
    expect(row).toHaveClass("bg-blue-50");
  });
});
