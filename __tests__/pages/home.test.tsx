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

    const calcLink = screen.getByRole("link", { name: /Abrir Calculadora/i });
    expect(calcLink).toHaveAttribute("href", "/calculadora");

    const tafLink = screen.getByRole("link", { name: /Simulador de TAF/i });
    expect(tafLink).toHaveAttribute("href", "/taf");
  });

  it("renderiza os cards para todas as 6 ferramentas com os links corretos", () => {
    render(<Home />);

    const expectedTools = [
      { name: "Calculadora de Pace", href: "/calculadora" },
      { name: "Média de Paces & Splits", href: "/medias" },
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
});
