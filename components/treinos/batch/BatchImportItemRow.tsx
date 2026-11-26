"use client";

import React from "react";
import {
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  ActivityType,
  BatchImportTarget,
  LOCATION_LABELS,
  LocationType,
} from "@/types";
import {
  type BatchItemEligibility,
  type BatchQueueItem,
  LOCATION_TYPES_ORDER,
  resolveTrainingCaloriesPayload,
  validateTrainingWeightKg,
} from "@/lib/activityParser/batchPayloads";
import { formatDateTimeFortaleza } from "@/lib/formatting/date";
import { formatTime } from "@/lib/formatting/time";
import { GpxPreviewCard } from "@/components/treinos/GpxPreviewCard";
import {
  AlertCircle,
  Award,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Loader2,
  RefreshCw,
  Scissors,
  Trash2,
} from "lucide-react";

interface BatchImportItemRowProps {
  index: number;
  item: BatchQueueItem;
  eligibility: BatchItemEligibility;
  target: BatchImportTarget;
  bodyWeightKg: string;
  isExpanded: boolean;
  isBatchBusy: boolean;
  onToggleExpand: (itemId: string) => void;
  onSplitMergedGroup: (itemId: string) => void;
  onRetryParseItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateItem: (
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
  ) => void;
}

function formatShortSessionDate(isoOrInput: string | null | undefined): string {
  if (!isoOrInput) return "Sem data";
  return formatDateTimeFortaleza(isoOrInput, "Data pendente");
}

function getStatusBadge(
  eligibility: BatchItemEligibility
): { label: string; className: string } {
  switch (eligibility.uiState) {
    case "pending":
      return {
        label: "Na fila",
        className: "bg-[#131A2E] text-[#8E9BB0] border-[#1E2942]",
      };
    case "parsing":
      return {
        label: "Analisando...",
        className: "bg-sky-950/50 text-sky-300 border-sky-500/30",
      };
    case "cancelled":
      return {
        label: "Análise cancelada",
        className: "bg-amber-950/50 text-amber-300 border-amber-500/30",
      };
    case "parse_error":
      return {
        label: "Erro na leitura",
        className: "bg-rose-950/60 text-rose-300 border-rose-500/40",
      };
    case "saving":
      return {
        label: "Salvando...",
        className: "bg-sky-950/50 text-sky-300 border-sky-500/30",
      };
    case "saved":
      return {
        label: "Salvo ✓",
        className: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
      };
    case "updated":
      return {
        label: "Atualizado ✓",
        className: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40",
      };
    case "skipped":
      return {
        label: "Pulado",
        className: "bg-[#131A2E] text-[#8E9BB0] border-[#1E2942]",
      };
    case "save_error":
      return {
        label: "Falha ao salvar",
        className: "bg-rose-950/60 text-rose-300 border-rose-500/40",
      };
    case "duplicate_in_batch":
      return {
        label: "Repetido neste lote",
        className: "bg-[#131A2E] text-[#8E9BB0] border-[#1E2942]",
      };
    case "needs_manual_fallback":
      return {
        label: "Requer dados manuais",
        className: "bg-amber-950/60 text-amber-300 border-amber-500/40",
      };
    case "taf_out_of_bounds":
      return {
        label: "Fora dos limites TAF",
        className: "bg-rose-950/60 text-rose-300 border-rose-500/40",
      };
    case "duplicate_target_skip":
      return {
        label: "Duplicado (será pulado)",
        className: "bg-amber-950/60 text-amber-300 border-amber-500/40",
      };
    case "duplicate_target_update":
      return {
        label: "Duplicado (será atualizado)",
        className: "bg-amber-950/60 text-amber-300 border-amber-500/40",
      };
    case "ready":
    default:
      return {
        label: "Pronto para salvar",
        className: "bg-[#B7F34A]/15 text-[#B7F34A] border-[#B7F34A]/40",
      };
  }
}

/**
 * Linha/card compacto de revisão para uma atividade no lote.
 * Mantém gráficos e tabela de splits sob demanda (`isExpanded`) para performance no mobile.
 */
