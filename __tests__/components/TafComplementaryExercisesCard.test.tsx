import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TafComplementaryExercisesCard } from "@/components/meu-taf/TafComplementaryExercisesCard";
import { TafGoalConfig } from "@/types";

describe("TafComplementaryExercisesCard Component", () => {
  const baseGoal: TafGoalConfig = {
    institutionName: "Edital Padrão",
    minDistanceMeters: 2400,
    targetDistanceMeters: 2600,
    targetDurationMinutes: 12,
    pullupType: "dinamica",
    pullupMinReps: 3,
    pullupTargetReps: 5,
    pullupDurationSeconds: 60,
    pushupMinReps: 20,
    pushupTargetReps: 30,
    pushupDurationSeconds: 60,
    absMinReps: 30,
    absTargetReps: 40,
    absDurationSeconds: 60,
  };

  it("renderiza o card recolhido inicialmente e expande ao clicar em Visualizar", () => {
    render(<TafComplementaryExercisesCard goal={baseGoal} />);

    expect(screen.getByText(/Exercícios Complementares do TAF/i)).toBeInTheDocument();
    expect(screen.queryByText(/Mínimo do Edital:/i)).not.toBeInTheDocument();

    const toggleBtn = screen.getByRole("button", { name: /Visualizar/i });
    fireEvent.click(toggleBtn);

    expect(screen.getAllByText(/Mínimo do Edital:/i).length).toBe(3);
    expect(screen.getByRole("button", { name: /Recolher/i })).toBeInTheDocument();
  });

  it("exibe informações com tempo máximo estipulado quando cadastrado", () => {
    render(<TafComplementaryExercisesCard goal={baseGoal} />);

    fireEvent.click(screen.getByRole("button", { name: /Visualizar/i }));

    // Barra Dinâmica com tempo
    expect(screen.getByText("Dinâmica (60s)")).toBeInTheDocument();
    expect(screen.getByText(/3 reps em até 60s/i)).toBeInTheDocument();
    expect(screen.getByText(/5 reps em até 60s/i)).toBeInTheDocument();

    // Flexão e Abdominal com tempo
    expect(screen.getAllByText("Até 60s").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/20 reps em até 60s/i)).toBeInTheDocument();
    expect(screen.getAllByText(/30 reps em até 60s/i).length).toBe(2); // Meta flexão e mínimo abdominal
    expect(screen.getByText(/40 reps em até 60s/i)).toBeInTheDocument();
  });

  it("exibe informações com indicação de tempo livre quando o tempo for nulo", () => {
    const freeTimeGoal: TafGoalConfig = {
      ...baseGoal,
      pullupDurationSeconds: null,
      pushupDurationSeconds: null,
      absDurationSeconds: null,
    };

    render(<TafComplementaryExercisesCard goal={freeTimeGoal} />);

    fireEvent.click(screen.getByRole("button", { name: /Visualizar/i }));

    // Barra dinâmica tempo livre
    expect(screen.getByText("Dinâmica (Tempo livre)")).toBeInTheDocument();
    expect(screen.getByText(/3 reps \(tempo livre\)/i)).toBeInTheDocument();
    expect(screen.getByText(/5 reps \(tempo livre\)/i)).toBeInTheDocument();

    // Flexão e Abdominal tempo livre
    expect(screen.getAllByText("Tempo livre").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/20 reps \(tempo livre\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/30 reps \(tempo livre\)/i).length).toBe(2); // Meta flexão e mínimo abdominal
    expect(screen.getByText(/40 reps \(tempo livre\)/i)).toBeInTheDocument();
  });

  it("exibe informações em segundos para barra quando modalidade for isometria", () => {
    const isometriaGoal: TafGoalConfig = {
      ...baseGoal,
      pullupType: "isometria",
      pullupMinSeconds: 20,
      pullupTargetSeconds: 35,
    };

    render(<TafComplementaryExercisesCard goal={isometriaGoal} />);

    fireEvent.click(screen.getByRole("button", { name: /Visualizar/i }));

    expect(screen.getByText("Isometria (Seg)")).toBeInTheDocument();
    expect(screen.getByText("20s")).toBeInTheDocument();
    expect(screen.getByText("35s")).toBeInTheDocument();
  });
});
