import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";

describe("Home Page (Fase 9)", () => {
  const renderHome = async () => {
    const utils = render(<Home />);
    await waitFor(() => {
      expect(screen.getByTestId("athlete-active-status-card")).toBeInTheDocument();
    });
    return utils;
  };

  it("renderiza o cabeçalho e título principal do laboratório", async () => {
    await renderHome();

    expect(
      screen.getByText("PaceLab • O Laboratório de Corrida e Performance")
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: /Cálculos Precisos para Cada Quilômetro da Sua Corrida/i,
      })
    ).toBeInTheDocument();
  });

  it("renderiza os botões de ação (CTAs) principais do Hero", async () => {
    await renderHome();

    const calcLink = screen.getByRole("link", { name: "Calculadoras" });
    expect(calcLink).toHaveAttribute("href", "/calculadora");

    const treinosLink = screen.getByRole("link", { name: /Diário de Treinos/i });
    expect(treinosLink).toHaveAttribute("href", "/treinos");

    const meuTafLink = screen.getByRole("link", { name: /Meu TAF \(12 Min\)/i });
    expect(meuTafLink).toHaveAttribute("href", "/meu-taf");
  });

  it("renderiza os cards para todas as 5 ferramentas com os links corretos", async () => {
    await renderHome();

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

  it("renderiza os 3 blocos de diferenciais de privacidade e performance", async () => {
    await renderHome();

    expect(screen.getByText("Validação & Cálculo em Tempo Real")).toBeInTheDocument();
    expect(screen.getByText("100% Privado e Seguro")).toBeInTheDocument();
    expect(screen.getByText("Criado para Mobile & Desktop")).toBeInTheDocument();
  });

  it("renderiza o card de destaque especial do módulo Meu TAF com link para /meu-taf", async () => {
    await renderHome();

    const card = screen.getByTestId("home-meu-taf-card");
    expect(card).toBeInTheDocument();

    expect(
      screen.getByText(/Meu TAF — Preparação Física para 12 Minutos/i)
    ).toBeInTheDocument();

    const meuTafLinks = screen.getAllByRole("link", { name: /Meu TAF/i });
    expect(meuTafLinks.some((l) => l.getAttribute("href") === "/meu-taf")).toBe(true);
  });

  it("renderiza o QuickPaceWidget e permite aplicar atalhos rápidos", async () => {
    const user = userEvent.setup();
    await renderHome();

    expect(screen.getByTestId("quick-pace-widget")).toBeInTheDocument();
    expect(screen.getByText("Cálculo Rápido de Ritmo & Velocidade")).toBeInTheDocument();

    const btn24k = screen.getByRole("button", { name: "2.4 km TAF" });
    await user.click(btn24k);

    expect(screen.getByDisplayValue("2.4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12:00")).toBeInTheDocument();
  });

  it("renderiza o AthleteActiveStatusCard com resumo das métricas do atleta", async () => {
    await renderHome();

    expect(screen.getByTestId("athlete-active-status-card")).toBeInTheDocument();
    expect(screen.getByText("Painel do Atleta")).toBeInTheDocument();
  });
});
