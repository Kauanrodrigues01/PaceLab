/**
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import TreinosPage from "@/app/treinos/page";
import MeuTafPage from "@/app/meu-taf/page";
import { TrainingCard } from "@/components/treinos/TrainingCard";
import { TafAttemptCard } from "@/components/meu-taf/TafAttemptCard";
import { TrainingList } from "@/components/treinos/TrainingList";
import { GoalAndBackupSettings } from "@/components/meu-taf/GoalAndBackupSettings";
import { TafAttemptForm } from "@/components/meu-taf/TafAttemptForm";
import { GpxImportPanel } from "@/components/treinos/GpxImportPanel";
import { tafService, TafApiError, DEFAULT_GOAL } from "@/lib/services/tafService";
import { profileService } from "@/lib/services/profileService";
import {
  clearCrossPageSheetsCaches,
  formatBatchImportToast,
  formatSheetsSyncBadge,
  formatSheetsSyncReportSummary,
  getSheetsSyncErrorMessage,
  combineTitleAndNotes,
  buildMirroredTafNotes,
} from "@/lib/sheetsSyncUi";
import type { SheetsSyncReport, SheetsSyncStatus } from "@/lib/googleSheets/types";
import type { ActivityParsePreview, TafAttempt, TrainingSession } from "@/types";

function makeTraining(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: "trn-1",
    source: "manual",
    externalId: null,
    syncedToSheetsAt: null,
    sessionDate: "2026-10-10T10:00:00.000Z",
    activityType: "corrida_continua",
    distanceKm: 6,
    durationSeconds: 1800,
    speedKmh: 12,
    paceSeconds: 300,
    paceFormatted: "5:00",
    splits: [],
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T10:00:00.000Z",
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<TafAttempt> = {}): TafAttempt {
  return {
    id: "att-1",
    source: "manual",
    externalId: null,
    syncedToSheetsAt: null,
    testDate: "2026-10-11T09:00:00.000Z",
    targetDurationSeconds: 720,
    actualDurationSeconds: 720,
    distanceMeters: 2600,
    speedKmh: 13,
    paceSeconds: 277,
    paceFormatted: "4:37",
    laps: [],
    createdAt: "2026-10-11T09:00:00.000Z",
    updatedAt: "2026-10-11T09:00:00.000Z",
    ...overrides,
  };
}

function makeSyncReport(overrides: Partial<SheetsSyncReport> = {}): SheetsSyncReport {
  return {
    direction: "bidirectional",
    forceFullResync: false,
    pulledUpdated: 1,
    pulledCreated: 1,
    pulledLinked: 0,
    pushedAppended: 2,
    pushedUpdated: 0,
    tafPulledUpdated: 0,
    tafPulledCreated: 0,
    tafPulledLinked: 0,
    tafPushedAppended: 0,
    tafPushedUpdated: 0,
    profileSynced: false,
    skipped: 0,
    warnings: [],
    durationMs: 145,
    syncedAt: "2026-10-15T14:30:00.000Z",
    ...overrides,
  };
}

function makeTafPreview(
  overrides: Partial<ActivityParsePreview> = {}
): ActivityParsePreview {
  return {
    source: "gpx_upload",
    filesUsed: ["gpx"],
    name: "Simulado 12 Min Pista",
    rawType: "running",
    sourceActivityKind: "run",
    isIndoor: false,
    startedAt: "2026-10-14T08:00:00.000Z",
    distanceKm: 3.1,
    durationSeconds: 900,
    elapsedSeconds: 920,
    speedKmh: 12.4,
    paceSeconds: 290,
    paceFormatted: "4:50",
    avgHeartRate: 172,
    maxHeartRate: 188,
    avgCadence: 180,
    elevationGainM: 12,
    activeCalories: 285,
    avgTemperatureC: null,
    splits: [],
    laps: [
      {
        lapNumber: 1,
        distanceMeters: 1200,
        durationSeconds: 360,
        paceFormatted: "5:00",
      },
    ],
    externalId: "gpx-ext-sync-01",
    pointCount: 250,
    warnings: [],
    alreadyExists: false,
    existingTrainingId: null,
    alreadyExistsAttempt: false,
    existingAttemptId: null,
    suggestedActivityType: "tempo_run",
    suggestedNotes: "Ritmo constante",
    allowedActivityTypes: [
      "rodagem_leve",
      "corrida_continua",
      "tempo_run",
      "corrida_intervalada",
      "longao",
    ],
    tafWindow: {
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2640,
      speedKmh: 13.2,
      paceSeconds: 273,
      paceFormatted: "4:33",
      avgHeartRate: 174,
      maxHeartRate: 189,
      windowStartOffsetSeconds: 0,
      windowEndOffsetSeconds: 720,
      isShorterThanTarget: false,
      laps: [
        {
          lapNumber: 1,
          distanceMeters: 1200,
          durationSeconds: 328,
          paceFormatted: "4:33",
        },
      ],
    },
    ...overrides,
  };
}

describe("Fase 6 — Frontend & UX: Sincronização Google Sheets", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Badges de Status e Origem em Cards", () => {
    it("exibe selo 'Sheets ✓' com tooltip formatado e origem 'Google Sheets' em TrainingCard", () => {
      const sheetsTraining = makeTraining({
        id: "trn-sheets-1",
        source: "sheets",
        syncedToSheetsAt: "2026-10-15T15:00:00.000Z",
      });

      render(
        <TrainingCard
          training={sheetsTraining}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByTestId("badge-source")).toHaveTextContent(
        "Google Sheets"
      );
      const syncBadge = screen.getByTestId("sheets-sync-badge");
      expect(syncBadge).toHaveTextContent("Sheets ✓");
      expect(syncBadge).toHaveAttribute("data-synced", "true");
      expect(syncBadge.getAttribute("title")).toMatch(
        /Sincronizado com Google Sheets em/i
      );
    });

    it("exibe selo 'Pendente Sheets' e omite badge de origem em treino manual sem syncedToSheetsAt", () => {
      const manualTraining = makeTraining({
        source: "manual",
        syncedToSheetsAt: null,
      });

      render(
        <TrainingCard
          training={manualTraining}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.queryByTestId("badge-source")).not.toBeInTheDocument();
      const syncBadge = screen.getByTestId("sheets-sync-badge");
      expect(syncBadge).toHaveTextContent("Pendente Sheets");
      expect(syncBadge).toHaveAttribute("data-synced", "false");
    });

    it("exibe selo de sincronização e origem 'Google Sheets' no TafAttemptCard", () => {
      const syncedAttempt = makeAttempt({
        source: "sheets",
        syncedToSheetsAt: "2026-10-15T15:10:00.000Z",
      });

      const { rerender } = render(
        <TafAttemptCard
          attempt={syncedAttempt}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByTestId("taf-badge-source")).toHaveTextContent(
        "Google Sheets"
      );
      expect(screen.getByTestId("sheets-sync-badge")).toHaveTextContent(
        "Sheets ✓"
      );

      rerender(
        <TafAttemptCard
          attempt={makeAttempt({ source: "manual", syncedToSheetsAt: null })}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(
        screen.queryByTestId("taf-badge-source")
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("sheets-sync-badge")).toHaveTextContent(
        "Pendente Sheets"
      );
    });
  });

  describe("2. Filtro por Origem 'sheets' na TrainingList", () => {
    it("filtra corretamente os treinos importados do Google Sheets via botão filter-source-sheets", async () => {
      const user = userEvent.setup();
      const trainings = [
        makeTraining({ id: "trn-manual", source: "manual", notes: "Treino local" }),
        makeTraining({
          id: "trn-sheets",
          source: "sheets",
          notes: "Treino vindo do Sheets",
          syncedToSheetsAt: "2026-10-15T12:00:00.000Z",
        }),
      ];

      render(
        <TrainingList
          trainings={trainings}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(screen.getByTestId("training-card-trn-manual")).toBeInTheDocument();
      expect(screen.getByTestId("training-card-trn-sheets")).toBeInTheDocument();

      const sheetsFilterBtn = screen.getByTestId("filter-source-sheets");
      expect(sheetsFilterBtn).toHaveTextContent("Google Sheets");
      await user.click(sheetsFilterBtn);

      expect(
        screen.queryByTestId("training-card-trn-manual")
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("training-card-trn-sheets")).toBeInTheDocument();
    });
  });

  describe("3. Botão 'Sincronizar Planilha' em /treinos", () => {
    it("executa sync bidirecional, exibe toast de resumo, limpa cache e recarrega lista", async () => {
      const user = userEvent.setup();
      const initialTraining = makeTraining({
        id: "trn-initial",
        source: "manual",
      });
      const syncedTraining = makeTraining({
        id: "trn-from-sheets",
        source: "sheets",
        syncedToSheetsAt: "2026-10-15T14:30:00.000Z",
        notes: "Treino puxado do Sheets",
      });

      const getTrainingsSpy = vi
        .spyOn(tafService, "getTrainings")
        .mockResolvedValueOnce([initialTraining])
        .mockResolvedValueOnce([syncedTraining, initialTraining]);

      const syncSpy = vi
        .spyOn(tafService, "syncGoogleSheets")
        .mockResolvedValueOnce(makeSyncReport());

      const removeItemSpy = vi.spyOn(
        window.sessionStorage.__proto__,
        "removeItem"
      );

      render(<TreinosPage />);

      await waitFor(() => {
        expect(
          screen.getByTestId("training-card-trn-initial")
        ).toBeInTheDocument();
      });

      const syncButton = screen.getByTestId("sync-sheets-btn");
      expect(syncButton).toHaveTextContent("Sincronizar Planilha");

      await user.click(syncButton);

      await waitFor(() => {
        expect(syncSpy).toHaveBeenCalledWith({
          direction: "bidirectional",
          forceFullResync: false,
        });
      });

      expect(removeItemSpy).toHaveBeenCalledWith("pacelab_cache_trainings");
      expect(getTrainingsSpy).toHaveBeenCalledTimes(2);
      expect(
        await screen.findByTestId("training-card-trn-from-sheets")
      ).toBeInTheDocument();
      expect(screen.getByTestId("toast-notification")).toHaveTextContent(
        "Planilha sincronizada: 2 enviado(s), 1 atualizado(s), 1 importado(s) do Sheets"
      );
    });

    it("exibe mensagem orientativa em português quando Sheets não está configurado (503)", async () => {
      const user = userEvent.setup();
      vi.spyOn(tafService, "getTrainings").mockResolvedValue([
        makeTraining({ id: "trn-1" }),
      ]);
      vi.spyOn(tafService, "syncGoogleSheets").mockRejectedValueOnce(
        new TafApiError(
          "Credenciais não configuradas",
          503,
          "SHEETS_NOT_CONFIGURED"
        )
      );

      render(<TreinosPage />);

      await waitFor(() => {
        expect(screen.getByTestId("sync-sheets-btn")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("sync-sheets-btn"));

      const toast = await screen.findByTestId("toast-notification");
      expect(toast).toHaveTextContent(/não configurada/i);
      expect(toast).toHaveTextContent(/README\.md/i);
    });
  });

  describe("4. Painel Configurações Google Sheets em GoalAndBackupSettings", () => {
    it("exibe status e pendências, executa sync bidirecional e full backfill com confirmação", async () => {
      const user = userEvent.setup();
      const statusBefore: SheetsSyncStatus = {
        configured: true,
        pendingTrainingsCount: 2,
        pendingAttemptsCount: 1,
        totalPendingCount: 3,
      };
      const statusAfter: SheetsSyncStatus = {
        configured: true,
        pendingTrainingsCount: 0,
        pendingAttemptsCount: 0,
        totalPendingCount: 0,
      };

      vi.spyOn(tafService, "getSheetsSyncStatus")
        .mockResolvedValueOnce(statusBefore)
        .mockResolvedValue(statusAfter);

      const syncSpy = vi
        .spyOn(tafService, "syncGoogleSheets")
        .mockResolvedValue(makeSyncReport({ pushedAppended: 3, pulledUpdated: 0, pulledCreated: 0 }));

      const onSheetsSynced = vi.fn();
      const showToast = vi.fn();

      render(
        <GoalAndBackupSettings
          goal={DEFAULT_GOAL}
          attempts={[]}
          trainings={[]}
          onGoalSaved={vi.fn()}
          onDataRefreshed={vi.fn()}
          onSheetsSynced={onSheetsSynced}
          showToast={showToast}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("sheets-config-status")).toHaveTextContent(
          "Configurada"
        );
      });
      expect(screen.getByTestId("sheets-pending-summary")).toHaveTextContent(
        "Pendências aguardando envio: 3 (2 treino(s) no Diário, 1 simulado(s) TAF)"
      );

      await user.click(screen.getByTestId("settings-sync-sheets-btn"));

      await waitFor(() => {
        expect(syncSpy).toHaveBeenCalledWith({
          direction: "bidirectional",
          forceFullResync: false,
        });
      });
      expect(onSheetsSynced).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining("Planilha sincronizada:"),
        "success"
      );

      // Fluxo de Full Backfill exige confirmação
      await user.click(screen.getByTestId("settings-backfill-sheets-btn"));
      expect(
        screen.getByTestId("confirm-full-backfill-panel")
      ).toBeInTheDocument();

      await user.click(screen.getByTestId("cancel-full-backfill-btn"));
      expect(
        screen.queryByTestId("confirm-full-backfill-panel")
      ).not.toBeInTheDocument();
      expect(syncSpy).toHaveBeenCalledTimes(1);

      await user.click(screen.getByTestId("settings-backfill-sheets-btn"));
      await user.click(screen.getByTestId("confirm-full-backfill-btn"));

      await waitFor(() => {
        expect(syncSpy).toHaveBeenCalledWith({
          direction: "push",
          forceFullResync: true,
        });
      });
    });

    it("exibe 'Não configurada' e orienta sobre README.md em erro 503", async () => {
      const user = userEvent.setup();
      vi.spyOn(tafService, "getSheetsSyncStatus").mockResolvedValueOnce({
        configured: false,
        error: "Variáveis GOOGLE_SHEETS_SPREADSHEET_ID ou credenciais ausentes.",
        pendingTrainingsCount: 1,
        pendingAttemptsCount: 0,
        totalPendingCount: 1,
      });
      vi.spyOn(tafService, "syncGoogleSheets").mockRejectedValueOnce(
        new TafApiError("Não configurado", 503, "SHEETS_NOT_CONFIGURED")
      );
      const showToast = vi.fn();

      render(
        <GoalAndBackupSettings
          goal={DEFAULT_GOAL}
          attempts={[]}
          trainings={[]}
          onGoalSaved={vi.fn()}
          onDataRefreshed={vi.fn()}
          showToast={showToast}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("sheets-config-status")).toHaveTextContent(
          "Não configurada"
        );
      });

      await user.click(screen.getByTestId("settings-sync-sheets-btn"));

      await waitFor(() => {
        expect(showToast).toHaveBeenCalledWith(
          expect.stringMatching(/README\.md/i),
          "error"
        );
      });
    });

    it("integra /meu-taf aba Meta & Banco invalidando caches e recarregando dados após sync", async () => {
      const user = userEvent.setup();
      vi.spyOn(tafService, "getGoal").mockResolvedValue(DEFAULT_GOAL);
      const getAttemptsSpy = vi
        .spyOn(tafService, "getAttempts")
        .mockResolvedValue([makeAttempt()]);
      const getTrainingsSpy = vi
        .spyOn(tafService, "getTrainings")
        .mockResolvedValue([makeTraining()]);
      vi.spyOn(tafService, "checkDatabaseHealth").mockResolvedValue({
        connected: true,
        orm: "Prisma",
      });
      vi.spyOn(profileService, "getProfile").mockResolvedValue({
        id: "profile-default",
        name: "Atleta Teste",
        currentWeightKg: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      });
      vi.spyOn(tafService, "getSheetsSyncStatus").mockResolvedValue({
        configured: true,
        pendingTrainingsCount: 0,
        pendingAttemptsCount: 0,
        totalPendingCount: 0,
      });
      vi.spyOn(tafService, "syncGoogleSheets").mockResolvedValueOnce(
        makeSyncReport({ profileSynced: true, tafPulledCreated: 1 })
      );

      const removeItemSpy = vi.spyOn(
        window.sessionStorage.__proto__,
        "removeItem"
      );

      render(<MeuTafPage />);

      await user.click(await screen.findByRole("button", { name: /Meta & Banco/i }));

      await waitFor(() => {
        expect(
          screen.getByTestId("settings-sync-sheets-btn")
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("settings-sync-sheets-btn"));

      await waitFor(() => {
        expect(removeItemSpy).toHaveBeenCalledWith("pacelab_cache_taf_attempts");
        expect(removeItemSpy).toHaveBeenCalledWith("pacelab_cache_taf_trainings");
        expect(removeItemSpy).toHaveBeenCalledWith("pacelab_cache_taf_goal");
      });

      expect(getAttemptsSpy).toHaveBeenCalledTimes(2);
      expect(getTrainingsSpy).toHaveBeenCalledTimes(2);
      expect(await screen.findByTestId("toast-notification")).toHaveTextContent(
        /Planilha sincronizada:/i
      );
    });

    it("sincroniza inputs de meta ao atualizar prop goal e recarrega pendências após restore de backup", async () => {
      const user = userEvent.setup();
      const getSheetsStatusSpy = vi
        .spyOn(tafService, "getSheetsSyncStatus")
        .mockResolvedValueOnce({
          configured: true,
          pendingTrainingsCount: 0,
          pendingAttemptsCount: 0,
          totalPendingCount: 0,
        })
        .mockResolvedValueOnce({
          configured: true,
          pendingTrainingsCount: 2,
          pendingAttemptsCount: 1,
          totalPendingCount: 3,
        });
      vi.spyOn(tafService, "importBackupJson").mockResolvedValueOnce({
        success: true,
        attemptsCount: 1,
        trainingsCount: 2,
        skippedCount: 0,
      });

      const { rerender } = render(
        <GoalAndBackupSettings
          goal={DEFAULT_GOAL}
          attempts={[]}
          trainings={[]}
          onGoalSaved={vi.fn()}
          onDataRefreshed={vi.fn()}
          showToast={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(getSheetsStatusSpy).toHaveBeenCalledTimes(1);
      });

      rerender(
        <GoalAndBackupSettings
          goal={{
            ...DEFAULT_GOAL,
            targetDistanceMeters: 2600,
            targetDurationMinutes: 14,
            targetExamDate: "2027-02-15",
          }}
          attempts={[]}
          trainings={[]}
          onGoalSaved={vi.fn()}
          onDataRefreshed={vi.fn()}
          showToast={vi.fn()}
        />
      );

      expect(screen.getByDisplayValue("2600")).toBeInTheDocument();
      expect(screen.getByDisplayValue("14")).toBeInTheDocument();
      expect(screen.getByDisplayValue("2027-02-15")).toBeInTheDocument();

      const backupInput = screen.getByTestId(
        "backup-file-input"
      ) as HTMLInputElement;
      const jsonFile = new File(['{"version":3}'], "backup.json", {
        type: "application/json",
      });
      await user.upload(backupInput, jsonFile);

      await waitFor(() => {
        expect(getSheetsStatusSpy).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByTestId("sheets-pending-summary")).toHaveTextContent(
        "Pendências aguardando envio: 3"
      );
    });
  });

  describe("5. Registro Espelhado Opcional TAF → Diário de Treinos", () => {
    it("mantém checkbox desmarcada por padrão e espelha no Diário com ID trn_ separado ao marcar no TafAttemptForm", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onAlsoSaveTraining = vi.fn().mockResolvedValue(undefined);

      const { rerender } = render(
        <TafAttemptForm
          targetDistanceMeters={2400}
          targetDurationMinutes={12}
          onSave={onSave}
          onAlsoSaveTraining={onAlsoSaveTraining}
        />
      );

      const checkbox = screen.getByTestId("also-save-diary-checkbox");
      expect(checkbox).not.toBeChecked();

      // Envio padrão sem marcar checkbox -> NÃO espelha
      await user.click(screen.getByTestId("submit-attempt-btn"));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onAlsoSaveTraining).not.toHaveBeenCalled();

      // Agora marcando a checkbox
      await user.click(checkbox);
      expect(checkbox).toBeChecked();

      await user.click(screen.getByTestId("submit-attempt-btn"));

      await waitFor(() =>
        expect(onAlsoSaveTraining).toHaveBeenCalledTimes(1)
      );

      const savedAttemptArg = onSave.mock.calls[1][0] as TafAttempt;
      const mirroredTrainingArg = onAlsoSaveTraining.mock
        .calls[0][0] as TrainingSession;

      expect(savedAttemptArg.id).toMatch(/^taf_/);
      expect(mirroredTrainingArg.id).toMatch(/^trn_/);
      expect(mirroredTrainingArg.id).not.toBe(savedAttemptArg.id);
      expect(mirroredTrainingArg.activityType).toBe("tempo_run");
      expect(mirroredTrainingArg.distanceKm).toBe(
        Number((savedAttemptArg.distanceMeters / 1000).toFixed(3))
      );
      expect(mirroredTrainingArg.notes).toMatch(/^\[Simulado TAF\]/);

      // Checkbox desaparece no modo de edição
      rerender(
        <TafAttemptForm
          targetDistanceMeters={2400}
          targetDurationMinutes={12}
          editingAttempt={makeAttempt()}
          onSave={onSave}
          onAlsoSaveTraining={onAlsoSaveTraining}
        />
      );
      expect(
        screen.queryByTestId("also-save-diary-checkbox")
      ).not.toBeInTheDocument();
    });

    it("consolida título + observações e espelha opcionalmente ao importar GPX/FIT como Simulado TAF", async () => {
      const user = userEvent.setup();
      vi.spyOn(profileService, "getProfile").mockResolvedValue({
        id: "profile-default",
        name: "Atleta Teste",
        currentWeightKg: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      });
      vi.spyOn(tafService, "parseActivity").mockResolvedValue(
        makeTafPreview({ alreadyExists: true })
      );
      const saveAttemptSpy = vi
        .spyOn(tafService, "saveAttempt")
        .mockImplementation(async (attempt) => attempt);
      const saveTrainingSpy = vi
        .spyOn(tafService, "saveTraining")
        .mockImplementation(async (training) => training);
      const onAttemptImported = vi.fn();
      const onMirroredTraining = vi.fn();

      render(
        <GpxImportPanel
          defaultSaveAs="taf_attempt"
          onAttemptImported={onAttemptImported}
          onMirroredTraining={onMirroredTraining}
        />
      );

      const file = new File(["<gpx></gpx>"], "simulado.gpx", {
        type: "application/gpx+xml",
      });
      await user.upload(screen.getByTestId("activity-file-input"), file);

      const mirrorCheckbox = await screen.findByTestId(
        "import-also-save-diary-checkbox"
      );
      expect(mirrorCheckbox).not.toBeChecked();

      const titleInput = screen.getByTestId("post-upload-title-input");
      await user.clear(titleInput);
      await user.type(titleInput, "Simulado Oficial");
      await user.type(
        screen.getByTestId("post-upload-notes-input"),
        "Ritmo constante"
      );
      await user.click(mirrorCheckbox);
      await user.click(screen.getByTestId("save-imported-attempt-btn"));

      await waitFor(() => {
        expect(saveAttemptSpy).toHaveBeenCalledTimes(1);
        expect(saveTrainingSpy).toHaveBeenCalledTimes(1);
      });

      const attemptSent = saveAttemptSpy.mock.calls[0][0] as TafAttempt;
      const trainingSent = saveTrainingSpy.mock.calls[0][0] as TrainingSession;

      expect(attemptSent.id).toMatch(/^att_/);
      expect(attemptSent.notes).toBe("Simulado Oficial — Ritmo constante");
      expect(trainingSent.id).toMatch(/^trn_/);
      expect(trainingSent.id).not.toBe(attemptSent.id);
      expect(trainingSent.activityType).toBe("tempo_run");
      expect(trainingSent.distanceKm).toBe(2.64);
      // Como preview.alreadyExists=true no Diário, o espelho evita colisão de externalId (409)
      expect(trainingSent.externalId).toBeNull();
      // Treino de 900s recortado para janela de 720s não herda calorias totais distorcidas
      expect(trainingSent.activeCalories).toBeNull();
      expect(trainingSent.notes).toBe(
        "[Simulado TAF] Simulado Oficial — Ritmo constante"
      );
      expect(onAttemptImported).toHaveBeenCalledWith(attemptSent, false, {
        mirrored: true,
        mirrorError: null,
      });
      expect(onMirroredTraining).toHaveBeenCalledWith(trainingSent);
    });

    it("propaga erro do espelhamento sem perder o Simulado TAF já salvo", async () => {
      const user = userEvent.setup();
      vi.spyOn(profileService, "getProfile").mockResolvedValue({
        id: "profile-default",
        name: "Atleta Teste",
        currentWeightKg: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      });
      vi.spyOn(tafService, "parseActivity").mockResolvedValue(makeTafPreview());
      vi.spyOn(tafService, "saveAttempt").mockImplementation(
        async (attempt) => attempt
      );
      vi.spyOn(tafService, "saveTraining").mockRejectedValueOnce(
        new Error("Falha ao gravar no Diário")
      );
      const onAttemptImported = vi.fn();

      render(
        <GpxImportPanel
          defaultSaveAs="taf_attempt"
          onAttemptImported={onAttemptImported}
        />
      );

      const file = new File(["<gpx></gpx>"], "simulado.gpx", {
        type: "application/gpx+xml",
      });
      await user.upload(screen.getByTestId("activity-file-input"), file);
      await user.click(await screen.findByTestId("import-also-save-diary-checkbox"));
      await user.click(screen.getByTestId("save-imported-attempt-btn"));

      await waitFor(() => {
        expect(onAttemptImported).toHaveBeenCalledTimes(1);
      });

      expect(onAttemptImported).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.stringMatching(/^att_/) }),
        false,
        {
          mirrored: false,
          mirrorError: "Falha ao gravar no Diário",
        }
      );
    });
  });

  describe("6. Utilitários lib/sheetsSyncUi", () => {
    it("cobre formatação de badges, avisos no resumo, erros 503/genéricos e notas", () => {
      expect(formatSheetsSyncBadge("data-invalida")).toEqual({
        isSynced: false,
        label: "Pendente Sheets",
        title: "Aguardando sincronização com a planilha Google Sheets",
      });

      const reportWithWarnings = makeSyncReport({
        warnings: [
          { tab: "Log_Treinos", rowNumber: 8, message: "Linha 8 ignorada" },
          { tab: "Simulados_TAF", rowNumber: 3, message: "Data inválida" },
        ],
      });
      expect(formatSheetsSyncReportSummary(reportWithWarnings)).toContain(
        "(2 aviso(s))"
      );

      expect(
        getSheetsSyncErrorMessage(new TafApiError("API fora do ar", 503))
      ).toBe("API fora do ar");
      expect(
        getSheetsSyncErrorMessage(new TafApiError("", 503))
      ).toMatch(/indisponível/i);
      expect(
        getSheetsSyncErrorMessage(new TafApiError("Erro 400", 400), "Fallback")
      ).toBe("Erro 400");
      expect(
        getSheetsSyncErrorMessage(new TafApiError("", 500), "Fallback")
      ).toBe("Fallback");
      expect(getSheetsSyncErrorMessage(new Error("Falha de rede"))).toBe(
        "Falha de rede"
      );
      expect(getSheetsSyncErrorMessage("desconhecido", "Fallback")).toBe(
        "Fallback"
      );

      expect(combineTitleAndNotes("   ", "  ")).toBeNull();
      expect(combineTitleAndNotes("A".repeat(1200), "")).toHaveLength(1000);
      expect(buildMirroredTafNotes(null)).toBe("[Simulado TAF]");

      sessionStorage.setItem("pacelab_cache_trainings", "[]");
      sessionStorage.setItem("pacelab_cache_taf_attempts", "[]");
      sessionStorage.setItem("pacelab_cache_taf_trainings", "[]");
      sessionStorage.setItem("pacelab_cache_weekly_plan", "{}");
      sessionStorage.setItem("pacelab_cache_taf_goal", "{}");
      clearCrossPageSheetsCaches({ includeGoal: false });
      expect(sessionStorage.getItem("pacelab_cache_trainings")).toBeNull();
      expect(sessionStorage.getItem("pacelab_cache_taf_attempts")).toBeNull();
      expect(sessionStorage.getItem("pacelab_cache_taf_trainings")).toBeNull();
      expect(sessionStorage.getItem("pacelab_cache_weekly_plan")).toBeNull();
      expect(sessionStorage.getItem("pacelab_cache_taf_goal")).toBe("{}");

      clearCrossPageSheetsCaches({ includeGoal: true });
      expect(sessionStorage.getItem("pacelab_cache_taf_goal")).toBeNull();

      const badge = formatSheetsSyncBadge("2026-10-15T15:00:00.000Z");
      expect(badge.title).toContain("12:00");
    });

    it("formata os 3 cenários de formatSheetsSyncReportSummary (contagens > 0, apenas Perfil/Meta e sem pendências)", () => {
      expect(
        formatSheetsSyncReportSummary(
          makeSyncReport({
            pushedAppended: 1,
            pushedUpdated: 2,
            pulledUpdated: 0,
            pulledCreated: 3,
            profileSynced: true,
          })
        )
      ).toBe("Planilha sincronizada: 1 enviado(s), 2 atualizado(s), 3 importado(s) do Sheets");

      expect(
        formatSheetsSyncReportSummary(
          makeSyncReport({
            pushedAppended: 0,
            pushedUpdated: 0,
            pulledUpdated: 0,
            pulledLinked: 0,
            pulledCreated: 0,
            tafPushedAppended: 0,
            tafPushedUpdated: 0,
            tafPulledUpdated: 0,
            tafPulledLinked: 0,
            tafPulledCreated: 0,
            profileSynced: true,
          })
        )
      ).toBe("Planilha sincronizada: Perfil/Meta atualizados no Sheets");

      expect(
        formatSheetsSyncReportSummary(
          makeSyncReport({
            pushedAppended: 0,
            pushedUpdated: 0,
            pulledUpdated: 0,
            pulledLinked: 0,
            pulledCreated: 0,
            tafPushedAppended: 0,
            tafPushedUpdated: 0,
            tafPulledUpdated: 0,
            tafPulledLinked: 0,
            tafPulledCreated: 0,
            profileSynced: false,
            warnings: [{ tab: "Log_Treinos", rowNumber: 4, message: "Aviso" }],
          })
        )
      ).toBe("Planilha já estava atualizada (nenhuma pendência encontrada) (1 aviso(s))");

      expect(
        formatSheetsSyncReportSummary(
          makeSyncReport({
            pushedAppended: 0,
            pushedUpdated: 0,
            pulledUpdated: 0,
            pulledLinked: 0,
            pulledCreated: 0,
            tafPushedAppended: 0,
            tafPushedUpdated: 0,
            tafPulledUpdated: 0,
            tafPulledLinked: 0,
            tafPulledCreated: 0,
            profileSynced: false,
            weeklyPlan: {
              imported: 0,
              updated: 0,
              removed: 0,
              matched: 0,
              missed: 1,
              pushed: 0,
              sheetMissingOrEmpty: true,
            },
          })
        )
      ).toBe("Planilha já estava atualizada (nenhuma pendência encontrada)");

      expect(
        formatSheetsSyncReportSummary(
          makeSyncReport({
            pushedAppended: 0,
            pushedUpdated: 0,
            pulledUpdated: 0,
            pulledLinked: 0,
            pulledCreated: 0,
            tafPushedAppended: 0,
            tafPushedUpdated: 0,
            tafPulledUpdated: 0,
            tafPulledLinked: 0,
            tafPulledCreated: 0,
            profileSynced: false,
            weeklyPlan: {
              imported: 4,
              updated: 0,
              removed: 1,
              matched: 2,
              missed: 0,
              pushed: 2,
              sheetMissingOrEmpty: false,
            },
          })
        )
      ).toBe(
        "Planilha sincronizada (Plano Semanal: 4 plano(s) importado(s), 1 plano(s) removido(s), 2 treino(s) conciliado(s), 2 status enviado(s))"
      );

      expect(
        formatSheetsSyncReportSummary(
          makeSyncReport({
            pushedAppended: 1,
            pushedUpdated: 0,
            pulledUpdated: 0,
            pulledLinked: 0,
            pulledCreated: 0,
            tafPushedAppended: 0,
            tafPushedUpdated: 0,
            tafPulledUpdated: 0,
            tafPulledLinked: 0,
            tafPulledCreated: 0,
            profileSynced: false,
            weeklyPlan: {
              imported: 0,
              updated: 1,
              removed: 0,
              matched: 1,
              missed: 0,
              pushed: 1,
              sheetMissingOrEmpty: false,
            },
          })
        )
      ).toBe(
        "Planilha sincronizada: 1 enviado(s), 0 atualizado(s), 0 importado(s) do Sheets (Plano Semanal: 1 plano(s) atualizado(s), 1 treino(s) conciliado(s), 1 status enviado(s))"
      );
    });

    it("atualiza pendências em GoalAndBackupSettings quando trainings/attempts mudam e após salvar meta", async () => {
      const user = userEvent.setup();
      const getSheetsStatusSpy = vi
        .spyOn(tafService, "getSheetsSyncStatus")
        .mockResolvedValueOnce({
          configured: true,
          pendingTrainingsCount: 0,
          pendingAttemptsCount: 0,
          totalPendingCount: 0,
        })
        .mockResolvedValueOnce({
          configured: true,
          pendingTrainingsCount: 1,
          pendingAttemptsCount: 0,
          totalPendingCount: 1,
        })
        .mockResolvedValueOnce({
          configured: true,
          pendingTrainingsCount: 1,
          pendingAttemptsCount: 1,
          totalPendingCount: 2,
        });

      vi.spyOn(tafService, "saveGoal").mockResolvedValueOnce({
        ...DEFAULT_GOAL,
        targetDistanceMeters: 2700,
      });

      const onGoalSaved = vi.fn();
      const showToast = vi.fn();
      const { rerender } = render(
        <GoalAndBackupSettings
          goal={DEFAULT_GOAL}
          attempts={[]}
          trainings={[]}
          onGoalSaved={onGoalSaved}
          onDataRefreshed={vi.fn()}
          showToast={showToast}
        />
      );

      await waitFor(() => {
        expect(getSheetsStatusSpy).toHaveBeenCalledTimes(1);
      });

      // Atualiza prop trainings com novo treino pendente -> dispara recarga reativa
      rerender(
        <GoalAndBackupSettings
          goal={DEFAULT_GOAL}
          attempts={[]}
          trainings={[makeTraining({ id: "trn-new-reactive", syncedToSheetsAt: null })]}
          onGoalSaved={onGoalSaved}
          onDataRefreshed={vi.fn()}
          showToast={showToast}
        />
      );

      await waitFor(() => {
        expect(getSheetsStatusSpy).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByTestId("sheets-pending-summary")).toHaveTextContent(
        "Pendências aguardando envio: 1"
      );

      // Salvar meta da prova física recarrega status de pendências
      await user.click(
        screen.getByRole("button", { name: /Salvar Configuração da Meta/i })
      );

      await waitFor(() => {
        expect(onGoalSaved).toHaveBeenCalledTimes(1);
        expect(getSheetsStatusSpy).toHaveBeenCalledTimes(3);
      });
      expect(screen.getByTestId("sheets-pending-summary")).toHaveTextContent(
        "Pendências aguardando envio: 2"
      );
    });

    it("limpa caches cross-page de /meu-taf ao salvar/excluir treino em /treinos e aplica max-w responsivo no toast", async () => {
      const user = userEvent.setup();
      sessionStorage.setItem(
        "pacelab_cache_taf_trainings",
        JSON.stringify([makeTraining({ id: "trn-stale-cache" })])
      );
      sessionStorage.setItem(
        "pacelab_cache_taf_attempts",
        JSON.stringify([makeAttempt({ id: "att-stale-cache" })])
      );

      vi.spyOn(tafService, "getTrainings").mockResolvedValueOnce([
        makeTraining({ id: "trn-del-target" }),
      ]);
      vi.spyOn(tafService, "deleteTraining").mockResolvedValueOnce(true);

      render(<TreinosPage />);

      await waitFor(() => {
        expect(screen.getByTestId("training-card-trn-del-target")).toBeInTheDocument();
      });

      await user.click(screen.getByTitle("Excluir treino"));
      await user.click(screen.getByRole("button", { name: /Sim, Excluir/i }));

      await waitFor(() => {
        expect(sessionStorage.getItem("pacelab_cache_taf_trainings")).toBeNull();
        expect(sessionStorage.getItem("pacelab_cache_taf_attempts")).toBeNull();
      });

      const toast = await screen.findByTestId("toast-notification");
      expect(toast).toHaveClass("max-w-[calc(100vw-2rem)]");
    });

    it("formata todos os cenários de formatBatchImportToast (sucesso, Sheets synced, warning Sheets, abort e falhas)", () => {
      const base = {
        target: "training" as const,
        duplicatePolicy: "skip" as const,
        totalItems: 3,
        savedCount: 2,
        updatedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        mirroredCount: 0,
        mirrorSkippedCount: 0,
        mirrorFailedCount: 0,
        sheetsSynced: true,
        sheetsSyncWarning: null,
        aborted: false,
      };

      expect(formatBatchImportToast(base)).toEqual({
        type: "success",
        message:
          "Lote importado: 2 novo(s), 1 atualizado(s) (treino(s)) • Google Sheets sincronizado!",
      });

      expect(
        formatBatchImportToast({
          ...base,
          target: "taf_attempt",
          updatedCount: 0,
          skippedCount: 1,
          mirroredCount: 2,
          sheetsSynced: false,
        })
      ).toEqual({
        type: "success",
        message:
          "Lote importado: 2 novo(s), 1 pulado(s), 2 espelhado(s) no Diário (simulado(s) TAF).",
      });

      expect(
        formatBatchImportToast({
          ...base,
          sheetsSynced: false,
          sheetsSyncWarning: "Cota excedida",
        })
      ).toMatchObject({
        type: "error",
        message: expect.stringContaining("Google Sheets falhou: Cota excedida"),
      });

      expect(
        formatBatchImportToast({
          ...base,
          mirrorFailedCount: 1,
        })
      ).toMatchObject({
        type: "error",
        message: expect.stringContaining("1 espelho(s) no Diário falharam"),
      });

      expect(
        formatBatchImportToast({
          ...base,
          aborted: true,
        })
      ).toMatchObject({
        type: "error",
        message: expect.stringContaining("interrompida"),
      });

      expect(
        formatBatchImportToast({
          ...base,
          failedCount: 2,
          savedCount: 0,
          updatedCount: 0,
        })
      ).toMatchObject({
        type: "error",
        message: expect.stringContaining("2 falha(s)"),
      });
    });
  });
});
