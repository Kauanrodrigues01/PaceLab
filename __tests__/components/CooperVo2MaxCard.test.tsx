import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CooperVo2MaxCard } from "@/components/meu-taf/CooperVo2MaxCard";

describe("CooperVo2MaxCard Component", () => {
  it("não deve renderizar nada se a distância for zero ou muito baixa", () => {
    const { container } = render(<CooperVo2MaxCard distanceMeters={400} />);
    expect(container.firstChild).toBeNull();
  });

  it("deve renderizar o card com o VO2 Máx calculado e classificação para 2400m", () => {
    render(
      <CooperVo2MaxCard
        distanceMeters={2400}
        initialAge={25}
        initialGender="M"
      />
    );

    expect(screen.getByTestId("cooper-vo2max-card")).toBeDefined();
    expect(screen.getByText("42.4")).toBeDefined();
    expect(screen.getAllByText("Médio").length).toBeGreaterThan(0);
    expect(screen.getByText(/Consumo máximo de oxigênio calculado para 2.400 m/i)).toBeDefined();
  });

  it("deve alternar a classificação ao mudar o sexo para Feminino", () => {
    render(
      <CooperVo2MaxCard
        distanceMeters={2400}
        initialAge={25}
        initialGender="M"
      />
    );

    // Clica no botão 'Fem'
    const femButton = screen.getByRole("button", { name: "Fem" });
    fireEvent.click(femButton);

    // Para mulheres de 25 anos com 2400m (VO2 42.4), a classificação é 'Excelente'
    expect(screen.getAllByText("Excelente").length).toBeGreaterThan(0);
  });

  it("deve expandir e ocultar a explicação médica ao clicar no botão", () => {
    render(
      <CooperVo2MaxCard
        distanceMeters={2500}
        initialAge={28}
        initialGender="M"
      />
    );

    const toggleButton = screen.getByRole("button", { name: /Como o VO2 Máx ajuda no TAF\?/i });
    fireEvent.click(toggleButton);

    expect(screen.getByText(/Ocultar explicação médica/i)).toBeDefined();
    expect(screen.getByText(/representa o volume máximo de oxigênio/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Ocultar explicação médica/i }));
    expect(screen.queryByText(/representa o volume máximo de oxigênio/i)).toBeNull();
  });
});
