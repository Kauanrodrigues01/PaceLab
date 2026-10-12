import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home Page (Fase 9)", () => {
  it("renderiza o cabeçalho e título principal do laboratório", () => {
    render(<Home />);

    expect(
      screen.getByText("PaceLab • O Laboratório de Corrida e Performance")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: /Cálculos Precisos para Cada Quilômetro da Sua Corrida/i,
      })
    ).toBeInTheDocument();
  });

  it("renderiza os botões de ação (CTAs) principais do Hero", () => {
    render(<Home />);

    const calcLink = screen.getByRole("link", { name: "Calculadoras" });
    expect(calcLink).toHaveAttribute("href", "/calculadora");

    const treinosLink = screen.getByRole("link", { name: /Diário de Treinos/i });
    expect(treinosLink).toHaveAttribute("href", "/treinos");

    const meuTafLink = screen.getByRole("link", { name: /Meu TAF \(12 Min\)/i });
    expect(meuTafLink).toHaveAttribute("href", "/meu-taf");
  });

  it("renderiza os cards para todas as 5 ferramentas com os links corretos", () => {
    render(<Home />);

    const expectedTools = [
      { name: "Calculadora de Pace", href: "/calculadora" },
      { name: "Preparação para o TAF", href: "/taf" },
      { name: "Metas & Planilha de Splits", href: "/metas" },
      { name: "Simulador Intervalado (HIIT)", href: "/intervalado" },
      { name: "Histórico de Treinos", href: "/historico" },
    ];

    expectedTools.forEach((tool) => {
      const link = screen.getByRole("link", {
        name: (name) => name.includes(tool.name),
      });
      expect(link).toHaveAttribute("href", tool.href);
    });
  });

  it("renderiza os 3 blocos de diferenciais de privacidade e performance", () => {
    render(<Home />);

    expect(screen.getByText("Validação & Cálculo em Tempo Real")).toBeInTheDocument();
    expect(screen.getByText("100% Privado e Seguro")).toBeInTheDocument();
    expect(screen.getByText("Criado para Mobile & Desktop")).toBeInTheDocument();
  });

  it("renderiza o card de destaque especial do módulo Meu TAF com link para /meu-taf", () => {
    render(<Home />);

    const card = screen.getByTestId("home-meu-taf-card");
    expect(card).toBeInTheDocument();

    expect(
      screen.getByText(/Meu TAF — Preparação Física para 12 Minutos/i)
    ).toBeInTheDocument();

    const meuTafLinks = screen.getAllByRole("link", { name: /Meu TAF/i });
    expect(meuTafLinks.some((l) => l.getAttribute("href") === "/meu-taf")).toBe(true);
  });
});