export function BatchImportItemRow({
  index,
  item,
  eligibility,
  target,
  bodyWeightKg,
  isExpanded,
  isBatchBusy,
  onToggleExpand,
  onSplitMergedGroup,
  onRetryParseItem,
  onRemoveItem,
  onUpdateItem,
}: BatchImportItemRowProps) {
  const statusBadge = getStatusBadge(eligibility);
  const isLockedSaved =
    item.saveStatus === "saved" || item.saveStatus === "updated";
  const isParsingThisItem = item.parseStatus === "parsing";
  const isSavingThisItem = item.saveStatus === "saving";
  const inputsDisabled = isLockedSaved || isBatchBusy || isSavingThisItem;

  const weightValidation = validateTrainingWeightKg(bodyWeightKg);
  const estimatedTrainingCalories =
    item.preview && target === "training" && eligibility.effectiveMetrics
      ? resolveTrainingCaloriesPayload({
          preview: item.preview,
          activityType: item.activityType,
          speedKmh: eligibility.effectiveMetrics.speedKmh,
          distanceKm: eligibility.effectiveMetrics.distanceKm,
          durationSeconds: eligibility.effectiveMetrics.durationSeconds,
          weightKg: weightValidation.valid ? weightValidation.weightKg : null,
        })
      : null;

  const pauseSeconds =
    item.preview?.elapsedSeconds != null &&
    eligibility.effectiveMetrics &&
    item.preview.elapsedSeconds > eligibility.effectiveMetrics.durationSeconds
      ? item.preview.elapsedSeconds - eligibility.effectiveMetrics.durationSeconds
      : 0;

  const detectedKind = item.preview?.sourceActivityKind ?? null;
  const allowedTypes = item.preview?.allowedActivityTypes ?? [];
  const isFamilyMismatch =
    item.parseStatus === "ready" &&
    target === "training" &&
    detectedKind !== null &&
    detectedKind !== "unknown" &&
    allowedTypes.length > 0 &&
    !allowedTypes.includes(item.activityType);
  const activityNotice =
    item.parseStatus === "ready" && target === "training"
      ? item.preview?.warnings.find(
          (w) =>
            w.code === "ACTIVITY_TYPE_MISMATCH" ||
            w.code === "UNKNOWN_ACTIVITY_TYPE"
        ) ?? null
      : null;

  return (
    <div
      data-testid={`batch-item-row-${index}`}
      data-item-id={item.id}
      className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 transition-colors ${
        eligibility.uiState === "parse_error" ||
        eligibility.uiState === "save_error" ||
        eligibility.uiState === "taf_out_of_bounds"
          ? "bg-rose-950/15 border-rose-500/35"
          : isLockedSaved
            ? "bg-emerald-950/15 border-emerald-500/35"
            : "bg-[#0B1020] border-[#1E2942]"
      }`}
    >
      {/* Linha superior: arquivo(s), origem, botão separar, status e remover */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-black text-[#8E9BB0] tabular-nums">
            #{index + 1}
          </span>
          <span
            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
              item.isMergedPair
                ? "bg-[#B7F34A]/15 text-[#B7F34A] border-[#B7F34A]/40"
                : item.kinds.includes("fit")
                  ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/30"
                  : "bg-cyan-950/50 text-cyan-300 border-cyan-500/30"
            }`}
          >
            {item.isMergedPair
              ? "MESCLADO (.FIT + .GPX)"
              : item.kinds[0] === "fit"
                ? ".FIT"
                : ".GPX"}
          </span>
          <span
            className="text-xs font-semibold text-white truncate max-w-[260px] sm:max-w-[380px]"
            title={item.displayFileNames}
          >
            {item.displayFileNames}
          </span>

          {item.parseStatus === "ready" && detectedKind && (
            <span
              data-testid={`batch-item-kind-${index}`}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                detectedKind === "walk"
                  ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/30"
                  : detectedKind === "run"
                    ? "bg-[#B7F34A]/10 text-[#B7F34A] border-[#B7F34A]/30"
                    : "bg-amber-950/40 text-amber-300 border-amber-500/30"
              }`}
            >
              {detectedKind === "walk"
                ? "Caminhada"
                : detectedKind === "run"
                  ? "Corrida"
                  : "Tipo não detectado"}
            </span>
          )}

          {item.isMergedPair &&
            !isLockedSaved &&
            !isBatchBusy &&
            !isParsingThisItem && (
              <button
                type="button"
                data-testid={`batch-item-split-${index}`}
                onClick={() => onSplitMergedGroup(item.id)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 px-2 py-0.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 transition-colors"
              >
                <Scissors className="w-3 h-3" />
                Separar em 2 treinos
              </button>
            )}
        </div>

        <div className="flex items-center gap-2">
          <span
            data-testid={`batch-item-status-${index}`}
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge.className}`}
          >
            {(isParsingThisItem || isSavingThisItem) && (
              <Loader2 className="w-3 h-3 animate-spin" />
            )}
            {statusBadge.label}
          </span>

          {item.parseStatus === "ready" && (
            <button
              type="button"
              data-testid={`batch-item-toggle-details-${index}`}
              onClick={() => onToggleExpand(item.id)}
              className="text-[11px] font-semibold text-[#8E9BB0] hover:text-white inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#1E2942] hover:bg-[#131A2E] transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Ocultar
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Detalhes
                </>
              )}
            </button>
          )}

          {!isBatchBusy && !isSavingThisItem && (
            <button
              type="button"
              data-testid={`batch-item-remove-${index}`}
              aria-label={`Remover ${item.displayFileNames} do lote`}
              onClick={() => onRemoveItem(item.id)}
              className="text-[#8E9BB0] hover:text-rose-400 p-1 rounded-lg hover:bg-rose-950/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Erro de leitura ou cancelamento */}
      {(item.parseStatus === "parse_error" ||
        item.parseStatus === "cancelled") && (
        <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            {item.parseError || "Não foi possível analisar este arquivo."}
          </span>
          {!isBatchBusy && (
            <button
              type="button"
              data-testid={`batch-item-retry-parse-${index}`}
              onClick={() => onRetryParseItem(item.id)}
              className="px-2.5 py-1 rounded-lg bg-[#131A2E] hover:bg-[#1E2942] text-white font-bold text-[11px] inline-flex items-center gap-1 border border-[#1E2942]"
            >
              <RefreshCw className="w-3 h-3" />
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* Aviso/erro de bloqueio, falha ao salvar ou status de espelho TAF -> Diário */}
      {eligibility.blockingReason &&
        item.parseStatus === "ready" &&
        item.saveStatus !== "saved" &&
        item.saveStatus !== "updated" && (
          <div
            data-testid={`batch-item-message-${index}`}
            className={`text-[11px] px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
              eligibility.uiState === "save_error" ||
              eligibility.uiState === "taf_out_of_bounds"
                ? "bg-rose-950/30 border-rose-500/30 text-rose-300"
                : "bg-amber-950/30 border-amber-500/30 text-amber-200"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{eligibility.blockingReason}</span>
          </div>
        )}

      {isLockedSaved && item.mirrorStatus !== "idle" && (
        <div
          data-testid={`batch-item-mirror-status-${index}`}
          className={`text-[11px] px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
            item.mirrorStatus === "error"
              ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
              : item.mirrorStatus === "skipped"
                ? "bg-[#131A2E] border-[#1E2942] text-[#8E9BB0]"
                : "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
          }`}
        >
          <span>
            {item.mirrorStatus === "saved" &&
              "Espelhado também no Diário de Treinos ✓"}
            {item.mirrorStatus === "updated" &&
              "Treino vinculado no Diário atualizado ✓"}
            {item.mirrorStatus === "skipped" &&
              "Espelho no Diário pulado (já existente ou repetido no lote)."}
            {item.mirrorStatus === "error" &&
              `Simulado salvo, mas falha ao espelhar no Diário: ${item.mirrorError}`}
          </span>
        </div>
      )}

      {/* Edição rápida inline + Métricas principais */}
      {item.parseStatus === "ready" && item.preview && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            {/* Título inline */}
            <div className="sm:col-span-5">
              <label
                htmlFor={`batch-title-${item.id}`}
                className="block text-[10px] font-bold uppercase tracking-wider text-[#8E9BB0] mb-1"
              >
                Título / Nome
              </label>
              <input
                id={`batch-title-${item.id}`}
                data-testid={`batch-item-title-${index}`}
                type="text"
                disabled={inputsDisabled}
                value={item.workoutTitle}
                onChange={(e) =>
                  onUpdateItem(item.id, { workoutTitle: e.target.value })
                }
                placeholder="Nome da sessão"
                className="w-full h-9 px-2.5 text-xs font-semibold rounded-lg border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
              />
            </div>

            {/* Select inline contextual (NUNCA seleciona Treino vs TAF aqui!) */}
            <div className="sm:col-span-4">
              {target === "training" ? (
                <>
                  <label
                    htmlFor={`batch-activity-${item.id}`}
                    className="block text-[10px] font-bold uppercase tracking-wider text-[#8E9BB0] mb-1"
                  >
                    Tipo de Treino
                  </label>
                  <select
                    id={`batch-activity-${item.id}`}
                    data-testid={`batch-item-activity-${index}`}
                    disabled={inputsDisabled}
                    value={item.activityType}
                    onChange={(e) =>
                      onUpdateItem(item.id, {
                        activityType: e.target.value as ActivityType,
                      })
                    }
                    className="w-full h-9 px-2.5 text-xs font-bold rounded-lg border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
                  >
                    {ACTIVITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {ACTIVITY_LABELS[type]}
                        {allowedTypes.length === 0 || allowedTypes.includes(type)
                          ? ""
                          : " (Outra família)"}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label
                    htmlFor={`batch-location-${item.id}`}
                    className="block text-[10px] font-bold uppercase tracking-wider text-[#8E9BB0] mb-1"
                  >
                    Local do Teste
                  </label>
                  <select
                    id={`batch-location-${item.id}`}
                    data-testid={`batch-item-location-${index}`}
                    disabled={inputsDisabled}
                    value={item.locationType}
                    onChange={(e) =>
                      onUpdateItem(item.id, {
                        locationType: e.target.value as LocationType,
                      })
                    }
                    className="w-full h-9 px-2.5 text-xs font-bold rounded-lg border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
                  >
                    {LOCATION_TYPES_ORDER.map((loc) => (
                      <option key={loc} value={loc}>
                        {LOCATION_LABELS[loc]}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* Tênis da linha */}
            <div className="sm:col-span-3">
              <label
                htmlFor={`batch-shoe-${item.id}`}
                className="block text-[10px] font-bold uppercase tracking-wider text-[#8E9BB0] mb-1"
              >
                Tênis
              </label>
              <input
                id={`batch-shoe-${item.id}`}
                data-testid={`batch-item-shoe-${index}`}
                type="text"
                disabled={inputsDisabled}
                value={item.shoeName}
                onChange={(e) =>
                  onUpdateItem(item.id, { shoeName: e.target.value })
                }
                placeholder="Opcional"
                className="w-full h-9 px-2.5 text-xs rounded-lg border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
              />
            </div>
          </div>

          {(isFamilyMismatch || activityNotice) && (
            <div
              data-testid={`batch-item-activity-warning-${index}`}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-950/25 text-amber-200 flex items-center gap-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {isFamilyMismatch
                  ? `Modalidade selecionada difere do arquivo (${
                      detectedKind === "walk" ? "Caminhada" : "Corrida"
                    }).`
                  : activityNotice?.message}
              </span>
            </div>
          )}

          {/* Métricas compactas conforme destino global ativo */}
          <div
            data-testid={`batch-item-metrics-${index}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#8E9BB0] bg-[#131A2E]/70 border border-[#1E2942] rounded-xl px-3 py-2"
          >
            <span>
              <strong className="text-white">
                {formatShortSessionDate(
                  item.preview.startedAt || item.fallbackDate
                )}
              </strong>
            </span>

            {target === "training" ? (
              <>
                {eligibility.effectiveMetrics ? (
                  <>
                    <span>
                      Distância:{" "}
                      <strong className="text-white">
                        {eligibility.effectiveMetrics.distanceKm.toFixed(2)} km
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#B7F34A]" />
                      <strong className="text-white">
                        {formatTime(eligibility.effectiveMetrics.durationSeconds)}
                      </strong>
                      {pauseSeconds > 0 && (
                        <span className="text-[10px] text-[#8E9BB0]">
                          (+{formatTime(pauseSeconds)} pausa)
                        </span>
                      )}
                    </span>
                    <span>
                      Pace:{" "}
                      <strong className="text-[#B7F34A]">
                        {eligibility.effectiveMetrics.paceFormatted}/km
                      </strong>
                    </span>
                    {estimatedTrainingCalories?.activeCalories != null &&
                      estimatedTrainingCalories.activeCalories > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-400" />
                          <strong className="text-white">
                            {estimatedTrainingCalories.activeCalories} kcal
                          </strong>
                        </span>
                      )}
                  </>
                ) : (
                  <span className="text-amber-300">
                    Métricas básicas pendentes
                  </span>
                )}
              </>
            ) : (
              <>
                {eligibility.tafWindow ? (
                  <>
                    <span className="inline-flex items-center gap-1">
                      <Award className="w-3 h-3 text-[#B7F34A]" />
                      Janela 12 min:{" "}
                      <strong className="text-white">
                        {eligibility.tafWindow.distanceMeters.toLocaleString(
                          "pt-BR"
                        )}{" "}
                        m
                      </strong>
                    </span>
                    <span>
                      Tempo:{" "}
                      <strong className="text-white">
                        {formatTime(eligibility.tafWindow.actualDurationSeconds)}
                      </strong>
                    </span>
                    <span>
                      Pace:{" "}
                      <strong className="text-[#B7F34A]">
                        {eligibility.tafWindow.paceFormatted}/km
                      </strong>
                    </span>
                    {eligibility.tafWindow.isShorterThanTarget && (
                      <span className="text-amber-300 font-semibold">
                        Treino &lt; 12 min (usará duração real)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-amber-300">
                    Janela TAF pendente
                  </span>
                )}
              </>
            )}

            {!eligibility.existsInActiveTarget &&
              eligibility.existsInOtherTarget && (
                <span className="text-sky-300 font-semibold">
                  {target === "training"
                    ? "Já existe no Meu TAF • livre no Diário"
                    : "Já existe no Diário • livre para Simulado"}
                </span>
              )}
          </div>

          {/* Inputs curtos de fallback (somente quando o arquivo veio sem data, distância ou duração) */}
          {eligibility.needsFallbackInputs && (
            <div
              data-testid={`batch-item-fallback-${index}`}
              className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/35 grid grid-cols-1 sm:grid-cols-3 gap-2"
            >
              <div>
                <label
                  htmlFor={`batch-fallback-date-${item.id}`}
                  className="block text-[10px] font-bold text-amber-200 mb-1"
                >
                  Data da Sessão
                </label>
                <input
                  id={`batch-fallback-date-${item.id}`}
                  data-testid={`batch-item-fallback-date-${index}`}
                  type="datetime-local"
                  disabled={inputsDisabled}
                  value={item.fallbackDate}
                  onChange={(e) =>
                    onUpdateItem(item.id, { fallbackDate: e.target.value })
                  }
                  className="w-full h-8 px-2 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white"
                />
              </div>
              <div>
                <label
                  htmlFor={`batch-fallback-distance-${item.id}`}
                  className="block text-[10px] font-bold text-amber-200 mb-1"
                >
                  Distância (km)
                </label>
                <input
                  id={`batch-fallback-distance-${item.id}`}
                  data-testid={`batch-item-fallback-distance-${index}`}
                  type="text"
                  disabled={inputsDisabled}
                  value={item.fallbackDistanceKm}
                  onChange={(e) =>
                    onUpdateItem(item.id, { fallbackDistanceKm: e.target.value })
                  }
                  placeholder="Ex: 5.0"
                  className="w-full h-8 px-2 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white"
                />
              </div>
              <div>
                <label
                  htmlFor={`batch-fallback-duration-${item.id}`}
                  className="block text-[10px] font-bold text-amber-200 mb-1"
                >
                  Duração (segundos)
                </label>
                <input
                  id={`batch-fallback-duration-${item.id}`}
                  data-testid={`batch-item-fallback-duration-${index}`}
                  type="number"
                  disabled={inputsDisabled}
                  value={item.fallbackDurationSec}
                  onChange={(e) =>
                    onUpdateItem(item.id, {
                      fallbackDurationSec: e.target.value,
                    })
                  }
                  placeholder="Ex: 1500"
                  className="w-full h-8 px-2 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white"
                />
              </div>
            </div>
          )}

          {/* Expansão sob demanda com GpxPreviewCard completo e observações da linha */}
          {isExpanded && (
            <div className="pt-2 space-y-2.5 border-t border-[#1E2942]">
              <div>
                <label
                  htmlFor={`batch-notes-${item.id}`}
                  className="block text-[10px] font-bold uppercase tracking-wider text-[#8E9BB0] mb-1"
                >
                  Observações adicionais desta sessão (opcional)
                </label>
                <textarea
                  id={`batch-notes-${item.id}`}
                  data-testid={`batch-item-notes-${index}`}
                  rows={2}
                  disabled={inputsDisabled}
                  value={item.notes}
                  onChange={(e) =>
                    onUpdateItem(item.id, { notes: e.target.value })
                  }
                  placeholder="Observações específicas deste treino/simulado..."
                  className="w-full p-2.5 text-xs rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] resize-none disabled:opacity-60"
                />
              </div>
              <GpxPreviewCard preview={item.preview} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
