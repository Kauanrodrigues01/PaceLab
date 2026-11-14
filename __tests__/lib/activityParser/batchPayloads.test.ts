import { describe, it, expect, vi, afterEach } from "vitest";
import type { ActivityParsePreview, TafAttempt, TrainingSession } from "@/types";
import type { SheetsSyncReport, SheetsSyncStatus } from "@/lib/googleSheets/types";
import {
  CreateTafAttemptSchema,
  CreateTrainingSessionSchema,
} from "@/lib/validations/taf";
import {
  buildMirroredTrainingFromAttempt,
  generateClientRecordId,
} from "@/lib/sheetsSyncUi";
import { groupActivityFilesForBatch } from "@/lib/activityParser/batchGrouping";
import {
  analyzeBatchActivityGroups,
  type BatchSaveOptions,
  buildSafeMirroredDiaryPayload,
  buildTafAttemptFromPreview,
  buildTrainingSessionFromPreview,
  computeFallbackTafWindow,
  createPendingBatchItems,
  evaluateBatchItemEligibility,
  isTafWindowOutOfBounds,
  persistBatchActivityItems,
  resolveDefaultBatchLocationType,
  resolveSafeIsoDate,
  runPool,
} from "@/lib/activityParser/batchPayloads";

function makeFakeFile(name: string, size = 1024, lastModified = 1700000000000): File {
  const file = new File([new Uint8Array(64)], name, { lastModified });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function makePreview(overrides: Partial<ActivityParsePreview> = {}): ActivityParsePreview {
  return {
    source: "fit_upload",
    filesUsed: ["fit"],
    name: "Rodagem Matinal",
    titleSource: "metadata",
    rawType: "running",
    sourceActivityKind: "run",
    isIndoor: false,
    startedAt: "2026-10-29T09:00:00.000Z",
    distanceKm: 6.0,
    durationSeconds: 1800,
    elapsedSeconds: 1840,
    speedKmh: 12.0,
    paceSeconds: 300,
    paceFormatted: "5:00",
    avgHeartRate: 158,
    maxHeartRate: 174,
    avgCadence: 176,
    elevationGainM: 42,
    activeCalories: 410,
    avgTemperatureC: 23.5,
    splits: [{ kilometer: 1, durationSeconds: 300, paceFormatted: "5:00" }],
    laps: [],
    externalId: "fit_unique_1",
    pointCount: 1800,
    warnings: [],
    alreadyExists: false,
    existingTrainingId: null,
    alreadyExistsAttempt: false,
    existingAttemptId: null,
    tafWindow: {
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2640,
      speedKmh: 13.2,
      paceSeconds: 273,
      paceFormatted: "4:33",
      avgHeartRate: 168,
      maxHeartRate: 179,
      windowStartOffsetSeconds: 120,
      windowEndOffsetSeconds: 840,
      isShorterThanTarget: false,
      laps: [{ lapNumber: 1, distanceMeters: 400, durationSeconds: 109, paceFormatted: "4:33" }],
    },
    suggestedActivityType: "corrida_continua",
    suggestedNotes: "Rodagem Matinal",
    allowedActivityTypes: ["rodagem_leve", "corrida_continua", "tempo_run"],
    ...overrides,
  };
}

function makeSyncReport(): SheetsSyncReport {
  return {
    direction: "push",
    forceFullResync: false,
    pulledUpdated: 0,
    pulledCreated: 0,
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
    durationMs: 42,
    syncedAt: "2026-10-29T10:00:00.000Z",
  };
}

describe("lib/sheetsSyncUi — generateClientRecordId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("gera IDs 100% únicos em loop rápido no mesmo milissegundo com prefixo trn_ / att_", () => {
    vi.spyOn(Date, "now").mockReturnValue(1760000000000);

    const trnIds = new Set(Array.from({ length: 100 }, () => generateClientRecordId("trn")));
    const attIds = new Set(Array.from({ length: 100 }, () => generateClientRecordId("att")));

    expect(trnIds.size).toBe(100);
    expect(attIds.size).toBe(100);
    expect(Array.from(trnIds).every((id) => id.startsWith("trn_"))).toBe(true);
    expect(Array.from(attIds).every((id) => id.startsWith("att_"))).toBe(true);
  });

  it("mantém unicidade absoluta mesmo no fallback sem crypto.randomUUID no mesmo ms", () => {
    vi.spyOn(Date, "now").mockReturnValue(1760000000000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    vi.stubGlobal("crypto", {});

    const ids = new Set(Array.from({ length: 50 }, () => generateClientRecordId("trn")));
    expect(ids.size).toBe(50);

    const attemptStub = {
      id: "att_1",
      testDate: "2026-10-29T09:00:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2600,
      speedKmh: 13,
      paceSeconds: 277,
      paceFormatted: "4:37",
      createdAt: "2026-10-29T09:00:00.000Z",
      updatedAt: "2026-10-29T09:00:00.000Z",
    } satisfies TafAttempt;

    const m1 = buildMirroredTrainingFromAttempt({ attempt: attemptStub });
    const m2 = buildMirroredTrainingFromAttempt({ attempt: attemptStub });
    expect(m1.id).toMatch(/^trn_/);
    expect(m2.id).toMatch(/^trn_/);
    expect(m1.id).not.toBe(m2.id);
  });
});

