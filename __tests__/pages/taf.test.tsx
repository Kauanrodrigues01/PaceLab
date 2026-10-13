import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TafPage from "@/app/taf/page";

describe("TafPage (Fase 5)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });
  });

  it("renderiza a página com os valores padrão e calcula o ritmo inicial", () => {
    render(<TafPage />);

    expect(
      screen.getByRole("heading", { name: "Calculadora de TAF (Teste de Aptidão Física)" })
    ).toBeInTheDocument();

    // Aviso legal obrigatório
    expect(
      screen.getByText("Aviso Importante e Termo de Referência")
    ).toBeInTheDocument();

    // Valores calculados padrão (2300m em 12min -> pace 5:13)
    expect(screen.getByText("5:13")).toBeInTheDocument();
    expect(screen.getByText("11.50")).toBeInTheDocument(); // velocidade em km/h
    expect(screen.getByText("Status: Abaixo da Meta")).toBeInTheDocument();
    expect(screen.getByText("91.3% Atingido")).toBeInTheDocument();

    // Tabela de voltas na pista
    expect(screen.getByText("Volta 1")).toBeInTheDocument();
  });

  it("calcula nova meta (12 min e 2400 m -> pace 5:00 e tempo de volta 2:00)", async () => {
    const user = userEvent.setup();
    render(<TafPage />);

    const targetInput = screen.getByLabelText("Meta de Distância");
    await user.clear(targetInput);
    await user.type(targetInput, "2400");

    const currentInput = screen.getByLabelText("Sua Distância Atual (Opcional)");
    await user.clear(currentInput);
    await user.type(currentInput, "2400");

    const calcButton = screen.getByRole("button", { name: "Calcular Metas do TAF" });
    await user.click(calcButton);

    // 2400m em 12min = pace 5:00 min/km e velocidade 12.00 km/h
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();
    expect(screen.getByText("Status: Apto na Meta")).toBeInTheDocument();
    expect(screen.getByText("100.0% Atingido")).toBeInTheDocument();
    expect(screen.getAllByText("2:00")[0]).toBeInTheDocument(); // 400m em 2:00
  });

  it("alterna para o modo Distância Fixa com Tempo Máximo e calcula", async () => {
    const user = userEvent.setup();
    render(<TafPage />);

    const fixedTab = screen.getByRole("button", { name: /Distância Fixa/i });
    await user.click(fixedTab);

    expect(
      screen.getByText("TAF com Distância Fixa e Tempo Limite")
    ).toBeInTheDocument();

    const distInput = screen.getByLabelText("Distância a Percorrer");
    await user.clear(distInput);
    await user.type(distInput, "2400");

    const timeInput = screen.getByLabelText("Tempo Máximo Permitido");
    await user.clear(timeInput);
    await user.type(timeInput, "12:00");

    const calcButton = screen.getByRole("button", { name: "Calcular Limite de Pace" });
    await user.click(calcButton);

    expect(screen.getByText("Pace Máximo Permitido")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();
  });

  it("exibe mensagem de erro quando campos forem inválidos", async () => {
    const user = userEvent.setup();
    render(<TafPage />);

    const durationInput = screen.getByLabelText("Duração do Teste");
    await user.clear(durationInput);
    await user.type(durationInput, "0");

    const calcButton = screen.getByRole("button", { name: "Calcular Metas do TAF" });
    await user.click(calcButton);

    expect(
      screen.getByText("A duração do teste deve ser maior que 0 minutos.")
    ).toBeInTheDocument();
  });

  it("limpa os campos ao clicar em Limpar", async () => {
    const user = userEvent.setup();
    render(<TafPage />);

    const clearButton = screen.getByRole("button", { name: "Limpar" });
    await user.click(clearButton);

    const targetInput = screen.getByLabelText("Meta de Distância");
    expect(targetInput).toHaveValue("");
  });

  it("salva estratégia calculada no histórico", async () => {
    const user = userEvent.setup();
    render(<TafPage />);

    const saveButton = screen.getByRole("button", { name: /Salvar esta Estratégia no Histórico/i });
    await user.click(saveButton);

    expect(screen.getByText("Estratégia Salva no Histórico!")).toBeInTheDocument();
  });

  it("exibe atalhos de meta de distância aumentando de 100 em 100 metros e atualiza o campo ao clicar", async () => {
    const user = userEvent.setup();
    render(<TafPage />);

    // Verifica que não pula de 200 em 200, tendo opções de 100 em 100m
    const expectedShortcuts = [
      "2.000 m",
      "2.100 m",
      "2.200 m",
      "2.300 m",
      "2.400 m",
      "2.500 m",
      "2.600 m",
      "2.700 m",
      "2.800 m",
      "2.900 m",
      "3.000 m",
    ];

    expectedShortcuts.forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });

    // Clica no atalho de 2.500 m
    const btn2500 = screen.getByRole("button", { name: "2.500 m" });
    await user.click(btn2500);

    const targetInput = screen.getByLabelText("Meta de Distância");
    expect(targetInput).toHaveValue("2500");
  });

  it("renderiza a régua visual de aprovação e as dicas táticas por volta de pista", async () => {
    render(<TafPage />);

    // Régua visual de aprovação
    await waitFor(() => {
      expect(screen.getByTestId("taf-approval-ruler")).toBeInTheDocument();
    });

    // Coluna e feedback tático na tabela
    expect(screen.getByText("Tática da Volta")).toBeInTheDocument();
    expect(screen.getByText(/Saída controlada/i)).toBeInTheDocument();
  });
});
