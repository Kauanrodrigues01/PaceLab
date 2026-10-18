import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TafApprovalRuler } from "@/components/meu-taf/TafApprovalRuler";

describe("TafApprovalRuler Component", () => {
  it("deve renderizar status de Reprovado/Abaixo do corte se distância for menor que o mínimo", () => {
    render(
      <TafApprovalRuler
        currentDistance={2100}
        minDistance={2400}
        targetDistance={2600}
        institutionName="PMCE"
      />
    );

    expect(screen.getByTestId("taf-approval-ruler")).toBeDefined();
    expect(screen.getByText(/PMCE/i)).toBeDefined();
    expect(screen.getByText(/Abaixo do Edital \(300m restantes\)/i)).toBeDefined();
  });

  it("deve renderizar status de Aprovado no Corte se distância estiver entre o corte e a meta", () => {
    render(
      <TafApprovalRuler
        currentDistance={2450}
        minDistance={2400}
        targetDistance={2600}
      />
    );

    expect(screen.getByText(/Aprovado no Corte \(\+50m\)/i)).toBeDefined();
    expect(screen.getByText(/Faltam apenas 150m para a meta de segurança/i)).toBeDefined();
  });

  it("deve renderizar status de Zona de Segurança Garantida se atingir a meta", () => {
    render(
      <TafApprovalRuler
        currentDistance={2700}
        minDistance={2400}
        targetDistance={2600}
      />
    );

    expect(screen.getByText(/Zona de Segurança Garantida!/i)).toBeDefined();
    expect(screen.getByText(/\+100m além da sua meta pessoal!/i)).toBeDefined();
  });

  it("deve ativar layout anti-colisão quando o corte e a meta estiverem muito próximos", () => {
    render(
      <TafApprovalRuler
        currentDistance={2410}
        minDistance={2400}
        targetDistance={2420}
        institutionName="PF"
      />
    );

    expect(screen.getByTestId("taf-approval-ruler")).toBeDefined();
    expect(screen.getByText(/Corte \(2400m\)/i)).toBeDefined();
    expect(screen.getByText(/Meta \(2420m\)/i)).toBeDefined();
    expect(screen.getByText(/Aprovado no Corte \(\+10m\)/i)).toBeDefined();
  });

  it("deve renderizar de forma segura quando a distância for 0m (sem simulado)", () => {
    render(
      <TafApprovalRuler
        currentDistance={0}
        minDistance={2400}
        targetDistance={2600}
      />
    );

    expect(screen.getByTestId("taf-approval-ruler")).toBeDefined();
    expect(screen.getByText(/Abaixo do Edital \(2400m restantes\)/i)).toBeDefined();
    // O pin do troféu não deve estar presente quando distância for 0
    expect(screen.queryByTestId("athlete-pin")).toBeNull();
  });

  it("deve renderizar corretamente quando a distância superar com folga a meta (ex: 3500m)", () => {
    render(
      <TafApprovalRuler
        currentDistance={3500}
        minDistance={2400}
        targetDistance={2800}
      />
    );

    expect(screen.getByText(/Zona de Segurança Garantida!/i)).toBeDefined();
    expect(screen.getByText(/\+700m além da sua meta pessoal!/i)).toBeDefined();
    expect(screen.getByText(/3\.500 m/i)).toBeDefined();
  });
});

