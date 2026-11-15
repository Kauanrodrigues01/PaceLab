"use client";

import React, { useEffect, useMemo } from "react";
import {
  ACTIVITY_LABELS,
  SOURCE_LABELS,
  TrainingSession,
} from "@/types";
import { ACTIVITY_CONFIG } from "@/lib/activity";
import { formatTime } from "@/lib/formatting/time";
import { analyzeSplits } from "@/lib/math/splitsAnalysis";
import { SplitsInsights } from "./SplitsInsights";
import { SplitsPaceChart } from "./SplitsPaceChart";
import { SplitsTable } from "./SplitsTable";
import {
  Activity,
  Clock,
  Edit2,
  FileText,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  Mountain,
  Scale,
  Timer,
  X,
} from "lucide-react";

interface TrainingDetailModalProps {
  training: TrainingSession | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (training: TrainingSession) => void;
}

function getRpeSummary(rpe?: number | null): string {
  if (!rpe || rpe < 1) return "—";
  if (rpe <= 2) return `RPE ${rpe}/10 • Muito Leve`;
  if (rpe <= 4) return `RPE ${rpe}/10 • Confortável`;
  if (rpe <= 6) return `RPE ${rpe}/10 • Moderado`;
  if (rpe <= 8) return `RPE ${rpe}/10 • Intenso`;
  return `RPE ${rpe}/10 • Exaustão`;
}

