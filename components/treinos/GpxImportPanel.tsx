"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ActivityParsePreview,
  ActivityType,
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  BatchDuplicatePolicy,
  BatchImportSummary,
  BatchImportTarget,
  LOCATION_LABELS,
  LocationType,
  TafAttempt,
  TrainingSession,
} from "@/types";
import { tafService } from "@/lib/services/tafService";
import { profileService } from "@/lib/services/profileService";
import {
  buildMirroredTrainingFromAttempt,
  clearCrossPageSheetsCaches,
} from "@/lib/sheetsSyncUi";
import { pickPreferredActivityTitleFromFileNames } from "@/lib/activityParser/filenameTitle";
import {
  type BatchImportMode,
  type BatchRejectedFile,
  MAX_BATCH_ACTIVITY_FILE_BYTES,
  MAX_BATCH_ACTIVITY_FILES,
  groupActivityFilesForBatch,
  markDuplicateExternalIdsInBatch,
  shouldAutoSwitchToBatchImport,
  splitMergedBatchGroup,
} from "@/lib/activityParser/batchGrouping";
import {
  type BatchQueueItem,
  LOCATION_TYPES_ORDER,
  analyzeBatchActivityGroups,
  buildTafAttemptFromPreview,
  buildTrainingSessionFromPreview,
  computeFallbackTafWindow,
  createPendingBatchItems,
  evaluateBatchItemEligibility,
  isTafWindowOutOfBounds as checkTafWindowOutOfBounds,
  persistBatchActivityItems,
  resolveDefaultBatchLocationType,
  resolveEffectivePreviewMetrics,
  resolveTrainingCaloriesPayload,
  validateTrainingWeightKg,
} from "@/lib/activityParser/batchPayloads";
import { formatTime } from "@/lib/formatting/time";
import { GpxPreviewCard } from "./GpxPreviewCard";
import { BatchImportTargetBar } from "./batch/BatchImportTargetBar";
import { BatchImportDefaultsBar } from "./batch/BatchImportDefaultsBar";
import { BatchImportItemRow } from "./batch/BatchImportItemRow";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  FileUp,
  Flame,
  Footprints,
  HeartPulse,
  Info,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  Scale,
  Sparkles,
  Tag,
  Timer,
  Trash2,
  Upload,
  X,
} from "lucide-react";

export const MAX_CLIENT_FILE_BYTES = MAX_BATCH_ACTIVITY_FILE_BYTES; // 4 MB

interface GpxImportAttemptMeta {
  mirrored?: boolean;
  mirrorError?: string | null;
}

interface GpxImportPanelProps {
  onImported?: (saved: TrainingSession, isUpdated?: boolean) => void;
  onAttemptImported?: (
    saved: TafAttempt,
    isUpdated?: boolean,
    meta?: GpxImportAttemptMeta
  ) => void;
  onMirroredTraining?: (saved: TrainingSession) => void;
  onBatchImported?: (summary: BatchImportSummary) => Promise<void> | void;
  defaultSaveAs?: "training" | "taf_attempt";
  onCancel?: () => void;
}

function getBatchFileSignatureKeyMap(items: readonly BatchQueueItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    for (const sig of item.signatureKeys) {
      keys.add(sig);
    }
  }
  return keys;
}

interface LiveBatchDefaultsSnapshot {
  activityType: ActivityType | "auto";
  locationType: LocationType | "auto";
  shoeName: string;
  perceivedEffort: number | null;
}

function mergeAnalyzedItemPreservingEdits(
  current: BatchQueueItem,
  analyzed: BatchQueueItem,
  liveDefaults: LiveBatchDefaultsSnapshot
): BatchQueueItem {
  const currentTitle = current.workoutTitle.trim();
  const hasManualTitle =
    currentTitle.length > 0 && currentTitle !== current.defaultTitle.trim();
  const resolvedActivityType =
    liveDefaults.activityType !== "auto"
      ? liveDefaults.activityType
      : analyzed.activityType;
  const resolvedLocationType =
    liveDefaults.locationType !== "auto"
      ? liveDefaults.locationType
      : analyzed.locationType;
  const resolvedShoeName =
    current.shoeName.trim().length > 0
      ? current.shoeName
      : liveDefaults.shoeName.trim() || analyzed.shoeName;
  const resolvedPerceivedEffort = liveDefaults.perceivedEffort;

  return {
    ...analyzed,
    workoutTitle: hasManualTitle ? current.workoutTitle : analyzed.workoutTitle,
    notes: current.notes || analyzed.notes,
    activityType: resolvedActivityType,
    locationType: resolvedLocationType,
    shoeName: resolvedShoeName,
    perceivedEffort: resolvedPerceivedEffort,
  };
}

