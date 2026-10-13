import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MetasPage from "@/app/metas/page";

describe("MetasPage (Fase 6)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });
  });

  it("renderiza com valores padrão de 5 km a 5:00 e gera parciais corretas", () => {
    render(<MetasPage />);

    expect(
      screen.getByRole("heading", { name: "Calculadora de Metas e Parciais (Splits)" })
    ).toBeInTheDocument();

    // 5 km a 5:00 -> tempo total 25:00 e 12.00 km/h
    expect(screen.getAllByText("25:00")[0]).toBeInTheDocument();
    expect(screen.getAllByText("5:00")[0]).toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();

    // Planilha de Splits
    expect(screen.getByText("Split 1")).toBeInTheDocument();
    expect(screen.getByText(/Chegada \(#5\)/i)).toBeInTheDocument();
  });

  it("calcula nova meta por pace (10 km a 4:30 -> 45:00)", async () => {
    const user = userEvent.setup();
    render(<MetasPage />);

    const distInput = screen.getByLabelText("Distância da Prova");
    await user.clear(distInput);
    await user.type(distInput, "10");

    const paceInput = screen.getByLabelText("Pace Alvo (Ritmo por Km)");
    await user.clear(paceInput);
    await user.type(paceInput, "4:30");

    const calcBtn = screen.getByRole("button", { name: "Gerar Planilha de Splits" });
    await user.click(calcBtn);

    expect(screen.getAllByText("45:00")[0]).toBeInTheDocument();
    expect(screen.getAllByText("4:30")[0]).toBeInTheDocument();
  });

  it("suporta digitar inteiros como '6' sem colocar '6:00' no campo de pace", async () => {
    const user = userEvent.setup();
    render(<MetasPage />);

    const distInput = screen.getByLabelText("Distância da Prova");
    await user.clear(distInput);
    await user.type(distInput, "10");

    const paceInput = screen.getByLabelText("Pace Alvo (Ritmo por Km)");
    await user.clear(paceInput);
    await user.type(paceInput, "6"); // Apenas número 6

    const calcBtn = screen.getByRole("button", { name: "Gerar Planilha de Splits" });
    await user.click(calcBtn);

    // 10 km a 6 min/km = 1:00:00 (ou 60:00)
    expect(screen.getAllByText("1:00:00")[0]).toBeInTheDocument();
    expect(screen.getAllByText("6:00")[0]).toBeInTheDocument();
    expect(screen.getByText("10.00")).toBeInTheDocument();
  });

  it("alterna para o modo Definir por Tempo-Alvo (10 km em 50:00 -> pace 5:00)", async () => {
    const user = userEvent.setup();
    render(<MetasPage />);

    const tabTime = screen.getByRole("button", { name: /Definir por Tempo-Alvo/i });
    await user.click(tabTime);

    const distInput = screen.getByLabelText("Distância da Prova");
    await user.clear(distInput);
    await user.type(distInput, "10");

    const timeInput = screen.getByLabelText("Tempo Alvo Total de Prova");
    await user.clear(timeInput);
    await user.type(timeInput, "50:00");

    const calcBtn = screen.getByRole("button", { name: "Gerar Planilha de Splits" });
    await user.click(calcBtn);

    expect(screen.getAllByText("50:00")[0]).toBeInTheDocument();
    expect(screen.getAllByText("5:00")[0]).toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();
  });

  it("permite selecionar intervalo de split de 500m", async () => {
    const user = userEvent.setup();
    render(<MetasPage />);

    const btn500m = screen.getByRole("button", { name: "500 m" });
    await user.click(btn500m);

    const calcBtn = screen.getByRole("button", { name: "Gerar Planilha de Splits" });
    await user.click(calcBtn);

    // Para 5 km com splits a cada 500m, teremos 10 splits
    expect(screen.getByText(/Chegada \(#10\)/i)).toBeInTheDocument();
  });

  it("exibe mensagem de erro quando distância for inválida (ex: 0)", async () => {
    const user = userEvent.setup();
    render(<MetasPage />);

    const distInput = screen.getByLabelText("Distância da Prova");
    await user.clear(distInput);
    await user.type(distInput, "0");

    const calcBtn = screen.getByRole("button", { name: "Gerar Planilha de Splits" });
    await user.click(calcBtn);

    expect(screen.getByText("A distância deve ser maior que zero.")).toBeInTheDocument();
  });

  it("limpa os campos ao clicar em Limpar", async () => {
    const user = userEvent.setup();
    render(<MetasPage />);

    const clearBtn = screen.getByRole("button", { name: "Limpar" });
    await user.click(clearBtn);

    const distInput = screen.getByLabelText("Distância da Prova");
    expect(distInput).toHaveValue("");
  });

  it("salva a meta calculada no histórico", async () => {
    const user = userEvent.setup();
    render(<MetasPage />);

    const saveBtn = screen.getByRole("button", { name: /Salvar esta Meta no Histórico/i });
    await user.click(saveBtn);

    expect(screen.getByText("Meta Salva no Histórico!")).toBeInTheDocument();
  });

  it("permite selecionar estratégia de Split Negativo e exibe coluna de Ritmo /km", async () => {
    const user = userEvent.setup();
    render(<MetasPage />);

    const negBtn = screen.getByRole("button", { name: /Split Negativo/i });
    await user.click(negBtn);

    const calcBtn = screen.getByRole("button", { name: "Gerar Planilha de Splits" });
    await user.click(calcBtn);

    expect(screen.getByText("Ritmo /km")).toBeInTheDocument();
    expect(screen.getByText("Split 1")).toBeInTheDocument();
  });
});
