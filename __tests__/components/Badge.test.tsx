import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";

describe("Badge Component", () => {
  it("renderiza o texto do badge com variante default por padrão", () => {
    render(<Badge>Treino</Badge>);

    const badge = screen.getByText("Treino");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-[#131A2E]");
  });

  it("renderiza diferentes variantes corretamente", () => {
    const { rerender } = render(<Badge variant="primary">Destaque</Badge>);
    expect(screen.getByText("Destaque")).toHaveClass("bg-[#B7F34A]/15");

    rerender(<Badge variant="success">Sucesso</Badge>);
    expect(screen.getByText("Sucesso")).toHaveClass("bg-emerald-950/60");

    rerender(<Badge variant="warning">Aviso</Badge>);
    expect(screen.getByText("Aviso")).toHaveClass("bg-amber-950/60");

    rerender(<Badge variant="danger">Erro</Badge>);
    expect(screen.getByText("Erro")).toHaveClass("bg-red-950/60");

    rerender(<Badge variant="lime">Ritmo</Badge>);
    expect(screen.getByText("Ritmo")).toHaveClass("bg-[#B7F34A]/15");
  });
});
