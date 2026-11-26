import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";

describe("Footer Component", () => {
  it("renderiza marca PaceLab, descrição e links principais incluindo API Docs (Swagger)", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "PaceLab Início" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Calculadoras" })).toHaveAttribute(
      "href",
      "/calculadora"
    );
    expect(screen.getByRole("link", { name: "Diário" })).toHaveAttribute("href", "/treinos");
    expect(screen.getByRole("link", { name: "Meu TAF" })).toHaveAttribute("href", "/meu-taf");
    expect(screen.getByRole("link", { name: "Perfil" })).toHaveAttribute("href", "/perfil");
    expect(screen.getByRole("link", { name: /API Docs \(Swagger\)/i })).toHaveAttribute(
      "href",
      "/docs"
    );
    expect(
      screen.getByText(/Plataforma para corredores e preparação física em concursos públicos/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/PaceLab © 2026/i)).toBeInTheDocument();
  });
});
