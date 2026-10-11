import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle Component", () => {
  it("renderiza o botão com label acessível para alternar para modo escuro", () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Ativar tema escuro" });
    expect(button).toBeInTheDocument();
  });

  it("chama setTheme com 'dark' ao ser clicado quando em tema claro", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Ativar tema escuro" });
    await user.click(button);

    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
