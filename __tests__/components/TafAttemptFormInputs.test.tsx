import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TafAttemptForm } from "@/components/meu-taf/TafAttemptForm";
import { TafAttempt } from "@/types";

describe("TafAttemptForm - Comportamento de Inputs Numéricos", () => {
  it("permite apagar o campo de distância em metros sem reinserir zero compulsoriamente", async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(<TafAttemptForm targetDistanceMeters={2300} onSave={handleSave} />);

    const distanceInput = screen.getByLabelText(/Distância Total Percorrida/i);
    expect(distanceInput).toHaveValue("2300");

    // Limpa o campo
    await user.clear(distanceInput);
    expect(distanceInput).toHaveValue("");

    // Digita nova distância diretamente
    await user.type(distanceInput, "2450");
    expect(distanceInput).toHaveValue("2450");
    expect((distanceInput as HTMLInputElement).value).not.toMatch(/^0\d/);
  });

  it("permite apagar e editar a duração do simulado sem travar no zero", async () => {
    const user = userEvent.setup();
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(<TafAttemptForm targetDistanceMeters={2300} onSave={handleSave} />);

    // Campos de duração
    const timeInputs = screen.getAllByRole("textbox").filter((input) =>
      input.getAttribute("inputmode") === "numeric"
    );

    // timeInputs: [minutes, seconds, distanceMeters]
    const minutesInput = timeInputs[0];
    const secondsInput = timeInputs[1];
    const distanceInput = timeInputs[2];

    await user.clear(minutesInput);
    expect(minutesInput).toHaveValue("");
    await user.type(minutesInput, "11");
    expect(minutesInput).toHaveValue("11");

    await user.clear(secondsInput);
    expect(secondsInput).toHaveValue("");
    await user.type(secondsInput, "50");
    expect(secondsInput).toHaveValue("50");

    await user.clear(distanceInput);
    await user.type(distanceInput, "2400");

    // Submete
    const submitBtn = screen.getByTestId("submit-attempt-btn");
    await user.click(submitBtn);

    expect(handleSave).toHaveBeenCalledTimes(1);
    const savedAttempt = handleSave.mock.calls[0][0] as TafAttempt;
    expect(savedAttempt.distanceMeters).toBe(2400);
    // 11 min 50s = 710 segundos
    expect(savedAttempt.actualDurationSeconds).toBe(710);
  });
});
