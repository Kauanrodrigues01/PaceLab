import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ResultBlock } from "@/components/ui/ResultBlock";

describe("ResultBlock", () => {
  let writeTextSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextSpy,
      },
      configurable: true,
      writable: true,
    });
  });

  it("renderiza rótulo, valor e unidade", () => {
    render(<ResultBlock label="Pace Médio" value="6:40" unit="min/km" />);

    expect(screen.getByText("Pace Médio")).toBeInTheDocument();
    expect(screen.getByText("6:40")).toBeInTheDocument();
    expect(screen.getByText("min/km")).toBeInTheDocument();
  });

  it("renderiza texto secundário quando fornecido", () => {
    render(
      <ResultBlock
        label="Velocidade"
        value="9.0"
        unit="km/h"
        secondaryText="Equivalente ao teste de 12 min"
      />
    );

    expect(screen.getByText("Equivalente ao teste de 12 min")).toBeInTheDocument();
  });

  it("permite copiar o valor clicando no botão de cópia", async () => {
    render(<ResultBlock label="Pace" value="6:40" unit="min/km" copyable />);

    const copyBtn = screen.getByRole("button", { name: /copiar pace/i });
    expect(copyBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(copyBtn);
    });
    expect(writeTextSpy).toHaveBeenCalledWith("Pace: 6:40 min/km");
  });

  it("oculta botão de cópia quando copyable={false}", () => {
    render(<ResultBlock label="Pace" value="6:40" copyable={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
