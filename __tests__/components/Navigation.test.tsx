import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Navbar } from "@/components/layout/Navbar";
import { BottomNav } from "@/components/layout/BottomNav";

// Mock do next/navigation usePathname
vi.mock("next/navigation", () => ({
  usePathname: () => "/meu-taf",
}));

describe("Navegação Global Redesenhada (Fase 3)", () => {
  describe("Navbar (Desktop)", () => {
    it("renderiza o link em destaque 'Meu TAF' apontando para /meu-taf", () => {
      render(<Navbar />);

      const meuTafLink = screen.getByRole("link", { name: /Meu TAF/i });
      expect(meuTafLink).toBeInTheDocument();
      expect(meuTafLink).toHaveAttribute("href", "/meu-taf");
    });

    it("renderiza os 3 pilares estratégicos da aplicação e o logo principal", () => {
      render(<Navbar />);

      expect(
        screen.getByRole("link", {
          name: (content) => content.includes("Pace") && content.includes("Lab"),
        })
      ).toHaveAttribute("href", "/");

      expect(screen.getByRole("link", { name: /^Calculadoras$/i })).toHaveAttribute("href", "/calculadora");
      expect(screen.getByRole("link", { name: /^Diário de Treinos$/i })).toHaveAttribute("href", "/treinos");
      expect(screen.getByRole("link", { name: /Meu TAF/i })).toHaveAttribute("href", "/meu-taf");
    });
  });

  describe("BottomNav (Mobile)", () => {
    it("renderiza a barra de navegação móvel com acessibilidade e link para Meu TAF", () => {
      render(<BottomNav />);

      const nav = screen.getByRole("navigation", { name: /Navegação móvel/i });
      expect(nav).toBeInTheDocument();

      const meuTafMobile = screen.getByRole("link", { name: /Meu TAF/i });
      expect(meuTafMobile).toBeInTheDocument();
      expect(meuTafMobile).toHaveAttribute("href", "/meu-taf");
    });

    it("renderiza as 4 abas sem barra de rolagem horizontal", () => {
      render(<BottomNav />);

      expect(screen.getByRole("link", { name: /^Início$/i })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: /^Calculadoras$/i })).toHaveAttribute("href", "/calculadora");
      expect(screen.getByRole("link", { name: /^Treinos$/i })).toHaveAttribute("href", "/treinos");
      expect(screen.getByRole("link", { name: /Meu TAF/i })).toHaveAttribute("href", "/meu-taf");
    });
  });
});
