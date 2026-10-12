"use client";

import React, { useState } from "react";
import { TafAttempt, LOCATION_LABELS } from "@/types";
import { formatTime } from "@/lib/formatting/time";
import {
  Trophy,
  CheckCircle2,
  Clock,
  Gauge,
  TrendingUp,
  TrendingDown,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  MapPin,
  FileText,
} from "lucide-react";

interface TafAttemptCardProps {
  attempt: TafAttempt;
  targetDistanceMeters?: number;
  onEdit: (attempt: TafAttempt) => void;
  onDelete: (id: string) => void;
}

export function TafAttemptCard({
  attempt,
  targetDistanceMeters = 2300,
  onEdit,
  onDelete,
}: TafAttemptCardProps) {
  const [showLaps, setShowLaps] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isApproved = attempt.distanceMeters >= targetDistanceMeters;
  const deficitMeters = targetDistanceMeters - attempt.distanceMeters;

  const formattedDate = new Date(attempt.testDate).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      data-testid={`taf-card-${attempt.id}`}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
    >
      {/* Faixa lateral de status */}
      <div
        className={`absolute top-0 left-0 bottom-0 w-1.5 ${
          isApproved ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />

      {/* Cabeçalho do Card */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            {formattedDate}
          </span>
          {attempt.locationType && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              <MapPin className="w-3 h-3 text-slate-400" />
              {LOCATION_LABELS[attempt.locationType] || attempt.locationType}
            </span>
          )}
        </div>

        {/* Badges de Destaque */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {attempt.isPersonalRecord && (
            <span
              data-testid="badge-record"
              className="inline-flex items-center gap-1 text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full border border-amber-300 dark:border-amber-700"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Recorde Pessoal
            </span>
          )}

          {isApproved ? (
            <span
              data-testid="badge-meta-pass"
              className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded-full"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Meta Atingida
            </span>
          ) : (
            <span
              data-testid="badge-meta-deficit"
              className="inline-flex items-center text-xs font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full"
            >
              Faltam {deficitMeters}m
            </span>
          )}
        </div>
      </div>

      {/* Distância e Métricas Centrais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-y border-slate-100 dark:border-slate-800 my-2">
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Distância</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {attempt.distanceMeters.toLocaleString("pt-BR")}{" "}
            <span className="text-xs font-semibold text-slate-500">m</span>
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Tempo</span>
          <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
            <Clock className="w-4 h-4 text-slate-400" />
            {formatTime(attempt.actualDurationSeconds)}
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Pace Médio</span>
          <div className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Gauge className="w-4 h-4" />
            {attempt.paceFormatted}
            <span className="text-xs font-normal text-slate-500">/km</span>
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Velocidade</span>
          <div className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-200">
            {attempt.speedKmh.toFixed(2)}{" "}
            <span className="text-xs font-normal text-slate-500">km/h</span>
          </div>
        </div>
      </div>

      {/* Delta em relação ao teste anterior */}
      <div className="flex items-center justify-between text-xs sm:text-sm mt-3 pt-1">
        <div>
          {attempt.deltaPreviousMeters !== undefined &&
          attempt.deltaPreviousMeters !== null ? (
            attempt.deltaPreviousMeters > 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                <TrendingUp className="w-4 h-4" />
                +{attempt.deltaPreviousMeters}m em relação ao teste anterior
              </span>
            ) : attempt.deltaPreviousMeters < 0 ? (
              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                <TrendingDown className="w-4 h-4" />
                {attempt.deltaPreviousMeters}m em relação ao teste anterior
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                = Mesma distância do teste anterior
              </span>
            )
          ) : (
            <span className="text-slate-400 text-xs italic">
              Primeiro teste registrado dessa duração
            </span>
          )}
        </div>

        {/* Ações de Edição e Exclusão */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(attempt)}
            title="Editar este teste"
            className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Excluir teste"
            className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notas adicionais */}
      {attempt.notes && (
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span>{attempt.notes}</span>
        </div>
      )}

      {/* Voltas / Parciais de 400m se existirem */}
      {attempt.laps && attempt.laps.length > 0 && (
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setShowLaps(!showLaps)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors"
          >
            <span>Ver parciais ({attempt.laps.length} voltas registradas)</span>
            {showLaps ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showLaps && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {attempt.laps.map((lap) => (
                <div
                  key={lap.lapNumber}
                  className="bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg text-xs flex justify-between items-center"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Volta {lap.lapNumber} ({lap.distanceMeters}m):
                  </span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {formatTime(lap.durationSeconds)}
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
            Excluir este teste de {attempt.distanceMeters}m?
          </p>
          <p className="text-xs text-slate-500 mb-3 max-w-xs">
            Esta ação recalculará seus recordes e deltas automaticamente.
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
                onDelete(attempt.id);
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
