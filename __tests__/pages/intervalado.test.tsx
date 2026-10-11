import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IntervaladoPage from "@/app/intervalado/page";

describe("IntervaladoPage (Fase 7)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });
  });

  it("renderiza com os valores padrão da simulação e exibe as etapas com badges", () => {
    render(<IntervaladoPage />);

    expect(
      screen.getByRole("heading", { name: "Simulador de Corrida Intervalada" })
    ).toBeInTheDocument();

    // 5 min aquec + 6x(2 + 1.5) + 5 min desaquec = 5 + 21 + 5 = 31 minutos (31:00)
    expect(screen.getAllByText("31:00")[0]).toBeInTheDocument();

    // Badges das etapas
    expect(screen.getByText("Aquecimento")).toBeInTheDocument();
    expect(screen.getAllByText("Tiro Rápido").length).toBe(6);
    expect(screen.getAllByText("Recuperação").length).toBe(6);
    expect(screen.getByText("Desaquecimento")).toBeInTheDocument();
  });

  it("calcula nova sessão de tiros (ex: 4x 1 min a 15 km/h)", async () => {
    const user = userEvent.setup();
    render(<IntervaladoPage />);

    // Zera aquecimento
    const warmDur = screen.getByLabelText("Duração do Aquecimento");
    await user.clear(warmDur);
    await user.type(warmDur, "0");

    // Tiros
    const runDur = screen.getByLabelText("Duração do Tiro");
    await user.clear(runDur);
    await user.type(runDur, "1");

    const runSpd = screen.getByLabelText("Velocidade do Tiro");
    await user.clear(runSpd);
    await user.type(runSpd, "15");

    // Repetições
    const repsInput = screen.getByLabelText("Quantidade de Repetições");
    await user.clear(repsInput);
    await user.type(repsInput, "4");

    const calcBtn = screen.getByRole("button", { name: "Simular Sessão Intervalada" });
    await user.click(calcBtn);

    // 4 tiros de corrida rápida presentes na tabela
    expect(screen.getAllByText("Tiro Rápido").length).toBe(4);
  });

  it("carrega valores de exemplo ao clicar em Carregar Exemplo", async () => {
    const user = userEvent.setup();
    render(<IntervaladoPage />);

    const clearBtn = screen.getByRole("button", { name: "Limpar" });
    await user.click(clearBtn);

    const exampleBtn = screen.getByRole("button", { name: "Carregar Exemplo" });
    await user.click(exampleBtn);

    expect(screen.getAllByText("31:00")[0]).toBeInTheDocument();
  });

  it("exibe mensagem de erro quando repetições forem inválidas (ex: 0)", async () => {
    const user = userEvent.setup();
    render(<IntervaladoPage />);

    const repsInput = screen.getByLabelText("Quantidade de Repetições");
    await user.clear(repsInput);
    await user.type(repsInput, "0");

    const calcBtn = screen.getByRole("button", { name: "Simular Sessão Intervalada" });
    await user.click(calcBtn);

    expect(
      screen.getByText("O número de repetições deve ser um número inteiro maior que zero.")
    ).toBeInTheDocument();
  });

  it("limpa os campos ao clicar em Limpar", async () => {
    const user = userEvent.setup();
    render(<IntervaladoPage />);

    const clearBtn = screen.getByRole("button", { name: "Limpar" });
    await user.click(clearBtn);

    const runDur = screen.getByLabelText("Duração do Tiro");
    expect(runDur).toHaveValue("");
  });

  it("salva a sessão calculada no histórico", async () => {
    const user = userEvent.setup();
    render(<IntervaladoPage />);

    const saveBtn = screen.getByRole("button", { name: /Salvar esta Sessão no Histórico/i });
    await user.click(saveBtn);

    expect(screen.getByText("Sessão Salva no Histórico!")).toBeInTheDocument();
  });
});
