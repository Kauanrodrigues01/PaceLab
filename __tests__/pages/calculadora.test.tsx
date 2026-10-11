import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalculadoraPage from "@/app/calculadora/page";

describe("CalculadoraPage", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });
  });

  it("renderiza a calculadora com os valores de exemplo do prompt (3 km em 20 min -> 6:40 e 9.0 km/h)", () => {
    render(<CalculadoraPage />);

    expect(screen.getByRole("heading", { name: "Cálculos de Corrida e Ritmo" })).toBeInTheDocument();
    // Exemplo inicial pré-calculado
    expect(screen.getAllByText("6:40")[0]).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument();
  });

  it("calcula nova distância e tempo (5 km em 25:00 -> pace 5:00 e 12.0 km/h)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const distInput = screen.getByLabelText("Distância");
    const timeInput = screen.getByLabelText("Tempo total");

    await user.clear(distInput);
    await user.type(distInput, "5");

    await user.clear(timeInput);
    await user.type(timeInput, "25:00");

    const calcButton = screen.getByRole("button", { name: "Calcular" });
    await user.click(calcButton);

    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("12.0")).toBeInTheDocument();
  });

  it("alterna para modo Pace -> Velocidade e calcula (pace 6:40 -> 9.00 km/h)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceToSpeed = screen.getByRole("button", { name: /Pace → Vel/i });
    await user.click(tabPaceToSpeed);

    const paceInput = screen.getByLabelText("Pace de Corrida");
    await user.clear(paceInput);
    await user.type(paceInput, "6:40");

    const calcButton = screen.getByRole("button", { name: "Calcular Velocidade" });
    await user.click(calcButton);

    expect(screen.getByText("9.00")).toBeInTheDocument();
  });

  it("alterna para modo Velocidade -> Pace e calcula (velocidade 9 km/h -> 6:40)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabSpeedToPace = screen.getByRole("button", { name: /Vel → Pace/i });
    await user.click(tabSpeedToPace);

    const speedInput = screen.getByLabelText("Velocidade");
    await user.clear(speedInput);
    await user.type(speedInput, "9");

    const calcButton = screen.getByRole("button", { name: "Calcular Pace" });
    await user.click(calcButton);

    expect(screen.getAllByText("6:40")[0]).toBeInTheDocument();
  });

  it("exibe mensagem de erro quando distância for inválida (ex: 0)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const distInput = screen.getByLabelText("Distância");
    await user.clear(distInput);
    await user.type(distInput, "0");

    const calcButton = screen.getByRole("button", { name: "Calcular" });
    await user.click(calcButton);

    expect(screen.getByText("A distância deve ser maior que zero.")).toBeInTheDocument();
  });

  it("limpa os campos ao clicar em Limpar", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const clearButton = screen.getByRole("button", { name: "Limpar" });
    await user.click(clearButton);

    const distInput = screen.getByLabelText("Distância");
    expect(distInput).toHaveValue("");
  });

  it("permite digitar minutos inteiros como '6' sem colocar '6:00' na conversão para velocidade (6 -> 10.00 km/h)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabPaceToSpeed = screen.getByRole("button", { name: /Pace → Vel/i });
    await user.click(tabPaceToSpeed);

    const paceInput = screen.getByLabelText("Pace de Corrida");
    await user.clear(paceInput);
    await user.type(paceInput, "6"); // Digita apenas o número inteiro 6

    const calcButton = screen.getByRole("button", { name: "Calcular Velocidade" });
    await user.click(calcButton);

    // 3600 / 360s = 10.00 km/h
    expect(screen.getByText("10.00")).toBeInTheDocument();
  });

  it("calcula tempo estimado no modo time-needed (10 km a 5:00 -> 50:00)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabTimeNeeded = screen.getByRole("button", { name: /Tempo Estimado/i });
    await user.click(tabTimeNeeded);

    const distInput = screen.getByLabelText("Distância desejada");
    await user.clear(distInput);
    await user.type(distInput, "10");

    const paceInput = screen.getByLabelText("Pace Alvo");
    await user.clear(paceInput);
    await user.type(paceInput, "5:00");

    const calcButton = screen.getByRole("button", { name: "Calcular Tempo" });
    await user.click(calcButton);

    expect(screen.getByText("50:00")).toBeInTheDocument();
  });

  it("calcula distância percorrida no modo distance-covered (30:00 a 10 km/h -> 5.00 km)", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const tabDistCovered = screen.getByRole("button", { name: /Distância Total/i });
    await user.click(tabDistCovered);

    const timeInput = screen.getByLabelText("Tempo de corrida");
    await user.clear(timeInput);
    await user.type(timeInput, "30:00");

    const speedInput = screen.getByLabelText("Velocidade média");
    await user.clear(speedInput);
    await user.type(speedInput, "10");

    const calcButton = screen.getByRole("button", { name: "Calcular Distância" });
    await user.click(calcButton);

    expect(screen.getByText("5.00")).toBeInTheDocument();
  });

  it("permite salvar atividade calculada no histórico", async () => {
    const user = userEvent.setup();
    render(<CalculadoraPage />);

    const saveButton = screen.getByRole("button", { name: /Salvar esta atividade no Histórico/i });
    await user.click(saveButton);

    expect(screen.getByText("Salvo no Histórico!")).toBeInTheDocument();
  });
});

