import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TrainingForm } from "@/components/meu-taf/TrainingForm";
import { TrainingSession } from "@/types";

describe("TrainingForm - Comportamento de Inputs Numéricos", () => {
  it("permite apagar o campo de distância sem reinserir '0' automaticamente", async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(<TrainingForm onSave={handleSave} />);

    const distanceInput = screen.getByLabelText(/Distância Percorrida/i);
    expect(distanceInput).toHaveValue("5.0");

    // Limpa o campo
    await user.clear(distanceInput);
    expect(distanceInput).toHaveValue("");

    // Digita '17.5' diretamente no campo limpo
    await user.type(distanceInput, "17.5");
    expect(distanceInput).toHaveValue("17.5");
    // Garante que NÃO existe prefixo 0
    expect((distanceInput as HTMLInputElement).value).not.toMatch(/^0\d/);
  });

  it("aceita vírgula como separador decimal e submete valor numérico correto", async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(<TrainingForm onSave={handleSave} />);

    const distanceInput = screen.getByLabelText(/Distância Percorrida/i);
    await user.clear(distanceInput);
    await user.type(distanceInput, "17,5");
    expect(distanceInput).toHaveValue("17,5");

    // Submete o formulário
    const submitBtn = screen.getByRole("button", { name: /Registrar Treino no Diário/i });
    await user.click(submitBtn);

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedSession = handleSave.mock.calls[0][0] as TrainingSession;
    expect(savedSession.distanceKm).toBe(17.5);
  });

  it("permite apagar e editar os campos de tempo (horas, minutos e segundos) sem travar o zero", async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(<TrainingForm onSave={handleSave} />);

    const distanceInput = screen.getByLabelText(/Distância Percorrida/i);
    await user.clear(distanceInput);
    await user.type(distanceInput, "10");

    // Encontra inputs de duração pelo inputMode="numeric"
    const timeInputs = screen.getAllByRole("textbox").filter((input) =>
      input.getAttribute("inputmode") === "numeric"
    );

    // timeInputs: [hours, minutes, seconds]
    const hoursInput = timeInputs[0];
    const minutesInput = timeInputs[1];
    const secondsInput = timeInputs[2];

    await user.clear(hoursInput);
    expect(hoursInput).toHaveValue("");
    await user.type(hoursInput, "1");
    expect(hoursInput).toHaveValue("1");

    await user.clear(minutesInput);
    expect(minutesInput).toHaveValue("");
    await user.type(minutesInput, "15");
    expect(minutesInput).toHaveValue("15");

    await user.clear(secondsInput);
    expect(secondsInput).toHaveValue("");
    await user.type(secondsInput, "45");
    expect(secondsInput).toHaveValue("45");

    // Submete
    const submitBtn = screen.getByRole("button", { name: /Registrar Treino no Diário/i });
    await user.click(submitBtn);

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedSession = handleSave.mock.calls[0][0] as TrainingSession;
    // 1h 15min 45s = 3600 + 900 + 45 = 4545 segundos
    expect(savedSession.durationSeconds).toBe(4545);
    expect(savedSession.distanceKm).toBe(10);
  });
});
