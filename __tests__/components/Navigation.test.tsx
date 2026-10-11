import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Navbar } from "@/components/layout/Navbar";
import { BottomNav } from "@/components/layout/BottomNav";

// Mock do next/navigation usePathname
vi.mock("next/navigation", () => ({
  usePathname: () => "/meu-taf",
}));

describe("Navegação Global (Fase G)", () => {
  describe("Navbar (Desktop)", () => {
    it("renderiza o link em destaque 'Meu TAF' apontando para /meu-taf", () => {
      render(<Navbar />);

      const meuTafLink = screen.getByRole("link", { name: /Meu TAF/i });
      expect(meuTafLink).toBeInTheDocument();
      expect(meuTafLink).toHaveAttribute("href", "/meu-taf");
    });

    it("renderiza todos os links de ferramentas e o logo principal", () => {
      render(<Navbar />);

      expect(
        screen.getByRole("link", {
          name: (content) => content.includes("Pace") && content.includes("Lab"),
        })
      ).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: /^Pace$/i })).toHaveAttribute("href", "/calculadora");
      expect(screen.getByRole("link", { name: /^Médias$/i })).toHaveAttribute("href", "/medias");
      expect(screen.getByRole("link", { name: /^TAF$/i })).toHaveAttribute("href", "/taf");
      expect(screen.getByRole("link", { name: /^Metas$/i })).toHaveAttribute("href", "/metas");
      expect(screen.getByRole("link", { name: /^Intervalado$/i })).toHaveAttribute("href", "/intervalado");
      expect(screen.getByRole("link", { name: /^Histórico$/i })).toHaveAttribute("href", "/historico");
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

    it("renderiza todos os atalhos móveis necessários para experiência Android", () => {
      render(<BottomNav />);

      expect(screen.getByRole("link", { name: /Início/i })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: /^Pace$/i })).toHaveAttribute("href", "/calculadora");
      expect(screen.getByRole("link", { name: /^Médias$/i })).toHaveAttribute("href", "/medias");
      expect(screen.getByRole("link", { name: /^TAF$/i })).toHaveAttribute("href", "/taf");
      expect(screen.getByRole("link", { name: /^Metas$/i })).toHaveAttribute("href", "/metas");
      expect(screen.getByRole("link", { name: /^Intervalos$/i })).toHaveAttribute("href", "/intervalado");
      expect(screen.getByRole("link", { name: /^Histórico$/i })).toHaveAttribute("href", "/historico");
    });
  });
});