describe("lib/activityParser/batchPayloads — Builders de Payload e Validações", () => {
  it("resolveSafeIsoDate e resolveDefaultBatchLocationType aplicam fallbacks determinísticos", () => {
    expect(resolveSafeIsoDate("2026-10-29T10:00:00.000Z", "")).toBe(
      "2026-10-29T10:00:00.000Z"
    );
    const fromFallback = resolveSafeIsoDate("", "2026-10-28T07:30");
    expect(Number.isNaN(Date.parse(fromFallback))).toBe(false);
    expect(resolveSafeIsoDate("invalid-date", "also-invalid")).toMatch(/T/);

    expect(resolveDefaultBatchLocationType({ isIndoor: true })).toBe("esteira");
    expect(resolveDefaultBatchLocationType({ isIndoor: false })).toBe("pista_400m");
  });

  it("buildTrainingSessionFromPreview prioriza Compêndio 2024 com peso e cai para calorias .FIT sem peso", () => {
    const preview = makePreview({ activeCalories: 390 });

    const withWeight = buildTrainingSessionFromPreview({
      preview,
      activityType: "corrida_continua",
      workoutTitle: "Rodagem Teste",
      notes: "Forte no final",
      shoeName: "Pegasus 41",
      perceivedEffort: 7,
      bodyWeightKg: "74,5",
    });

    expect(withWeight.ok).toBe(true);
    if (withWeight.ok) {
      expect(withWeight.payload.id).toMatch(/^trn_/);
      expect(withWeight.payload.calorieMethod).toBe("compendium_2024_met");
      expect(withWeight.payload.calorieSource).toBe("auto_calculated");
      expect(withWeight.payload.bodyWeightKg).toBe(74.5);
      expect(withWeight.payload.elapsedSeconds).toBe(1840);
      expect(withWeight.payload.notes).toBe("Rodagem Teste — Forte no final");
      expect(withWeight.payload.shoeName).toBe("Pegasus 41");
    }

    const withoutWeight = buildTrainingSessionFromPreview({
      preview,
      activityType: "corrida_continua",
      bodyWeightKg: "",
    });
    expect(withoutWeight.ok).toBe(true);
    if (withoutWeight.ok) {
      expect(withoutWeight.payload.calorieMethod).toBe("garmin_fit_device");
      expect(withoutWeight.payload.activeCalories).toBe(390);
      expect(withoutWeight.payload.calorieSource).toBe("device_fit");
    }

    const noCaloriesAtAll = buildTrainingSessionFromPreview({
      preview: makePreview({ activeCalories: null }),
      activityType: "caminhada",
    });
    expect(noCaloriesAtAll.ok).toBe(true);
    if (noCaloriesAtAll.ok) {
      expect(noCaloriesAtAll.payload.calorieMethod).toBeNull();
      expect(noCaloriesAtAll.payload.activeCalories).toBeNull();
    }
  });

  it("buildTrainingSessionFromPreview valida limites de peso, distância e duração e suporta onDuplicate", () => {
    const preview = makePreview();

    expect(
      buildTrainingSessionFromPreview({
        preview,
        activityType: "corrida_continua",
        bodyWeightKg: "20",
      })
    ).toEqual({
      ok: false,
      error: "Informe um peso corporal válido entre 30 kg e 250 kg (ou deixe em branco).",
    });

    expect(
      buildTrainingSessionFromPreview({
        preview: makePreview({ distanceKm: 0 }),
        activityType: "corrida_continua",
        fallbackDistanceKm: "0.01",
        fallbackDurationSec: "300",
      }).ok
    ).toBe(false);

    expect(
      buildTrainingSessionFromPreview({
        preview: makePreview({ durationSeconds: 0 }),
        activityType: "corrida_continua",
        fallbackDistanceKm: "5",
        fallbackDurationSec: "15",
      }).ok
    ).toBe(false);

    const updateBuild = buildTrainingSessionFromPreview({
      preview: makePreview({
        alreadyExists: true,
        existingTrainingId: "trn_db_existing",
      }),
      activityType: "longao",
      onDuplicate: "update",
    });
    expect(updateBuild.ok).toBe(true);
    if (updateBuild.ok) {
      expect(updateBuild.payload.id).toBe("trn_db_existing");
      expect(updateBuild.payload.onDuplicate).toBe("update");
    }
  });

  it("buildTafAttemptFromPreview e computeFallbackTafWindow calculam janela 12 min, validam bounds e FC", () => {
    const previewNoWindow = makePreview({
      tafWindow: null,
      distanceKm: 4.8,
      durationSeconds: 1440,
      avgHeartRate: 170,
      maxHeartRate: 165, // propositalmente menor que avg para testar clamp
    });

    const fallbackWin = computeFallbackTafWindow(previewNoWindow);
    expect(fallbackWin).not.toBeNull();
    expect(fallbackWin?.actualDurationSeconds).toBe(720);
    expect(fallbackWin?.distanceMeters).toBe(2400);
    expect(fallbackWin?.isShorterThanTarget).toBe(false);

    const built = buildTafAttemptFromPreview({
      preview: previewNoWindow,
      locationType: "pista_400m",
      workoutTitle: "Simulado Oficial",
      shoeName: "Corre 4",
      onDuplicate: "update",
      existingAttemptId: "att_existing_99",
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.payload.id).toBe("att_existing_99");
      expect(built.payload.distanceMeters).toBe(2400);
      expect(built.payload.actualDurationSeconds).toBe(720);
      expect(built.payload.avgHeartRate).toBe(170);
      expect(built.payload.maxHeartRate).toBe(170); // clamped >= avgHeartRate
      expect(built.payload.onDuplicate).toBe("update");
    }

    const outOfBoundsPreview = makePreview({
      tafWindow: {
        targetDurationSeconds: 720,
        actualDurationSeconds: 600,
        distanceMeters: 80, // < 100 m
        speedKmh: 0.48,
        paceSeconds: 7500,
        paceFormatted: "125:00",
        avgHeartRate: null,
        maxHeartRate: null,
        windowStartOffsetSeconds: 0,
        windowEndOffsetSeconds: 600,
        isShorterThanTarget: true,
        laps: [],
      },
    });
    expect(isTafWindowOutOfBounds(outOfBoundsPreview.tafWindow)).toBe(true);
    expect(
      buildTafAttemptFromPreview({
        preview: outOfBoundsPreview,
        locationType: "rua_plana",
      }).ok
    ).toBe(false);
  });

  it("buildSafeMirroredDiaryPayload evita cópia órfã no Diário ao espelhar TAF já existente", () => {
    const attempt: TafAttempt = {
      id: "att_900",
      source: "fit_upload",
      externalId: "fit_shared_1",
      testDate: "2026-10-29T09:00:00.000Z",
      targetDurationSeconds: 720,
      actualDurationSeconds: 720,
      distanceMeters: 2600,
      speedKmh: 13.0,
      paceSeconds: 277,
      paceFormatted: "4:37",
      laps: [],
      createdAt: "2026-10-29T09:00:00.000Z",
      updatedAt: "2026-10-29T09:00:00.000Z",
    };

    // 1. Novo no Diário -> cria normalmente mantendo externalId
    const planCreate = buildSafeMirroredDiaryPayload({
      attempt,
      preview: makePreview({
        externalId: "fit_shared_1",
        alreadyExists: false,
        durationSeconds: 722,
        activeCalories: 210,
      }),
      duplicatePolicy: "skip",
    });
    expect(planCreate.action).toBe("create");
    expect(planCreate.payload?.externalId).toBe("fit_shared_1");
    expect(planCreate.payload?.activeCalories).toBe(210);

    // 2. Já existe no Diário + skip -> NÃO cria segunda cópia órfã!
    const planSkip = buildSafeMirroredDiaryPayload({
      attempt,
      preview: makePreview({
        externalId: "fit_shared_1",
        alreadyExists: true,
        existingTrainingId: "trn_old_1",
      }),
      duplicatePolicy: "skip",
    });
    expect(planSkip).toEqual({ action: "skip" });

    // 3. Já existe no Diário + update -> atualiza treino vinculado com onDuplicate: "update"
    const planUpdate = buildSafeMirroredDiaryPayload({
      attempt,
      preview: makePreview({
        externalId: "fit_shared_1",
        alreadyExists: true,
        existingTrainingId: "trn_old_1",
      }),
      duplicatePolicy: "update",
    });
    expect(planUpdate.action).toBe("update");
    expect(planUpdate.payload?.id).toBe("trn_old_1");
    expect(planUpdate.payload?.externalId).toBe("fit_shared_1");
    expect(planUpdate.payload?.onDuplicate).toBe("update");
  });
});

