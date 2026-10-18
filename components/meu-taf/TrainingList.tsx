"use client";

import React, { useState, useMemo } from "react";
import { TrainingSession, ActivityType, ACTIVITY_LABELS } from "@/types";
import { TrainingCard } from "./TrainingCard";
import { formatPace, formatTime } from "@/lib/formatting/time";
import { parseSafeDate } from "@/lib/math/evolution";
import {
  Flame,
  Calendar,
  Activity,
  Search,
  X,
  RotateCcw,
  ArrowUpDown,
} from "lucide-react";

interface TrainingListProps {
  trainings: TrainingSession[];
  onEdit: (training: TrainingSession) => void;
  onDelete: (id: string) => void;
}

type PeriodPreset = "all" | "7d" | "30d" | "90d" | "year";
type SessionCount = 2 | 4 | 6;
type FilterMode = "preset" | "sessions" | "custom";
type RpeFilter = "all" | "leve" | "moderado" | "intenso" | "maximo";
type SortOption = "date-desc" | "date-asc" | "dist-desc" | "pace-asc" | "rpe-desc";

export function TrainingList({ trainings, onEdit, onDelete }: TrainingListProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("preset");
  const [periodFilter, setPeriodFilter] = useState<PeriodPreset>("all");
  const [sessionCount, setSessionCount] = useState<SessionCount>(4);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityType>("all");
  const [rpeFilter, setRpeFilter] = useState<RpeFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date-desc");
  const [searchQuery, setSearchQuery] = useState("");

  // Aplica filtros de modalidade, data, sessões, RPE, busca e ordenação
  const filteredTrainings = useMemo(() => {
    const now = new Date();
    const nowTime = now.getTime();
    const query = searchQuery.toLowerCase().trim();

    // 1. Filtros básicos de atributos: Modalidade, RPE e Busca Textual
    let list = trainings.filter((t) => {
      // Modalidade
      if (activityFilter !== "all" && t.activityType !== activityFilter) {
        return false;
      }

      // Intensidade (RPE)
      if (rpeFilter !== "all") {
        const rpe = t.perceivedEffort ?? 0;
        if (rpeFilter === "leve" && (rpe < 1 || rpe > 3)) return false;
        if (rpeFilter === "moderado" && (rpe < 4 || rpe > 6)) return false;
        if (rpeFilter === "intenso" && (rpe < 7 || rpe > 8)) return false;
        if (rpeFilter === "maximo" && (rpe < 9 || rpe > 10)) return false;
      }

      // Busca textual (notas, modalidade ou rpe)
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

    // 2. Filtros de Período / Quantidade de Sessões
    if (filterMode === "sessions") {
      // Ordena decrescente por data para pegar as N sessões mais recentes filtradas
      list = list
        .sort((a, b) => {
          const da = parseSafeDate(a.sessionDate)?.getTime() ?? 0;
          const db = parseSafeDate(b.sessionDate)?.getTime() ?? 0;
          return db - da;
        })
        .slice(0, sessionCount);
    } else if (filterMode === "custom") {
      const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
      const endMs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;

      list = list.filter((t) => {
        const tDate = parseSafeDate(t.sessionDate);
        if (!tDate) return false;
        const tMs = tDate.getTime();

        if (startMs !== null && !isNaN(startMs) && tMs < startMs) return false;
        if (endMs !== null && !isNaN(endMs) && tMs > endMs) return false;
        return true;
      });
    } else if (filterMode === "preset" && periodFilter !== "all") {
      list = list.filter((t) => {
        const tDate = parseSafeDate(t.sessionDate);
        if (!tDate) return false;
        const diffMs = nowTime - tDate.getTime();

        switch (periodFilter) {
          case "7d":
            return diffMs <= 7 * 24 * 60 * 60 * 1000 + 86400000;
          case "30d":
            return diffMs <= 30 * 24 * 60 * 60 * 1000 + 86400000;
          case "90d":
            return diffMs <= 90 * 24 * 60 * 60 * 1000 + 86400000;
          case "year": {
            const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
            return tDate.getTime() >= startOfYear - 86400000;
          }
          default:
            return true;
        }
      });
    }

    // 3. Aplicação da Ordenação Selecionada
    return list.sort((a, b) => {
      const da = parseSafeDate(a.sessionDate)?.getTime() ?? 0;
      const db = parseSafeDate(b.sessionDate)?.getTime() ?? 0;

      switch (sortOption) {
        case "date-asc":
          return da - db;
        case "dist-desc":
          return (Number(b.distanceKm) || 0) - (Number(a.distanceKm) || 0);
        case "pace-asc": {
          const pa = a.paceSeconds && a.paceSeconds > 0 ? a.paceSeconds : 999999;
          const pb = b.paceSeconds && b.paceSeconds > 0 ? b.paceSeconds : 999999;
          return pa - pb;
        }
        case "rpe-desc":
          return (b.perceivedEffort || 0) - (a.perceivedEffort || 0);
        case "date-desc":
        default:
          return db - da; // Mais recente primeiro
      }
    });
  }, [
    trainings,
    activityFilter,
    rpeFilter,
    searchQuery,
    filterMode,
    sessionCount,
    startDate,
    endDate,
    periodFilter,
    sortOption,
  ]);

  // Indicador de se há filtros aplicados
  const isAnyFilterActive = useMemo(() => {
    return (
      (filterMode === "preset" && periodFilter !== "all") ||
      filterMode === "sessions" ||
      filterMode === "custom" ||
      activityFilter !== "all" ||
      rpeFilter !== "all" ||
      sortOption !== "date-desc" ||
      searchQuery.trim().length > 0
    );
  }, [filterMode, periodFilter, activityFilter, rpeFilter, sortOption, searchQuery]);

  // Reset geral dos filtros
  const handleResetFilters = () => {
    setFilterMode("preset");
    setPeriodFilter("all");
    setSessionCount(4);
    setStartDate("");
    setEndDate("");
    setActivityFilter("all");
    setRpeFilter("all");
    setSortOption("date-desc");
    setSearchQuery("");
  };

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
      {/* ─── Painel Completo de Filtros do Diário ─── */}
      <div className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3.5">
        {/* Cabeçalho do painel de filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-[#B7F34A]" />
            <h3 className="font-bold text-base text-white">
              Diário de Treinos ({filteredTrainings.length})
            </h3>
          </div>

          {isAnyFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-[#8E9BB0] hover:text-[#B7F34A] flex items-center gap-1.5 transition-colors self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar todos os filtros
            </button>
          )}
        </div>

        {/* Linha 1: Seletor de Período Temporal & Quantidade de Sessões */}
        <div
          data-testid="list-filter-period"
          className="flex items-center p-1 bg-[#0B1020] rounded-2xl border border-[#1E2942] overflow-x-auto max-w-full"
        >
          {/* Presets Temporais */}
          <button
            type="button"
            onClick={() => {
              setFilterMode("preset");
              setPeriodFilter("all");
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              filterMode === "preset" && periodFilter === "all"
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            Tudo
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode("preset");
              setPeriodFilter("7d");
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              filterMode === "preset" && periodFilter === "7d"
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            7 dias
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode("preset");
              setPeriodFilter("30d");
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              filterMode === "preset" && periodFilter === "30d"
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            30 dias
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode("preset");
              setPeriodFilter("90d");
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              filterMode === "preset" && periodFilter === "90d"
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            90 dias
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode("preset");
              setPeriodFilter("year");
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              filterMode === "preset" && periodFilter === "year"
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            Ano Atual
          </button>

          {/* Separador Visual */}
          <div className="h-4 w-px bg-[#1E2942] mx-1 shrink-0" />

          {/* Filtros por Quantidade de Sessões Recentes */}
          <button
            type="button"
            onClick={() => {
              setFilterMode("sessions");
              setSessionCount(2);
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              filterMode === "sessions" && sessionCount === 2
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            2 sessões
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode("sessions");
              setSessionCount(4);
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              filterMode === "sessions" && sessionCount === 4
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            4 sessões
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode("sessions");
              setSessionCount(6);
            }}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              filterMode === "sessions" && sessionCount === 6
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            6 sessões
          </button>

          {/* Separador Visual */}
          <div className="h-4 w-px bg-[#1E2942] mx-1 shrink-0" />

          {/* Filtro por Período Personalizado */}
          <button
            type="button"
            onClick={() => setFilterMode("custom")}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              filterMode === "custom"
                ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Personalizado</span>
          </button>
        </div>

        {/* Linha 2 (Opcional): Painel Retrátil de Data Inicial e Final */}
        {filterMode === "custom" && (
          <div
            data-testid="list-custom-date-panel"
            className="p-3 bg-[#0B1020] border border-[#1E2942] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[#8E9BB0] font-semibold">De:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#131A2E] border border-[#1E2942] rounded-xl px-2.5 py-1 text-white text-xs focus:outline-hidden focus:border-[#B7F34A] transition-colors"
                  data-testid="list-filter-start-date"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#8E9BB0] font-semibold">Até:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-[#131A2E] border border-[#1E2942] rounded-xl px-2.5 py-1 text-white text-xs focus:outline-hidden focus:border-[#B7F34A] transition-colors"
                  data-testid="list-filter-end-date"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="text-[11px] text-[#8E9BB0] hover:text-[#B7F34A] underline font-semibold transition-colors"
                >
                  Limpar período
                </button>
              )}
            </div>
            <div className="text-[11px] text-[#8E9BB0]">
              {filteredTrainings.length} {filteredTrainings.length === 1 ? "sessão no período" : "sessões no período"}
            </div>
          </div>
        )}

        {/* Linha 3: Variedade de Filtros (Modalidade, RPE, Ordenação e Busca) */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          {/* Seletor de Modalidade (mantém role="combobox" único para compatibilidade de testes) */}
          <div className="shrink-0">
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as "all" | ActivityType)}
              className="h-9 px-3 text-xs font-semibold rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-hidden focus:border-[#B7F34A] w-full sm:w-auto"
            >
              <option value="all">Todas as Modalidades</option>
              <option value="corrida_continua">Corrida Contínua</option>
              <option value="corrida_intervalada">Intervalado / Tiros</option>
              <option value="caminhada">Caminhada</option>
            </select>
          </div>

          {/* Filtro Rápido por Intensidade RPE (Pills de esforço) */}
          <div className="flex items-center gap-1 p-1 bg-[#0B1020] rounded-xl border border-[#1E2942] overflow-x-auto text-[11px]">
            <span className="text-[#8E9BB0] text-[10px] font-bold px-1.5 uppercase shrink-0">RPE:</span>
            <button
              type="button"
              onClick={() => setRpeFilter("all")}
              className={`px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                rpeFilter === "all"
                  ? "bg-[#B7F34A] text-[#0B1020]"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setRpeFilter("leve")}
              className={`px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                rpeFilter === "leve"
                  ? "bg-emerald-500 text-white"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Leve (1-3)
            </button>
            <button
              type="button"
              onClick={() => setRpeFilter("moderado")}
              className={`px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                rpeFilter === "moderado"
                  ? "bg-blue-500 text-white"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Moderado (4-6)
            </button>
            <button
              type="button"
              onClick={() => setRpeFilter("intenso")}
              className={`px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                rpeFilter === "intenso"
                  ? "bg-amber-500 text-white"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Intenso (7-8)
            </button>
            <button
              type="button"
              onClick={() => setRpeFilter("maximo")}
              className={`px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                rpeFilter === "maximo"
                  ? "bg-rose-500 text-white"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Máximo (9-10)
            </button>
          </div>

          {/* Ordenação Rápida */}
          <div className="flex items-center gap-1 p-1 bg-[#0B1020] rounded-xl border border-[#1E2942] overflow-x-auto text-[11px]">
            <ArrowUpDown className="w-3 h-3 text-[#8E9BB0] ml-1 shrink-0" />
            <button
              type="button"
              onClick={() => setSortOption("date-desc")}
              className={`px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                sortOption === "date-desc"
                  ? "bg-[#B7F34A] text-[#0B1020]"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Recentes
            </button>
            <button
              type="button"
              onClick={() => setSortOption("dist-desc")}
              className={`px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                sortOption === "dist-desc"
                  ? "bg-[#B7F34A] text-[#0B1020]"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Maior km
            </button>
            <button
              type="button"
              onClick={() => setSortOption("pace-asc")}
              className={`px-2 py-0.5 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                sortOption === "pace-asc"
                  ? "bg-[#B7F34A] text-[#0B1020]"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Mais rápidos
            </button>
          </div>

          {/* Campo de Busca Textual */}
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 text-[#8E9BB0] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por notas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 h-9 text-xs rounded-xl border border-[#1E2942] bg-[#0B1020] text-white placeholder-[#8E9BB0] focus:outline-hidden focus:border-[#B7F34A] font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8E9BB0] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Resumo Rápido de Volume Acumulado do Filtro */}
        {aggregatedStats && (
          <div className="pt-3 border-t border-[#1E2942] grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-[#0B1020]/60 border border-[#1E2942] p-2 rounded-xl">
              <span className="text-[10px] text-[#8E9BB0] uppercase font-bold tracking-wider">
                Sessões
              </span>
              <div className="text-sm font-black text-white">
                {aggregatedStats.count}
              </div>
            </div>

            <div className="bg-[#0B1020]/60 border border-[#1E2942] p-2 rounded-xl">
              <span className="text-[10px] text-[#8E9BB0] uppercase font-bold tracking-wider">
                Volume Total
              </span>
              <div className="text-sm font-black text-[#B7F34A]">
                {aggregatedStats.totalDistanceKm} km
              </div>
            </div>

            <div className="bg-[#0B1020]/60 border border-[#1E2942] p-2 rounded-xl">
              <span className="text-[10px] text-[#8E9BB0] uppercase font-bold tracking-wider">
                Tempo Total
              </span>
              <div className="text-sm font-black text-white">
                {formatTime(aggregatedStats.totalDurationSeconds)}
              </div>
            </div>

            <div className="bg-[#0B1020]/60 border border-[#1E2942] p-2 rounded-xl">
              <span className="text-[10px] text-[#8E9BB0] uppercase font-bold tracking-wider">
                Pace Médio
              </span>
              <div className="text-sm font-black text-[#B7F34A]">
                {aggregatedStats.avgPaceFormatted}/km
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Lista de Sessões ou Empty State ─── */}
      {filteredTrainings.length === 0 ? (
        <div
          data-testid="training-empty-state"
          className="bg-[#131A2E]/60 border border-dashed border-[#1E2942] rounded-3xl p-8 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#1E2942] text-[#B7F34A] flex items-center justify-center mx-auto mb-3">
            <Activity className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm text-white mb-1">
            Nenhum treino registrado
          </h4>
          <p className="text-xs text-[#8E9BB0] max-w-sm mx-auto">
            {isAnyFilterActive
              ? "Nenhuma sessão de treino corresponde aos filtros selecionados. Tente ajustar os filtros ou clicar em 'Limpar todos os filtros'."
              : "Seu diário de treinos está vazio. Preencha o formulário acima para registrar sua primeira sessão de corrida, tiros ou caminhada!"}
          </p>
          {isAnyFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-3 px-3 py-1.5 rounded-xl bg-[#0B1020] border border-[#1E2942] text-[#B7F34A] text-xs font-bold hover:bg-[#B7F34A] hover:text-[#0B1020] transition-colors"
            >
              Limpar todos os filtros
            </button>
          )}
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
