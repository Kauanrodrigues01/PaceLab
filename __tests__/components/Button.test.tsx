import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("renderiza o texto do botão", () => {
    render(<Button>Calcular</Button>);
    expect(screen.getByRole("button", { name: "Calcular" })).toBeInTheDocument();
  });

  it("dispara onClick ao clicar", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Calcular</Button>);

    await user.click(screen.getByRole("button", { name: "Calcular" }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("não dispara onClick quando disabled={true}", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Button disabled onClick={handleClick}>
        Calcular
      </Button>
    );

    const button = screen.getByRole("button", { name: "Calcular" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("exibe estado de loading e desabilita interação", () => {
    render(<Button loading>Calculando...</Button>);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
  });
});
