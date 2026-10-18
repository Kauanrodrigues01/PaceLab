import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";

describe("Badge Component", () => {
  it("renderiza o texto do badge com variante default por padrão", () => {
    render(<Badge>Treino</Badge>);

    const badge = screen.getByText("Treino");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-slate-100");
  });

  it("renderiza diferentes variantes corretamente", () => {
    const { rerender } = render(<Badge variant="primary">Destaque</Badge>);
    expect(screen.getByText("Destaque")).toHaveClass("bg-blue-50");

    rerender(<Badge variant="success">Sucesso</Badge>);
    expect(screen.getByText("Sucesso")).toHaveClass("bg-emerald-50");

    rerender(<Badge variant="warning">Aviso</Badge>);
    expect(screen.getByText("Aviso")).toHaveClass("bg-amber-50");

    rerender(<Badge variant="danger">Erro</Badge>);
    expect(screen.getByText("Erro")).toHaveClass("bg-red-50");

    rerender(<Badge variant="lime">Ritmo</Badge>);
    expect(screen.getByText("Ritmo")).toHaveClass("bg-lime-50");
  });
});
