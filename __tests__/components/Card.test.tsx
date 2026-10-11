import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/Card";

describe("Card", () => {
  it("renderiza o conteúdo principal (children)", () => {
    render(
      <Card>
        <p>Conteúdo interno do card</p>
      </Card>
    );

    expect(screen.getByText("Conteúdo interno do card")).toBeInTheDocument();
  });

  it("renderiza título e descrição no cabeçalho", () => {
    render(
      <Card
        title="Calculadora de Pace"
        description="Calcule pace a partir de distância e tempo"
      >
        <span>Conteúdo</span>
      </Card>
    );

    expect(screen.getByRole("heading", { level: 2, name: "Calculadora de Pace" })).toBeInTheDocument();
    expect(
      screen.getByText("Calcule pace a partir de distância e tempo")
    ).toBeInTheDocument();
  });

  it("renderiza headerAction no cabeçalho quando fornecido", () => {
    render(
      <Card
        title="Card com Ação"
        headerAction={<button type="button">Ação</button>}
      >
        <span>Corpo</span>
      </Card>
    );

    expect(screen.getByRole("button", { name: "Ação" })).toBeInTheDocument();
  });
});
