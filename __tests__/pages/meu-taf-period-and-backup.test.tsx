import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MeuTafPage from "@/app/meu-taf/page";
import { tafService } from "@/lib/services/tafService";
import { setupMockTafApi } from "@/test/helpers/mockTafApi";

describe("MeuTafPage - Fase F (Comparador de Períodos & Configuração de Meta / Backup)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    setupMockTafApi();
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
  });

  // ─── Testes do Comparador de Períodos ─────────────────────────────────────
  describe("Comparador de Períodos", () => {
    it("navega para a aba Comparar Períodos e exibe aviso de amostragem reduzida com base vazia", async () => {
      const user = userEvent.setup();
      render(<MeuTafPage />);

      const tabComparador = await screen.findByRole("button", {
        name: /Comparar Períodos/i,
      });
      await user.click(tabComparador);

      expect(screen.getByTestId("period-comparator")).toBeInTheDocument();
      expect(screen.getByText(/Comparador de Períodos de Treinamento/i)).toBeInTheDocument();
      expect(screen.getByTestId("low-sample-warning")).toBeInTheDocument();
      expect(
        screen.getByText(/Aviso Metodológico de Amostragem Reduzida/i)
      ).toBeInTheDocument();
    });

    it("permite clicar nos atalhos de 14d, 30d e mensal", async () => {
      const user = userEvent.setup();
      render(<MeuTafPage />);

      const tabComparador = await screen.findByRole("button", {
        name: /Comparar Períodos/i,
      });
      await user.click(tabComparador);

      const btn14d = screen.getByRole("button", { name: /Últimos 14 vs 14 dias/i });
      const btn30d = screen.getByRole("button", { name: /Últimos 30 vs 30 dias/i });
      const btnMonth = screen.getByRole("button", { name: /Este Mês vs Anterior/i });

      await user.click(btn14d);
      expect(screen.getByTestId("period-comparator")).toBeInTheDocument();

      await user.click(btn30d);
      expect(screen.getByTestId("period-comparator")).toBeInTheDocument();

      await user.click(btnMonth);
      expect(screen.getByTestId("period-comparator")).toBeInTheDocument();
    });

    it("calcula deltas comparativos corretamente quando há treinos e simulados nos dois períodos", async () => {
      const user = userEvent.setup();
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const d10 = new Date(now);
      d10.setDate(now.getDate() - 10);
      const date10Ago = d10.toISOString().slice(0, 10);

      const d40 = new Date(now);
      d40.setDate(now.getDate() - 40);
      const date40Ago = d40.toISOString().slice(0, 10);

      // Período A (anterior: ~40 dias atrás): 3 treinos
      await tafService.saveTraining({
        id: "trn-old-1",
        sessionDate: `${date40Ago}T07:00:00.000Z`,
        activityType: "corrida_continua",
        distanceKm: 4.0,
        durationSeconds: 1440,
        speedKmh: 10.0,
        paceSeconds: 360,
        paceFormatted: "6:00",
        perceivedEffort: 7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await tafService.saveTraining({
        id: "trn-old-2",
        sessionDate: `${date40Ago}T08:00:00.000Z`,
        activityType: "corrida_continua",
        distanceKm: 5.0,
        durationSeconds: 1800,
        speedKmh: 10.0,
        paceSeconds: 360,
        paceFormatted: "6:00",
        perceivedEffort: 8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await tafService.saveAttempt({
        id: "taf-old-1",
        testDate: `${date40Ago}T09:00:00.000Z`,
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2100,
        speedKmh: 10.5,
        paceSeconds: 343,
        paceFormatted: "5:43",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Período B (recente: ~10 dias atrás): 3 treinos com melhora
      await tafService.saveTraining({
        id: "trn-new-1",
        sessionDate: `${date10Ago}T07:00:00.000Z`,
        activityType: "corrida_continua",
        distanceKm: 6.0,
        durationSeconds: 1800,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "5:00",
        perceivedEffort: 6,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await tafService.saveTraining({
        id: "trn-new-2",
        sessionDate: `${date10Ago}T08:00:00.000Z`,
        activityType: "corrida_continua",
        distanceKm: 8.0,
        durationSeconds: 2400,
        speedKmh: 12.0,
        paceSeconds: 300,
        paceFormatted: "5:00",
        perceivedEffort: 7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await tafService.saveAttempt({
        id: "taf-new-1",
        testDate: `${todayStr}T09:00:00.000Z`,
        targetDurationSeconds: 720,
        actualDurationSeconds: 720,
        distanceMeters: 2350,
        speedKmh: 11.75,
        paceSeconds: 306,
        paceFormatted: "5:06",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<MeuTafPage />);

      const tabComparador = await screen.findByRole("button", {
        name: /Comparar Períodos/i,
      });
      await user.click(tabComparador);

      // Clica no atalho de 30 dias para englobar os períodos
      const btn30d = screen.getByRole("button", { name: /Últimos 30 vs 30 dias/i });
      await user.click(btn30d);

      // Diagnóstico de evolução presente
      expect(
        screen.getByText(/Diagnóstico de Evolução do Período/i)
      ).toBeInTheDocument();

      // Diferença do melhor TAF exibida (+250 m)
      expect(screen.getByText("+250 m")).toBeInTheDocument();
    });
  });

  // ─── Testes de Configuração de Meta & Backup ──────────────────────────────
  describe("Configuração de Meta & Central de Backup", () => {
    it("navega para a aba Meta & Banco e exibe os valores padrões e ritmos de aprovação", async () => {
      const user = userEvent.setup();
      render(<MeuTafPage />);

      const tabConfig = await screen.findByRole("button", { name: /Meta & Banco/i });
      await user.click(tabConfig);

      const configContainer = screen.getByTestId("goal-and-backup-settings");
      expect(configContainer).toBeInTheDocument();
      expect(
        within(configContainer).getByText(/Meta da Prova Física \(TAF\)/i)
      ).toBeInTheDocument();

      // Ritmos exigidos em tempo real para 2.300 m em 12 min (125s por volta na pista de 400m = 2:05)
      expect(within(configContainer).getByText(/5:13/i)).toBeInTheDocument();
      expect(within(configContainer).getByText(/11.50/i)).toBeInTheDocument();
      expect(within(configContainer).getByText(/2:05/i)).toBeInTheDocument();
    });

    it("permite alterar a meta da prova e salva com sucesso", async () => {
      const user = userEvent.setup();
      render(<MeuTafPage />);

      const tabConfig = await screen.findByRole("button", { name: /Meta & Banco/i });
      await user.click(tabConfig);

      const distanceInput = screen.getByLabelText(/Distância Exigida no Edital/i);
      await user.clear(distanceInput);
      await user.type(distanceInput, "2400");

      const saveBtn = screen.getByRole("button", {
        name: /Salvar Configuração da Meta/i,
      });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByTestId("toast-notification")).toHaveTextContent(
          /Meta da prova física atualizada com sucesso/i
        );
      });

      // Verifica se a meta salva no banco de dados (Supabase) foi atualizada para 2400m
      const storedGoal = await tafService.getGoal();
      expect(storedGoal.targetDistanceMeters).toBe(2400);
    });

    it("permite disparar a exportação de Backup JSON e planilhas CSV", async () => {
      const user = userEvent.setup();
      render(<MeuTafPage />);

      const tabConfig = await screen.findByRole("button", { name: /Meta & Banco/i });
      await user.click(tabConfig);

      const exportJsonBtn = screen.getByRole("button", {
        name: /Backup Completo \(JSON\)/i,
      });
      await user.click(exportJsonBtn);

      await waitFor(() => {
        expect(screen.getByTestId("toast-notification")).toHaveTextContent(
          /Backup JSON exportado com sucesso/i
        );
      });

      const exportAttemptsCsvBtn = screen.getByRole("button", {
        name: /Simulados TAF \(CSV\)/i,
      });
      await user.click(exportAttemptsCsvBtn);

      await waitFor(() => {
        expect(screen.getByTestId("toast-notification")).toHaveTextContent(
          /Planilha CSV de simulados exportada/i
        );
      });

      const exportTrainingsCsvBtn = screen.getByRole("button", {
        name: /Diário de Treinos \(CSV\)/i,
      });
      await user.click(exportTrainingsCsvBtn);

      await waitFor(() => {
        expect(screen.getByTestId("toast-notification")).toHaveTextContent(
          /Planilha CSV de treinos exportada/i
        );
      });
    });

    it("executa teste de conexão com o banco Supabase", async () => {
      const user = userEvent.setup();
      render(<MeuTafPage />);

      const tabConfig = await screen.findByRole("button", { name: /Meta & Banco/i });
      await user.click(tabConfig);

      const testDbBtn = screen.getByRole("button", { name: /Testar Conexão/i });
      await user.click(testDbBtn);

      await waitFor(() => {
        expect(screen.getByTestId("toast-notification")).toHaveTextContent(
          /Conexão ativa com PostgreSQL via Prisma ORM!/i
        );
      });
    });

    it("exibe aviso quando o teste de conexão com o banco falha", async () => {
      const user = userEvent.setup();
      render(<MeuTafPage />);

      const tabConfig = await screen.findByRole("button", { name: /Meta & Banco/i });
      await user.click(tabConfig);

      // Simula falha na rota de health
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/taf/health")) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ status: "error", error: "Database offline" }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      });

      const testDbBtn = screen.getByRole("button", { name: /Testar Conexão/i });
      await user.click(testDbBtn);

      await waitFor(() => {
        expect(screen.getByTestId("toast-notification")).toHaveTextContent(
          /Não foi possível conectar ao banco de dados Supabase/i
        );
      });
    });

    it("permite importar arquivo JSON de restauração de backup", async () => {
      const user = userEvent.setup();
      render(<MeuTafPage />);

      const tabConfig = await screen.findByRole("button", { name: /Meta & Banco/i });
      await user.click(tabConfig);

      const fileInput = screen.getByTestId("backup-file-input");
      const backupJsonContent = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        appName: "PaceLab",
        goal: {
          targetDistanceMeters: 2500,
          targetDurationMinutes: 12,
        },
        attempts: [
          {
            id: "taf-imported-1",
            testDate: "2026-10-10T08:00:00.000Z",
            targetDurationSeconds: 720,
            actualDurationSeconds: 720,
            distanceMeters: 2350,
            speedKmh: 11.75,
            paceSeconds: 306,
            paceFormatted: "5:06",
            createdAt: "2026-10-10T08:00:00.000Z",
            updatedAt: "2026-10-10T08:00:00.000Z",
          },
        ],
        trainings: [],
      });

      const file = new File([backupJsonContent], "pacelab-backup.json", {
        type: "application/json",
      });
      file.text = vi.fn().mockResolvedValue(backupJsonContent);

      await user.upload(fileInput, file);

      await waitFor(() => {
        expect(screen.getByTestId("toast-notification")).toHaveTextContent(
          /Backup restaurado com sucesso: 1 simulados e 0 treinos carregados!/i
        );
      });
    });
  });
});
