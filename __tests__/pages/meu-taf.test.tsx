import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MeuTafPage from "@/app/meu-taf/page";
import { tafService } from "@/lib/services/tafService";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";

describe("MeuTafPage - Fase C (Histórico de 12 Minutos e Interface do TAF)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    setupMockTafApi();
  });

  it("renderiza o cabeçalho, status offline/banco e KPIs iniciais vazios", async () => {
    render(<MeuTafPage />);

    // Header principal
    expect(await screen.findByRole("heading", { name: "Meu TAF" })).toBeInTheDocument();
    expect(
      screen.getByText(/Guarda Municipal de Fortaleza — TAF 12 Min/i)
    ).toBeInTheDocument();

    // Status de banco
    expect(screen.getByTestId("db-status-badge")).toHaveTextContent(
      "Supabase • PostgreSQL Conectado"
    );

    // KPIs iniciais
    expect(screen.getByText("Recorde 12 Min")).toBeInTheDocument();
    expect(screen.getByText("Nenhum teste ainda")).toBeInTheDocument();
    expect(screen.getByText("Simulados Feitos")).toBeInTheDocument();
    expect(screen.getByText("Sem registros")).toBeInTheDocument();

    // Estado vazio da lista
    expect(screen.getByTestId("taf-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText(/Você ainda não registrou nenhum simulado de 12 minutos/i)
    ).toBeInTheDocument();
  });

  it("permite registrar um novo teste de 12 minutos e calcula pace/velocidade em tempo real", async () => {
    const user = userEvent.setup();
    render(<MeuTafPage />);

    await screen.findByRole("heading", { name: "Meu TAF" });

    // Formulário presente
    const form = screen.getByTestId("taf-attempt-form");
    expect(form).toBeInTheDocument();

    // Clica no atalho rápido de 2.400m
    const shortcut2400 = screen.getByRole("button", { name: /2\.400 m/i });
    await user.click(shortcut2400);

    // Verifica que a prévia de desempenho calculou em tempo real
    // 2400m em 12min -> pace 5:00 /km e velocidade 12.00 km/h
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("12.00")).toBeInTheDocument();
    expect(screen.getByText("+100m")).toBeInTheDocument(); // meta é 2300m

    // Badge informativo de novo recorde pessoal antes de salvar
    expect(
      screen.getByText(/Este teste será o seu novo/i)
    ).toBeInTheDocument();

    // Submete o formulário
    const submitBtn = screen.getByTestId("submit-attempt-btn");
    await user.click(submitBtn);

    // Toast de sucesso
    expect(
      await screen.findByText("Novo teste registrado no histórico com sucesso!")
    ).toBeInTheDocument();

    // O card do teste agora aparece na lista
    expect(screen.getByText("2.400")).toBeInTheDocument();
    expect(screen.getByTestId("badge-record")).toHaveTextContent("Recorde Pessoal");
    expect(screen.getByTestId("badge-meta-pass")).toHaveTextContent("Meta Atingida");

    // KPI atualizado no topo
    expect(screen.getAllByText("Meta Atingida! 🎉")[0]).toBeInTheDocument();
    expect(screen.getByText("1 teste registrado")).toBeInTheDocument();
  });

  it("permite registrar parciais de voltas de 400m com validação e expansão no card", async () => {
    const user = userEvent.setup();
    render(<MeuTafPage />);

    await screen.findByRole("heading", { name: "Meu TAF" });

    // Seleciona 2.400m (6 voltas exatas de 400m)
    const shortcut2400 = screen.getByRole("button", { name: /2\.400 m/i });
    await user.click(shortcut2400);

    // Ativa checkbox de parciais
    const lapsCheckbox = screen.getByLabelText(/Registrar parciais de voltas/i);
    await user.click(lapsCheckbox);

    // Voltas geradas automaticamente (6 voltas de 400m a 120s cada)
    expect(screen.getByText("Volta 1 (400m)")).toBeInTheDocument();
    expect(screen.getByText("Volta 6 (400m)")).toBeInTheDocument();

    // Submete
    const submitBtn = screen.getByTestId("submit-attempt-btn");
    await user.click(submitBtn);

    // Card exibido
    await screen.findByText("2.400");
    const toggleLapsBtn = screen.getByRole("button", {
      name: /Ver parciais \(6 voltas registradas\)/i,
    });
    expect(toggleLapsBtn).toBeInTheDocument();

    // Expande parciais
    await user.click(toggleLapsBtn);
    expect(screen.getByText("Volta 1 (400m):")).toBeInTheDocument();
    expect(screen.getByText("Volta 6 (400m):")).toBeInTheDocument();
  });

  it("permite editar um teste existente e recalcula o histórico", async () => {
    const user = userEvent.setup();

    // Pré-popula uma tentativa inicial
    await tafService.saveAttempt({
      id: "teste-edit-1",
      testDate: "2026-10-10T08:00:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2200,
      speedKmh: 11.0,
      paceSeconds: 327,
      paceFormatted: "5:27",
      locationType: "Pista de Atletismo (400m)",
      notes: "Treino inicial moderado",
      createdAt: "2026-10-10T08:00:00.000Z",
      updatedAt: "2026-10-10T08:00:00.000Z",
    });

    render(<MeuTafPage />);

    await screen.findByText("2.200");
    expect(screen.getByTestId("badge-meta-deficit")).toHaveTextContent("Faltam 100m");

    // Clica no botão de editar
    const editBtn = screen.getByTitle("Editar este teste");
    await user.click(editBtn);

    // Formulário entra em modo de edição
    expect(
      screen.getByRole("heading", { name: "Editar Teste do TAF" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar Edição" })).toBeInTheDocument();

    // Altera a distância para 2.500m
    const shortcut2500 = screen.getByRole("button", { name: /2\.500 m/i });
    await user.click(shortcut2500);

    // Salva alteração
    const saveBtn = screen.getByTestId("submit-attempt-btn");
    await user.click(saveBtn);

    // Verifica confirmação e atualização
    expect(
      await screen.findByText("Teste atualizado com sucesso!")
    ).toBeInTheDocument();
    expect(screen.getByText("2.500")).toBeInTheDocument();
    expect(screen.getByTestId("badge-meta-pass")).toHaveTextContent("Meta Atingida");
  });

  it("permite excluir um teste com diálogo de confirmação e atualiza a contagem", async () => {
    const user = userEvent.setup();

    // Pré-popula uma tentativa inicial
    await tafService.saveAttempt({
      id: "teste-delete-1",
      testDate: "2026-10-10T08:00:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2150,
      speedKmh: 10.75,
      paceSeconds: 335,
      paceFormatted: "5:35",
      createdAt: "2026-10-10T08:00:00.000Z",
      updatedAt: "2026-10-10T08:00:00.000Z",
    });

    render(<MeuTafPage />);

    await screen.findByText("2.150");

    // Clica no botão de excluir
    const deleteBtn = screen.getByTitle("Excluir teste");
    await user.click(deleteBtn);

    // Diálogo de confirmação aparece
    expect(
      screen.getByText(/Excluir este teste de 2150m\?/i)
    ).toBeInTheDocument();

    // Confirma exclusão
    const confirmDeleteBtn = screen.getByRole("button", { name: "Sim, Excluir" });
    await user.click(confirmDeleteBtn);

    // Toast de confirmação e volta ao empty state
    expect(await screen.findByText("Teste excluído com sucesso.")).toBeInTheDocument();
    expect(screen.getByTestId("taf-empty-state")).toBeInTheDocument();
  });

  it("filtra tentativas por duração (12 Minutos vs Outras durações)", async () => {
    const user = userEvent.setup();

    // Teste de 12 min (720s)
    await tafService.saveAttempt({
      id: "teste-12m",
      testDate: "2026-10-09T08:00:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2350,
      speedKmh: 11.75,
      paceSeconds: 306,
      paceFormatted: "5:06",
      createdAt: "2026-10-09T08:00:00.000Z",
      updatedAt: "2026-10-09T08:00:00.000Z",
    });

    // Teste de 10 min (600s)
    await tafService.saveAttempt({
      id: "teste-10m",
      testDate: "2026-10-10T08:00:00.000Z",
      targetDurationSeconds: 600,
      actualDurationSeconds: 600,
      distanceMeters: 1950,
      speedKmh: 11.7,
      paceSeconds: 308,
      paceFormatted: "5:08",
      createdAt: "2026-10-10T08:00:00.000Z",
      updatedAt: "2026-10-10T08:00:00.000Z",
    });

    render(<MeuTafPage />);

    // Padrão: filtro '12 Minutos (TAF)' ativo -> deve exibir o de 2350m mas não o de 1950m
    await screen.findByText("2.350");
    expect(screen.queryByText("1.950")).not.toBeInTheDocument();

    // Clica no filtro 'Outras durações'
    const otherFilter = screen.getByRole("button", { name: "Outras durações" });
    await user.click(otherFilter);

    // Agora deve exibir o de 1950m e esconder o de 2350m
    expect(screen.getByText("1.950")).toBeInTheDocument();
    expect(screen.queryByText("2.350")).not.toBeInTheDocument();

    // Clica no filtro 'Todos'
    const allFilter = screen.getByRole("button", { name: "Todos" });
    await user.click(allFilter);

    // Exibe ambos
    expect(screen.getByText("2.350")).toBeInTheDocument();
    expect(screen.getByText("1.950")).toBeInTheDocument();
  });

  it("exibe mensagem de erro e não reseta campos se a API do Supabase falhar ao salvar", async () => {
    const user = userEvent.setup();
    render(<MeuTafPage />);

    await screen.findByRole("heading", { name: "Meu TAF" });

    // Força a API a retornar erro 500 no POST de tentativa
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/taf/attempts") && init?.method === "POST") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Falha de conexão com o Supabase" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    const shortcut2400 = screen.getByRole("button", { name: /2\.400 m/i });
    await user.click(shortcut2400);

    const submitBtn = screen.getByTestId("submit-attempt-btn");
    await user.click(submitBtn);

    // Mensagem de erro exibida no formulário e no toast
    expect(await screen.findByTestId("form-error-message")).toHaveTextContent(
      "Falha de conexão com o Supabase"
    );
    expect(screen.getByTestId("toast-notification")).toHaveTextContent(
      "Falha de conexão com o Supabase"
    );

    // Prévia calculada continua mantida
    expect(screen.getByText("5:00")).toBeInTheDocument();
  });
});
