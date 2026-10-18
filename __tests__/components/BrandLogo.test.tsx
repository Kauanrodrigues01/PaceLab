import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrandLogo } from "@/components/layout/BrandLogo";

describe("BrandLogo Component", () => {
  it("renderiza a logo com ícone ico.png e tipografia PaceLab no modo icon padrão", () => {
    render(<BrandLogo size="md" variant="icon" />);

    const img = screen.getByAltText("PaceLab Logo");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toContain("/images/ico.png");

    expect(screen.getByText("Pace")).toBeInTheDocument();
    expect(screen.getByText("Lab")).toBeInTheDocument();
  });

  it("renderiza a logo completa logo.png no modo full", () => {
    render(<BrandLogo size="lg" variant="full" />);

    const img = screen.getByAltText("PaceLab Logo");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toContain("/images/logo.png");
    // No modo full o texto já faz parte da arte da imagem
    expect(screen.queryByText("Pace")).not.toBeInTheDocument();
  });

  it("permite ocultar o texto da marca quando showText é falso", () => {
    render(<BrandLogo size="sm" showText={false} />);

    expect(screen.getByAltText("PaceLab Logo")).toBeInTheDocument();
    expect(screen.queryByText("Pace")).not.toBeInTheDocument();
    expect(screen.queryByText("Lab")).not.toBeInTheDocument();
  });

  it("exibe fallback gracioso com ícone vetorial se o carregamento da imagem falhar", () => {
    render(<BrandLogo size="md" />);

    const img = screen.getByAltText("PaceLab Logo");
    // Simula erro de carregamento da imagem
    fireEvent.error(img);

    expect(screen.getByTestId("brand-logo-fallback")).toBeInTheDocument();
    expect(screen.getByText("Pace")).toBeInTheDocument();
    expect(screen.getByText("Lab")).toBeInTheDocument();
  });

  it("aplica variações de tamanho sm, md e lg corretamente", () => {
    const { rerender } = render(<BrandLogo size="sm" />);
    expect(screen.getByAltText("PaceLab Logo")).toHaveAttribute("width", "28");

    rerender(<BrandLogo size="lg" />);
    expect(screen.getByAltText("PaceLab Logo")).toHaveAttribute("width", "48");
  });
});
