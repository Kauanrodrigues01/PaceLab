import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PerfilPage from "@/app/perfil/page";
import { profileService } from "@/lib/services/profileService";
import { setupMockTafApi } from "@/__tests__/helpers/mockTafApi";

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

  it("permite excluir e cancelar exclusão de pesagem usando confirmação inline sem window.confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<PerfilPage />);

    await waitFor(() => {
      expect(screen.getByText(/Histórico de Pesagens \(2\)/i)).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", {
      name: /Excluir pesagem/i,
    });
    fireEvent.click(deleteButtons[0]);

    expect(confirmSpy).not.toHaveBeenCalled();

    // Cancela primeiro
    const cancelBtn = screen.getByRole("button", {
      name: "Cancelar exclusão da pesagem",
    });
    fireEvent.click(cancelBtn);
    expect(screen.getByText(/Histórico de Pesagens \(2\)/i)).toBeInTheDocument();

    // Inicia novamente e confirma
    fireEvent.click(
      screen.getAllByRole("button", { name: /Excluir pesagem/i })[0]
    );
    const confirmBtn = screen.getByRole("button", {
      name: "Confirmar exclusão da pesagem",
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText(/Histórico de Pesagens \(1\)/i)).toBeInTheDocument();
    });
  });

  it("limpa confirmação inline e exibe erro se a exclusão falhar na API", async () => {
    vi.spyOn(profileService, "deleteWeightRecord").mockRejectedValueOnce(
      new Error("Erro ao remover pesagem")
    );

    render(<PerfilPage />);

    await waitFor(() => {
      expect(screen.getByText(/Histórico de Pesagens \(2\)/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Excluir pesagem/i })[0]);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar exclusão da pesagem" })
    );

    await waitFor(() => {
      expect(screen.getByText("Erro ao remover pesagem")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Confirmar exclusão da pesagem" })
      ).not.toBeInTheDocument();
    });
  });

  it("impede duplo envio simultâneo ao confirmar exclusão de pesagem", async () => {
    let resolveDelete!: () => void;
    const deleteMock = vi
      .spyOn(profileService, "deleteWeightRecord")
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve;
          })
      );

    render(<PerfilPage />);

    await waitFor(() => {
      expect(screen.getByText(/Histórico de Pesagens \(2\)/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Excluir pesagem/i })[0]);
    const confirmBtn = screen.getByRole("button", {
      name: "Confirmar exclusão da pesagem",
    });

    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    expect(deleteMock).toHaveBeenCalledTimes(1);

    resolveDelete();
    await waitFor(() => {
      expect(screen.getByText(/Histórico de Pesagens \(1\)/i)).toBeInTheDocument();
    });
  });

  it("registra nova pesagem em meio-dia Fortaleza (T15:00:00.000Z) e exibe a data sem D-1", async () => {
    const { container } = render(<PerfilPage />);

    await waitFor(() => {
      expect(screen.getByText(/Atleta Kauan Atleta/i)).toBeInTheDocument();
    });

    const addSpy = vi.spyOn(profileService, "addWeightRecord");

    fireEvent.click(screen.getByRole("button", { name: /Nova Pesagem/i }));

    fireEvent.change(screen.getByPlaceholderText("Ex: 72.3"), {
      target: { value: "73.4" },
    });

    const dateInput = container.querySelector('input[type="date"]');
    expect(dateInput).not.toBeNull();
    fireEvent.change(dateInput!, { target: { value: "2026-10-18" } });

    fireEvent.click(screen.getByRole("button", { name: /Registrar Pesagem/i }));

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          weightKg: 73.4,
          recordedAt: "2026-10-18T15:00:00.000Z",
        })
      );
      expect(screen.getAllByText("18/10/2026").length).toBeGreaterThanOrEqual(1);
    });
  });
});
