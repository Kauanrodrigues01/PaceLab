import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GpxImportPanel } from "@/components/treinos/GpxImportPanel";
import { tafService } from "@/lib/services/tafService";
import { profileService } from "@/lib/services/profileService";
import {
  ACTIVITY_TYPES,
  ActivityParsePreview,
  BatchImportSummary,
  TafAttempt,
  TrainingSession,
} from "@/types";

vi.mock("@/lib/services/tafService", () => ({
  tafService: {
    getTrainings: vi.fn(),
    parseActivity: vi.fn(),
    parseGpx: vi.fn(),
    saveTraining: vi.fn(),
    saveAttempt: vi.fn(),
    deleteTraining: vi.fn(),
    getSheetsSyncStatus: vi.fn(),
    syncGoogleSheets: vi.fn(),
  },
}));

vi.mock("@/lib/services/profileService", () => ({
  profileService: {
    getProfile: vi.fn(),
  },
}));

function makeActivityFile(
  name: string,
  size = 2048,
  lastModified = 1700000000000
): File {
  const file = new File([new Uint8Array(64)], name, {
    type: name.toLowerCase().endsWith(".gpx")
      ? "application/gpx+xml"
      : "application/octet-stream",
    lastModified,
  });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function makePreview(
  overrides: Partial<ActivityParsePreview> = {}
): ActivityParsePreview {
  return {
    source: "fit_upload",
    filesUsed: ["fit"],
    name: null,
    rawType: "running",
    sourceActivityKind: "run",
    isIndoor: false,
    externalId: "fit_ext_default",
    startedAt: "2026-11-10T07:00:00.000Z",
    distanceKm: 6.0,
    durationSeconds: 1800,
    elapsedSeconds: 1830,
    paceSeconds: 300,
    paceFormatted: "5:00",
    speedKmh: 12.0,
    elevationGainM: 35,
    avgHeartRate: 155,
    maxHeartRate: 172,
    avgCadence: 176,
    activeCalories: 410,
    avgTemperatureC: null,
    pointCount: 1800,
    splits: [
      {
        kilometer: 1,
        distanceKm: 1.0,
        durationSeconds: 300,
        paceSeconds: 300,
        paceFormatted: "5:00",
        elevationDiffM: 5,
        avgHeartRate: 150,
      },
    ],
    laps: [],
    warnings: [],
    alreadyExists: false,
    existingTrainingId: null,
    alreadyExistsAttempt: false,
    existingAttemptId: null,
    tafWindow: {
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2520,
      speedKmh: 12.6,
      paceSeconds: 286,
      paceFormatted: "4:46",
      avgHeartRate: 168,
      maxHeartRate: 178,
      windowStartOffsetSeconds: 120,
      windowEndOffsetSeconds: 840,
      isShorterThanTarget: false,
      laps: [
        {
          lapNumber: 1,
          distanceMeters: 400,
          durationSeconds: 114,
          paceFormatted: "4:45",
        },
      ],
    },
    suggestedActivityType: "corrida_continua",
    suggestedNotes: "",
    allowedActivityTypes: [...ACTIVITY_TYPES],
    ...overrides,
  };
}

describe("Fase 3 — UI de Importação em Massa (.FIT / .GPX) com Seleção Única Global", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.clear();
    }
    vi.mocked(profileService.getProfile).mockResolvedValue({
      id: "prof-1",
      userId: "user-1",
      name: "Atleta PaceLab",
      currentWeightKg: 76.5,
      heightCm: 178,
      birthDate: "1996-05-10",
      gender: "M",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
    vi.mocked(tafService.getSheetsSyncStatus).mockResolvedValue({
      configured: true,
      pendingTrainingsCount: 0,
      pendingAttemptsCount: 0,
      totalPendingCount: 0,
    });
    vi.mocked(tafService.syncGoogleSheets).mockResolvedValue({
      direction: "push",
      forceFullResync: false,
      pushedAppended: 3,
      pushedUpdated: 0,
      pulledCreated: 0,
      pulledUpdated: 0,
      pulledLinked: 0,
      tafPushedAppended: 0,
      tafPushedUpdated: 0,
      tafPulledCreated: 0,
      tafPulledUpdated: 0,
      tafPulledLinked: 0,
      profileSynced: false,
      skipped: 0,
      warnings: [],
      durationMs: 120,
      syncedAt: "2026-11-14T17:00:00.000Z",
    });
    vi.mocked(tafService.saveTraining).mockImplementation(
      async (session: TrainingSession) => session
    );
    vi.mocked(tafService.saveAttempt).mockImplementation(
      async (attempt: TafAttempt) => attempt
    );
  });

  it("1. Entra automaticamente em Modo Em Massa ao enviar 3 arquivos, chama parseActivity 3 vezes isoladas e pré-preenche títulos", async () => {
    const user = userEvent.setup({ applyAccept: false });

    vi.mocked(tafService.parseActivity).mockImplementation(async (filesArg) => {
      const first = Array.isArray(filesArg) ? filesArg[0] : filesArg;
      const fileName = (first as File).name;
      if (fileName.startsWith("Rodagem_leve")) {
        return makePreview({
          externalId: "fit_a",
          name: null,
          suggestedActivityType: "rodagem_leve",
        });
      }
      if (fileName.startsWith("Tiro_forte")) {
        return makePreview({
          externalId: "fit_b",
          name: null,
          suggestedActivityType: "corrida_intervalada",
        });
      }
      return makePreview({
        source: "gpx_upload",
        filesUsed: ["gpx"],
        externalId: "gpx_c",
        name: "Caminhada no Parque",
        suggestedActivityType: "caminhada",
      });
    });

    render(<GpxImportPanel />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("Rodagem_leve.fit", 1024, 1001),
      makeActivityFile("Tiro_forte.fit", 1024, 1002),
      makeActivityFile("parque.gpx", 1024, 1003),
    ]);

    expect(
      await screen.findByTestId("batch-import-workspace")
    ).toBeInTheDocument();
    expect(screen.getByTestId("import-mode-batch")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByTestId("batch-queue-count")).toHaveTextContent(
      "3 atividades na fila"
    );

    await waitFor(() => {
      expect(tafService.parseActivity).toHaveBeenCalledTimes(3);
    });

    const title0 = (await screen.findByTestId(
      "batch-item-title-0"
    )) as HTMLInputElement;
    const title1 = screen.getByTestId("batch-item-title-1") as HTMLInputElement;
    const title2 = screen.getByTestId("batch-item-title-2") as HTMLInputElement;

    expect(title0.value).toBe("Rodagem leve");
    expect(title1.value).toBe("Tiro forte");
    expect(title2.value).toBe("Caminhada no Parque");
    expect(screen.getByTestId("batch-submit-btn")).toHaveTextContent(
      "Importar Lote (3 prontos)"
    );
  });

  it("2. Pareia automaticamente longao.fit + longao.gpx e permite separar em 2 treinos com reanálise", async () => {
    const user = userEvent.setup({ applyAccept: false });

    vi.mocked(tafService.parseActivity).mockImplementation(async (filesArg) => {
      const list = Array.isArray(filesArg)
        ? (filesArg as File[])
        : [filesArg as File];
      if (list.length === 2) {
        return makePreview({
          externalId: "merged_longao",
          filesUsed: ["fit", "gpx"],
          name: "Longão de Domingo",
        });
      }
      const single = list[0];
      return makePreview({
        source: single.name.endsWith(".gpx") ? "gpx_upload" : "fit_upload",
        filesUsed: [single.name.endsWith(".gpx") ? "gpx" : "fit"],
        externalId: `ext_${single.name}`,
        name: single.name.endsWith(".gpx") ? "GPX Separado" : null,
      });
    });

    render(<GpxImportPanel />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("longao.fit", 1024, 2001),
      makeActivityFile("longao.gpx", 1024, 2002),
      makeActivityFile("tiro.fit", 1024, 2003),
    ]);

    expect(
      await screen.findByTestId("batch-queue-count")
    ).toHaveTextContent("2 atividades na fila");

    await waitFor(() => {
      expect(tafService.parseActivity).toHaveBeenCalledTimes(2);
    });

    // Primeiro grupo enviou [longao.fit, longao.gpx] juntos
    const firstCallFiles = vi.mocked(tafService.parseActivity).mock
      .calls[0][0] as File[];
    expect(firstCallFiles.map((f) => f.name)).toEqual([
      "longao.fit",
      "longao.gpx",
    ]);

    const row0 = screen.getByTestId("batch-item-row-0");
    expect(within(row0).getByText("MESCLADO (.FIT + .GPX)")).toBeInTheDocument();

    // Separa em 2 treinos
    const splitBtn = await screen.findByTestId("batch-item-split-0");
    await user.click(splitBtn);

    await waitFor(() => {
      expect(screen.getByTestId("batch-queue-count")).toHaveTextContent(
        "3 atividades na fila"
      );
      expect(tafService.parseActivity).toHaveBeenCalledTimes(4);
    });

    expect(screen.queryByTestId("batch-item-split-0")).not.toBeInTheDocument();
  });

  it("3. Mantém seleção única global (sem alternadores por linha) e alterna todos para Simulados TAF salvando com skipSheetsSync", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onBatchImported = vi.fn();

    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(
        makePreview({
          externalId: "fit_1",
          name: "Cooper Pista",
          isIndoor: false,
          tafWindow: {
            targetDurationSeconds: 720,
            actualDurationSeconds: 720,
            distanceMeters: 2650,
            speedKmh: 13.25,
            paceSeconds: 272,
            paceFormatted: "4:32",
            avgHeartRate: 170,
            maxHeartRate: 184,
            windowStartOffsetSeconds: 0,
            windowEndOffsetSeconds: 720,
            isShorterThanTarget: false,
            laps: [],
          },
        })
      )
      .mockResolvedValueOnce(
        makePreview({
          externalId: "fit_2",
          name: "Esteira Rápida",
          isIndoor: true,
          tafWindow: {
            targetDurationSeconds: 720,
            actualDurationSeconds: 720,
            distanceMeters: 2450,
            speedKmh: 12.25,
            paceSeconds: 294,
            paceFormatted: "4:54",
            avgHeartRate: 162,
            maxHeartRate: 175,
            windowStartOffsetSeconds: 60,
            windowEndOffsetSeconds: 780,
            isShorterThanTarget: false,
            laps: [],
          },
        })
      );

    render(<GpxImportPanel onBatchImported={onBatchImported} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("cooper_pista.fit", 1024, 3001),
      makeActivityFile("esteira_rapida.fit", 1024, 3002),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("batch-item-title-1")).toBeInTheDocument();
    });

    // Existe APENAS 1 radiogroup global de destino; nenhum radiogroup dentro das linhas
    const workspace = screen.getByTestId("batch-import-workspace");
    expect(within(workspace).getAllByRole("radiogroup")).toHaveLength(1);
    const reviewList = screen.getByTestId("batch-review-list");
    expect(within(reviewList).queryAllByRole("radiogroup")).toHaveLength(0);
    expect(
      within(reviewList).queryByTestId("batch-target-training")
    ).not.toBeInTheDocument();
    expect(
      within(reviewList).queryByTestId("batch-target-taf")
    ).not.toBeInTheDocument();

    // Alternar para "Todos como Simulados TAF" NÃO chama parseActivity novamente
    await user.click(screen.getByTestId("batch-target-taf"));
    expect(tafService.parseActivity).toHaveBeenCalledTimes(2);

    // Prévias das duas linhas passam a exibir a janela de 12 min e sugestão de local indoor/pista
    expect(screen.getByTestId("batch-item-metrics-0")).toHaveTextContent(
      /Janela 12 min:\s*2\.650 m/i
    );
    expect(screen.getByTestId("batch-item-metrics-1")).toHaveTextContent(
      /Janela 12 min:\s*2\.450 m/i
    );
    expect(
      (screen.getByTestId("batch-item-location-0") as HTMLSelectElement).value
    ).toBe("pista_400m");
    expect(
      (screen.getByTestId("batch-item-location-1") as HTMLSelectElement).value
    ).toBe("esteira");

    await user.click(screen.getByTestId("batch-submit-btn"));

    await waitFor(() => {
      expect(tafService.saveAttempt).toHaveBeenCalledTimes(2);
    });
    expect(tafService.saveTraining).not.toHaveBeenCalled();

    expect(vi.mocked(tafService.saveAttempt).mock.calls[0][1]).toBe(false);
    expect(vi.mocked(tafService.saveAttempt).mock.calls[0][2]).toEqual({
      skipSheetsSync: true,
    });
    expect(vi.mocked(tafService.saveAttempt).mock.calls[1][2]).toEqual({
      skipSheetsSync: true,
    });

    expect(tafService.syncGoogleSheets).toHaveBeenCalledTimes(1);
    expect(tafService.syncGoogleSheets).toHaveBeenCalledWith({
      direction: "push",
      forceFullResync: false,
    });

    expect(onBatchImported).toHaveBeenCalledWith(
      expect.objectContaining<Partial<BatchImportSummary>>({
        target: "taf_attempt",
        savedCount: 2,
        failedCount: 0,
        sheetsSynced: true,
      })
    );
  });

  it("4. Aplica defaults em massa (tipo, peso, tênis, RPE) e reflete edições/detalhes sob demanda nos payloads", async () => {
    const user = userEvent.setup({ applyAccept: false });

    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(
        makePreview({
          externalId: "fit_def_1",
          name: "Treino Base 1",
          activeCalories: null,
        })
      )
      .mockResolvedValueOnce(
        makePreview({
          externalId: "fit_def_2",
          name: "Treino Base 2",
          activeCalories: null,
        })
      );

    render(<GpxImportPanel />);

    // Aguarda pré-carregamento do peso do perfil (76.5)
    await user.click(screen.getByTestId("import-mode-batch"));
    await waitFor(() => {
      expect(
        (screen.getByTestId("batch-default-weight-input") as HTMLInputElement)
          .value
      ).toBe("76.5");
    });

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("base1.fit", 1024, 4001),
      makeActivityFile("base2.fit", 1024, 4002),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("batch-item-title-1")).toBeInTheDocument();
    });

    // GpxPreviewCard está fechado por padrão (lazy) e abre somente ao clicar "Detalhes"
    expect(screen.queryByTestId("gpx-preview-card")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("batch-item-toggle-details-0"));
    expect(screen.getByTestId("gpx-preview-card")).toBeInTheDocument();
    await user.type(
      screen.getByTestId("batch-item-notes-0"),
      "Obs específica"
    );

    // Defaults em massa
    await user.selectOptions(
      screen.getByTestId("batch-default-activity-select"),
      "longao"
    );
    const weightInput = screen.getByTestId("batch-default-weight-input");
    await user.clear(weightInput);
    await user.type(weightInput, "80");

    await user.type(screen.getByTestId("batch-default-shoe-input"), "Nimbus 26");
    await user.click(screen.getByTestId("batch-default-rpe-btn-8"));

    // Edição pontual no título do item 0
    const title0 = screen.getByTestId("batch-item-title-0");
    await user.clear(title0);
    await user.type(title0, "Longão Especial");

    await user.click(screen.getByTestId("batch-submit-btn"));

    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledTimes(2);
    });

    const payload0 = vi.mocked(tafService.saveTraining).mock.calls[0][0];
    const payload1 = vi.mocked(tafService.saveTraining).mock.calls[1][0];

    expect(payload0.activityType).toBe("longao");
    expect(payload1.activityType).toBe("longao");
    expect(payload0.shoeName).toBe("Nimbus 26");
    expect(payload1.shoeName).toBe("Nimbus 26");
    expect(payload0.bodyWeightKg).toBe(80);
    expect(payload1.bodyWeightKg).toBe(80);
    expect(payload0.perceivedEffort).toBe(8);
    expect(payload1.perceivedEffort).toBe(8);
    expect(payload0.notes).toBe("Longão Especial — Obs específica");
    expect(payload0.calorieSource).toBe("auto_calculated");
    expect(payload0.activeCalories).toBeGreaterThan(0);
    expect(vi.mocked(tafService.saveTraining).mock.calls[0][2]).toEqual({
      skipSheetsSync: true,
    });
  });

  it("5. Isola arquivo corrompido + rejeições pré-upload e permite 'Tentar novamente falhos' sem duplicar itens já salvos", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onBatchImported = vi.fn();

    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(
        makePreview({ externalId: "fit_ok_1", name: "Treino Ok 1" })
      )
      .mockRejectedValueOnce(new Error("Arquivo FIT corrompido (CRC inválido)"))
      .mockResolvedValueOnce(
        makePreview({ externalId: "fit_ok_2", name: "Treino Ok 2" })
      );

    render(<GpxImportPanel onBatchImported={onBatchImported} />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("ok1.fit", 1024, 5001),
      makeActivityFile("corrompido.fit", 1024, 5002),
      makeActivityFile("ok2.fit", 1024, 5003),
      makeActivityFile("vazio.fit", 0, 5004),
    ]);

    // Aviso de arquivo inválido/vazio separado
    expect(
      await screen.findByTestId("batch-rejections-alert")
    ).toHaveTextContent(/vazio\.fit/i);

    await waitFor(() => {
      expect(screen.getByTestId("batch-item-status-1")).toHaveTextContent(
        "Erro na leitura"
      );
    });
    expect(screen.getByTestId("batch-submit-btn")).toHaveTextContent(
      "Importar Lote (2 prontos)"
    );

    // Simula falha de API apenas no 2º item válido durante a 1ª gravação
    vi.mocked(tafService.saveTraining)
      .mockResolvedValueOnce({} as TrainingSession)
      .mockRejectedValueOnce(new Error("Timeout PostgreSQL"))
      .mockImplementationOnce(async (tr: TrainingSession) => tr);

    await user.click(screen.getByTestId("batch-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("batch-import-summary")).toHaveTextContent(
        /1 novo\(s\).*2 falha\(s\)/i
      );
    });
    expect(screen.getByTestId("batch-item-status-0")).toHaveTextContent(
      "Salvo ✓"
    );
    expect(screen.getByTestId("batch-item-status-2")).toHaveTextContent(
      "Falha ao salvar"
    );

    // Remove o item irrecuperável (corrompido, index 1) -> restam [ok1 (salvo), ok2 (save_error)]
    await user.click(screen.getByTestId("batch-item-remove-1"));
    expect(screen.getByTestId("batch-queue-count")).toHaveTextContent(
      "2 atividades na fila"
    );

    // Agora "Tentar novamente falhos (1)" reenvia SOMENTE ok2 sem duplicar ok1
    const callsBeforeRetry = vi.mocked(tafService.saveTraining).mock.calls
      .length;
    await user.click(screen.getByTestId("batch-retry-failed-btn"));

    await waitFor(() => {
      expect(vi.mocked(tafService.saveTraining).mock.calls.length).toBe(
        callsBeforeRetry + 1
      );
    });
    expect(
      vi.mocked(tafService.saveTraining).mock.calls[callsBeforeRetry][0]
        .externalId
    ).toBe("fit_ok_2");
    expect(screen.getByTestId("batch-item-status-1")).toHaveTextContent(
      "Salvo ✓"
    );
  });

  it("6. Respeita política skip vs update, dedup intra-lote, espelho seguro TAF→Diário e fallback/limites TAF", async () => {
    const user = userEvent.setup({ applyAccept: false });

    vi.mocked(tafService.parseActivity)
      // Item 0: já existe no Diário E já existe em Simulados TAF
      .mockResolvedValueOnce(
        makePreview({
          externalId: "fit_dup",
          name: "Simulado Repetido DB",
          alreadyExists: true,
          existingTrainingId: "trn_db_99",
          alreadyExistsAttempt: true,
          existingAttemptId: "att_db_77",
        })
      )
      // Item 1: arquivo distinto com MESMO externalId do Item 0 (duplicado intra-lote)
      .mockResolvedValueOnce(
        makePreview({
          externalId: "fit_dup",
          name: "Cópia Mesmo Treino",
          alreadyExists: true,
          existingTrainingId: "trn_db_99",
          alreadyExistsAttempt: true,
          existingAttemptId: "att_db_77",
        })
      )
      // Item 2: arquivo incompleto que pede fallback manual e fica válido após preenchimento
      .mockResolvedValueOnce(
        makePreview({
          externalId: "gpx_incompleto",
          source: "gpx_upload",
          filesUsed: ["gpx"],
          name: "GPX Sem Métricas",
          startedAt: "",
          distanceKm: 0,
          durationSeconds: 0,
          tafWindow: null,
        })
      );

    render(<GpxImportPanel defaultSaveAs="taf_attempt" />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("dup1.fit", 1024, 6001),
      makeActivityFile("dup2.fit", 1024, 6002),
      makeActivityFile("sem_metricas.gpx", 1024, 6003),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("batch-item-status-2")).toHaveTextContent(
        "Requer dados manuais"
      );
    });

    // No modo padrão "skip", item 0 é pulado por já existir no TAF e item 1 é repetido neste lote
    expect(screen.getByTestId("batch-item-status-0")).toHaveTextContent(
      "Duplicado (será pulado)"
    );
    expect(screen.getByTestId("batch-item-status-1")).toHaveTextContent(
      "Repetido neste lote"
    );

    // Preenche fallback manual no item 2 -> vira pronto para salvar
    await user.type(
      screen.getByTestId("batch-item-fallback-distance-2"),
      "2.8"
    );
    await user.type(
      screen.getByTestId("batch-item-fallback-duration-2"),
      "720"
    );
    expect(screen.getByTestId("batch-item-status-2")).toHaveTextContent(
      "Pronto para salvar"
    );

    // Troca política para "update" e marca espelhamento no Diário
    await user.selectOptions(
      screen.getByTestId("batch-duplicate-policy-select"),
      "update"
    );
    expect(screen.getByTestId("batch-item-status-0")).toHaveTextContent(
      "Duplicado (será atualizado)"
    );
    // Repetido neste lote CONTINUA bloqueado mesmo em update
    expect(screen.getByTestId("batch-item-status-1")).toHaveTextContent(
      "Repetido neste lote"
    );

    await user.click(screen.getByTestId("batch-also-save-diary-checkbox"));

    await user.click(screen.getByTestId("batch-submit-btn"));

    await waitFor(() => {
      // Item 0 (update) + Item 2 (create) = 2 saveAttempt + 2 espelhos saveTraining
      expect(tafService.saveAttempt).toHaveBeenCalledTimes(2);
      expect(tafService.saveTraining).toHaveBeenCalledTimes(2);
    });

    const attCalls = vi.mocked(tafService.saveAttempt).mock.calls;
    const updatedAttemptCall = attCalls.find(
      ([att]) => att.externalId === "fit_dup"
    );
    expect(updatedAttemptCall?.[0]).toMatchObject({
      id: "att_db_77",
      onDuplicate: "update",
    });
    expect(updatedAttemptCall?.[2]).toEqual({ skipSheetsSync: true });

    const trnCalls = vi.mocked(tafService.saveTraining).mock.calls;
    const updatedDiaryMirror = trnCalls.find(
      ([tr]) => tr.externalId === "fit_dup"
    );
    expect(updatedDiaryMirror?.[0]).toMatchObject({
      id: "trn_db_99",
      onDuplicate: "update",
    });
    expect(updatedDiaryMirror?.[2]).toEqual({ skipSheetsSync: true });

    expect(tafService.syncGoogleSheets).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("batch-sheets-synced-ok")).toBeInTheDocument();
  });

  it("7. Exibe aviso não destrutivo se Sheets falhar após gravação e limpa status de espelho ao alternar TAF → Treino", async () => {
    const user = userEvent.setup({ applyAccept: false });

    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(
        makePreview({ externalId: "fit_s_1", name: "Corrida 1" })
      )
      .mockResolvedValueOnce(
        makePreview({
          externalId: "fit_s_2",
          name: "Corrida Curta Demais",
          tafWindow: {
            targetDurationSeconds: 720,
            actualDurationSeconds: 20,
            distanceMeters: 60,
            speedKmh: 10.8,
            paceSeconds: 333,
            paceFormatted: "5:33",
            avgHeartRate: null,
            maxHeartRate: null,
            windowStartOffsetSeconds: 0,
            windowEndOffsetSeconds: 20,
            isShorterThanTarget: true,
            laps: [],
          },
        })
      );

    vi.mocked(tafService.syncGoogleSheets).mockRejectedValueOnce(
      new Error("Cota excedida Google Sheets")
    );

    render(<GpxImportPanel defaultSaveAs="taf_attempt" />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("corrida1.fit", 1024, 7001),
      makeActivityFile("curta.fit", 1024, 7002),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("batch-item-status-1")).toHaveTextContent(
        "Fora dos limites TAF"
      );
    });

    await user.click(screen.getByTestId("batch-also-save-diary-checkbox"));
    await user.click(screen.getByTestId("batch-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("batch-sheets-warning")).toHaveTextContent(
        /Cota excedida Google Sheets/i
      );
    });
    expect(screen.getByTestId("batch-item-mirror-status-0")).toHaveTextContent(
      "Espelhado também no Diário de Treinos ✓"
    );

    // Alterna destino único global para Treinos e valida limpeza do banner de espelho antigo
    vi.mocked(tafService.syncGoogleSheets).mockResolvedValueOnce({
      direction: "push",
      forceFullResync: false,
      pushedAppended: 1,
      pushedUpdated: 0,
      pulledCreated: 0,
      pulledUpdated: 0,
      pulledLinked: 0,
      tafPushedAppended: 0,
      tafPushedUpdated: 0,
      tafPulledCreated: 0,
      tafPulledUpdated: 0,
      tafPulledLinked: 0,
      profileSynced: false,
      skipped: 0,
      warnings: [],
      durationMs: 120,
      syncedAt: "2026-11-14T17:01:00.000Z",
    });

    await user.click(screen.getByTestId("batch-target-training"));
    expect(
      screen.queryByTestId("batch-item-mirror-status-0")
    ).not.toBeInTheDocument();

    // Agora item 1 (20s < 30s) entra em Requer dados manuais no modo Training,
    // e item 0 pode ser gravado normalmente como Treino sem resíduo de espelho
    await user.click(screen.getByTestId("batch-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("batch-sheets-synced-ok")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("batch-item-mirror-status-0")
    ).not.toBeInTheDocument();
  });

  it("8. Valida peso inválido, adiciona mais arquivos à fila deduplicando repetidos e não chama Sheets quando não configurado", async () => {
    const user = userEvent.setup({ applyAccept: false });

    vi.mocked(tafService.getSheetsSyncStatus).mockResolvedValue({
      configured: false,
      pendingTrainingsCount: 0,
      pendingAttemptsCount: 0,
      totalPendingCount: 0,
    });
    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(makePreview({ externalId: "fit_ext_1", name: "Item 1" }))
      .mockResolvedValueOnce(makePreview({ externalId: "fit_ext_2", name: "Item 2" }))
      .mockResolvedValueOnce(makePreview({ externalId: "fit_ext_3", name: "Item 3" }));

    render(<GpxImportPanel />);

    const f1 = makeActivityFile("um.fit", 1024, 8001);
    const f2 = makeActivityFile("dois.fit", 1024, 8002);
    const f3 = makeActivityFile("tres.fit", 1024, 8003);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [f1, f2]);

    await waitFor(() => {
      expect(screen.getByTestId("batch-item-title-1")).toBeInTheDocument();
    });

    // Adiciona novamente f1 (já está na fila) + f3 novo
    await user.upload(fileInput, [f1, f3]);

    expect(
      await screen.findByTestId("batch-rejections-alert")
    ).toHaveTextContent(/1 arquivo\(s\) já estavam na fila/i);
    expect(screen.getByTestId("batch-queue-count")).toHaveTextContent(
      "3 atividades na fila"
    );

    // Peso corporal inválido bloqueia submit com mensagem clara
    const weightInput = screen.getByTestId("batch-default-weight-input");
    await user.clear(weightInput);
    await user.type(weightInput, "15");
    await user.click(screen.getByTestId("batch-submit-btn"));

    expect(screen.getByTestId("batch-action-error")).toHaveTextContent(
      /peso corporal válido entre 30 kg e 250 kg/i
    );
    expect(tafService.saveTraining).not.toHaveBeenCalled();

    // Corrige peso e envia sem Sheets configurado
    await user.clear(weightInput);
    await user.type(weightInput, "72");
    await user.click(screen.getByTestId("batch-submit-btn"));

    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledTimes(3);
    });
    expect(tafService.syncGoogleSheets).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("batch-sheets-synced-ok")
    ).not.toBeInTheDocument();
  });

  it("9. Reaproveita item individual ao alternar para Em Massa, permite cancelar análise em andamento e reprocessar", async () => {
    const user = userEvent.setup({ applyAccept: false });

    let resolvePendingParse!: (value: ActivityParsePreview) => void;
    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(
        makePreview({ externalId: "single_seed", name: "Treino Semente" })
      )
      .mockImplementationOnce(
        (_files, opts) =>
          new Promise<ActivityParsePreview>((resolve, reject) => {
            resolvePendingParse = resolve;
            opts?.signal?.addEventListener("abort", () => {
              const abortErr = new Error("Aborted");
              abortErr.name = "AbortError";
              reject(abortErr);
            });
          })
      )
      .mockResolvedValueOnce(
        makePreview({ externalId: "second_after_abort", name: "Segundo Arquivo" })
      );

    render(<GpxImportPanel />);

    // 1. Sobe 1 arquivo no modo Individual
    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [makeActivityFile("semente.fit", 1024, 9001)]);

    await waitFor(() => {
      expect(screen.getByTestId("smart-post-upload-form")).toBeInTheDocument();
    });

    // 2. Alterna manualmente para Modo Em Massa e verifica seed preservado
    await user.click(screen.getByTestId("import-mode-batch"));
    expect(screen.getByTestId("batch-queue-count")).toHaveTextContent(
      "1 atividade na fila"
    );
    expect(
      (screen.getByTestId("batch-item-title-0") as HTMLInputElement).value
    ).toBe("Treino Semente");

    // 3. Enfileira novo arquivo cuja análise ficará pendente e cancela em seguida
    await user.upload(fileInput, [makeActivityFile("segundo.fit", 1024, 9002)]);
    const cancelBtn = await screen.findByTestId("batch-cancel-analyze-btn");
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(screen.getByTestId("batch-item-status-1")).toHaveTextContent(
        "Análise cancelada"
      );
    });
    expect(resolvePendingParse).toBeDefined();

    // 4. Reprocessa apenas o item cancelado
    await user.click(screen.getByTestId("batch-item-retry-parse-1"));
    await waitFor(() => {
      expect(screen.getByTestId("batch-item-status-1")).toHaveTextContent(
        "Pronto para salvar"
      );
    });
    expect(
      (screen.getByTestId("batch-item-title-1") as HTMLInputElement).value
    ).toBe("Segundo Arquivo");
  });

  it("10. Suporta drag-and-drop, troca de destino durante análise, Sobrescrever todos no tênis e bloqueia drop durante gravação", async () => {
    const user = userEvent.setup({ applyAccept: false });

    let resolveSecondParse!: (value: ActivityParsePreview) => void;
    let resolveSave!: (value: TafAttempt) => void;

    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(
        makePreview({ externalId: "dnd_1", name: "Drag 1" })
      )
      .mockImplementationOnce(
        () =>
          new Promise<ActivityParsePreview>((resolve) => {
            resolveSecondParse = resolve;
          })
      );

    vi.mocked(tafService.saveAttempt).mockImplementationOnce(
      () =>
        new Promise<TafAttempt>((resolve) => {
          resolveSave = resolve;
        })
    );

    render(<GpxImportPanel />);

    // 1. Arrasta e solta 2 arquivos na dropzone para entrar automaticamente em Em Massa
    const dropzone = screen.getByTestId("activity-dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [
          makeActivityFile("drag1.fit", 1024, 10001),
          makeActivityFile("drag2.fit", 1024, 10002),
        ],
      },
    });

    expect(
      await screen.findByTestId("batch-import-workspace")
    ).toBeInTheDocument();

    // 2. Enquanto o 2º arquivo ainda analisa, alterna destino único global para Simulado TAF
    await user.click(screen.getByTestId("batch-target-taf"));
    expect(screen.getByTestId("batch-target-taf")).toHaveAttribute(
      "aria-checked",
      "true"
    );

    // Finaliza a análise pendente
    resolveSecondParse(makePreview({ externalId: "dnd_2", name: "Drag 2" }));
    await waitFor(() => {
      expect(screen.getByTestId("batch-submit-btn")).toHaveTextContent(
        "Importar Lote (2 prontos)"
      );
    });

    // 3. Tênis customizado no item 0 + default global -> "Sobrescrever todos" uniformiza os dois
    await user.type(screen.getByTestId("batch-item-shoe-0"), "Tênis Antigo");
    await user.type(screen.getByTestId("batch-default-shoe-input"), "Vaporfly 3");
    expect(
      (screen.getByTestId("batch-item-shoe-0") as HTMLInputElement).value
    ).toBe("Tênis Antigo");
    await user.click(screen.getByTestId("batch-apply-shoe-all-btn"));
    expect(
      (screen.getByTestId("batch-item-shoe-0") as HTMLInputElement).value
    ).toBe("Vaporfly 3");
    expect(
      (screen.getByTestId("batch-item-shoe-1") as HTMLInputElement).value
    ).toBe("Vaporfly 3");

    // 4. Inicia gravação (em progresso) e verifica que drag-and-drop adicional é bloqueado durante saving
    await user.click(screen.getByTestId("batch-submit-btn"));
    await waitFor(() => {
      expect(tafService.saveAttempt).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId("batch-progress-bar")).toBeInTheDocument();

    const parseCallsBeforeBlockedDrop = vi.mocked(tafService.parseActivity).mock
      .calls.length;
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [makeActivityFile("intruso.fit", 1024, 10003)],
      },
    });
    expect(tafService.parseActivity).toHaveBeenCalledTimes(
      parseCallsBeforeBlockedDrop
    );
    expect(screen.getByTestId("batch-queue-count")).toHaveTextContent(
      "2 atividades na fila"
    );

    // Conclui save pendente com limpeza adequada
    resolveSave({
      id: "att-1",
      testDate: "2026-11-10T07:00:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2520,
      laps: [],
      paceSeconds: 286,
      paceFormatted: "4:46",
      speedKmh: 12.6,
      avgHeartRate: 168,
      maxHeartRate: 178,
      locationType: "pista_400m",
      shoeName: "Vaporfly 3",
      externalId: "dnd_1",
      createdAt: "2026-11-14T17:00:00.000Z",
      updatedAt: "2026-11-14T17:00:00.000Z",
    });
    await waitFor(() => {
      expect(screen.getByTestId("batch-import-summary")).toBeInTheDocument();
    });
  });

  it("11. Preserva limpeza de RPE do lote quando clicado durante análise em andamento (sem ressuscitar snapshot antigo)", async () => {
    const user = userEvent.setup({ applyAccept: false });

    let resolveSecond!: (value: ActivityParsePreview) => void;
    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(
        makePreview({ externalId: "rpe_1", name: "Treino RPE 1" })
      )
      .mockImplementationOnce(
        () =>
          new Promise<ActivityParsePreview>((resolve) => {
            resolveSecond = resolve;
          })
      );

    render(<GpxImportPanel />);

    // Define RPE 7 antes de subir os arquivos
    await user.click(screen.getByTestId("import-mode-batch"));
    await user.click(screen.getByTestId("batch-default-rpe-btn-7"));

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("rpe1.fit", 1024, 11001),
      makeActivityFile("rpe2.fit", 1024, 11002),
    ]);

    await waitFor(() => {
      expect(resolveSecond).toBeDefined();
    });

    // Limpa o RPE enquanto o 2º item ainda está analisando
    await user.click(screen.getByRole("button", { name: /Limpar RPE do lote/i }));

    // Finaliza a análise pendente
    resolveSecond(makePreview({ externalId: "rpe_2", name: "Treino RPE 2" }));
    await waitFor(() => {
      expect(screen.getByTestId("batch-submit-btn")).toHaveTextContent(
        "Importar Lote (2 prontos)"
      );
    });

    await user.click(screen.getByTestId("batch-submit-btn"));
    await waitFor(() => {
      expect(tafService.saveTraining).toHaveBeenCalledTimes(2);
    });

    expect(vi.mocked(tafService.saveTraining).mock.calls[0][0].perceivedEffort).toBeNull();
    expect(vi.mocked(tafService.saveTraining).mock.calls[1][0].perceivedEffort).toBeNull();
  });

  it("12. Distingue caminhada vs corrida no lote (incluindo unknown walk), sinaliza divergência de família e reseta default ao limpar fila", async () => {
    const user = userEvent.setup({ applyAccept: false });

    vi.mocked(tafService.parseActivity)
      .mockResolvedValueOnce(
        makePreview({
          externalId: "batch_walk_fit",
          name: "Caminhada no Parque",
          sourceActivityKind: "walk",
          rawType: "walking:casualwalking",
          speedKmh: 5.4,
          suggestedActivityType: "caminhada",
          allowedActivityTypes: ["caminhada"],
        })
      )
      .mockResolvedValueOnce(
        makePreview({
          externalId: "batch_unknown_walk_gpx",
          source: "gpx_upload",
          filesUsed: ["gpx"],
          name: null,
          rawType: null,
          sourceActivityKind: "unknown",
          speedKmh: 4.9,
          distanceKm: 2.45,
          durationSeconds: 1800,
          suggestedActivityType: null,
          allowedActivityTypes: [
            "rodagem_leve",
            "corrida_continua",
            "tempo_run",
            "corrida_intervalada",
            "longao",
            "caminhada",
          ],
          warnings: [
            {
              code: "UNKNOWN_ACTIVITY_TYPE",
              message:
                "O arquivo .GPX não informa o tipo da atividade (<type>); escolha a modalidade antes de salvar.",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        makePreview({
          externalId: "batch_run_fit",
          name: "Corrida Matinal",
          sourceActivityKind: "run",
          rawType: "running:street",
          speedKmh: 11.8,
          suggestedActivityType: "corrida_continua",
          allowedActivityTypes: [
            "rodagem_leve",
            "corrida_continua",
            "tempo_run",
            "corrida_intervalada",
            "longao",
          ],
        })
      );

    render(<GpxImportPanel />);

    const fileInput = screen.getByTestId(
      "activity-file-input"
    ) as HTMLInputElement;
    await user.upload(fileInput, [
      makeActivityFile("walk.fit", 1024, 12001),
      makeActivityFile("Caminhada_matinal.gpx", 1024, 12002),
      makeActivityFile("run.fit", 1024, 12003),
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("batch-item-activity-2")).toBeInTheDocument();
    });

    const act0 = screen.getByTestId("batch-item-activity-0") as HTMLSelectElement;
    const act1 = screen.getByTestId("batch-item-activity-1") as HTMLSelectElement;
    const act2 = screen.getByTestId("batch-item-activity-2") as HTMLSelectElement;

    expect(act0.value).toBe("caminhada");
    expect(act1.value).toBe("caminhada");
    expect(act2.value).toBe("corrida_continua");

    expect(screen.getByTestId("batch-item-kind-0")).toHaveTextContent("Caminhada");
    expect(screen.getByTestId("batch-item-kind-1")).toHaveTextContent(
      "Tipo não detectado"
    );
    expect(screen.getByTestId("batch-item-kind-2")).toHaveTextContent("Corrida");
    expect(screen.getByTestId("batch-item-activity-warning-1")).toHaveTextContent(
      /<type>/i
    );

    // Override global para Corrida Contínua dispara alerta na caminhada detectada
    await user.selectOptions(
      screen.getByTestId("batch-default-activity-select"),
      "corrida_continua"
    );
    expect(act0.value).toBe("corrida_continua");
    expect(screen.getByTestId("batch-item-activity-warning-0")).toHaveTextContent(
      /difere do arquivo \(Caminhada\)/i
    );

    // Limpar lote volta default global para 'auto' sem prender próximo lote
    await user.click(screen.getByTestId("batch-clear-queue-btn"));
    expect(
      (
        screen.getByTestId(
          "batch-default-activity-select"
        ) as HTMLSelectElement
      ).value
    ).toBe("auto");
  });
});
