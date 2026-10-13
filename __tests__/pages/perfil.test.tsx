import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PerfilPage from "@/app/perfil/page";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";

// Mock do Recharts ResponsiveContainer para evitar erros de dimensionamento no jsdom
vi.mock("recharts", async () => {
  const original = await vi.importActual<Record<string, unknown>>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
        {children}
      </div>
    ),
  };
});

describe("PerfilPage Component", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setupMockTafApi({
      profile: {
        id: "prof_1",
        name: "Kauan Atleta",
        heightCm: 180,
        currentWeightKg: 75,
        birthDate: "1998-04-15",
        gender: "masculino",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      weights: [
        {
          id: "w_1",
          weightKg: 75.0,
          recordedAt: new Date().toISOString(),
          source: "weekly_prompt",
          notes: "Pesagem oficial",
          createdAt: new Date().toISOString(),
        },
        {
          id: "w_2",
          weightKg: 76.5,
          recordedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
          source: "manual",
          notes: "Início",
          createdAt: new Date().toISOString(),
        },
      ],
    });
  });

  it("renderiza o cabeçalho, dados biométricos e histórico de pesagens", async () => {
    render(<PerfilPage />);

    await waitFor(() => {
      expect(screen.getByText(/Atleta Kauan Atleta/i)).toBeInTheDocument();
    });

    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("180")).toBeInTheDocument();
    // 75 / (1.8^2) = 23.1 (Peso normal)
    expect(screen.getByText("23.1")).toBeInTheDocument();
    expect(screen.getByText("Peso normal")).toBeInTheDocument();
    expect(screen.getByText(/Histórico de Pesagens \(2\)/i)).toBeInTheDocument();
  });

  it("abre e fecha formulário de edição de dados biométricos", async () => {
    render(<PerfilPage />);

    await waitFor(() => {
      expect(screen.getByText(/Atleta Kauan Atleta/i)).toBeInTheDocument();
    });

    const editBtn = screen.getByRole("button", { name: /Editar Dados/i });
    fireEvent.click(editBtn);

    expect(screen.getByText("Editar Dados Biométricos do Atleta")).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: /Cancelar/i });
    fireEvent.click(cancelBtn);

    expect(
      screen.queryByText("Editar Dados Biométricos do Atleta")
    ).not.toBeInTheDocument();
  });

  it("abre formulário de nova pesagem e registra um novo peso", async () => {
    render(<PerfilPage />);

    await waitFor(() => {
      expect(screen.getByText(/Atleta Kauan Atleta/i)).toBeInTheDocument();
    });

    const newWeightBtn = screen.getByRole("button", { name: /Nova Pesagem/i });
    fireEvent.click(newWeightBtn);

    expect(screen.getByText("Registrar Nova Pesagem Corporal")).toBeInTheDocument();

    const weightInput = screen.getByPlaceholderText(/Ex: 72.3/i);
    fireEvent.change(weightInput, { target: { value: "74.2" } });

    const submitBtn = screen.getByRole("button", { name: /Registrar Pesagem/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Pesagem registrada com sucesso!")).toBeInTheDocument();
    });
  });
});
