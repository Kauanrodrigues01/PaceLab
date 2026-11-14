"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ActivityParsePreview,
  ActivityType,
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  LOCATION_LABELS,
  LocationType,
  TafAttempt,
  TafWindowSummary,
  TrainingSession,
} from "@/types";
import { tafService } from "@/lib/services/tafService";
import { profileService } from "@/lib/services/profileService";
import { formatTime } from "@/lib/formatting/time";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import {
  buildCaloriePayload,
  estimateTrainingCalories,
} from "@/lib/math/calories";
import { GpxPreviewCard } from "./GpxPreviewCard";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  FileUp,
  Flame,
  Footprints,
  HeartPulse,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  Scale,
  Sparkles,
  Tag,
  Timer,
  Upload,
  X,
} from "lucide-react";

export const MAX_CLIENT_FILE_BYTES = 4 * 1024 * 1024; // 4 MB

const LOCATION_TYPES_ORDER: LocationType[] = [
  "pista_400m",
  "rua_plana",
  "parque_praca",
  "esteira",
  "outro",
];

function resolveSafeIsoDate(primaryIso: string | null | undefined, fallbackInput: string): string {
  if (primaryIso) return primaryIso;
  if (fallbackInput) {
    const parsed = new Date(fallbackInput);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

interface GpxImportPanelProps {
  onImported?: (saved: TrainingSession, isUpdated?: boolean) => void;
  onAttemptImported?: (saved: TafAttempt, isUpdated?: boolean) => void;
  defaultSaveAs?: "training" | "taf_attempt";
  onCancel?: () => void;
}

export function GpxImportPanel({
  onImported,
  onAttemptImported,
  defaultSaveAs = "training",
  onCancel,
}: GpxImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<
    "idle" | "parsing" | "preview" | "saving" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ActivityParsePreview | null>(null);

  // Seletor explícito de destino pós-upload: Diário de Treinos ou Simulado TAF
  const [saveAs, setSaveAs] = useState<"training" | "taf_attempt">(
    defaultSaveAs
  );

  // Campos simples e contextuais do Formulário Pós-Upload Inteligente (Seção 2.3)
  const [workoutTitle, setWorkoutTitle] = useState("");
  const [activityType, setActivityType] =
    useState<ActivityType>("corrida_continua");
  const [locationType, setLocationType] = useState<LocationType>("pista_400m");
  const [perceivedEffort, setPerceivedEffort] = useState<number | null>(null);
  const [shoeName, setShoeName] = useState("");
  const [bodyWeightKg, setBodyWeightKg] = useState("");
  const [notes, setNotes] = useState("");
  const [savedAttemptBanner, setSavedAttemptBanner] =
    useState<TafAttempt | null>(null);

  // Inputs básicos de fallback (exibidos SOMENTE se o arquivo não trouxer data, distância ou duração)
  const [fallbackDate, setFallbackDate] = useState("");
  const [fallbackDistanceKm, setFallbackDistanceKm] = useState("");
  const [fallbackDurationSec, setFallbackDurationSec] = useState("");

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
      setPreview(result);
      setSavedAttemptBanner(null);
      setWorkoutTitle(result.name ?? "");
      setActivityType(result.suggestedActivityType ?? "corrida_continua");
      setLocationType(result.isIndoor ? "esteira" : "pista_400m");
      setFallbackDate(
        result.startedAt ? result.startedAt.slice(0, 16) : ""
      );
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

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    // Limpa o value do input nativo para permitir selecionar o mesmo arquivo novamente se necessário
    e.target.value = "";
    if (fileList.length === 0) return;

    // Se já havia 1 arquivo válido (.FIT ou .GPX) e o usuário selecionou mais 1 do formato complementar válido, combina os dois
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
    const droppedFiles = e.dataTransfer?.files
      ? Array.from(e.dataTransfer.files)
      : [];
    if (droppedFiles.length > 0) {
      await validateAndAnalyzeFiles(droppedFiles);
    }
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

  const needsBasicFallback = Boolean(
    preview &&
      (!preview.startedAt ||
        preview.distanceKm <= 0 ||
        preview.durationSeconds <= 0)
  );

  // Cálculo de calorias: prioriza Compêndio 2024 quando o atleta tem peso preenchido;
  // caso contrário preserva activeCalories vindo do dispositivo .FIT
  const effectiveMetrics = React.useMemo(() => {
    if (!preview) return null;
    const rawDist =
      preview.distanceKm > 0
        ? preview.distanceKm
        : parseFloat(fallbackDistanceKm.replace(",", "."));
    const rawDur =
      preview.durationSeconds > 0
        ? preview.durationSeconds
        : parseInt(fallbackDurationSec, 10);

    if (
      !Number.isFinite(rawDist) ||
      rawDist <= 0 ||
      !Number.isFinite(rawDur) ||
      rawDur <= 0
    ) {
      return null;
    }

    if (
      preview.distanceKm > 0 &&
      preview.durationSeconds > 0 &&
      preview.speedKmh > 0 &&
      preview.paceSeconds > 0
    ) {
      return {
        distanceKm: preview.distanceKm,
        durationSeconds: preview.durationSeconds,
        speedKmh: preview.speedKmh,
        paceSeconds: preview.paceSeconds,
        paceFormatted: preview.paceFormatted,
      };
    }

    const pace = calcPaceFromDistanceAndTime(rawDist, rawDur);
    return {
      distanceKm: Number(rawDist.toFixed(3)),
      durationSeconds: Math.round(rawDur),
      speedKmh: Number(pace.speedKmh.toFixed(2)),
      paceSeconds: Math.round(pace.paceSeconds),
      paceFormatted: pace.paceFormatted,
    };
  }, [preview, fallbackDistanceKm, fallbackDurationSec]);

  const calorieEstimate = React.useMemo(() => {
    if (!effectiveMetrics) return null;
    const sanitized = bodyWeightKg.trim().replace(",", ".");
    const weight = parseFloat(sanitized);
    if (isNaN(weight) || weight <= 0) return null;
    try {
      return estimateTrainingCalories({
        activityType,
        speedKmh: effectiveMetrics.speedKmh,
        distanceKm: effectiveMetrics.distanceKm,
        durationSeconds: effectiveMetrics.durationSeconds,
        weightKg: weight,
      });
    } catch {
      return null;
    }
  }, [effectiveMetrics, activityType, bodyWeightKg]);

  const handleSaveImportedTraining = async (onDuplicateMode?: "update") => {
    if (!preview) return;
    setErrorMessage(null);

    let parsedWeight: number | null = null;
    if (bodyWeightKg.trim() !== "") {
      const numWeight = parseFloat(bodyWeightKg.replace(",", "."));
      if (isNaN(numWeight) || numWeight < 30 || numWeight > 250) {
        setErrorMessage(
          "Informe um peso corporal válido entre 30 kg e 250 kg (ou deixe em branco)."
        );
        return;
      }
      parsedWeight = Number(numWeight.toFixed(1));
    }

    const finalDistanceKm =
      preview.distanceKm > 0
        ? preview.distanceKm
        : parseFloat(fallbackDistanceKm.replace(",", "."));
    const finalDurationSeconds =
      preview.durationSeconds > 0
        ? preview.durationSeconds
        : parseInt(fallbackDurationSec, 10);
    const finalSessionDate = resolveSafeIsoDate(preview.startedAt, fallbackDate);

    if (
      !Number.isFinite(finalDistanceKm) ||
      finalDistanceKm < 0.05 ||
      finalDistanceKm > 100
    ) {
      setErrorMessage(
        "A distância do treino deve estar entre 0,05 km (50 m) e 100 km."
      );
      return;
    }

    if (
      !Number.isFinite(finalDurationSeconds) ||
      finalDurationSeconds < 30 ||
      finalDurationSeconds > 86400
    ) {
      setErrorMessage(
        "A duração do treino deve estar entre 30 segundos e 24 horas."
      );
      return;
    }

    const paceMetrics =
      preview.distanceKm > 0 &&
      preview.durationSeconds > 0 &&
      preview.speedKmh > 0 &&
      preview.paceSeconds > 0
        ? {
            speedKmh: preview.speedKmh,
            paceSeconds: preview.paceSeconds,
            paceFormatted: preview.paceFormatted,
          }
        : (() => {
            const calc = calcPaceFromDistanceAndTime(
              finalDistanceKm,
              finalDurationSeconds
            );
            return {
              speedKmh: Number(calc.speedKmh.toFixed(2)),
              paceSeconds: Math.round(calc.paceSeconds),
              paceFormatted: calc.paceFormatted,
            };
          })();

    const finalElapsedSeconds =
      preview.elapsedSeconds !== null
        ? Math.max(finalDurationSeconds, preview.elapsedSeconds)
        : null;

    // Combina Título do Treino e Observações em notes (respeitando limite de 1.000 chars do Zod)
    const cleanTitle = workoutTitle.trim();
    const cleanNotes = notes.trim();
    const combinedRaw =
      cleanTitle && cleanNotes
        ? `${cleanTitle} — ${cleanNotes}`
        : cleanTitle || cleanNotes || "";
    const combinedNotes = combinedRaw ? combinedRaw.slice(0, 1000) : null;

    const caloriePayload = calorieEstimate
      ? buildCaloriePayload(calorieEstimate)
      : preview.activeCalories !== null && preview.activeCalories > 0
        ? {
            activeCalories: preview.activeCalories,
            totalCalories: preview.activeCalories,
            metValue: null,
            calorieMethod: "garmin_fit_device",
            calorieSource: "device_fit",
            calorieMetadata: { source: "fit_session_total_calories" },
          }
        : {
            activeCalories: null,
            totalCalories: null,
            metValue: null,
            calorieMethod: null,
            calorieSource: null,
            calorieMetadata: null,
          };

    setStatus("saving");

    try {
      const payload: TrainingSession & { onDuplicate?: "update" } = {
        id:
          onDuplicateMode === "update" && preview.existingTrainingId
            ? preview.existingTrainingId
            : `trn_${Date.now()}`,
        source: preview.source,
        externalId: preview.externalId,
        sessionDate: finalSessionDate,
        activityType,
        distanceKm: Number(finalDistanceKm.toFixed(3)),
        durationSeconds: Math.round(finalDurationSeconds),
        elapsedSeconds: finalElapsedSeconds,
        speedKmh: paceMetrics.speedKmh,
        paceSeconds: paceMetrics.paceSeconds,
        paceFormatted: paceMetrics.paceFormatted,
        avgHeartRate: preview.avgHeartRate,
        maxHeartRate: preview.maxHeartRate,
        elevationGainM: preview.elevationGainM,
        avgCadence: preview.avgCadence,
        shoeName: shoeName.trim() || null,
        perceivedEffort,
        bodyWeightKg: parsedWeight,
        notes: combinedNotes,
        splits: preview.splits,
        ...caloriePayload,
        ...(onDuplicateMode === "update" ? { onDuplicate: "update" } : {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await tafService.saveTraining(payload, false);
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

  // Resumo da janela de 12 minutos para Simulado TAF (vindo do parser ou calculado por fallback)
  const effectiveTafWindow: TafWindowSummary | null = React.useMemo(() => {
    if (!preview) return null;
    if (preview.tafWindow) return preview.tafWindow;
    if (!effectiveMetrics) return null;

    const targetSeconds = 720;
    const rawDuration = effectiveMetrics.durationSeconds;
    const actualDurationSeconds = Math.min(targetSeconds, rawDuration);
    const ratio = rawDuration > targetSeconds ? targetSeconds / rawDuration : 1;
    const distanceMeters = Math.round(effectiveMetrics.distanceKm * 1000 * ratio);
    if (distanceMeters <= 0 || actualDurationSeconds <= 0) return null;

    const paceCalc = calcPaceFromDistanceAndTime(
      distanceMeters / 1000,
      actualDurationSeconds
    );

    return {
      targetDurationSeconds: targetSeconds,
      actualDurationSeconds,
      distanceMeters,
      speedKmh: Number(paceCalc.speedKmh.toFixed(2)),
      paceSeconds: Math.round(paceCalc.paceSeconds),
      paceFormatted: paceCalc.paceFormatted,
      avgHeartRate: preview.avgHeartRate,
      maxHeartRate: preview.maxHeartRate,
      windowStartOffsetSeconds: 0,
      windowEndOffsetSeconds: actualDurationSeconds,
      isShorterThanTarget: actualDurationSeconds < targetSeconds - 5,
      laps: [],
    };
  }, [preview, effectiveMetrics]);

  const isTafWindowOutOfBounds = Boolean(
    effectiveTafWindow &&
      (effectiveTafWindow.distanceMeters < 100 ||
        effectiveTafWindow.distanceMeters > 10000 ||
        effectiveTafWindow.actualDurationSeconds < 30 ||
        effectiveTafWindow.actualDurationSeconds > 7200)
  );

  const handleSaveImportedAttempt = async (onDuplicateMode?: "update") => {
    if (!preview || !effectiveTafWindow) return;
    setErrorMessage(null);
    setSavedAttemptBanner(null);

    const distanceMeters = Math.round(effectiveTafWindow.distanceMeters);
    const actualDurationSeconds = Math.round(
      effectiveTafWindow.actualDurationSeconds
    );

    if (
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 100 ||
      distanceMeters > 10000
    ) {
      setErrorMessage(
        "Para salvar como Simulado TAF, a distância na janela deve estar entre 100 m e 10.000 m."
      );
      return;
    }

    if (
      !Number.isFinite(actualDurationSeconds) ||
      actualDurationSeconds < 30 ||
      actualDurationSeconds > 7200
    ) {
      setErrorMessage(
        "Para salvar como Simulado TAF, a duração da janela deve estar entre 30 segundos e 2 horas (7.200s)."
      );
      return;
    }

    const finalTestDate = resolveSafeIsoDate(preview.startedAt, fallbackDate);

    const rawAvgHr = effectiveTafWindow.avgHeartRate ?? preview.avgHeartRate;
    const rawMaxHr = effectiveTafWindow.maxHeartRate ?? preview.maxHeartRate;
    const avgHeartRate =
      typeof rawAvgHr === "number" && rawAvgHr >= 30 && rawAvgHr <= 250
        ? Math.round(rawAvgHr)
        : null;
    const maxHrCandidate =
      typeof rawMaxHr === "number" && rawMaxHr >= 30 && rawMaxHr <= 250
        ? Math.round(rawMaxHr)
        : null;
    const maxHeartRate =
      maxHrCandidate !== null && avgHeartRate !== null && maxHrCandidate < avgHeartRate
        ? avgHeartRate
        : maxHrCandidate;

    const cleanTitle = workoutTitle.trim();
    const cleanNotes = notes.trim();
    const combinedRaw =
      cleanTitle && cleanNotes
        ? `${cleanTitle} — ${cleanNotes}`
        : cleanTitle || cleanNotes || "";
    const combinedNotes = combinedRaw ? combinedRaw.slice(0, 1000) : null;

    setStatus("saving");

    try {
      const payload: TafAttempt & { onDuplicate?: "update" } = {
        id:
          onDuplicateMode === "update" && preview.existingAttemptId
            ? preview.existingAttemptId
            : `att_${Date.now()}`,
        source: preview.source,
        externalId: preview.externalId,
        testDate: finalTestDate,
        targetDurationSeconds: 720,
        actualDurationSeconds,
        distanceMeters,
        speedKmh: effectiveTafWindow.speedKmh,
        paceSeconds: effectiveTafWindow.paceSeconds,
        paceFormatted: effectiveTafWindow.paceFormatted,
        locationType,
        shoeName: shoeName.trim() || null,
        avgHeartRate,
        maxHeartRate,
        notes: combinedNotes,
        laps: effectiveTafWindow.laps,
        ...(onDuplicateMode === "update" ? { onDuplicate: "update" as const } : {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await tafService.saveAttempt(payload, false);
      setStatus("preview");
      if (onAttemptImported) {
        onAttemptImported(saved, onDuplicateMode === "update");
      } else {
        setPreview((prev) =>
          prev
            ? {
                ...prev,
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

  const isTitleMissingFromSource = Boolean(
    preview && (!preview.name || preview.name.trim().length === 0)
  );

  return (
    <div
      data-testid="gpx-import-panel"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-7 shadow-sm space-y-5"
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1E2942]">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileUp className="w-5 h-5 text-[#B7F34A]" />
            Importar Treino do Strava / Garmin (.FIT Prioritário + .GPX)
          </h3>
          <p className="text-xs text-[#8E9BB0] mt-0.5">
            Envie o arquivo original <strong className="text-white">.FIT</strong>{" "}
            (recomendado), um <strong className="text-white">.GPX</strong> isolado ou{" "}
            <strong className="text-[#B7F34A]">.FIT + .GPX juntos</strong> do mesmo
            treino para mesclar telemetria oficial e título do Strava.
          </p>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-[#8E9BB0] hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1E2942] hover:bg-[#1E2942] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Fechar
          </button>
        )}
      </div>

      {/* Área de Seleção / Drag & Drop de 1 ou 2 arquivos (.FIT e/ou .GPX) */}
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
          onChange={handleFileInputChange}
          className="sr-only"
        />

        <div className="flex flex-col items-center justify-center space-y-2.5">
          <div className="w-11 h-11 rounded-2xl bg-[#131A2E] border border-[#1E2942] flex items-center justify-center text-[#B7F34A]">
            {status === "parsing" ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="activity-file-upload"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B7F34A] hover:bg-[#a6e03f] text-[#0B1020] font-black text-xs cursor-pointer transition-all shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              {selectedFiles.length === 0
                ? "Selecionar arquivo(s) .FIT e/ou .GPX"
                : selectedFiles.length === 1
                  ? "Adicionar 2º arquivo complementar ou trocar"
                  : "Trocar arquivos selecionados"}
            </label>
            <p className="text-[11px] text-[#8E9BB0]">
              Aceita 1 ou 2 arquivos simultâneos (`.fit`, `.gpx` ou `.fit + .gpx` • máx. 4 MB cada)
            </p>
          </div>

          {/* Badges dos arquivos selecionados */}
          {selectedFiles.length > 0 && (
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
                      {isFit ? "Fonte Primária (.FIT):" : "Complemento/Fallback (.GPX):"}{" "}
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
        </div>
      </div>

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
                O mesmo arquivo pode ser salvo no Diário e como Simulado TAF sem conflito
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
                    Registra rodagem completa, parciais por km e gasto calórico.
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
                    Extrai a melhor janela contínua de 12 minutos e voltas de 400m.
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
                      Janela: {formatTime(Math.round(effectiveTafWindow.windowStartOffsetSeconds))} –{" "}
                      {formatTime(Math.round(effectiveTafWindow.windowEndOffsetSeconds))}
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
                  <span className="text-[11px] text-[#8E9BB0] block">Distância na janela</span>
                  <span
                    data-testid="taf-window-distance"
                    className="text-base sm:text-lg font-black text-white"
                  >
                    {effectiveTafWindow.distanceMeters.toLocaleString("pt-BR")}{" "}
                    <span className="text-xs font-semibold text-[#8E9BB0]">m</span>
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-[#8E9BB0] block">Tempo da janela</span>
                  <span className="text-base sm:text-lg font-black text-white">
                    {formatTime(effectiveTafWindow.actualDurationSeconds)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-[#8E9BB0] block">Pace médio</span>
                  <span className="text-base sm:text-lg font-black text-[#B7F34A]">
                    {effectiveTafWindow.paceFormatted}{" "}
                    <span className="text-xs font-normal text-[#8E9BB0]">/km</span>
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-[#8E9BB0] block">Velocidade</span>
                  <span className="text-base sm:text-lg font-black text-white">
                    {effectiveTafWindow.speedKmh.toFixed(2)}{" "}
                    <span className="text-xs font-normal text-[#8E9BB0]">km/h</span>
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
                    Treino mais curto que 12 min ({formatTime(effectiveTafWindow.actualDurationSeconds)}). O simulado será registrado com a duração real percorrida.
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
                    Para registrar como Simulado TAF, a distância deve estar entre 100 m e 10.000 m e a duração entre 30s e 7.200s.
                  </span>
                </div>
              )}

              {effectiveTafWindow.laps.length > 0 && (
                <div data-testid="taf-window-laps" className="space-y-1.5">
                  <span className="text-[11px] font-bold text-[#8E9BB0] uppercase tracking-wider block">
                    Parciais por volta de 400m ({effectiveTafWindow.laps.length}{" "}
                    {effectiveTafWindow.laps.length === 1 ? "volta" : "voltas"})
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
                    Você pode atualizar o registro existente com os dados e o
                    contexto abaixo sem duplicar a sessão no diário.
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
                    Você pode atualizar o simulado existente com os metadados
                    abaixo sem criar duplicata no histórico do Meu TAF.
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
                  Este arquivo já foi importado como Simulado TAF, mas ainda não
                  consta no Diário de Treinos. Você pode salvá-lo normalmente
                  aqui.
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
                  Este arquivo já foi importado no Diário de Treinos, mas ainda
                  não consta como Simulado TAF. Você pode salvá-lo normalmente
                  no Meu TAF.
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

          {/* 2. Formulário Pós-Upload Inteligente (Apenas Campos Simples e Contextuais — NUNCA pede sensores ausentes) */}
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
                Informe apenas os dados contextuais simples abaixo. Os dados de
                sensores e parciais vêm automaticamente do arquivo.
              </p>
            </div>

            {/* Campo 1: Nome / Título do Treino (Destaque principal quando ausente no .FIT) */}
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
                    Destaque • Nomeie seu treino
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-emerald-400">
                    Preenchido pelo .GPX (editável)
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

            {/* Grid contextual conforme destino: Treino (Tipo, Tênis, Peso) ou TAF (Local do Teste, Tênis) */}
            {saveAs === "training" ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Campo 2: Tipo de Treino (Select Obrigatório) */}
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

                {/* Campo 4: Tênis Utilizado (Opcional) */}
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

                {/* Campo 5: Peso Corporal (Pré-preenchido com UserProfile.currentWeightKg) */}
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
                {/* Local do Teste (Obrigatório contextualmente no TAF — pré-seleciona "esteira" se indoor) */}
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

                {/* Tênis Utilizado (Opcional) */}
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

            {/* Campo 3: Esforço Percebido (RPE 1 a 10 — apenas para Treino do Diário) */}
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

            {/* Campo 6: Observações Livres (Opcional) */}
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

            {/* Campo 7: Fallback de Dados Básicos (SOMENTE se o arquivo não trouxer data, distância ou duração) */}
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
                      Informe o peso corporal para estimar o gasto calórico (MET).
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#1E2942]">
                <div className="flex items-center gap-2 text-xs text-[#8E9BB0]">
                  <Award className="w-4 h-4 text-[#B7F34A] shrink-0" />
                  {effectiveTafWindow ? (
                    <span>
                      Janela TAF (12 min):{" "}
                      <strong className="text-[#B7F34A]">
                        {effectiveTafWindow.distanceMeters.toLocaleString("pt-BR")}{" "}
                        m
                      </strong>{" "}
                      em {formatTime(effectiveTafWindow.actualDurationSeconds)} (
                      {effectiveTafWindow.paceFormatted}/km)
                    </span>
                  ) : (
                    <span>
                      Informe distância e duração nos campos acima para gerar o
                      simulado TAF.
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
