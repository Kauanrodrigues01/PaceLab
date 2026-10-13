"use client";

import React, { useState, useMemo } from "react";
import { TrainingSession, ActivityType, ACTIVITY_LABELS } from "@/types";
import { TrainingCard } from "./TrainingCard";
import { formatPace, formatTime } from "@/lib/formatting/time";
import { parseSafeDate } from "@/lib/math/evolution";
import { Flame, Calendar, Activity, Search, X } from "lucide-react";

interface TrainingListProps {
  trainings: TrainingSession[];
  onEdit: (training: TrainingSession) => void;
  onDelete: (id: string) => void;
}

export function TrainingList({ trainings, onEdit, onDelete }: TrainingListProps) {
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityType>("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "7d" | "30d" | "90d">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Ordena cronologicamente decrescente (mais recente primeiro)
  const sortedTrainings = useMemo(() => {
    return [...trainings].sort((a, b) => {
      const da = parseSafeDate(a.sessionDate)?.getTime() ?? 0;
      const db = parseSafeDate(b.sessionDate)?.getTime() ?? 0;
      return db - da;
    });
  }, [trainings]);

  // Aplica filtros de modalidade, data e busca textual
  const filteredTrainings = useMemo(() => {
    const now = new Date().getTime();
    const query = searchQuery.toLowerCase().trim();

    return sortedTrainings.filter((t) => {
      // Filtro de atividade
      if (activityFilter !== "all" && t.activityType !== activityFilter) {
        return false;
      }

      // Filtro de período
      if (periodFilter !== "all") {
        const d = parseSafeDate(t.sessionDate)?.getTime() ?? 0;
        const diffDays = (now - d) / (1000 * 60 * 60 * 24);

        if (periodFilter === "7d" && diffDays > 7) return false;
        if (periodFilter === "30d" && diffDays > 30) return false;
        if (periodFilter === "90d" && diffDays > 90) return false;
      }

      // Filtro de busca textual (notas, modalidade ou rpe)
      if (query) {
        const notesMatch = t.notes?.toLowerCase().includes(query) ?? false;
        const activityMatch = ACTIVITY_LABELS[t.activityType]?.toLowerCase().includes(query) ?? false;
        const rpeMatch = t.perceivedEffort ? `rpe ${t.perceivedEffort}`.includes(query) : false;
        if (!notesMatch && !activityMatch && !rpeMatch) {
          return false;
        }
      }

      return true;
    });
  }, [sortedTrainings, activityFilter, periodFilter, searchQuery]);

  // Métricas agregadas do filtro ativo
  const aggregatedStats = useMemo(() => {
    if (filteredTrainings.length === 0) return null;

    let totalDistanceKm = 0;
    let totalDurationSeconds = 0;

    filteredTrainings.forEach((t) => {
      totalDistanceKm += Number(t.distanceKm) || 0;
      totalDurationSeconds += Number(t.durationSeconds) || 0;
    });

    const avgPaceSeconds =
      totalDistanceKm > 0 && totalDurationSeconds > 0
        ? Math.round(totalDurationSeconds / totalDistanceKm)
        : 0;

    return {
      count: filteredTrainings.length,
      totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      totalDurationSeconds,
      avgPaceFormatted: avgPaceSeconds > 0 ? formatPace(avgPaceSeconds) : "0:00",
    };
  }, [filteredTrainings]);

  return (
    <div data-testid="training-list" className="space-y-4">
      {/* Barra de Filtros */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Título e contador */}
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
              Diário de Treinos ({filteredTrainings.length})
            </h3>
          </div>

          {/* Filtros em linha */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor de Período */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
              <button
                type="button"
                onClick={() => setPeriodFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  periodFilter === "all"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Tudo
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter("7d")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  periodFilter === "7d"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                7 dias
              </button>
              <button
                type="button"
                onClick={() => setPeriodFilter("30d")}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  periodFilter === "30d"
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                30 dias
              </button>
            </div>

            {/* Seletor de Modalidade */}
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as "all" | ActivityType)}
              className="h-9 px-3 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas as Modalidades</option>
              <option value="corrida_continua">Corrida Contínua</option>
              <option value="corrida_intervalada">Intervalado / Tiros</option>
              <option value="caminhada">Caminhada</option>
            </select>

            {/* Campo de Busca Textual */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por notas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Resumo Rápido de Volume Acumulado do Filtro */}
        {aggregatedStats && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Sessões
              </span>
              <div className="text-sm font-black text-slate-800 dark:text-slate-200">
                {aggregatedStats.count}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Volume Total
              </span>
              <div className="text-sm font-black text-blue-600 dark:text-blue-400">
                {aggregatedStats.totalDistanceKm} km
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Tempo Total
              </span>
              <div className="text-sm font-black text-slate-800 dark:text-slate-200">
                {formatTime(aggregatedStats.totalDurationSeconds)}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                Pace Médio
              </span>
              <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                {aggregatedStats.avgPaceFormatted}/km
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Sessões ou Empty State */}
      {filteredTrainings.length === 0 ? (
        <div
          data-testid="training-empty-state"
          className="bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
            <Activity className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">
            Nenhum treino registrado
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {activityFilter !== "all" || periodFilter !== "all"
              ? "Nenhuma sessão de treino corresponde aos filtros selecionados. Tente ajustar os filtros."
              : "Seu diário de treinos está vazio. Preencha o formulário acima para registrar sua primeira sessão de corrida, tiros ou caminhada!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTrainings.map((session) => (
            <TrainingCard
              key={session.id}
              training={session}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
