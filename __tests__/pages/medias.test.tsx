import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MediasPage from "@/app/medias/page";

describe("MediasPage (Fase 4)", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
      writable: true,
    });
  });

  it("renderiza a página com o exemplo inicial do enunciado e calcula média das 9 parciais", () => {
    render(<MediasPage />);

    expect(
      screen.getByRole("heading", { name: "Calculadora de Médias de Paces" })
    ).toBeInTheDocument();

    // Verifica que o aviso sobre premissa de trechos iguais está presente
    expect(
      screen.getByText("Aviso Importante sobre Cálculo de Média")
    ).toBeInTheDocument();

    // 9 parciais informadas no exemplo inicial
    expect(screen.getByText("Calculado a partir de 9 parciais")).toBeInTheDocument();

    // Mais rápido é 6:02 e mais lento é 7:34
    expect(screen.getByText("6:02")).toBeInTheDocument();
    expect(screen.getByText("7:34")).toBeInTheDocument();
  });

  it("calcula nova lista de paces simples quando o usuário digita", async () => {
    const user = userEvent.setup();
    render(<MediasPage />);

    const textarea = screen.getByLabelText("Paces por Linha");
    await user.clear(textarea);
    await user.type(textarea, "5:00\n6:00");

    const calcButton = screen.getByRole("button", { name: "Calcular Médias" });
    await user.click(calcButton);

    // Média de 5:00 (300s) e 6:00 (360s) = 330s = 5:30
    expect(screen.getAllByText("5:30")[0]).toBeInTheDocument();
    expect(screen.getByText("Calculado a partir de 2 parciais")).toBeInTheDocument();
  });

  it("suporta inteiros como '6' sem precisar digitar '6:00' na lista de paces", async () => {
    const user = userEvent.setup();
    render(<MediasPage />);

    const textarea = screen.getByLabelText("Paces por Linha");
    await user.clear(textarea);
    await user.type(textarea, "5\n6");

    const calcButton = screen.getByRole("button", { name: "Calcular Médias" });
    await user.click(calcButton);

    // Média de 5 (300s) e 6 (360s) = 5:30
    expect(screen.getAllByText("5:30")[0]).toBeInTheDocument();
  });

  it("exibe erro se houver linha inválida", async () => {
    const user = userEvent.setup();
    render(<MediasPage />);

    const textarea = screen.getByLabelText("Paces por Linha");
    await user.clear(textarea);
    await user.type(textarea, "invalido");

    const calcButton = screen.getByRole("button", { name: "Calcular Médias" });
    await user.click(calcButton);

    expect(screen.getByText(/Linha 1 \("invalido"\) inválida/i)).toBeInTheDocument();
  });

  it("alterna para o modo ponderado e calcula com distâncias diferentes", async () => {
    const user = userEvent.setup();
    render(<MediasPage />);

    const switchBtn = screen.getByRole("switch");
    await user.click(switchBtn);

    expect(
      screen.getByText("Parciais Ponderadas (com distâncias)")
    ).toBeInTheDocument();

    const calcButton = screen.getByRole("button", { name: "Calcular Médias" });
    await user.click(calcButton);

    expect(screen.getByText("Pace Médio Geral")).toBeInTheDocument();
  });

  it("permite adicionar e remover parciais no modo ponderado", async () => {
    const user = userEvent.setup();
    render(<MediasPage />);

    const switchBtn = screen.getByRole("switch");
    await user.click(switchBtn);

    const addBtn = screen.getByRole("button", { name: "Adicionar Nova Parcial" });
    await user.click(addBtn);

    const removeBtns = screen.getAllByRole("button", { name: /Remover parcial/i });
    expect(removeBtns.length).toBe(4);

    await user.click(removeBtns[removeBtns.length - 1]);
    expect(screen.getAllByRole("button", { name: /Remover parcial/i }).length).toBe(3);
  });

  it("limpa os campos ao clicar no botão Limpar", async () => {
    const user = userEvent.setup();
    render(<MediasPage />);

    const clearBtn = screen.getByRole("button", { name: "Limpar" });
    await user.click(clearBtn);

    const textarea = screen.getByLabelText("Paces por Linha");
    expect(textarea).toHaveValue("");
    expect(screen.getByText("Insira as parciais e clique em Calcular")).toBeInTheDocument();
  });

  it("salva a média calculada no histórico", async () => {
    const user = userEvent.setup();
    render(<MediasPage />);

    const saveBtn = screen.getByRole("button", { name: /Salvar esta Média no Histórico/i });
    await user.click(saveBtn);

    expect(screen.getByText("Média Salva no Histórico!")).toBeInTheDocument();
  });
});
