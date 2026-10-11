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
  Activity,
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
      "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700",
    borderClass: "border-l-blue-500",
  },
  corrida_intervalada: {
    label: "Intervalado / Tiros",
    icon: Zap,
    badgeClass:
      "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700",
    borderClass: "border-l-amber-500",
  },
  caminhada: {
    label: "Caminhada",
    icon: Footprints,
    badgeClass:
      "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700",
    borderClass: "border-l-emerald-500",
  },
  teste_taf: {
    label: "Simulado TAF",
    icon: Activity,
    badgeClass:
      "bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700",
    borderClass: "border-l-purple-500",
  },
  outro: {
    label: "Outra Atividade",
    icon: Activity,
    badgeClass:
      "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
    borderClass: "border-l-slate-400",
  },
};

export function getRpeBadgeInfo(rpe?: number | null) {
  if (!rpe || rpe < 1) return null;
  if (rpe <= 2)
    return {
      label: `RPE ${rpe} • Muito Leve`,
      class: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    };
  if (rpe <= 4)
    return {
      label: `RPE ${rpe} • Confortável`,
      class: "bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
    };
  if (rpe <= 6)
    return {
      label: `RPE ${rpe} • Moderado`,
      class: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    };
  if (rpe <= 8)
    return {
      label: `RPE ${rpe} • Intenso`,
      class: "bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    };
  return {
    label: `RPE ${rpe} • Exaustão`,
    class: "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  };
}

export function TrainingCard({ training, onEdit, onDelete }: TrainingCardProps) {
  const [showSplits, setShowSplits] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const config = ACTIVITY_CONFIG[training.activityType] || ACTIVITY_CONFIG.outro;
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
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-l-4 ${config.borderClass} rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            {formattedDate}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${config.badgeClass}`}
          >
            <ActivityIcon className="w-3.5 h-3.5" />
            {config.label}
          </span>
        </div>

        {/* Badges de RPE e Peso */}
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
              className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700"
            >
              <Scale className="w-3 h-3 text-slate-400" />
              {training.bodyWeightKg.toFixed(1)} kg
            </span>
          )}
        </div>
      </div>

      {/* Grid de Métricas Centrais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-y border-slate-100 dark:border-slate-800 my-2">
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Distância</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {training.distanceKm.toFixed(2)}{" "}
            <span className="text-xs font-semibold text-slate-500">km</span>
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Duração</span>
          <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <Clock className="w-4 h-4 text-slate-400" />
            {formatTime(training.durationSeconds)}
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Pace Médio</span>
          <div className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Gauge className="w-4 h-4" />
            {training.paceFormatted}
            <span className="text-xs font-normal text-slate-500">/km</span>
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Velocidade</span>
          <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-200">
            {training.speedKmh.toFixed(2)}{" "}
            <span className="text-xs font-normal text-slate-500">km/h</span>
          </div>
        </div>
      </div>

      {/* Rodapé do Card com Ações */}
      <div className="flex items-center justify-between text-xs sm:text-sm mt-3 pt-1">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {training.splits && training.splits.length > 0
            ? `${training.splits.length} km com parciais gravadas`
            : "Sessão registrada"}
        </div>

        {/* Ações de Edição e Exclusão */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(training)}
            title="Editar este treino"
            className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Excluir treino"
            className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Observações */}
      {training.notes && (
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span>{training.notes}</span>
        </div>
      )}

      {/* Parciais por Quilômetro */}
      {training.splits && training.splits.length > 0 && (
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setShowSplits(!showSplits)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors"
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
                  className="bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg text-xs flex justify-between items-center"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Km {split.kilometer}:
                  </span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
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
        <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-4 rounded-2xl flex flex-col items-center justify-center text-center z-10 animate-fade-in">
          <Trash2 className="w-8 h-8 text-red-500 mb-2" />
          <p className="font-bold text-sm text-slate-900 dark:text-slate-100 mb-1">
            Excluir este treino de {training.distanceKm.toFixed(2)} km?
          </p>
          <p className="text-xs text-slate-500 mb-3 max-w-xs">
            Esta ação removerá a sessão do diário e recalculará as médias.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onDelete(training.id);
                setShowDeleteConfirm(false);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Sim, Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