describe("lib/activityParser/batchPayloads — Pool de Análise e Persistência em Massa", () => {
  it("runPool respeita concorrência máxima e preserva ordem dos resultados", async () => {
    let active = 0;
    let peak = 0;

    const results = await runPool([10, 20, 30, 40, 50], 2, async (val) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return val * 2;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(results).toEqual([20, 40, 60, 80, 100]);
  });

  it("analyzeBatchActivityGroups isola erro em arquivo corrompido, marca duplicado intra-lote e respeita defaults", async () => {
    const grouped = groupActivityFilesForBatch([
      makeFakeFile("a_ok.fit", 1000),
      makeFakeFile("b_bad.fit", 1100),
      makeFakeFile("c_copia_a.fit", 1200),
      makeFakeFile("d_esteira.gpx", 900),
    ]);

    const pending = createPendingBatchItems(grouped.groups, {
      defaultShoeName: "Novablast 5",
      defaultPerceivedEffort: 6,
    });

    const parseMock = vi.fn(async (files: File[]) => {
      const name = files[0].name;
      if (name === "b_bad.fit") {
        throw new Error("Arquivo .FIT corrompido.");
      }
      if (name === "c_copia_a.fit") {
        return makePreview({ externalId: "fit_a", name: null });
      }
      if (name === "d_esteira.gpx") {
        return makePreview({
          externalId: "gpx_d",
          source: "gpx_upload",
          filesUsed: ["gpx"],
          isIndoor: true,
          name: "",
          suggestedNotes: "",
        });
      }
      return makePreview({ externalId: "fit_a", name: "Treino A" });
    });

    const analyzed = await analyzeBatchActivityGroups(pending, parseMock, {
      concurrency: 3,
      defaultShoeName: "Novablast 5",
      defaultPerceivedEffort: 6,
    });

    expect(analyzed.aborted).toBe(false);
    expect(analyzed.items[0].parseStatus).toBe("ready");
    expect(analyzed.items[0].workoutTitle).toBe("Treino A");
    expect(analyzed.items[0].isDuplicateInBatch).toBe(false);

    expect(analyzed.items[1].parseStatus).toBe("parse_error");
    expect(analyzed.items[1].parseError).toContain("corrompido");

    expect(analyzed.items[2].parseStatus).toBe("ready");
    expect(analyzed.items[2].isDuplicateInBatch).toBe(true);
    expect(analyzed.items[2].duplicateOfItemId).toBe(analyzed.items[0].id);

    expect(analyzed.items[3].parseStatus).toBe("ready");
    expect(analyzed.items[3].locationType).toBe("esteira");
    expect(analyzed.items[3].workoutTitle).toBe("d esteira");
  });

  it("persistBatchActivityItems pula duplicados (DB e lote), usa { skipSheetsSync: true } e dispara 1 único push Sheets", async () => {
    const grouped = groupActivityFilesForBatch([
      makeFakeFile("t1_novo.fit", 1000),
      makeFakeFile("t2_dup_db.fit", 1100),
      makeFakeFile("t3_dup_lote.fit", 1200),
    ]);

    const items = createPendingBatchItems(grouped.groups);
    const analyzed = await analyzeBatchActivityGroups(items, async (files) => {
      if (files[0].name === "t2_dup_db.fit") {
        return makePreview({
          externalId: "fit_db",
          alreadyExists: true,
          existingTrainingId: "trn_old_db",
        });
      }
      return makePreview({ externalId: "fit_shared_lote" });
    });

    const saveTraining = vi.fn(
      async (
        t: TrainingSession & { onDuplicate?: "update" },
        _isUpdate?: boolean,
        _opts?: BatchSaveOptions
      ): Promise<TrainingSession> => ({ ...t })
    );
    const saveAttempt = vi.fn();
    const getSheetsSyncStatus = vi.fn(
      async (): Promise<SheetsSyncStatus> => ({
        configured: true,
        pendingTrainingsCount: 0,
        pendingAttemptsCount: 0,
        totalPendingCount: 0,
      })
    );
    const syncGoogleSheets = vi.fn(async () => makeSyncReport());
    const progressEvents: number[] = [];

    // Política SKIP
    const resSkip = await persistBatchActivityItems(
      analyzed.items,
      {
        target: "training",
        duplicatePolicy: "skip",
        bodyWeightKg: 72,
      },
      { saveTraining, saveAttempt, getSheetsSyncStatus, syncGoogleSheets },
      { onProgress: (p) => progressEvents.push(p.completed) }
    );

    expect(resSkip.summary.savedCount).toBe(1);
    expect(resSkip.summary.skippedCount).toBe(2); // t2_dup_db + t3_dup_lote
    expect(resSkip.summary.failedCount).toBe(0);
    expect(resSkip.summary.sheetsSynced).toBe(true);
    expect(progressEvents).toEqual([1]);

    expect(saveTraining).toHaveBeenCalledTimes(1);
    expect(saveTraining.mock.calls[0][2]).toEqual({ skipSheetsSync: true });
    expect(syncGoogleSheets).toHaveBeenCalledTimes(1);
    expect(syncGoogleSheets).toHaveBeenCalledWith({
      direction: "push",
      forceFullResync: false,
    });

    // Política UPDATE no mesmo cenário: retry sobre resSkip não reenvia t1_novo (já saved), atualiza t2_dup_db!
    saveTraining.mockClear();
    syncGoogleSheets.mockClear();
    const resUpdate = await persistBatchActivityItems(
      resSkip.items,
      {
        target: "training",
        duplicatePolicy: "update",
        bodyWeightKg: 72,
      },
      { saveTraining, saveAttempt, getSheetsSyncStatus, syncGoogleSheets }
    );

    expect(resUpdate.summary.savedCount).toBe(1); // t1_novo mantido como saved (não reenviado!)
    expect(resUpdate.summary.updatedCount).toBe(1); // t2_dup_db atualizado!
    expect(resUpdate.summary.skippedCount).toBe(1); // t3_dup_lote continua skipped
    expect(saveTraining).toHaveBeenCalledTimes(1);
    expect(saveTraining.mock.calls[0][0].id).toBe("trn_old_db");
    expect(saveTraining.mock.calls[0][0].onDuplicate).toBe("update");
    expect(saveTraining.mock.calls[0][2]).toEqual({ skipSheetsSync: true });
    expect(syncGoogleSheets).toHaveBeenCalledTimes(1);
  });

  it("persistBatchActivityItems em modo Simulado TAF espelha no Diário sem cópia órfã e com { skipSheetsSync: true }", async () => {
    const grouped = groupActivityFilesForBatch([
      makeFakeFile("taf1_novo.fit", 1000),
      makeFakeFile("taf2_ja_no_diario.fit", 1100),
    ]);

    const analyzed = await analyzeBatchActivityGroups(
      createPendingBatchItems(grouped.groups),
      async (files) => {
        if (files[0].name === "taf2_ja_no_diario.fit") {
          return makePreview({
            externalId: "fit_taf_2",
            alreadyExists: true,
            existingTrainingId: "trn_link_2",
            alreadyExistsAttempt: false,
          });
        }
        return makePreview({
          externalId: "fit_taf_1",
          alreadyExists: false,
          alreadyExistsAttempt: false,
        });
      }
    );

    const saveAttempt = vi.fn(
      async (
        a: TafAttempt & { onDuplicate?: "update" },
        _isUpdate?: boolean,
        _opts?: BatchSaveOptions
      ): Promise<TafAttempt> => ({ ...a })
    );
    const saveTraining = vi.fn(
      async (
        t: TrainingSession & { onDuplicate?: "update" },
        _isUpdate?: boolean,
        _opts?: BatchSaveOptions
      ): Promise<TrainingSession> => ({ ...t })
    );

    const res = await persistBatchActivityItems(
      analyzed.items,
      {
        target: "taf_attempt",
        duplicatePolicy: "skip",
        alsoSaveToDiary: true,
      },
      { saveAttempt, saveTraining }
    );

    expect(res.summary.savedCount).toBe(2);
    expect(res.summary.mirroredCount).toBe(1); // taf1 espelhado
    expect(res.summary.mirrorSkippedCount).toBe(1); // taf2 pulado (sem cópia órfã!)

    expect(saveAttempt).toHaveBeenCalledTimes(2);
    expect(saveAttempt.mock.calls[0][2]).toEqual({ skipSheetsSync: true });
    expect(saveAttempt.mock.calls[1][2]).toEqual({ skipSheetsSync: true });

    expect(saveTraining).toHaveBeenCalledTimes(1);
    expect(saveTraining.mock.calls[0][0].externalId).toBe("fit_taf_1");
    expect(saveTraining.mock.calls[0][2]).toEqual({ skipSheetsSync: true });
  });

  it("respeita AbortSignal interrompendo análise e gravação sem perder rastreabilidade", async () => {
    const grouped = groupActivityFilesForBatch([
      makeFakeFile("f1.fit", 1000),
      makeFakeFile("f2.fit", 1100),
      makeFakeFile("f3.fit", 1200),
    ]);

    const controller = new AbortController();
    const parseFn = vi.fn(async (files: File[]) => {
      if (files[0].name === "f1.fit") {
        controller.abort();
      }
      return makePreview({ externalId: `id_${files[0].name}` });
    });

    const analyzed = await analyzeBatchActivityGroups(
      createPendingBatchItems(grouped.groups),
      parseFn,
      { concurrency: 1, signal: controller.signal }
    );

    expect(analyzed.aborted).toBe(true);
    expect(analyzed.items[0].parseStatus).toBe("ready");
    expect(analyzed.items[1].parseStatus).toBe("cancelled");
    expect(analyzed.items[2].parseStatus).toBe("cancelled");

    // Teste de AbortSignal durante persistência
    const saveController = new AbortController();
    const readyItems = analyzed.items.map((item, idx) => ({
      ...item,
      parseStatus: "ready" as const,
      preview: makePreview({ externalId: `ext_abort_${idx}` }),
    }));

    const saveTraining = vi.fn(async (t: TrainingSession) => {
      if (t.externalId === "ext_abort_0") {
        saveController.abort();
      }
      return t;
    });

    const persisted = await persistBatchActivityItems(
      readyItems,
      { target: "training", duplicatePolicy: "skip", concurrency: 1 },
      { saveTraining, saveAttempt: vi.fn() },
      { signal: saveController.signal }
    );

    expect(persisted.summary.aborted).toBe(true);
    expect(persisted.summary.savedCount).toBe(1);
    expect(saveTraining).toHaveBeenCalledTimes(1);
  });

  it("isola falhas parciais de save, espelho TAF→Diário e falha de Sheets sem descartar itens gravados", async () => {
    const grouped = groupActivityFilesForBatch([
      makeFakeFile("ok.fit", 1000),
      makeFakeFile("fail_save.fit", 1100),
    ]);

    const analyzed = await analyzeBatchActivityGroups(
      createPendingBatchItems(grouped.groups),
      async (files) =>
        makePreview({
          externalId: `ext_${files[0].name}`,
          alreadyExists: files[0].name === "ok.fit",
          existingTrainingId: files[0].name === "ok.fit" ? "trn_mirror_link" : null,
          durationSeconds: 720,
          activeCalories: 220,
        })
    );

    // Força taf_attempt + update + espelho com falha no espelho para ok.fit e erro de saveAttempt para fail_save.fit
    const saveAttempt = vi.fn(async (attempt: TafAttempt) => {
      if (attempt.externalId === "ext_fail_save.fit") {
        throw new Error("Erro HTTP 500 simulado");
      }
      return attempt;
    });
    const saveTraining = vi.fn(async () => {
      throw new Error("Falha ao espelhar Diário");
    });
    const getSheetsSyncStatus = vi.fn(
      async (): Promise<SheetsSyncStatus> => ({
        configured: true,
        pendingTrainingsCount: 0,
        pendingAttemptsCount: 0,
        totalPendingCount: 0,
      })
    );
    const syncGoogleSheets = vi.fn(async () => {
      throw new Error("Quota Sheets temporariamente indisponível");
    });

    const result = await persistBatchActivityItems(
      analyzed.items,
      {
        target: "taf_attempt",
        duplicatePolicy: "update",
        alsoSaveToDiary: true,
      },
      { saveAttempt, saveTraining, getSheetsSyncStatus, syncGoogleSheets }
    );

    expect(result.summary.savedCount).toBe(1);
    expect(result.summary.failedCount).toBe(1);
    expect(result.summary.mirrorFailedCount).toBe(1);
    expect(result.summary.sheetsSynced).toBe(false);
    expect(result.summary.sheetsSyncWarning).toContain("Quota Sheets");

    expect(result.items[0].saveStatus).toBe("saved");
    expect(result.items[0].mirrorStatus).toBe("error");
    expect(result.items[0].mirrorError).toContain("Falha ao espelhar Diário");
    expect(result.items[1].saveStatus).toBe("save_error");
    expect(result.items[1].saveError).toContain("Erro HTTP 500 simulado");
  });

  it("sanitiza métricas extremas conforme Zod (CreateTrainingSessionSchema e CreateTafAttemptSchema) e evita push Sheets redundante em retry sem novos saves", async () => {
    const extremePreview = makePreview({
      elapsedSeconds: 120_000, // > 86400s
      avgCadence: 18, // < 30 spm
      elevationGainM: -12, // < 0
      avgHeartRate: 172,
      maxHeartRate: 165, // < avgHeartRate
      activeCalories: 0,
    });

    const trnBuilt = buildTrainingSessionFromPreview({
      preview: extremePreview,
      activityType: "caminhada",
      shoeName: "T".repeat(140),
      perceivedEffort: 15,
      bodyWeightKg: "",
    });
    expect(trnBuilt.ok).toBe(true);
    if (trnBuilt.ok) {
      expect(trnBuilt.payload.elapsedSeconds).toBe(86400);
      expect(trnBuilt.payload.avgCadence).toBeNull();
      expect(trnBuilt.payload.elevationGainM).toBeNull();
      expect(trnBuilt.payload.maxHeartRate).toBe(172);
      expect(trnBuilt.payload.shoeName?.length).toBe(100);
      expect(trnBuilt.payload.perceivedEffort).toBeNull();
      expect(trnBuilt.payload.activeCalories).toBeNull();
      expect(CreateTrainingSessionSchema.safeParse(trnBuilt.payload).success).toBe(true);
    }

    const attBuilt = buildTafAttemptFromPreview({
      preview: extremePreview,
      locationType: "pista_400m",
      shoeName: "T".repeat(140),
    });
    expect(attBuilt.ok).toBe(true);
    if (attBuilt.ok) {
      expect(CreateTafAttemptSchema.safeParse(attBuilt.payload).success).toBe(true);
    }

    // Retry onde item 0 já estava salvo e item 1 falha novamente -> newlyPersistedInRun === 0 -> NÃO chama syncGoogleSheets
    const grouped = groupActivityFilesForBatch([
      makeFakeFile("ja_salvo.fit", 1000),
      makeFakeFile("ainda_falha.fit", 1100),
    ]);
    const analyzed = await analyzeBatchActivityGroups(
      createPendingBatchItems(grouped.groups),
      async (files) => makePreview({ externalId: `retry_${files[0].name}` })
    );
    const partialItems = [
      { ...analyzed.items[0], saveStatus: "saved" as const },
      { ...analyzed.items[1], saveStatus: "save_error" as const },
    ];

    const saveTraining = vi.fn(async () => {
      throw new Error("Erro de rede persistente");
    });
    const getSheetsSyncStatus = vi.fn(
      async (): Promise<SheetsSyncStatus> => ({
        configured: true,
        pendingTrainingsCount: 0,
        pendingAttemptsCount: 0,
        totalPendingCount: 0,
      })
    );
    const syncGoogleSheets = vi.fn(async () => makeSyncReport());

    const retryResult = await persistBatchActivityItems(
      partialItems,
      { target: "training", duplicatePolicy: "skip" },
      { saveTraining, saveAttempt: vi.fn(), getSheetsSyncStatus, syncGoogleSheets }
    );

    expect(retryResult.summary.savedCount).toBe(1); // preservou item 0 já salvo
    expect(retryResult.summary.failedCount).toBe(1);
    expect(retryResult.summary.sheetsSynced).toBe(false);
    expect(syncGoogleSheets).not.toHaveBeenCalled();
  });

  it("evaluateBatchItemEligibility cobre todos os estados de revisão, fallback manual, bounds TAF e duplicidades", () => {
    const grouped = groupActivityFilesForBatch([makeFakeFile("eval.fit", 1024)]);
    const [baseItem] = createPendingBatchItems(grouped.groups);

    expect(
      evaluateBatchItemEligibility(baseItem, "training", "skip").uiState
    ).toBe("pending");
    expect(
      evaluateBatchItemEligibility(
        { ...baseItem, parseStatus: "parsing" },
        "training",
        "skip"
      ).uiState
    ).toBe("parsing");
    expect(
      evaluateBatchItemEligibility(
        { ...baseItem, saveStatus: "saving" },
        "training",
        "skip"
      ).uiState
    ).toBe("saving");
    expect(
      evaluateBatchItemEligibility(
        { ...baseItem, saveStatus: "saved" },
        "training",
        "skip"
      ).uiState
    ).toBe("saved");
    expect(
      evaluateBatchItemEligibility(
        {
          ...baseItem,
          parseStatus: "ready",
          preview: makePreview(),
          saveStatus: "save_error",
          saveError: "Erro HTTP",
        },
        "training",
        "skip"
      )
    ).toMatchObject({
      uiState: "save_error",
      canSaveInBatch: true,
      blockingReason: "Erro HTTP",
    });

    // Arquivo sem distância/duração entra em needs_manual_fallback até receber fallback válido
    const missingMetricsItem = {
      ...baseItem,
      parseStatus: "ready" as const,
      preview: makePreview({
        startedAt: "",
        distanceKm: 0,
        durationSeconds: 0,
        tafWindow: null,
      }),
    };
    expect(
      evaluateBatchItemEligibility(missingMetricsItem, "training", "skip")
    ).toMatchObject({
      uiState: "needs_manual_fallback",
      needsFallbackInputs: true,
      canSaveInBatch: false,
    });
    expect(
      evaluateBatchItemEligibility(missingMetricsItem, "taf_attempt", "skip")
    ).toMatchObject({
      uiState: "needs_manual_fallback",
      needsFallbackInputs: true,
      canSaveInBatch: false,
    });

    const filledFallbackItem = {
      ...missingMetricsItem,
      fallbackDate: "2026-10-29T08:00",
      fallbackDistanceKm: "3.0",
      fallbackDurationSec: "720",
    };
    expect(
      evaluateBatchItemEligibility(filledFallbackItem, "training", "skip")
        .canSaveInBatch
    ).toBe(true);
    expect(
      evaluateBatchItemEligibility(filledFallbackItem, "taf_attempt", "skip")
        .canSaveInBatch
    ).toBe(true);

    // Arquivo com distância > 0 mas abaixo de 0.05 km não exibe inputs fallback enganosos
    const tinyDistItem = {
      ...baseItem,
      parseStatus: "ready" as const,
      preview: makePreview({ distanceKm: 0.01, durationSeconds: 20 }),
    };
    const tinyEval = evaluateBatchItemEligibility(tinyDistItem, "training", "skip");
    expect(tinyEval.uiState).toBe("needs_manual_fallback");
    expect(tinyEval.needsFallbackInputs).toBe(false);

    // Fora dos limites TAF
    const outOfBoundsTaf = {
      ...baseItem,
      parseStatus: "ready" as const,
      preview: makePreview({
        tafWindow: {
          targetDurationSeconds: 720,
          actualDurationSeconds: 720,
          distanceMeters: 12000,
          speedKmh: 60,
          paceSeconds: 60,
          paceFormatted: "1:00",
          avgHeartRate: null,
          maxHeartRate: null,
          windowStartOffsetSeconds: 0,
          windowEndOffsetSeconds: 720,
          isShorterThanTarget: false,
          laps: [],
        },
      }),
    };
    expect(
      evaluateBatchItemEligibility(outOfBoundsTaf, "taf_attempt", "skip")
    ).toMatchObject({
      uiState: "taf_out_of_bounds",
      tafOutOfBounds: true,
      canSaveInBatch: false,
    });

    // Duplicidade no destino ativo vs outro destino + duplicado intra-lote
    const crossDupItem = {
      ...baseItem,
      parseStatus: "ready" as const,
      preview: makePreview({ alreadyExists: true, alreadyExistsAttempt: false }),
    };
    expect(
      evaluateBatchItemEligibility(crossDupItem, "training", "skip")
    ).toMatchObject({
      uiState: "duplicate_target_skip",
      canSaveInBatch: false,
    });
    expect(
      evaluateBatchItemEligibility(crossDupItem, "training", "update")
    ).toMatchObject({
      uiState: "duplicate_target_update",
      canSaveInBatch: true,
    });
    expect(
      evaluateBatchItemEligibility(crossDupItem, "taf_attempt", "skip")
    ).toMatchObject({
      uiState: "ready",
      existsInActiveTarget: false,
      existsInOtherTarget: true,
      canSaveInBatch: true,
    });

    expect(
      evaluateBatchItemEligibility(
        { ...crossDupItem, isDuplicateInBatch: true },
        "training",
        "update"
      ).uiState
    ).toBe("duplicate_in_batch");
  });

  it("limpa mirrorStatus e não contabiliza espelhos residuais ao reexecutar em modo training", async () => {
    const grouped = groupActivityFilesForBatch([
      makeFakeFile("a.fit"),
      makeFakeFile("b.fit"),
    ]);
    const [pendingA, pendingB] = createPendingBatchItems(grouped.groups);

    const readyItems = [
      {
        ...pendingA,
        parseStatus: "ready" as const,
        preview: makePreview({ externalId: "fit_m_1", alreadyExists: false }),
        saveStatus: "idle" as const,
        mirrorStatus: "saved" as const,
        mirrorError: null,
      },
      {
        ...pendingB,
        parseStatus: "ready" as const,
        preview: makePreview({ externalId: "fit_m_2", alreadyExists: true }),
        saveStatus: "idle" as const,
        mirrorStatus: "error" as const,
        mirrorError: "Erro antigo",
      },
    ];

    const saveTrainingMock = vi.fn(
      async (tr: TrainingSession) => tr
    );

    const result = await persistBatchActivityItems(
      readyItems,
      {
        target: "training",
        duplicatePolicy: "skip",
      },
      {
        saveTraining: saveTrainingMock,
        saveAttempt: vi.fn(),
      }
    );

    expect(result.items[0].mirrorStatus).toBe("idle");
    expect(result.items[0].mirrorError).toBeNull();
    expect(result.items[1].mirrorStatus).toBe("idle");
    expect(result.items[1].mirrorError).toBeNull();
    expect(result.summary.savedCount).toBe(1);
    expect(result.summary.skippedCount).toBe(1);
    expect(result.summary.mirroredCount).toBe(0);
    expect(result.summary.mirrorFailedCount).toBe(0);
  });
});
