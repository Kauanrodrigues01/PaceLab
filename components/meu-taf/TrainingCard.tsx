"use client";

import React, { useState } from "react";
import { TrainingSession, ActivityType } from "@/types";
import { formatTime } from "@/lib/formatting/time";
import {
  Clock,
  Gauge,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  Flame,
  Zap,
  Footprints,
  Scale,
} from "lucide-react";

interface TrainingCardProps {
  training: TrainingSession;
  onEdit: (training: TrainingSession) => void;
  onDelete: (id: string) => void;
}

export const ACTIVITY_CONFIG: Record<
  ActivityType,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
    borderClass: string;
  }
> = {
  corrida_continua: {
    label: "Corrida Contínua",
    icon: Flame,
    badgeClass:
      "bg-[#B7F34A]/10 text-[#B7F34A] border-[#B7F34A]/30",
    borderClass: "border-l-[#B7F34A]",
  },
  corrida_intervalada: {
    label: "Intervalado / Tiros",
    icon: Zap,
    badgeClass:
      "bg-amber-950/40 text-amber-300 border-amber-500/30",
    borderClass: "border-l-amber-400",
  },
  caminhada: {
    label: "Caminhada",
    icon: Footprints,
    badgeClass:
      "bg-emerald-950/40 text-emerald-300 border-emerald-500/30",
    borderClass: "border-l-emerald-400",
  },
};

export function getRpeBadgeInfo(rpe?: number | null) {
  if (!rpe || rpe < 1) return null;
  if (rpe <= 2)
    return {
      label: `RPE ${rpe} • Muito Leve`,
      class: "bg-emerald-950/40 text-emerald-300 border-emerald-500/30",
    };
  if (rpe <= 4)
    return {
      label: `RPE ${rpe} • Confortável`,
      class: "bg-[#B7F34A]/10 text-[#B7F34A] border-[#B7F34A]/30",
    };
  if (rpe <= 6)
    return {
      label: `RPE ${rpe} • Moderado`,
      class: "bg-amber-950/40 text-amber-300 border-amber-500/30",
    };
  if (rpe <= 8)
    return {
      label: `RPE ${rpe} • Intenso`,
      class: "bg-orange-950/40 text-orange-300 border-orange-500/30",
    };
  return {
    label: `RPE ${rpe} • Exaustão`,
    class: "bg-rose-950/40 text-rose-300 border-rose-500/30",
  };
}

