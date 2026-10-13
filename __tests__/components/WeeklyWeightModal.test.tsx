import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WeeklyWeightModal } from "@/components/profile/WeeklyWeightModal";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";
import { DISMISSED_PROMPT_KEY } from "@/lib/services/profileService";

describe("WeeklyWeightModal Component", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setupMockTafApi();
  });

  it("renderiza o modal quando forceOpen é true", () => {
    render(<WeeklyWeightModal forceOpen={true} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Hora de atualizar seu peso!")).toBeInTheDocument();
    expect(screen.getByLabelText(/Peso Corporal Atual/i)).toBeInTheDocument();
  });

  it("permite digitar o peso e submeter o formulário com sucesso", async () => {
    const handleSaved = vi.fn();
    render(<WeeklyWeightModal forceOpen={true} onWeightSaved={handleSaved} />);

    const input = screen.getByLabelText(/Peso Corporal Atual/i);
    fireEvent.change(input, { target: { value: "71.5" } });

    const submitBtn = screen.getByRole("button", { name: /Confirmar Peso/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Peso atualizado com sucesso!")).toBeInTheDocument();
    });

    expect(handleSaved).toHaveBeenCalledWith(71.5);
  });

  it("exibe mensagem de erro ao informar peso inválido (< 30 kg ou > 250 kg)", async () => {
    render(<WeeklyWeightModal forceOpen={true} />);

    const input = screen.getByLabelText(/Peso Corporal Atual/i);
    fireEvent.change(input, { target: { value: "20" } });

    const form = input.closest("form")!;
    fireEvent.submit(form);

    expect(
      screen.getByText(/informe um peso corporal válido entre 30 e 250 kg/i)
    ).toBeInTheDocument();
  });

  it("dispensa o lembrete por 24h ao clicar em 'Pular por 24h'", () => {
    const handleClose = vi.fn();
    render(<WeeklyWeightModal forceOpen={true} onClose={handleClose} />);

    const dismissBtn = screen.getByRole("button", { name: /Pular por 24h/i });
    fireEvent.click(dismissBtn);

    expect(localStorage.getItem(DISMISSED_PROMPT_KEY)).not.toBeNull();
    expect(handleClose).toHaveBeenCalled();
  });

  it("fecha o modal ao clicar no botão X", () => {
    const handleClose = vi.fn();
    render(<WeeklyWeightModal forceOpen={true} onClose={handleClose} />);

    const closeBtn = screen.getByLabelText(/Dispensar lembrete de pesagem/i);
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalled();
  });
});
