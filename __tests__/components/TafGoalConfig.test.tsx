import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TafGoalConfigCard } from "@/components/profile/TafGoalConfigCard";
import { tafService, DEFAULT_GOAL } from "@/lib/services/tafService";

describe("TafGoalConfigCard Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("carrega e renderiza os campos de metas multimodais do edital", async () => {
    vi.spyOn(tafService, "getGoal").mockResolvedValueOnce({
      institutionName: "Polícia Militar SP",
      minDistanceMeters: 2400,
      targetDistanceMeters: 2600,
      targetDurationMinutes: 12,
      targetExamDate: null,
      pullupType: "dinamica",
      pullupMinReps: 4,
      pullupTargetReps: 6,
      pullupDurationSeconds: 60,
      pushupMinReps: 25,
      pushupTargetReps: 35,
      pushupDurationSeconds: 60,
      absMinReps: 35,
      absTargetReps: 45,
      absDurationSeconds: 60,
    });

    render(<TafGoalConfigCard />);

    expect(screen.getByText(/Carregando metas do edital/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Metas do TAF & Edital/i)).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Polícia Militar SP")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2400")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2600")).toBeInTheDocument();
    expect(screen.getByDisplayValue("4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("35").length).toBeGreaterThanOrEqual(1);
  });

  it("permite alterar e salvar as metas com sucesso", async () => {
    vi.spyOn(tafService, "getGoal").mockResolvedValueOnce(DEFAULT_GOAL);
    const saveGoalMock = vi.spyOn(tafService, "saveGoal").mockResolvedValueOnce({
      ...DEFAULT_GOAL,
      institutionName: "PRF",
      minDistanceMeters: 2300,
      targetDistanceMeters: 2500,
    });

    const onSaved = vi.fn();
    render(<TafGoalConfigCard onSaved={onSaved} />);

    await waitFor(() => {
      expect(screen.getByText(/Metas do TAF & Edital/i)).toBeInTheDocument();
    });

    const instInput = screen.getByPlaceholderText(/Ex: Polícia Federal/i);
    fireEvent.change(instInput, { target: { value: "PRF" } });

    const submitBtn = screen.getByRole("button", {
      name: /Salvar Metas do Edital/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveGoalMock).toHaveBeenCalled();
      expect(screen.getByText(/Metas do edital TAF atualizadas com sucesso/i)).toBeInTheDocument();
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("alterna corretamente entre barra dinâmica e barra em isometria", async () => {
    vi.spyOn(tafService, "getGoal").mockResolvedValueOnce({
      ...DEFAULT_GOAL,
      pullupType: "dinamica",
    });

    render(<TafGoalConfigCard />);

    await waitFor(() => {
      expect(screen.getByText(/Metas do TAF & Edital/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Mínimo \(reps\)/i).length).toBe(3);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "isometria" } });

    expect(screen.getByText(/Mínimo \(s\)/i)).toBeInTheDocument();
  });

  it("permite marcar e desmarcar tempo de execução opcional para barra dinâmica", async () => {
    vi.spyOn(tafService, "getGoal").mockResolvedValueOnce({
      ...DEFAULT_GOAL,
      pullupType: "dinamica",
      pullupDurationSeconds: null,
    });

    const saveGoalMock = vi.spyOn(tafService, "saveGoal").mockImplementation(async (g) => g);

    render(<TafGoalConfigCard />);

    await waitFor(() => {
      expect(screen.getByText(/Metas do TAF & Edital/i)).toBeInTheDocument();
    });

    const pullupCheckbox = screen.getByRole("checkbox", {
      name: /Definir tempo máximo para barra/i,
    });
    expect(pullupCheckbox).not.toBeChecked();
    expect(screen.getAllByText(/Sem limite de tempo \(tempo livre\)/i).length).toBeGreaterThanOrEqual(1);

    // Marca o tempo
    fireEvent.click(pullupCheckbox);
    expect(pullupCheckbox).toBeChecked();

    // Atalho de 30s
    const btn30s = screen.getAllByRole("button", { name: "30s" })[0];
    fireEvent.click(btn30s);

    // Salvar
    const submitBtn = screen.getByRole("button", {
      name: /Salvar Metas do Edital/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveGoalMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pullupDurationSeconds: 30,
        })
      );
    });
  });

  it("envia null nos campos de tempo quando as opções estiverem desmarcadas", async () => {
    vi.spyOn(tafService, "getGoal").mockResolvedValueOnce({
      ...DEFAULT_GOAL,
      pullupType: "dinamica",
      pullupDurationSeconds: 60,
      pushupDurationSeconds: 60,
      absDurationSeconds: 60,
    });

    const saveGoalMock = vi.spyOn(tafService, "saveGoal").mockImplementation(async (g) => g);

    render(<TafGoalConfigCard />);

    await waitFor(() => {
      expect(screen.getByText(/Metas do TAF & Edital/i)).toBeInTheDocument();
    });

    const pullupCheckbox = screen.getByRole("checkbox", {
      name: /Definir tempo máximo para barra/i,
    });
    const pushupCheckbox = screen.getByRole("checkbox", {
      name: /Definir tempo máximo para flexão/i,
    });
    const absCheckbox = screen.getByRole("checkbox", {
      name: /Definir tempo máximo para abdominal/i,
    });

    expect(pullupCheckbox).toBeChecked();
    expect(pushupCheckbox).toBeChecked();
    expect(absCheckbox).toBeChecked();

    // Desmarca todos
    fireEvent.click(pullupCheckbox);
    fireEvent.click(pushupCheckbox);
    fireEvent.click(absCheckbox);

    expect(pullupCheckbox).not.toBeChecked();
    expect(pushupCheckbox).not.toBeChecked();
    expect(absCheckbox).not.toBeChecked();

    const submitBtn = screen.getByRole("button", {
      name: /Salvar Metas do Edital/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveGoalMock).toHaveBeenCalledWith(
        expect.objectContaining({
          pullupDurationSeconds: null,
          pushupDurationSeconds: null,
          absDurationSeconds: null,
        })
      );
    });
  });

  it("aplica presets oficiais de concursos corretamente", async () => {
    vi.spyOn(tafService, "getGoal").mockResolvedValueOnce(DEFAULT_GOAL);

    render(<TafGoalConfigCard />);

    await waitFor(() => {
      expect(screen.getByText(/Metas do TAF & Edital/i)).toBeInTheDocument();
    });

    // Clica no preset PM-SP
    const pmspBtn = screen.getByRole("button", { name: /PM-SP/i });
    fireEvent.click(pmspBtn);

    expect(screen.getByDisplayValue(/Polícia Militar SP/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("2400")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2600")).toBeInTheDocument();

    // Clica no preset PF
    const pfBtn = screen.getByRole("button", { name: /^PF$/i });
    fireEvent.click(pfBtn);

    expect(screen.getByDisplayValue(/Polícia Federal \(PF\)/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("2350")).toBeInTheDocument();
  });
});