export function TrainingCard({ training, onEdit, onDelete }: TrainingCardProps) {
  const [showSplits, setShowSplits] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const config = ACTIVITY_CONFIG[training.activityType] || ACTIVITY_CONFIG.corrida_continua;
  const ActivityIcon = config.icon;
  const rpeInfo = getRpeBadgeInfo(training.perceivedEffort);

  const formattedDate = new Date(training.sessionDate).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      data-testid={`training-card-${training.id}`}
      className={`bg-[#131A2E] border border-[#1E2942] border-l-4 ${config.borderClass} rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-medium text-[#8E9BB0]">
            {formattedDate}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${config.badgeClass}`}
          >
            <ActivityIcon className="w-3.5 h-3.5" />
            {config.label}
          </span>
        </div>

        {/* Badges de RPE, Peso e Calorias */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {rpeInfo && (
            <span
              data-testid="badge-rpe"
              className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full border ${rpeInfo.class}`}
            >
              {rpeInfo.label}
            </span>
          )}

          {training.bodyWeightKg !== undefined && training.bodyWeightKg !== null && (
            <span
              data-testid="badge-weight"
              className="inline-flex items-center gap-1 text-xs font-semibold bg-[#0B1020] text-[#8E9BB0] px-2 py-0.5 rounded-full border border-[#1E2942]"
            >
              <Scale className="w-3 h-3 text-[#8E9BB0]" />
              {training.bodyWeightKg.toFixed(1)} kg
            </span>
          )}

          {training.activeCalories !== undefined && training.activeCalories !== null && (
            <span
              data-testid="badge-calories"
              title={`Calorias Totais: ${training.totalCalories ?? training.activeCalories} kcal • MET: ${training.metValue !== undefined && training.metValue !== null ? training.metValue.toFixed(1) : "--"} • Compêndio 2024`}
              className="inline-flex items-center gap-1 text-xs font-bold bg-amber-950/40 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/30"
            >
              <Flame className="w-3 h-3 text-amber-400 fill-amber-400" />
              {training.activeCalories} kcal ativas
            </span>
          )}
        </div>
      </div>

      {/* Grid de Métricas Centrais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-y border-[#1E2942] my-2">
        <div>
          <span className="text-xs text-[#8E9BB0]">Distância</span>
          <div className="text-xl sm:text-2xl font-black text-white">
            {training.distanceKm.toFixed(2)}{" "}
            <span className="text-xs font-semibold text-[#8E9BB0]">km</span>
          </div>
        </div>

        <div>
          <span className="text-xs text-[#8E9BB0]">Duração</span>
          <div className="text-lg sm:text-xl font-bold text-white flex items-center gap-1">
            <Clock className="w-4 h-4 text-[#8E9BB0]" />
            {formatTime(training.durationSeconds)}
          </div>
        </div>

        <div>
          <span className="text-xs text-[#8E9BB0]">Pace Médio</span>
          <div className="text-lg sm:text-xl font-bold text-[#B7F34A] flex items-center gap-1">
            <Gauge className="w-4 h-4 text-[#B7F34A]" />
            {training.paceFormatted}
            <span className="text-xs font-normal text-[#8E9BB0]">/km</span>
          </div>
        </div>

        <div>
          <span className="text-xs text-[#8E9BB0]">Velocidade</span>
          <div className="text-lg sm:text-xl font-bold text-white">
            {training.speedKmh.toFixed(2)}{" "}
            <span className="text-xs font-normal text-[#8E9BB0]">km/h</span>
          </div>
        </div>
      </div>

      {/* Rodapé do Card com Ações */}
      <div className="flex items-center justify-between text-xs sm:text-sm mt-3 pt-1">
        <div className="text-xs text-[#8E9BB0]">
          {training.splits && training.splits.length > 0
            ? `${training.splits.length} km com parciais gravadas`
            : "Sessão registrada"}
        </div>

        {/* Ações de Edição e Exclusão */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(training)}
            title="Editar este treino"
            className="p-1.5 text-[#8E9BB0] hover:text-[#B7F34A] hover:bg-[#1E2942] rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Excluir treino"
            className="p-1.5 text-[#8E9BB0] hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Observações */}
      {training.notes && (
        <div className="mt-2 text-xs text-[#8E9BB0] flex items-start gap-1.5 bg-[#0B1020]/60 border border-[#1E2942] p-2 rounded-lg">
          <FileText className="w-3.5 h-3.5 text-[#8E9BB0] shrink-0 mt-0.5" />
          <span>{training.notes}</span>
        </div>
      )}

      {/* Parciais por Quilômetro */}
      {training.splits && training.splits.length > 0 && (
        <div className="mt-3 pt-2 border-t border-[#1E2942]">
          <button
            onClick={() => setShowSplits(!showSplits)}
            className="flex items-center justify-between w-full text-xs font-semibold text-[#8E9BB0] hover:text-[#B7F34A] transition-colors"
          >
            <span>Ver parciais de km ({training.splits.length} km)</span>
            {showSplits ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showSplits && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {training.splits.map((split) => (
                <div
                  key={split.kilometer}
                  className="bg-[#0B1020]/60 border border-[#1E2942] p-2 rounded-lg text-xs flex justify-between items-center"
                >
                  <span className="font-medium text-[#8E9BB0]">
                    Km {split.kilometer}:
                  </span>
                  <span className="font-bold text-[#B7F34A]">
                    {split.paceFormatted}/km
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diálogo de Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-[#0B1020]/95 backdrop-blur-sm p-4 rounded-2xl flex flex-col items-center justify-center text-center z-10 animate-fade-in border border-[#1E2942]">
          <Trash2 className="w-8 h-8 text-rose-500 mb-2" />
          <p className="font-bold text-sm text-white mb-1">
            Excluir este treino de {training.distanceKm.toFixed(2)} km?
          </p>
          <p className="text-xs text-[#8E9BB0] mb-3 max-w-xs">
            Esta ação removerá a sessão do diário e recalculará as médias.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-xs font-semibold text-[#8E9BB0] bg-[#131A2E] border border-[#1E2942] rounded-lg hover:bg-[#1E2942] hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onDelete(training.id);
                setShowDeleteConfirm(false);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors"
            >
              Sim, Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