export function TrainingDetailModal({
  training,
  isOpen,
  onClose,
  onEdit,
}: TrainingDetailModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const splitsAnalysis = useMemo(
    () => analyzeSplits(training?.splits ?? []),
    [training?.splits]
  );

  if (!isOpen || !training) {
    return null;
  }

  const activityConfig =
    ACTIVITY_CONFIG[training.activityType] || ACTIVITY_CONFIG.corrida_continua;
  const ActivityIcon = activityConfig.icon;
  const activityLabel =
    ACTIVITY_LABELS[training.activityType] ?? activityConfig.label;
  const sourceKey = training.source ?? "manual";
  const sourceLabel = SOURCE_LABELS[sourceKey] ?? sourceKey;

  const parsedSessionDate = new Date(training.sessionDate);
  const formattedDate = Number.isNaN(parsedSessionDate.getTime())
    ? training.sessionDate || "Data não informada"
    : parsedSessionDate.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  const avgHrText = training.avgHeartRate != null ? `${training.avgHeartRate} bpm` : "—";
  const maxHrText = training.maxHeartRate != null ? `${training.maxHeartRate} bpm` : "—";
  const hrDisplay =
    training.avgHeartRate != null || training.maxHeartRate != null
      ? `${avgHrText} / ${maxHrText}`
      : "—";

  const elevationDisplay =
    training.elevationGainM != null
      ? `+${Number.isInteger(training.elevationGainM) ? training.elevationGainM : training.elevationGainM.toFixed(1)} m`
      : "—";

  const cadenceDisplay =
    training.avgCadence != null ? `${training.avgCadence} spm` : "—";

  const speedDisplay =
    training.speedKmh != null && training.speedKmh > 0
      ? `${training.speedKmh.toFixed(1)} km/h`
      : training.durationSeconds > 0 && training.distanceKm > 0
        ? `${(training.distanceKm / (training.durationSeconds / 3600)).toFixed(1)} km/h`
        : "—";

  const caloriesDisplay =
    training.activeCalories != null
      ? `${training.activeCalories} kcal ativas${training.totalCalories != null ? ` (${training.totalCalories} kcal totais)` : ""}`
      : training.totalCalories != null
        ? `${training.totalCalories} kcal totais`
        : "—";

  return (
    <div
      data-testid="training-detail-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="training-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1020]/90 backdrop-blur-md p-3 sm:p-6 overflow-y-auto"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[#0F1629] border border-[#1E2942] rounded-2xl shadow-2xl p-4 sm:p-6 space-y-5 my-auto">
        {/* Cabeçalho do Modal */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E2942] pb-4">
          <div className="space-y-1.5 min-w-0 max-w-full">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${activityConfig.badgeClass}`}
              >
                <ActivityIcon className="w-3.5 h-3.5" />
                {activityLabel}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[#131A2E] text-[#8E9BB0] border border-[#1E2942]">
                {sourceLabel}
              </span>
              {training.externalId && (
                <span
                  data-testid="training-detail-external-id"
                  className="inline-flex items-center text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#0B1020] text-[#8E9BB0] border border-[#1E2942] break-all max-w-full"
                >
                  ID: {training.externalId}
                </span>
              )}
            </div>

            <h2
              id="training-detail-title"
              className="text-lg sm:text-xl font-black text-white capitalize"
            >
              Detalhes do Treino • {formattedDate}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                type="button"
                data-testid="training-detail-edit-btn"
                onClick={() => onEdit(training)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#B7F34A]/15 hover:bg-[#B7F34A]/25 text-[#B7F34A] border border-[#B7F34A]/40 text-xs font-bold transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Editar treino
              </button>
            )}
            <button
              type="button"
              data-testid="training-detail-close-btn"
              onClick={onClose}
              aria-label="Fechar detalhes do treino"
              className="p-2 rounded-xl bg-[#131A2E] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-white border border-[#1E2942] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Grade Completa de Telemetria e Contexto */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-[#B7F34A]" />
              Distância
            </span>
            <p className="text-base sm:text-lg font-black text-white mt-0.5">
              {training.distanceKm.toFixed(2)} km
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              Tempo em Movimento
            </span>
            <p className="text-base sm:text-lg font-black text-white mt-0.5">
              {formatTime(training.durationSeconds)}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Timer className="w-3.5 h-3.5 text-[#8E9BB0]" />
              Tempo Decorrido
            </span>
            <p className="text-base sm:text-lg font-bold text-white mt-0.5">
              {training.elapsedSeconds != null
                ? formatTime(training.elapsedSeconds)
                : "—"}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-[#B7F34A]" />
              Pace / Velocidade
            </span>
            <p className="text-base sm:text-lg font-black text-[#B7F34A] mt-0.5">
              {training.paceFormatted &&
              training.paceFormatted.trim() !== "" &&
              training.paceSeconds > 0
                ? `${training.paceFormatted} /km`
                : "—"}
            </p>
            <p className="text-[11px] text-[#8E9BB0]">{speedDisplay}</p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
              FC Média / Máxima
            </span>
            <p className="text-sm sm:text-base font-bold text-white mt-0.5">
              {hrDisplay}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Mountain className="w-3.5 h-3.5 text-emerald-400" />
              Ganho de Elevação
            </span>
            <p className="text-sm sm:text-base font-bold text-white mt-0.5">
              {elevationDisplay}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Footprints className="w-3.5 h-3.5 text-cyan-400" />
              Cadência Média
            </span>
            <p className="text-sm sm:text-base font-bold text-white mt-0.5">
              {cadenceDisplay}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Calorias / MET
            </span>
            <p className="text-xs sm:text-sm font-bold text-white mt-0.5">
              {caloriesDisplay}
            </p>
            <p className="text-[11px] text-[#8E9BB0]">
              MET: {training.metValue != null ? training.metValue.toFixed(1) : "—"}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0]">Esforço Percebido</span>
            <p className="text-xs sm:text-sm font-bold text-white mt-0.5">
              {getRpeSummary(training.perceivedEffort)}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0]">Tênis Utilizado</span>
            <p className="text-xs sm:text-sm font-bold text-white mt-0.5">
              {training.shoeName || "—"}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-[#8E9BB0]" />
              Peso Corporal
            </span>
            <p className="text-xs sm:text-sm font-bold text-white mt-0.5">
              {training.bodyWeightKg != null
                ? `${training.bodyWeightKg.toFixed(1)} kg`
                : "—"}
            </p>
          </div>

          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
            <span className="text-[11px] text-[#8E9BB0]">Parciais Registradas</span>
            <p className="text-xs sm:text-sm font-bold text-white mt-0.5">
              {splitsAnalysis.hasSplits
                ? `${splitsAnalysis.totalSplits} ${splitsAnalysis.totalSplits === 1 ? "parcial" : "parciais"}`
                : "Sem parciais"}
            </p>
          </div>
        </div>

        {/* Observações do Treino */}
        {training.notes && (
          <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3.5">
            <span className="text-xs font-bold text-[#8E9BB0] flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5 text-[#B7F34A]" />
              Notas e Observações
            </span>
            <p className="text-sm text-white/90 whitespace-pre-wrap break-words">
              {training.notes}
            </p>
          </div>
        )}

        {/* Análise e Visualização de Parciais por Quilômetro */}
        <section className="space-y-4 pt-2 border-t border-[#1E2942]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm sm:text-base font-black text-white">
              Análise Completa de Parciais (Splits)
            </h3>
            {splitsAnalysis.hasSplits && (
              <span className="text-xs text-[#8E9BB0]">
                Ritmo médio ponderado:{" "}
                <strong className="text-[#B7F34A]">
                  {splitsAnalysis.avgPaceFormatted}/km
                </strong>
              </span>
            )}
          </div>

          {splitsAnalysis.hasSplits ? (
            <div className="space-y-4">
              <SplitsInsights analysis={splitsAnalysis} />
              <SplitsPaceChart analysis={splitsAnalysis} />
              <SplitsTable analysis={splitsAnalysis} />
            </div>
          ) : (
            <div
              data-testid="training-detail-no-splits"
              className="bg-[#131A2E] border border-dashed border-[#1E2942] rounded-xl p-5 text-center space-y-1"
            >
              <p className="text-sm font-bold text-white">
                Este treino não possui parciais por quilômetro registradas.
              </p>
              <p className="text-xs text-[#8E9BB0]">
                Importe um arquivo <code className="text-[#B7F34A]">.FIT</code> ou{" "}
                <code className="text-[#B7F34A]">.GPX</code> para desbloquear gráficos de pace, deriva cardíaca e estratégia de corrida.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