export function GpxImportPanel({
  onImported,
  onAttemptImported,
  onMirroredTraining,
  onBatchImported,
  defaultSaveAs = "training",
  onCancel,
}: GpxImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Alternador entre fluxo individual preservado e fluxo em massa
  const [importMode, setImportMode] = useState<BatchImportMode>("single");

  // ─── Estado do Fluxo Individual (1 arquivo ou 1 par .FIT + .GPX) ───────────
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<
    "idle" | "parsing" | "preview" | "saving" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ActivityParsePreview | null>(null);
  const [saveAs, setSaveAs] = useState<"training" | "taf_attempt">(
    defaultSaveAs
  );

  const [workoutTitle, setWorkoutTitle] = useState("");
  const [activityType, setActivityType] =
    useState<ActivityType>("corrida_continua");
  const [locationType, setLocationType] = useState<LocationType>("pista_400m");
  const [perceivedEffort, setPerceivedEffort] = useState<number | null>(null);
  const [shoeName, setShoeName] = useState("");
  const [bodyWeightKg, setBodyWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [alsoSaveToDiary, setAlsoSaveToDiary] = useState(false);
  const [savedAttemptBanner, setSavedAttemptBanner] =
    useState<TafAttempt | null>(null);

  const [fallbackDate, setFallbackDate] = useState("");
  const [fallbackDistanceKm, setFallbackDistanceKm] = useState("");
  const [fallbackDurationSec, setFallbackDurationSec] = useState("");

  // ─── Estado do Fluxo Em Massa (Lote com Seleção Única Global) ─────────────
  const [batchTarget, setBatchTarget] =
    useState<BatchImportTarget>(defaultSaveAs);
  const [batchDuplicatePolicy, setBatchDuplicatePolicy] =
    useState<BatchDuplicatePolicy>("skip");
  const [batchActivityType, setBatchActivityType] = useState<
    ActivityType | "auto"
  >("auto");
  const [batchLocationType, setBatchLocationType] = useState<
    LocationType | "auto"
  >("auto");
  const [batchShoeName, setBatchShoeName] = useState("");
  const [batchPerceivedEffort, setBatchPerceivedEffort] = useState<
    number | null
  >(null);
  const [batchAlsoSaveToDiary, setBatchAlsoSaveToDiary] = useState(false);

  const [batchItems, setBatchItems] = useState<BatchQueueItem[]>([]);
  const [batchRejections, setBatchRejections] = useState<BatchRejectedFile[]>(
    []
  );
  const [batchIgnoredDuplicatesCount, setBatchIgnoredDuplicatesCount] =
    useState(0);
  const [batchPhase, setBatchPhase] = useState<"idle" | "analyzing" | "saving">(
    "idle"
  );
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchImportSummary | null>(
    null
  );
  const [batchActionError, setBatchActionError] = useState<string | null>(null);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    () => new Set()
  );

  // Refs para segurança assíncrona em lote (evita stale closures e aborta no unmount)
  const batchItemsRef = useRef<BatchQueueItem[]>([]);
  batchItemsRef.current = batchItems;
  const batchDefaultsRef = useRef({
    activityType: batchActivityType,
    locationType: batchLocationType,
    shoeName: batchShoeName,
    perceivedEffort: batchPerceivedEffort,
  });
  batchDefaultsRef.current = {
    activityType: batchActivityType,
    locationType: batchLocationType,
    shoeName: batchShoeName,
    perceivedEffort: batchPerceivedEffort,
  };
  const prevBatchShoeRef = useRef(batchShoeName);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const saveAbortRef = useRef<AbortController | null>(null);
  const analyzeRunTokenRef = useRef(0);
  const isMountedRef = useRef(true);

  const updateBatchItems = (
    updater: (prev: BatchQueueItem[]) => BatchQueueItem[]
  ) => {
    const next = updater(batchItemsRef.current);
    batchItemsRef.current = next;
    setBatchItems(next);
  };

  // Pré-carrega peso corporal atual do perfil (UserProfile.currentWeightKg)
  useEffect(() => {
    let mounted = true;
    profileService
      .getProfile()
      .then((prof) => {
        if (mounted && prof?.currentWeightKg) {
          setBodyWeightKg(String(prof.currentWeightKg));
        }
      })
      .catch(() => {
        // Mantém vazio caso falhe
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Cancela pools em andamento ao desmontar o painel
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      analyzeAbortRef.current?.abort();
      saveAbortRef.current?.abort();
    };
  }, []);

  // ─── Helpers do Fluxo Individual ───────────────────────────────────────────
  const validateAndAnalyzeFiles = async (incomingFiles: File[]) => {
    setErrorMessage(null);

    if (incomingFiles.length === 0) {
      return;
    }

    if (incomingFiles.length > 2) {
      setSelectedFiles([]);
      setPreview(null);
      setStatus("error");
      setErrorMessage(
        "Selecione no máximo 2 arquivos simultaneamente (1 .FIT principal e/ou 1 .GPX complementar do mesmo treino)."
      );
      return;
    }

    let fitCount = 0;
    let gpxCount = 0;

    for (const file of incomingFiles) {
      const lower = file.name.trim().toLowerCase();
      if (!lower.endsWith(".fit") && !lower.endsWith(".gpx")) {
        setSelectedFiles([]);
        setPreview(null);
        setStatus("error");
        setErrorMessage(
          `Formato inválido em "${file.name}". Envie apenas arquivos .FIT ou .GPX.`
        );
        return;
      }
      if (file.size > MAX_CLIENT_FILE_BYTES) {
        setSelectedFiles([]);
        setPreview(null);
        setStatus("error");
        setErrorMessage(
          `O arquivo "${file.name}" excede o limite máximo de 4 MB.`
        );
        return;
      }
      if (file.size === 0) {
        setSelectedFiles([]);
        setPreview(null);
        setStatus("error");
        setErrorMessage(`O arquivo "${file.name}" está vazio.`);
        return;
      }
      if (lower.endsWith(".fit")) fitCount++;
      if (lower.endsWith(".gpx")) gpxCount++;
    }

    if (fitCount > 1 || gpxCount > 1) {
      setSelectedFiles([]);
      setPreview(null);
      setStatus("error");
      setErrorMessage(
        "Envie no máximo 1 arquivo .FIT e 1 arquivo .GPX complementar do mesmo treino."
      );
      return;
    }

    setSelectedFiles(incomingFiles);
    setStatus("parsing");

    try {
      const result = await tafService.parseActivity(incomingFiles);
      const localFilenameTitle = pickPreferredActivityTitleFromFileNames(
        incomingFiles.map((f) => f.name)
      );
      setPreview(result);
      setSavedAttemptBanner(null);
      setWorkoutTitle(
        result.name?.trim() ||
          result.suggestedNotes?.trim() ||
          localFilenameTitle ||
          ""
      );
      setActivityType(result.suggestedActivityType ?? "corrida_continua");
      setLocationType(resolveDefaultBatchLocationType(result));
      setFallbackDate(result.startedAt ? result.startedAt.slice(0, 16) : "");
      setFallbackDistanceKm(
        result.distanceKm > 0 ? String(result.distanceKm) : ""
      );
      setFallbackDurationSec(
        result.durationSeconds > 0 ? String(result.durationSeconds) : ""
      );
      setStatus("preview");
    } catch (err) {
      setStatus("error");
      setPreview(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível analisar o(s) arquivo(s) enviado(s)."
      );
    }
  };

  // ─── Helpers e Ações do Fluxo Em Massa ─────────────────────────────────────
  const runBatchAnalysis = async (itemsToAnalyze: BatchQueueItem[]) => {
    if (itemsToAnalyze.length === 0) return;

    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    const runToken = ++analyzeRunTokenRef.current;

    const targetIds = new Set(itemsToAnalyze.map((it) => it.id));
    setBatchPhase("analyzing");
    setBatchActionError(null);
    setBatchProgress({ completed: 0, total: itemsToAnalyze.length });

    // Marca itens-alvo visualmente como pendentes se estavam em erro/cancelados
    updateBatchItems((prev) =>
      prev.map((curr) =>
        targetIds.has(curr.id)
          ? { ...curr, parseStatus: "pending", parseError: null }
          : curr
      )
    );

    const defaults = batchDefaultsRef.current;

    const analyzed = await analyzeBatchActivityGroups(
      itemsToAnalyze,
      (files, signal) =>
        tafService.parseActivity(files, signal ? { signal } : undefined),
      {
        concurrency: 3,
        signal: controller.signal,
        activityTypeOverride: defaults.activityType,
        locationTypeOverride: defaults.locationType,
        defaultShoeName: defaults.shoeName,
        defaultPerceivedEffort: defaults.perceivedEffort,
        onProgress: ({ completed, total, item }) => {
          if (!isMountedRef.current || analyzeRunTokenRef.current !== runToken) {
            return;
          }
          setBatchProgress({ completed, total });
          updateBatchItems((prev) =>
            markDuplicateExternalIdsInBatch(
              prev.map((curr) =>
                curr.id === item.id
                  ? mergeAnalyzedItemPreservingEdits(
                      curr,
                      item,
                      batchDefaultsRef.current
                    )
                  : curr
              )
            )
          );
        },
      }
    );

    if (!isMountedRef.current || analyzeRunTokenRef.current !== runToken) {
      return;
    }

    const byId = new Map(analyzed.items.map((it) => [it.id, it]));
    updateBatchItems((prev) =>
      markDuplicateExternalIdsInBatch(
        prev.map((curr) => {
          const updated = byId.get(curr.id);
          return updated
            ? mergeAnalyzedItemPreservingEdits(
                curr,
                updated,
                batchDefaultsRef.current
              )
            : curr;
        })
      )
    );

    setBatchPhase("idle");
    setBatchProgress(null);
    if (analyzeAbortRef.current === controller) {
      analyzeAbortRef.current = null;
    }
  };

  const enqueueBatchFiles = async (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;

    const existingItems = batchItemsRef.current;
    const existingKeys = getBatchFileSignatureKeyMap(existingItems);

    const grouped = groupActivityFilesForBatch(incomingFiles, {
      existingKeys,
      currentGroupCount: existingItems.length,
      maxGroups: MAX_BATCH_ACTIVITY_FILES,
    });

    setBatchRejections(grouped.rejectedFiles);
    setBatchIgnoredDuplicatesCount(grouped.ignoredDuplicateFilesCount);
    setBatchActionError(null);

    if (grouped.groups.length === 0) {
      return;
    }

    setBatchSummary(null);

    const defaults = batchDefaultsRef.current;
    const pendingItems = createPendingBatchItems(grouped.groups, {
      activityTypeOverride: defaults.activityType,
      locationTypeOverride: defaults.locationType,
      defaultShoeName: defaults.shoeName,
      defaultPerceivedEffort: defaults.perceivedEffort,
    });

    const nextItems = markDuplicateExternalIdsInBatch([
      ...existingItems,
      ...pendingItems,
    ]);
    batchItemsRef.current = nextItems;
    setBatchItems(nextItems);

    // Analisa somente os novos itens + eventuais itens pendentes restantes (sem refazer os já prontos)
    const toAnalyze = nextItems.filter(
      (it) =>
        it.parseStatus === "pending" ||
        pendingItems.some((p) => p.id === it.id)
    );
    await runBatchAnalysis(toAnalyze);
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    // Limpa o value do input nativo para permitir selecionar o mesmo arquivo novamente se necessário
    e.target.value = "";
    if (fileList.length === 0 || batchPhase === "saving") return;

    if (shouldAutoSwitchToBatchImport(fileList, importMode)) {
      if (importMode !== "batch") {
        setSelectedFiles([]);
        setPreview(null);
        setErrorMessage(null);
        setSavedAttemptBanner(null);
        setStatus("idle");
        setImportMode("batch");
      }
      await enqueueBatchFiles(fileList);
      return;
    }

    // Se já havia 1 arquivo válido (.FIT ou .GPX) e o usuário selecionou mais 1 do formato complementar válido, combina os dois no modo individual
    if (selectedFiles.length === 1 && fileList.length === 1) {
      const existingLower = selectedFiles[0].name.trim().toLowerCase();
      const newLower = fileList[0].name.trim().toLowerCase();
      const existingExt = existingLower.endsWith(".fit")
        ? "fit"
        : existingLower.endsWith(".gpx")
          ? "gpx"
          : null;
      const newExt = newLower.endsWith(".fit")
        ? "fit"
        : newLower.endsWith(".gpx")
          ? "gpx"
          : null;
      if (existingExt && newExt && existingExt !== newExt) {
        await validateAndAnalyzeFiles([selectedFiles[0], fileList[0]]);
        return;
      }
    }

    await validateAndAnalyzeFiles(fileList);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (batchPhase === "saving") return;
    const droppedFiles = e.dataTransfer?.files
      ? Array.from(e.dataTransfer.files)
      : [];
    if (droppedFiles.length === 0) return;

    if (shouldAutoSwitchToBatchImport(droppedFiles, importMode)) {
      if (importMode !== "batch") {
        setSelectedFiles([]);
        setPreview(null);
        setErrorMessage(null);
        setSavedAttemptBanner(null);
        setStatus("idle");
        setImportMode("batch");
      }
      await enqueueBatchFiles(droppedFiles);
      return;
    }

    await validateAndAnalyzeFiles(droppedFiles);
  };

  const handleSwitchImportMode = (nextMode: BatchImportMode) => {
    if (nextMode === importMode) return;
    if (batchPhase !== "idle") return;

    if (nextMode === "batch") {
      setImportMode("batch");
      setErrorMessage(null);
      setBatchActionError(null);
      // Se já havia um arquivo/par analisado no individual e fila do lote está vazia, aproveita na fila
      if (
        batchItemsRef.current.length === 0 &&
        selectedFiles.length > 0 &&
        preview
      ) {
        const grouped = groupActivityFilesForBatch(selectedFiles);
        if (grouped.groups.length === 1) {
          const [seedGroup] = grouped.groups;
          const seededItem: BatchQueueItem = {
            ...seedGroup,
            parseStatus: "ready",
            parseError: null,
            preview,
            workoutTitle: workoutTitle || seedGroup.defaultTitle,
            activityType:
              batchActivityType !== "auto" ? batchActivityType : activityType,
            locationType:
              batchLocationType !== "auto" ? batchLocationType : locationType,
            shoeName: shoeName || batchShoeName,
            perceivedEffort: perceivedEffort ?? batchPerceivedEffort,
            notes,
            fallbackDate,
            fallbackDistanceKm,
            fallbackDurationSec,
            isDuplicateInBatch: false,
            duplicateOfItemId: null,
            saveStatus: "idle",
            saveError: null,
            skipReason: null,
            savedTraining: null,
            savedAttempt: null,
            mirrorStatus: "idle",
            mirrorError: null,
          };
          batchItemsRef.current = [seededItem];
          setBatchItems([seededItem]);
        }
      }
      return;
    }

    // Voltando para modo individual
    setBatchActionError(null);
    setBatchRejections([]);
    setBatchIgnoredDuplicatesCount(0);
    setImportMode("single");
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setPreview(null);
    setErrorMessage(null);
    setSavedAttemptBanner(null);
    setStatus("idle");
    setSaveAs(defaultSaveAs);
    setWorkoutTitle("");
    setNotes("");
    setAlsoSaveToDiary(false);
    setLocationType("pista_400m");
    setPerceivedEffort(null);
    setShoeName("");
    setFallbackDate("");
    setFallbackDistanceKm("");
    setFallbackDurationSec("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleResetBatch = () => {
    analyzeAbortRef.current?.abort();
    saveAbortRef.current?.abort();
    analyzeRunTokenRef.current += 1;
    setBatchPhase("idle");
    setBatchProgress(null);
    setBatchItems([]);
    batchItemsRef.current = [];
    setBatchRejections([]);
    setBatchIgnoredDuplicatesCount(0);
    setBatchSummary(null);
    setBatchActionError(null);
    setExpandedItemIds(new Set());
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ─── Cálculos Derivados do Fluxo Individual (via batchPayloads.ts) ─────────
  const needsBasicFallback = Boolean(
    preview &&
      (!preview.startedAt ||
        preview.distanceKm <= 0 ||
        preview.durationSeconds <= 0)
  );

  const effectiveMetrics = useMemo(
    () =>
      preview
        ? resolveEffectivePreviewMetrics(
            preview,
            fallbackDistanceKm,
            fallbackDurationSec
          )
        : null,
    [preview, fallbackDistanceKm, fallbackDurationSec]
  );

  const calorieEstimate = useMemo(() => {
    if (!effectiveMetrics || !preview) return null;
    const weightRes = validateTrainingWeightKg(bodyWeightKg);
    if (!weightRes.valid || weightRes.weightKg === null) return null;
    const payload = resolveTrainingCaloriesPayload({
      preview,
      activityType,
      speedKmh: effectiveMetrics.speedKmh,
      distanceKm: effectiveMetrics.distanceKm,
      durationSeconds: effectiveMetrics.durationSeconds,
      weightKg: weightRes.weightKg,
    });
    if (
      payload.calorieSource !== "auto_calculated" ||
      payload.activeCalories === null ||
      payload.totalCalories === null
    ) {
      return null;
    }
    return {
      activeCalories: payload.activeCalories,
      totalCalories: payload.totalCalories,
    };
  }, [effectiveMetrics, preview, activityType, bodyWeightKg]);

  const effectiveTafWindow = useMemo(
    () =>
      preview
        ? computeFallbackTafWindow(
            preview,
            fallbackDistanceKm,
            fallbackDurationSec
          )
        : null,
    [preview, fallbackDistanceKm, fallbackDurationSec]
  );

  const isTafWindowOutOfBounds = checkTafWindowOutOfBounds(effectiveTafWindow);

  // ─── Salvamento Individual (reutiliza builders + generateClientRecordId) ──
  const handleSaveImportedTraining = async (onDuplicateMode?: "update") => {
    if (!preview) return;
    setErrorMessage(null);

    const built = buildTrainingSessionFromPreview({
      preview,
      activityType,
      workoutTitle,
      notes,
      shoeName,
      perceivedEffort,
      bodyWeightKg,
      fallbackDate,
      fallbackDistanceKm,
      fallbackDurationSec,
      onDuplicate: onDuplicateMode,
      existingTrainingId: preview.existingTrainingId,
    });

    if (!built.ok) {
      setErrorMessage(built.error);
      return;
    }

    setStatus("saving");

    try {
      const saved = await tafService.saveTraining(built.payload, false);
      if (onImported) {
        onImported(saved, onDuplicateMode === "update");
      } else {
        setPreview((prev) =>
          prev
            ? {
                ...prev,
                alreadyExists: true,
                existingTrainingId: saved.id,
              }
            : prev
        );
        setStatus("preview");
      }
    } catch (err) {
      setStatus("preview");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Erro ao salvar o treino importado."
      );
    }
  };

  const handleSaveImportedAttempt = async (onDuplicateMode?: "update") => {
    if (!preview || !effectiveTafWindow) return;
    setErrorMessage(null);
    setSavedAttemptBanner(null);

    const built = buildTafAttemptFromPreview({
      preview,
      locationType,
      workoutTitle,
      notes,
      shoeName,
      fallbackDate,
      fallbackDistanceKm,
      fallbackDurationSec,
      onDuplicate: onDuplicateMode,
      existingAttemptId: preview.existingAttemptId,
    });

    if (!built.ok) {
      setErrorMessage(built.error);
      return;
    }

    setStatus("saving");

    try {
      const saved = await tafService.saveAttempt(built.payload, false);

      let mirrorError: string | null = null;
      let mirroredOk = false;
      if (alsoSaveToDiary) {
        const isSameDurationWindow =
          preview.durationSeconds > 0 &&
          Math.abs(preview.durationSeconds - saved.actualDurationSeconds) <= 10;
        const hasDeviceCalories =
          isSameDurationWindow &&
          preview.activeCalories !== null &&
          preview.activeCalories > 0;
        const mirroredPayload = buildMirroredTrainingFromAttempt({
          attempt: saved,
          source: preview.source,
          externalId: preview.alreadyExists ? null : preview.externalId,
          activeCalories: hasDeviceCalories ? preview.activeCalories : null,
          calorieMethod: hasDeviceCalories ? "garmin_fit_device" : null,
          calorieSource: hasDeviceCalories ? "device_fit" : null,
          calorieMetadata: hasDeviceCalories
            ? { source: "fit_session_total_calories" }
            : null,
        });

        try {
          const savedMirrored = await tafService.saveTraining(
            mirroredPayload,
            false
          );
          mirroredOk = true;
          if (onMirroredTraining) {
            onMirroredTraining(savedMirrored);
          } else {
            onImported?.(savedMirrored, false);
          }
        } catch (mirrorErr) {
          mirrorError =
            mirrorErr instanceof Error
              ? mirrorErr.message
              : "Não foi possível espelhar o simulado no Diário de Treinos.";
        }
      }

      setStatus("preview");
      setAlsoSaveToDiary(false);
      if (mirrorError) {
        setErrorMessage(
          `Simulado TAF salvo, mas falha ao espelhar no Diário: ${mirrorError}`
        );
      }

      if (onAttemptImported) {
        onAttemptImported(saved, onDuplicateMode === "update", {
          mirrored: mirroredOk,
          mirrorError,
        });
      } else {
        setPreview((prev) =>
          prev
            ? {
                ...prev,
                alreadyExists: prev.alreadyExists || mirroredOk,
                alreadyExistsAttempt: true,
                existingAttemptId: saved.id,
              }
            : prev
        );
        setSavedAttemptBanner(saved);
      }
    } catch (err) {
      setStatus("preview");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Erro ao salvar o simulado TAF importado."
      );
    }
  };

  // ─── Handlers Interativos da Fila Em Massa ─────────────────────────────────
  const handleBatchTargetChange = (nextTarget: BatchImportTarget) => {
    if (nextTarget === batchTarget || batchPhase === "saving") return;
    setBatchTarget(nextTarget);
    setBatchSummary(null);
    setBatchActionError(null);
    updateBatchItems((prev) =>
      prev.map((item) => ({
        ...item,
        saveStatus: "idle",
        saveError: null,
        skipReason: null,
        mirrorStatus: "idle",
        mirrorError: null,
      }))
    );
  };

  const handleBatchDuplicatePolicyChange = (
    nextPolicy: BatchDuplicatePolicy
  ) => {
    setBatchDuplicatePolicy(nextPolicy);
    setBatchSummary(null);
    setBatchActionError(null);
    updateBatchItems((prev) =>
      prev.map((item) =>
        item.saveStatus === "skipped" || item.saveStatus === "save_error"
          ? { ...item, saveStatus: "idle", saveError: null, skipReason: null }
          : item
      )
    );
  };

  const handleBatchActivityDefaultChange = (next: ActivityType | "auto") => {
    setBatchActivityType(next);
    batchDefaultsRef.current = { ...batchDefaultsRef.current, activityType: next };
    updateBatchItems((prev) =>
      prev.map((item) => {
        if (item.saveStatus === "saved" || item.saveStatus === "updated") {
          return item;
        }
        return {
          ...item,
          activityType:
            next === "auto"
              ? (item.preview?.suggestedActivityType ?? "corrida_continua")
              : next,
        };
      })
    );
  };

  const handleBatchLocationDefaultChange = (next: LocationType | "auto") => {
    setBatchLocationType(next);
    batchDefaultsRef.current = { ...batchDefaultsRef.current, locationType: next };
    updateBatchItems((prev) =>
      prev.map((item) => {
        if (item.saveStatus === "saved" || item.saveStatus === "updated") {
          return item;
        }
        return {
          ...item,
          locationType:
            next === "auto"
              ? item.preview
                ? resolveDefaultBatchLocationType(item.preview)
                : "pista_400m"
              : next,
        };
      })
    );
  };

  const handleBatchShoeDefaultChange = (nextShoe: string) => {
    const prevShoe = prevBatchShoeRef.current;
    prevBatchShoeRef.current = nextShoe;
    setBatchShoeName(nextShoe);
    batchDefaultsRef.current = { ...batchDefaultsRef.current, shoeName: nextShoe };
    updateBatchItems((prev) =>
      prev.map((item) => {
        if (item.saveStatus === "saved" || item.saveStatus === "updated") {
          return item;
        }
        if (item.shoeName === prevShoe || item.shoeName.trim() === "") {
          return { ...item, shoeName: nextShoe };
        }
        return item;
      })
    );
  };

  const handleApplyShoeToAll = () => {
    const clean = batchShoeName;
    updateBatchItems((prev) =>
      prev.map((item) =>
        item.saveStatus === "saved" || item.saveStatus === "updated"
          ? item
          : { ...item, shoeName: clean }
      )
    );
  };

  const handleBatchRpeDefaultChange = (nextRpe: number | null) => {
    setBatchPerceivedEffort(nextRpe);
    batchDefaultsRef.current = {
      ...batchDefaultsRef.current,
      perceivedEffort: nextRpe,
    };
    updateBatchItems((prev) =>
      prev.map((item) =>
        item.saveStatus === "saved" || item.saveStatus === "updated"
          ? item
          : { ...item, perceivedEffort: nextRpe }
      )
    );
  };

  const handleUpdateBatchItem = (
    itemId: string,
    patch: Partial<
      Pick<
        BatchQueueItem,
        | "workoutTitle"
        | "activityType"
        | "locationType"
        | "shoeName"
        | "notes"
        | "fallbackDate"
        | "fallbackDistanceKm"
        | "fallbackDurationSec"
      >
    >
  ) => {
    setBatchActionError(null);
    updateBatchItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const resetSave =
          item.saveStatus === "save_error" || item.saveStatus === "skipped"
            ? {
                saveStatus: "idle" as const,
                saveError: null,
                skipReason: null,
              }
            : {};
        return {
          ...item,
          ...patch,
          ...resetSave,
        };
      })
    );
  };

  const handleRemoveBatchItem = (itemId: string) => {
    if (batchPhase !== "idle") return;
    setBatchSummary(null);
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    updateBatchItems((prev) =>
      markDuplicateExternalIdsInBatch(prev.filter((it) => it.id !== itemId))
    );
  };

  const handleToggleExpandItem = (itemId: string) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSplitMergedBatchItem = async (itemId: string) => {
    if (batchPhase !== "idle") return;
    setBatchSummary(null);
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    const current = batchItemsRef.current;
    const existingById = new Map(current.map((it) => [it.id, it]));
    const splitGroups = splitMergedBatchGroup(current, itemId);
    const defaults = batchDefaultsRef.current;

    const nextItemsRaw: BatchQueueItem[] = splitGroups.map((group) => {
      const kept = existingById.get(group.id);
      if (kept) return kept;
      return createPendingBatchItems([group], {
        activityTypeOverride: defaults.activityType,
        locationTypeOverride: defaults.locationType,
        defaultShoeName: defaults.shoeName,
        defaultPerceivedEffort: defaults.perceivedEffort,
      })[0];
    });

    const nextItems = markDuplicateExternalIdsInBatch(nextItemsRaw);
    batchItemsRef.current = nextItems;
    setBatchItems(nextItems);

    const newPending = nextItems.filter((it) => !existingById.has(it.id));
    if (newPending.length > 0) {
      await runBatchAnalysis(newPending);
    }
  };

  const handleRetryParseSingleItem = async (itemId: string) => {
    if (batchPhase !== "idle") return;
    const target = batchItemsRef.current.find((it) => it.id === itemId);
    if (!target) return;
    await runBatchAnalysis([target]);
  };

  // Elegibilidade computada reativamente para cada linha e contadores globais
  const batchEligibilities = useMemo(
    () =>
      batchItems.map((item) =>
        evaluateBatchItemEligibility(item, batchTarget, batchDuplicatePolicy)
      ),
    [batchItems, batchTarget, batchDuplicatePolicy]
  );

  const batchCounts = useMemo(() => {
    let actionable = 0;
    let parseFailed = 0;
    let saveFailed = 0;
    let skipped = 0;
    let savedDone = 0;
    let blocked = 0;

    batchItems.forEach((item, idx) => {
      const el = batchEligibilities[idx];
      if (!el) return;
      if (item.parseStatus === "parse_error" || item.parseStatus === "cancelled") {
        parseFailed++;
      } else if (item.saveStatus === "save_error") {
        saveFailed++;
        actionable++;
      } else if (item.saveStatus === "saved" || item.saveStatus === "updated") {
        savedDone++;
      } else if (
        el.uiState === "ready" ||
        el.uiState === "duplicate_target_update"
      ) {
        actionable++;
      } else if (
        el.uiState === "duplicate_in_batch" ||
        el.uiState === "duplicate_target_skip" ||
        el.uiState === "skipped"
      ) {
        skipped++;
      } else if (
        el.uiState === "needs_manual_fallback" ||
        el.uiState === "taf_out_of_bounds"
      ) {
        blocked++;
      }
    });

    return {
      actionable,
      parseFailed,
      saveFailed,
      skipped,
      savedDone,
      blocked,
    };
  }, [batchItems, batchEligibilities]);

  const handlePersistBatch = async (onlyRetryFailedSaves = false) => {
    if (batchPhase !== "idle") return;
    setBatchActionError(null);

    if (batchTarget === "training") {
      const weightValidation = validateTrainingWeightKg(bodyWeightKg);
      if (!weightValidation.valid) {
        setBatchActionError(weightValidation.error!);
        return;
      }
    }

    const preparedItems: BatchQueueItem[] = batchItemsRef.current.map((item) => {
      if (item.saveStatus === "save_error") {
        return { ...item, saveStatus: "idle", saveError: null };
      }
      if (!onlyRetryFailedSaves && item.saveStatus === "skipped") {
        return { ...item, saveStatus: "idle", skipReason: null };
      }
      return item;
    });

    const eligibleCount = preparedItems.filter(
      (it) =>
        evaluateBatchItemEligibility(it, batchTarget, batchDuplicatePolicy)
          .canSaveInBatch
    ).length;

    if (eligibleCount === 0) {
      return;
    }

    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;

    setBatchPhase("saving");
    setBatchProgress({ completed: 0, total: eligibleCount });
    setBatchItems(preparedItems);

    try {
      const result = await persistBatchActivityItems(
        preparedItems,
        {
          target: batchTarget,
          duplicatePolicy: batchDuplicatePolicy,
          bodyWeightKg: batchTarget === "training" ? bodyWeightKg : null,
          alsoSaveToDiary:
            batchTarget === "taf_attempt" ? batchAlsoSaveToDiary : false,
          concurrency: 2,
        },
        {
          saveTraining: (training, isUpd, opts) =>
            tafService.saveTraining(training, isUpd, opts),
          saveAttempt: (attempt, isUpd, opts) =>
            tafService.saveAttempt(attempt, isUpd, opts),
          getSheetsSyncStatus:
            typeof tafService.getSheetsSyncStatus === "function"
              ? () => tafService.getSheetsSyncStatus()
              : undefined,
          syncGoogleSheets:
            typeof tafService.syncGoogleSheets === "function"
              ? (opts) => tafService.syncGoogleSheets(opts)
              : undefined,
        },
        {
          signal: controller.signal,
          onProgress: ({ completed, total, item }) => {
            if (!isMountedRef.current) return;
            setBatchProgress({ completed, total });
            updateBatchItems((prev) =>
              prev.map((curr) => (curr.id === item.id ? item : curr))
            );
          },
        }
      );

      if (isMountedRef.current) {
        batchItemsRef.current = result.items;
        setBatchItems(result.items);
        setBatchSummary(result.summary);
        setBatchPhase("idle");
        setBatchProgress(null);
      }

      if (
        result.summary.savedCount +
          result.summary.updatedCount +
          result.summary.mirroredCount >
        0
      ) {
        clearCrossPageSheetsCaches({ includeGoal: false });
      }

      if (onBatchImported) {
        await onBatchImported(result.summary);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setBatchPhase("idle");
        setBatchProgress(null);
        setBatchActionError(
          err instanceof Error
            ? err.message
            : "Erro inesperado ao executar importação em lote."
        );
      }
    } finally {
      if (saveAbortRef.current === controller) {
        saveAbortRef.current = null;
      }
    }
  };

  const handleRetryAllFailed = async () => {
    if (batchPhase !== "idle") return;
    const failedToParse = batchItemsRef.current.filter(
      (it) => it.parseStatus === "parse_error" || it.parseStatus === "cancelled"
    );
    if (failedToParse.length > 0) {
      await runBatchAnalysis(failedToParse);
    }
    if (!isMountedRef.current) return;
    const hasFailedSaves = batchItemsRef.current.some(
      (it) => it.saveStatus === "save_error"
    );
    if (hasFailedSaves) {
      await handlePersistBatch(true);
    }
  };

  const isTitleMissingFromSource = Boolean(
    preview && (!preview.name || preview.name.trim().length === 0)
  );

  return (
    <div
      data-testid="gpx-import-panel"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-7 shadow-sm space-y-5"
    >
      {/* Cabeçalho + Alternador Individual vs Em Massa */}
      <div className="flex flex-col gap-3 pb-4 border-b border-[#1E2942]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileUp className="w-5 h-5 text-[#B7F34A] shrink-0" />
              Importar Treino do Strava / Garmin (.FIT Prioritário + .GPX)
            </h3>
            <p className="text-xs text-[#8E9BB0] mt-0.5">
              {importMode === "batch" ? (
                <>
                  Envie múltiplos arquivos{" "}
                  <strong className="text-white">.FIT</strong> e/ou{" "}
                  <strong className="text-white">.GPX</strong> de uma vez (até{" "}
                  {MAX_BATCH_ACTIVITY_FILES} atividades) com pareamento automático
                  por nome e seleção única global.
                </>
              ) : (
                <>
                  Envie o arquivo original{" "}
                  <strong className="text-white">.FIT</strong> (recomendado), um{" "}
                  <strong className="text-white">.GPX</strong> isolado ou{" "}
                  <strong className="text-[#B7F34A]">.FIT + .GPX juntos</strong>{" "}
                  do mesmo treino — ou arraste vários arquivos para abrir o{" "}
                  <strong className="text-white">Modo Em Massa</strong>.
                </>
              )}
            </p>
          </div>

          {onCancel && (
            <button
              type="button"
              onClick={() => {
                analyzeAbortRef.current?.abort();
                saveAbortRef.current?.abort();
                onCancel();
              }}
              className="text-xs font-semibold text-[#8E9BB0] hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1E2942] hover:bg-[#1E2942] transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Fechar
            </button>
          )}
        </div>

        {/* Seletor de Modo: 1 Treino (Individual) vs Em Massa (Vários Arquivos) */}
        <div
          data-testid="import-mode-switcher"
          role="tablist"
          aria-label="Modo de importação"
          className="inline-flex flex-wrap max-w-full self-start p-1 rounded-2xl bg-[#0B1020] border border-[#1E2942] gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={importMode === "single"}
            data-testid="import-mode-single"
            disabled={batchPhase !== "idle"}
            onClick={() => handleSwitchImportMode("single")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 ${
              importMode === "single"
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>1 Treino (Individual)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={importMode === "batch"}
            data-testid="import-mode-batch"
            disabled={batchPhase !== "idle"}
            onClick={() => handleSwitchImportMode("batch")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50 ${
              importMode === "batch"
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Em Massa (Vários Arquivos)</span>
          </button>
        </div>
      </div>

      {/* Área de Seleção / Drag & Drop unificada (.FIT e/ou .GPX) */}
      <div
        data-testid="activity-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-[#1E2942] hover:border-[#B7F34A]/60 rounded-2xl p-5 bg-[#0B1020]/70 text-center transition-colors"
      >
        <input
          ref={fileInputRef}
          id="activity-file-upload"
          data-testid="activity-file-input"
          type="file"
          accept=".fit,.gpx"
          multiple
          disabled={batchPhase === "saving"}
          onChange={handleFileInputChange}
          className="sr-only"
        />

        <div className="flex flex-col items-center justify-center space-y-2.5">
          <div className="w-11 h-11 rounded-2xl bg-[#131A2E] border border-[#1E2942] flex items-center justify-center text-[#B7F34A]">
            {status === "parsing" || batchPhase === "analyzing" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="activity-file-upload"
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] hover:bg-[#a6e03f] text-[#0B1020] font-black text-xs cursor-pointer transition-all shadow-sm ${
                batchPhase === "saving" ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              {importMode === "batch"
                ? batchItems.length === 0
                  ? "Selecionar arquivos .FIT e/ou .GPX para o lote"
                  : "Adicionar mais arquivos à fila"
                : selectedFiles.length === 0
                  ? "Selecionar arquivo(s) .FIT e/ou .GPX"
                  : selectedFiles.length === 1
                    ? "Adicionar 2º arquivo complementar ou trocar"
                    : "Trocar arquivos selecionados"}
            </label>
            <p className="text-[11px] text-[#8E9BB0]">
              {importMode === "batch"
                ? `Até ${MAX_BATCH_ACTIVITY_FILES} atividades por lote (.fit e/ou .gpx • máx. 4 MB cada • pareamento automático pelo nome)`
                : "Aceita 1 ou 2 arquivos do mesmo treino ou múltiplos arquivos para modo Em Massa (`.fit`, `.gpx` • máx. 4 MB cada)"}
            </p>
          </div>

          {/* Badges do Fluxo Individual */}
          {importMode === "single" && selectedFiles.length > 0 && (
            <div
              data-testid="selected-files-badges"
              className="flex flex-wrap items-center justify-center gap-2 pt-2"
            >
              {selectedFiles.map((f) => {
                const isFit = f.name.toLowerCase().endsWith(".fit");
                return (
                  <span
                    key={f.name}
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${
                      isFit
                        ? "bg-[#B7F34A]/15 text-[#B7F34A] border-[#B7F34A]/40"
                        : "bg-cyan-950/50 text-cyan-300 border-cyan-500/30"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {isFit
                        ? "Fonte Primária (.FIT):"
                        : "Complemento/Fallback (.GPX):"}{" "}
                      {f.name}
                    </span>
                  </span>
                );
              })}

              <button
                type="button"
                data-testid="reset-import-btn"
                onClick={handleReset}
                className="text-xs text-[#8E9BB0] hover:text-white underline ml-1"
              >
                Limpar seleção
              </button>
            </div>
          )}

          {/* Barra compacta da fila no Modo Em Massa */}
          {importMode === "batch" && batchItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-xs">
              <span
                data-testid="batch-queue-count"
                className="font-bold text-white"
              >
                {batchItems.length}{" "}
                {batchItems.length === 1
                  ? "atividade na fila"
                  : "atividades na fila"}
              </span>
              {batchPhase === "analyzing" ? (
                <button
                  type="button"
                  data-testid="batch-cancel-analyze-btn"
                  onClick={() => analyzeAbortRef.current?.abort()}
                  className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline"
                >
                  Cancelar análise
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="batch-clear-queue-btn"
                  disabled={batchPhase !== "idle"}
                  onClick={handleResetBatch}
                  className="text-xs text-[#8E9BB0] hover:text-white inline-flex items-center gap-1 underline disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar lote
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODO EM MASSA                                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {importMode === "batch" && (
        <div data-testid="batch-import-workspace" className="space-y-4">
          {/* Seleção Única Global: TODOS como Treinos vs TODOS como Simulados TAF */}
          <BatchImportTargetBar
            target={batchTarget}
            onChange={handleBatchTargetChange}
            disabled={batchPhase === "saving"}
          />

          {/* Configuração Rápida do Lote */}
          <BatchImportDefaultsBar
            target={batchTarget}
            duplicatePolicy={batchDuplicatePolicy}
            onDuplicatePolicyChange={handleBatchDuplicatePolicyChange}
            bodyWeightKg={bodyWeightKg}
            onBodyWeightKgChange={(val) => {
              setBatchActionError(null);
              setBodyWeightKg(val);
            }}
            activityTypeDefault={batchActivityType}
            onActivityTypeDefaultChange={handleBatchActivityDefaultChange}
            locationTypeDefault={batchLocationType}
            onLocationTypeDefaultChange={handleBatchLocationDefaultChange}
            defaultShoeName={batchShoeName}
            onDefaultShoeNameChange={handleBatchShoeDefaultChange}
            onApplyShoeToAll={handleApplyShoeToAll}
            defaultPerceivedEffort={batchPerceivedEffort}
            onDefaultPerceivedEffortChange={handleBatchRpeDefaultChange}
            alsoSaveToDiary={batchAlsoSaveToDiary}
            onAlsoSaveToDiaryChange={setBatchAlsoSaveToDiary}
            disabled={batchPhase === "saving"}
            hasItems={batchItems.length > 0}
          />

          {/* Avisos de arquivos rejeitados na pré-validação ou ignorados por repetição */}
          {(batchRejections.length > 0 || batchIgnoredDuplicatesCount > 0) && (
            <div
              data-testid="batch-rejections-alert"
              className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  Avisos na seleção de arquivos
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBatchRejections([]);
                    setBatchIgnoredDuplicatesCount(0);
                  }}
                  className="text-[11px] text-amber-300 hover:text-white underline"
                >
                  Dispensar
                </button>
              </div>
              {batchIgnoredDuplicatesCount > 0 && (
                <p>
                  {batchIgnoredDuplicatesCount} arquivo(s) já estavam na fila e
                  foram ignorados.
                </p>
              )}
              {batchRejections.map((rej, idx) => (
                <p key={`${rej.fileName}-${idx}`}>{rej.message}</p>
              ))}
            </div>
          )}

          {/* Erro de ação do lote (ex: peso corporal inválido) */}
          {batchActionError && (
            <div
              data-testid="batch-action-error"
              className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-medium text-rose-400 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{batchActionError}</span>
            </div>
          )}

          {/* Barra de Progresso */}
          {batchProgress && batchPhase !== "idle" && (
            <div
              data-testid="batch-progress-bar"
              className="p-3.5 rounded-2xl bg-[#0B1020] border border-[#1E2942] space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#B7F34A]" />
                  {batchPhase === "analyzing"
                    ? `Analisando ${batchProgress.completed} de ${batchProgress.total}...`
                    : `Salvando ${batchProgress.completed} de ${batchProgress.total}...`}
                </span>
                <span className="text-[11px] font-bold text-[#B7F34A] tabular-nums">
                  {batchProgress.total > 0
                    ? Math.round(
                        (batchProgress.completed / batchProgress.total) * 100
                      )
                    : 0}
                  %
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#131A2E] overflow-hidden">
                <div
                  className="h-full bg-[#B7F34A] transition-all duration-200"
                  style={{
                    width: `${
                      batchProgress.total > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (batchProgress.completed / batchProgress.total) *
                                100
                            )
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Resumo Final da Execução do Lote + Status Google Sheets */}
          {batchSummary && (
            <div
              data-testid="batch-import-summary"
              className={`p-4 rounded-2xl border text-xs space-y-2 ${
                batchSummary.failedCount > 0 || batchSummary.aborted
                  ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                  : "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#B7F34A] shrink-0" />
                  Resumo do Lote (
                  {batchSummary.target === "training"
                    ? "Treinos do Diário"
                    : "Simulados TAF"}
                  )
                </span>
                <span className="text-[11px] font-semibold">
                  {batchSummary.savedCount} novo(s) •{" "}
                  {batchSummary.updatedCount} atualizado(s) •{" "}
                  {batchSummary.skippedCount} pulado(s) •{" "}
                  {batchSummary.failedCount} falha(s)
                </span>
              </div>

              {batchSummary.mirroredCount > 0 && (
                <p className="text-[11px] text-emerald-300">
                  {batchSummary.mirroredCount} simulado(s) espelhado(s) com
                  sucesso no Diário de Treinos (Log_Treinos).
                </p>
              )}

              {batchSummary.mirrorFailedCount > 0 && (
                <p className="text-[11px] text-amber-300">
                  {batchSummary.mirrorFailedCount} espelho(s) no Diário
                  falharam, mas os simulados correspondentes foram salvos em Meu
                  TAF.
                </p>
              )}

              {batchSummary.sheetsSynced && (
                <p
                  data-testid="batch-sheets-synced-ok"
                  className="text-[11px] text-[#B7F34A] font-semibold"
                >
                  Google Sheets sincronizado em 1 único push consolidado ✓
                </p>
              )}

              {batchSummary.sheetsSyncWarning && (
                <div
                  data-testid="batch-sheets-warning"
                  className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Os registros foram gravados com sucesso no banco PostgreSQL,
                    mas houve falha no push ao Google Sheets:{" "}
                    {batchSummary.sheetsSyncWarning}. Você pode reenviar em{" "}
                    <strong>&ldquo;Sincronizar Planilha&rdquo;</strong>.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Lista de Revisão da Fila */}
          {batchItems.length > 0 && (
            <div data-testid="batch-review-list" className="space-y-2.5">
              {batchItems.map((item, idx) => (
                <BatchImportItemRow
                  key={item.id}
                  index={idx}
                  item={item}
                  eligibility={batchEligibilities[idx]}
                  target={batchTarget}
                  bodyWeightKg={bodyWeightKg}
                  isExpanded={expandedItemIds.has(item.id)}
                  isBatchBusy={batchPhase !== "idle"}
                  onToggleExpand={handleToggleExpandItem}
                  onSplitMergedGroup={handleSplitMergedBatchItem}
                  onRetryParseItem={handleRetryParseSingleItem}
                  onRemoveItem={handleRemoveBatchItem}
                  onUpdateItem={handleUpdateBatchItem}
                />
              ))}
            </div>
          )}

          {/* Barra de Ação Final do Lote */}
          {batchItems.length > 0 && (
            <div className="pt-2 border-t border-[#1E2942] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-[11px] text-[#8E9BB0] space-y-0.5">
                <p>
                  <strong className="text-white">{batchCounts.actionable}</strong>{" "}
                  pronto(s) para gravar
                  {batchCounts.skipped > 0
                    ? ` • ${batchCounts.skipped} pulado(s)`
                    : ""}
                  {batchCounts.blocked > 0
                    ? ` • ${batchCounts.blocked} bloqueado(s)`
                    : ""}
                  {batchCounts.savedDone > 0
                    ? ` • ${batchCounts.savedDone} concluído(s)`
                    : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(batchCounts.parseFailed > 0 || batchCounts.saveFailed > 0) &&
                  batchPhase === "idle" && (
                    <button
                      type="button"
                      data-testid="batch-retry-failed-btn"
                      onClick={handleRetryAllFailed}
                      className="h-11 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0B1020] font-black text-xs inline-flex items-center justify-center gap-1.5 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Tentar novamente falhos (
                      {batchCounts.parseFailed + batchCounts.saveFailed})
                    </button>
                  )}

                <button
                  type="button"
                  data-testid="batch-submit-btn"
                  disabled={
                    batchPhase !== "idle" || batchCounts.actionable === 0
                  }
                  onClick={() => handlePersistBatch(false)}
                  className="h-11 px-6 rounded-xl bg-[#B7F34A] hover:bg-[#a6e03f] text-[#0B1020] font-black text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-[#B7F34A]/20 transition-all disabled:opacity-50"
                >
                  {batchPhase === "saving" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando lote...
                    </>
                  ) : batchCounts.actionable > 0 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Importar Lote ({batchCounts.actionable}{" "}
                      {batchCounts.actionable === 1 ? "pronto" : "prontos"})
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Nenhum item pronto para importar
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODO INDIVIDUAL (Preservado 100%)                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {importMode === "single" && (
        <>
          {/* Mensagem de Erro */}
          {errorMessage && (
            <div
              data-testid="import-error-message"
              className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-medium text-rose-400 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Preview Somente Leitura + Formulário Pós-Upload Inteligente */}
          {preview && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* 0. Seletor de Destino Pós-Upload: Treino do Diário vs Simulado TAF */}
              <div
                data-testid="save-target-selector"
                role="radiogroup"
                aria-label="Salvar atividade como"
                className="bg-[#0B1020] border border-[#1E2942] rounded-2xl p-3.5 sm:p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Salvar como:
                  </span>
                  <span className="text-[11px] text-[#8E9BB0]">
                    O mesmo arquivo pode ser salvo no Diário e como Simulado TAF
                    sem conflito
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={saveAs === "training"}
                    data-testid="save-target-training"
                    onClick={() => {
                      setSaveAs("training");
                      setErrorMessage(null);
                      setSavedAttemptBanner(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                      saveAs === "training"
                        ? "bg-[#B7F34A]/10 border-[#B7F34A] text-white"
                        : "bg-[#131A2E] border-[#1E2942] text-[#8E9BB0] hover:border-[#8E9BB0]/40"
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        saveAs === "training"
                          ? "border-[#B7F34A]"
                          : "border-[#8E9BB0]"
                      }`}
                    >
                      {saveAs === "training" && (
                        <span className="w-2 h-2 rounded-full bg-[#B7F34A]" />
                      )}
                    </span>
                    <div>
                      <span className="text-xs sm:text-sm font-bold block text-white">
                        Treino do Diário
                      </span>
                      <span className="text-[11px] text-[#8E9BB0]">
                        Registra rodagem completa, parciais por km e gasto
                        calórico.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={saveAs === "taf_attempt"}
                    data-testid="save-target-taf"
                    onClick={() => {
                      setSaveAs("taf_attempt");
                      setErrorMessage(null);
                      setSavedAttemptBanner(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                      saveAs === "taf_attempt"
                        ? "bg-[#B7F34A]/10 border-[#B7F34A] text-white"
                        : "bg-[#131A2E] border-[#1E2942] text-[#8E9BB0] hover:border-[#8E9BB0]/40"
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        saveAs === "taf_attempt"
                          ? "border-[#B7F34A]"
                          : "border-[#8E9BB0]"
                      }`}
                    >
                      {saveAs === "taf_attempt" && (
                        <span className="w-2 h-2 rounded-full bg-[#B7F34A]" />
                      )}
                    </span>
                    <div>
                      <span className="text-xs sm:text-sm font-bold block text-white">
                        Simulado TAF (Cooper 12 min)
                      </span>
                      <span className="text-[11px] text-[#8E9BB0]">
                        Extrai a melhor janela contínua de 12 minutos e voltas
                        de 400m.
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* 1. Painel Somente Leitura de Telemetria Extraída */}
              <GpxPreviewCard preview={preview} />

              {/* 1.5 Resumo da Janela Contínua de 12 Minutos (apenas quando destino = Simulado TAF) */}
              {saveAs === "taf_attempt" && effectiveTafWindow && (
                <div
                  data-testid="taf-window-preview"
                  className="bg-[#0B1020] border border-[#B7F34A]/40 rounded-2xl p-4 sm:p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#B7F34A]" />
                      Melhor Janela Contínua de 12 min (Simulado TAF)
                    </h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      {effectiveTafWindow.windowEndOffsetSeconds > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#131A2E] text-[#8E9BB0] px-2.5 py-0.5 rounded-full border border-[#1E2942]">
                          <Timer className="w-3 h-3 text-[#B7F34A]" />
                          Janela:{" "}
                          {formatTime(
                            Math.round(
                              effectiveTafWindow.windowStartOffsetSeconds
                            )
                          )}{" "}
                          –{" "}
                          {formatTime(
                            Math.round(effectiveTafWindow.windowEndOffsetSeconds)
                          )}
                        </span>
                      )}
                      {effectiveTafWindow.avgHeartRate != null && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-rose-950/40 text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-500/30">
                          <HeartPulse className="w-3 h-3 text-rose-400" />
                          FC janela: {effectiveTafWindow.avgHeartRate} bpm
                          {effectiveTafWindow.maxHeartRate != null
                            ? ` (máx ${effectiveTafWindow.maxHeartRate})`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
                    <div>
                      <span className="text-[11px] text-[#8E9BB0] block">
                        Distância na janela
                      </span>
                      <span
                        data-testid="taf-window-distance"
                        className="text-base sm:text-lg font-black text-white"
                      >
                        {effectiveTafWindow.distanceMeters.toLocaleString(
                          "pt-BR"
                        )}{" "}
                        <span className="text-xs font-semibold text-[#8E9BB0]">
                          m
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#8E9BB0] block">
                        Tempo da janela
                      </span>
                      <span className="text-base sm:text-lg font-black text-white">
                        {formatTime(effectiveTafWindow.actualDurationSeconds)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#8E9BB0] block">
                        Pace médio
                      </span>
                      <span className="text-base sm:text-lg font-black text-[#B7F34A]">
                        {effectiveTafWindow.paceFormatted}{" "}
                        <span className="text-xs font-normal text-[#8E9BB0]">
                          /km
                        </span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#8E9BB0] block">
                        Velocidade
                      </span>
                      <span className="text-base sm:text-lg font-black text-white">
                        {effectiveTafWindow.speedKmh.toFixed(2)}{" "}
                        <span className="text-xs font-normal text-[#8E9BB0]">
                          km/h
                        </span>
                      </span>
                    </div>
                  </div>

                  {effectiveTafWindow.isShorterThanTarget && (
                    <div
                      data-testid="taf-shorter-window-warning"
                      className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        Treino mais curto que 12 min (
                        {formatTime(effectiveTafWindow.actualDurationSeconds)}). O
                        simulado será registrado com a duração real percorrida.
                      </span>
                    </div>
                  )}

                  {isTafWindowOutOfBounds && (
                    <div
                      data-testid="taf-bounds-warning"
                      className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>
                        Para registrar como Simulado TAF, a distância deve estar
                        entre 100 m e 10.000 m e a duração entre 30s e 7.200s.
                      </span>
                    </div>
                  )}

                  {effectiveTafWindow.laps.length > 0 && (
                    <div data-testid="taf-window-laps" className="space-y-1.5">
                      <span className="text-[11px] font-bold text-[#8E9BB0] uppercase tracking-wider block">
                        Parciais por volta de 400m (
                        {effectiveTafWindow.laps.length}{" "}
                        {effectiveTafWindow.laps.length === 1
                          ? "volta"
                          : "voltas"}
                        )
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {effectiveTafWindow.laps.map((lap) => (
                          <span
                            key={lap.lapNumber}
                            className="text-[11px] font-semibold bg-[#131A2E] text-white px-2.5 py-1 rounded-lg border border-[#1E2942]"
                          >
                            V{lap.lapNumber}: {lap.distanceMeters}m •{" "}
                            {formatTime(lap.durationSeconds)}
                            {lap.paceFormatted ? ` (${lap.paceFormatted}/km)` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Alerta de Duplicidade (Treino do Diário vs Simulado TAF, verificados independentemente) */}
              {saveAs === "training" && preview.alreadyExists && (
                <div
                  data-testid="duplicate-training-alert"
                  className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block text-amber-300">
                        Este treino já foi importado anteriormente
                      </span>
                      <span>
                        Você pode atualizar o registro existente com os dados e
                        o contexto abaixo sem duplicar a sessão no diário.
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="update-existing-training-btn"
                    disabled={status === "saving"}
                    onClick={() => handleSaveImportedTraining("update")}
                    className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0B1020] font-black text-xs inline-flex items-center gap-1.5 shrink-0 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Atualizar treino existente
                  </button>
                </div>
              )}

              {saveAs === "taf_attempt" && preview.alreadyExistsAttempt && (
                <div
                  data-testid="duplicate-attempt-alert"
                  className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block text-amber-300">
                        Este simulado TAF já foi importado anteriormente
                      </span>
                      <span>
                        Você pode atualizar o simulado existente com os
                        metadados abaixo sem criar duplicata no histórico do Meu
                        TAF.
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="update-existing-attempt-btn"
                    disabled={status === "saving"}
                    onClick={() => handleSaveImportedAttempt("update")}
                    className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0B1020] font-black text-xs inline-flex items-center gap-1.5 shrink-0 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Atualizar simulado existente
                  </button>
                </div>
              )}

              {saveAs === "training" &&
                !preview.alreadyExists &&
                preview.alreadyExistsAttempt && (
                  <div
                    data-testid="cross-duplicate-info"
                    className="p-3 rounded-2xl bg-sky-950/40 border border-sky-500/30 text-sky-200 text-xs flex items-center gap-2.5"
                  >
                    <Info className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>
                      Este arquivo já foi importado como Simulado TAF, mas ainda
                      não consta no Diário de Treinos. Você pode salvá-lo
                      normalmente aqui.
                    </span>
                  </div>
                )}

              {saveAs === "taf_attempt" &&
                !preview.alreadyExistsAttempt &&
                preview.alreadyExists && (
                  <div
                    data-testid="cross-duplicate-info"
                    className="p-3 rounded-2xl bg-sky-950/40 border border-sky-500/30 text-sky-200 text-xs flex items-center gap-2.5"
                  >
                    <Info className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>
                      Este arquivo já foi importado no Diário de Treinos, mas
                      ainda não consta como Simulado TAF. Você pode salvá-lo
                      normalmente no Meu TAF.
                    </span>
                  </div>
                )}

              {savedAttemptBanner && (
                <div
                  data-testid="taf-import-saved-banner"
                  className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#B7F34A] shrink-0" />
                    <span>
                      Simulado TAF salvo com{" "}
                      <strong className="text-white">
                        {savedAttemptBanner.distanceMeters} m
                      </strong>{" "}
                      ({savedAttemptBanner.paceFormatted}/km)!
                    </span>
                  </div>
                  <Link
                    href="/meu-taf"
                    className="px-3 py-1.5 rounded-xl bg-[#B7F34A] text-[#0B1020] font-black text-xs hover:bg-[#a6e03f] transition-colors"
                  >
                    Ver no Meu TAF
                  </Link>
                </div>
              )}

              {/* 2. Formulário Pós-Upload Inteligente */}
              <div
                data-testid="smart-post-upload-form"
                className="bg-[#0B1020] border border-[#1E2942] rounded-2xl p-4 sm:p-5 space-y-4"
              >
                <div className="border-b border-[#1E2942] pb-2.5">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B7F34A]" />
                    Complemento Rápido da Sessão
                  </h4>
                  <p className="text-[11px] text-[#8E9BB0]">
                    Informe apenas os dados contextuais simples abaixo. Os dados
                    de sensores e parciais vêm automaticamente do arquivo.
                  </p>
                </div>

                {/* Campo 1: Nome / Título do Treino */}
                <div
                  className={
                    isTitleMissingFromSource
                      ? "p-3.5 rounded-2xl bg-[#131A2E] border-2 border-[#B7F34A]/60 space-y-1.5"
                      : "space-y-1.5"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="post-upload-title"
                      className="text-xs font-bold text-white flex items-center gap-1.5"
                    >
                      <Tag className="w-3.5 h-3.5 text-[#B7F34A]" />
                      Nome / Título do Treino
                    </label>
                    {isTitleMissingFromSource ? (
                      <span
                        data-testid="title-highlight-badge"
                        className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#B7F34A] text-[#0B1020]"
                      >
                        {workoutTitle.trim().length > 0
                          ? "Sugerido pelo arquivo • Editável"
                          : "Destaque • Nomeie seu treino"}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-emerald-400">
                        {preview?.filesUsed.includes("gpx")
                          ? "Preenchido pelo .GPX (editável)"
                          : "Preenchido pelo .FIT (editável)"}
                      </span>
                    )}
                  </div>
                  <input
                    id="post-upload-title"
                    data-testid="post-upload-title-input"
                    type="text"
                    value={workoutTitle}
                    onChange={(e) => setWorkoutTitle(e.target.value)}
                    placeholder="Ex: Rodagem leve 6 km ou Tiros 6x400m"
                    className="w-full h-11 px-3.5 text-sm font-semibold rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                  />
                </div>

                {/* Grid contextual conforme destino */}
                {saveAs === "training" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label
                        htmlFor="post-upload-activity-type"
                        className="block text-xs font-bold text-[#8E9BB0] mb-1.5"
                      >
                        Tipo de Treino *
                      </label>
                      <select
                        id="post-upload-activity-type"
                        data-testid="post-upload-activity-select"
                        value={activityType}
                        onChange={(e) =>
                          setActivityType(e.target.value as ActivityType)
                        }
                        className="w-full h-11 px-3 text-xs font-bold rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A]"
                      >
                        {ACTIVITY_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {ACTIVITY_LABELS[type]}
                            {preview.allowedActivityTypes.includes(type)
                              ? ""
                              : " (Outra família)"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="post-upload-shoe"
                        className="block text-xs font-bold text-[#8E9BB0] mb-1.5 flex items-center gap-1"
                      >
                        <Footprints className="w-3.5 h-3.5 text-[#B7F34A]" />
                        Tênis Utilizado (Opcional)
                      </label>
                      <input
                        id="post-upload-shoe"
                        data-testid="post-upload-shoe-input"
                        type="text"
                        value={shoeName}
                        onChange={(e) => setShoeName(e.target.value)}
                        placeholder="Ex: Nike Pegasus 40"
                        className="w-full h-11 px-3 text-xs rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="post-upload-weight"
                        className="block text-xs font-bold text-[#8E9BB0] mb-1.5 flex items-center gap-1"
                      >
                        <Scale className="w-3.5 h-3.5 text-[#8E9BB0]" />
                        Peso Corporal (kg)
                      </label>
                      <input
                        id="post-upload-weight"
                        data-testid="post-upload-weight-input"
                        type="text"
                        inputMode="decimal"
                        value={bodyWeightKg}
                        onChange={(e) => setBodyWeightKg(e.target.value)}
                        placeholder="Ex: 74.5"
                        className="w-full h-11 px-3 text-xs rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label
                        htmlFor="post-upload-location"
                        className="block text-xs font-bold text-[#8E9BB0] mb-1.5 flex items-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#B7F34A]" />
                        Local do Teste
                      </label>
                      <select
                        id="post-upload-location"
                        data-testid="post-upload-location-select"
                        value={locationType}
                        onChange={(e) =>
                          setLocationType(e.target.value as LocationType)
                        }
                        className="w-full h-11 px-3 text-xs font-bold rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A]"
                      >
                        {LOCATION_TYPES_ORDER.map((loc) => (
                          <option key={loc} value={loc}>
                            {LOCATION_LABELS[loc]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="post-upload-shoe"
                        className="block text-xs font-bold text-[#8E9BB0] mb-1.5 flex items-center gap-1"
                      >
                        <Footprints className="w-3.5 h-3.5 text-[#B7F34A]" />
                        Tênis Utilizado (Opcional)
                      </label>
                      <input
                        id="post-upload-shoe"
                        data-testid="post-upload-shoe-input"
                        type="text"
                        value={shoeName}
                        onChange={(e) => setShoeName(e.target.value)}
                        placeholder="Ex: Nike Vaporfly 3"
                        className="w-full h-11 px-3 text-xs rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A]"
                      />
                    </div>
                  </div>
                )}

                {/* RPE */}
                {saveAs === "training" && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-[#8E9BB0]">
                        Esforço Percebido — RPE 1 a 10 (Opcional)
                      </label>
                      {perceivedEffort !== null && (
                        <button
                          type="button"
                          onClick={() => setPerceivedEffort(null)}
                          className="text-[11px] text-[#8E9BB0] hover:text-white underline"
                        >
                          Limpar RPE
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
                        const isSelected = perceivedEffort === val;
                        return (
                          <button
                            type="button"
                            key={val}
                            data-testid={`post-upload-rpe-btn-${val}`}
                            onClick={() => setPerceivedEffort(val)}
                            className={`h-9 rounded-xl text-xs font-black transition-all ${
                              isSelected
                                ? "bg-[#B7F34A] text-[#0B1020] ring-2 ring-[#B7F34A]"
                                : "bg-[#131A2E] border border-[#1E2942] text-[#8E9BB0] hover:text-white"
                            }`}
                          >
                            {val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Observações */}
                <div>
                  <label
                    htmlFor="post-upload-notes"
                    className="block text-xs font-bold text-[#8E9BB0] mb-1.5"
                  >
                    Observações Adicionais (Opcional)
                  </label>
                  <textarea
                    id="post-upload-notes"
                    data-testid="post-upload-notes-input"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex: Sensação de pernas leves, clima ameno, hidratação no km 3."
                    className="w-full p-3 text-xs rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] resize-none"
                  />
                </div>

                {/* Fallback de Dados Básicos */}
                {needsBasicFallback && (
                  <div
                    data-testid="fallback-basic-inputs"
                    className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 grid grid-cols-1 sm:grid-cols-3 gap-3"
                  >
                    <div>
                      <label
                        htmlFor="fallback-date-input"
                        className="block text-xs font-bold text-amber-200 mb-1"
                      >
                        Data da Sessão
                      </label>
                      <input
                        id="fallback-date-input"
                        data-testid="fallback-date-input"
                        type="datetime-local"
                        value={fallbackDate}
                        onChange={(e) => setFallbackDate(e.target.value)}
                        className="w-full h-10 px-2.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fallback-distance-input"
                        className="block text-xs font-bold text-amber-200 mb-1"
                      >
                        Distância (km)
                      </label>
                      <input
                        id="fallback-distance-input"
                        data-testid="fallback-distance-input"
                        type="text"
                        value={fallbackDistanceKm}
                        onChange={(e) => setFallbackDistanceKm(e.target.value)}
                        className="w-full h-10 px-2.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fallback-duration-input"
                        className="block text-xs font-bold text-amber-200 mb-1"
                      >
                        Duração (segundos)
                      </label>
                      <input
                        id="fallback-duration-input"
                        data-testid="fallback-duration-input"
                        type="number"
                        value={fallbackDurationSec}
                        onChange={(e) => setFallbackDurationSec(e.target.value)}
                        className="w-full h-10 px-2.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white"
                      />
                    </div>
                  </div>
                )}

                {/* Resumo Final e Botão de Salvar conforme destino selecionado */}
                {saveAs === "training" ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#1E2942]">
                    <div className="flex items-center gap-2 text-xs text-[#8E9BB0]">
                      <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                      {calorieEstimate ? (
                        <span>
                          Gasto estimado (Compêndio 2024):{" "}
                          <strong className="text-[#B7F34A]">
                            {calorieEstimate.activeCalories} kcal ativas
                          </strong>{" "}
                          ({calorieEstimate.totalCalories} kcal totais)
                        </span>
                      ) : preview.activeCalories !== null ? (
                        <span>
                          Calorias do dispositivo (.FIT):{" "}
                          <strong className="text-[#B7F34A]">
                            {preview.activeCalories} kcal
                          </strong>
                        </span>
                      ) : (
                        <span>
                          Informe o peso corporal para estimar o gasto calórico
                          (MET).
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      data-testid="save-imported-training-btn"
                      disabled={status === "saving"}
                      onClick={() =>
                        handleSaveImportedTraining(
                          preview.alreadyExists ? "update" : undefined
                        )
                      }
                      className="h-11 px-6 rounded-xl bg-[#B7F34A] hover:bg-[#a6e03f] text-[#0B1020] font-black text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-[#B7F34A]/20 transition-all disabled:opacity-50"
                    >
                      {status === "saving" ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Salvando...
                        </>
                      ) : preview.alreadyExists ? (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Salvar Atualização do Treino
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Confirmar e Salvar Treino
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-[#1E2942]">
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#131A2E] border border-[#1E2942] cursor-pointer hover:border-[#B7F34A]/50 transition-colors">
                      <input
                        type="checkbox"
                        data-testid="import-also-save-diary-checkbox"
                        checked={alsoSaveToDiary}
                        onChange={(e) => setAlsoSaveToDiary(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#1E2942] bg-[#0B1020] text-[#B7F34A] focus:ring-[#B7F34A]"
                      />
                      <span className="text-xs text-[#E2E8F0] leading-relaxed">
                        <span className="font-bold text-white block">
                          Também registrar no Diário de Treinos (Log_Treinos)
                        </span>
                        <span className="text-[11px] text-[#8E9BB0]">
                          Salva uma sessão espelhada no Diário como Tempo Run
                          (ID trn_ separado para sincronização com Google
                          Sheets).
                        </span>
                      </span>
                    </label>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-[#8E9BB0]">
                        <Award className="w-4 h-4 text-[#B7F34A] shrink-0" />
                        {effectiveTafWindow ? (
                          <span>
                            Janela TAF (12 min):{" "}
                            <strong className="text-[#B7F34A]">
                              {effectiveTafWindow.distanceMeters.toLocaleString(
                                "pt-BR"
                              )}{" "}
                              m
                            </strong>{" "}
                            em{" "}
                            {formatTime(
                              effectiveTafWindow.actualDurationSeconds
                            )}{" "}
                            ({effectiveTafWindow.paceFormatted}/km)
                          </span>
                        ) : (
                          <span>
                            Informe distância e duração nos campos acima para
                            gerar o simulado TAF.
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        data-testid="save-imported-attempt-btn"
                        disabled={
                          status === "saving" ||
                          !effectiveTafWindow ||
                          isTafWindowOutOfBounds
                        }
                        onClick={() =>
                          handleSaveImportedAttempt(
                            preview.alreadyExistsAttempt ? "update" : undefined
                          )
                        }
                        className="h-11 px-6 rounded-xl bg-[#B7F34A] hover:bg-[#a6e03f] text-[#0B1020] font-black text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-lg shadow-[#B7F34A]/20 transition-all disabled:opacity-50"
                      >
                        {status === "saving" ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Salvando...
                          </>
                        ) : preview.alreadyExistsAttempt ? (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Salvar Atualização do Simulado TAF
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Confirmar e Salvar Simulado TAF
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
