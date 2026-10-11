import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "@/components/ui/Input";

describe("Input", () => {
  it("renderiza o label corretamente associado ao campo", () => {
    render(<Input label="Distância" />);
    const input = screen.getByLabelText("Distância");
    expect(input).toBeInTheDocument();
  });

  it("chama onChange quando o usuário digita", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Input label="Pace" onChange={handleChange} />);

    const input = screen.getByLabelText("Pace");
    await user.type(input, "6:40");

    expect(handleChange).toHaveBeenCalled();
  });

  it("exibe mensagem de erro e marca aria-invalid", () => {
    render(<Input label="Tempo" error="Informe um tempo válido" />);

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage).toHaveTextContent("Informe um tempo válido");

    const input = screen.getByLabelText("Tempo");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("renderiza rightAddon com a unidade", () => {
    render(<Input label="Distância" rightAddon="km" />);
    expect(screen.getByText("km")).toBeInTheDocument();
  });

  it("renderiza hint quando fornecida", () => {
    render(<Input label="Velocidade" hint="Exemplo: 12 km/h" />);
    expect(screen.getByText("Exemplo: 12 km/h")).toBeInTheDocument();
  });

  it("fica desabilitado quando disabled={true}", () => {
    render(<Input label="Campo bloqueado" disabled />);
    const input = screen.getByLabelText("Campo bloqueado");
    expect(input).toBeDisabled();
  });
});
