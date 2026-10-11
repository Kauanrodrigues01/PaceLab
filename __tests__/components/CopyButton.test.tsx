import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyButton } from "@/components/ui/CopyButton";

describe("CopyButton Component", () => {
  it("renderiza o texto inicial 'Copiar' e copia texto para a área de transferência", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<CopyButton textToCopy="Pace: 5:00 min/km" />);

    const button = screen.getByRole("button", { name: /Copiar/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("Pace: 5:00 min/km");
    });
    expect(screen.getByRole("button", { name: /Copiado!/i })).toBeInTheDocument();
  });
});
