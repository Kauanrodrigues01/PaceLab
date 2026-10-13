"use client";

import React, { useState, useMemo } from "react";
import { TafAttempt } from "@/types";
import { processTafAttempts, parseSafeDate } from "@/lib/math/evolution";
import { TafAttemptCard } from "./TafAttemptCard";
import { Trophy, History, Calendar } from "lucide-react";

interface TafAttemptListProps {
  attempts: TafAttempt[];
  targetDistanceMeters?: number;
  onEdit: (attempt: TafAttempt) => void;
  onDelete: (id: string) => void;
}

export function TafAttemptList({
  attempts,
  targetDistanceMeters = 2300,
  onEdit,
  onDelete,
}: TafAttemptListProps) {
  const [filterDuration, setFilterDuration] = useState<"all" | "12min" | "other">("12min");
  const [filterPeriod, setFilterPeriod] = useState<"all" | "30d" | "90d">("all");

  // Processa tentativas para calcular recordes, deltas e déficits
  const processed = useMemo(
    () => processTafAttempts(attempts, targetDistanceMeters),
    [attempts, targetDistanceMeters]
  );

  // Aplica filtro de duração e período
  const filtered = useMemo(() => {
    const now = Date.now();
    return processed.filter((att) => {
      const is12m = (att.targetDurationSeconds || 720) === 720;
      if (filterDuration === "12min" && !is12m) return false;
      if (filterDuration === "other" && is12m) return false;

      if (filterPeriod !== "all") {
        const testTime = parseSafeDate(att.testDate)?.getTime() ?? 0;
        const diffDays = (now - testTime) / (1000 * 60 * 60 * 24);
        if (filterPeriod === "30d" && diffDays > 30) return false;
        if (filterPeriod === "90d" && diffDays > 90) return false;
      }

      return true;
    });
  }, [processed, filterDuration, filterPeriod]);

  return (
    <div data-testid="taf-attempt-list" className="space-y-4">
      {/* Cabeçalho da Lista e Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
            Histórico de Testes ({filtered.length})
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por período */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <button
              type="button"
              onClick={() => setFilterPeriod("all")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filterPeriod === "all"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Todo o período
            </button>
            <button
              type="button"
              onClick={() => setFilterPeriod("30d")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filterPeriod === "30d"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              30 dias
            </button>
            <button
              type="button"
              onClick={() => setFilterPeriod("90d")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filterPeriod === "90d"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              90 dias
            </button>
          </div>

          {/* Filtro por duração */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setFilterDuration("12min")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterDuration === "12min"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              12 Minutos (TAF)
            </button>
            <button
              type="button"
              onClick={() => setFilterDuration("all")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterDuration === "all"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterDuration("other")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterDuration === "other"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Outras durações
            </button>
          </div>
        </div>
      </div>

      {/* Lista ou Empty State */}
      {filtered.length === 0 ? (
        <div
          data-testid="taf-empty-state"
          className="bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-1">
            Nenhum teste registrado
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {filterDuration === "12min"
              ? "Você ainda não registrou nenhum simulado de 12 minutos. Preencha o formulário acima para registrar sua primeira tentativa e ver seus recordes!"
              : "Nenhum teste encontrado para o filtro selecionado."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((att) => (
            <TafAttemptCard
              key={att.id}
              attempt={att}
              targetDistanceMeters={targetDistanceMeters}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
