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
          <History className="w-5 h-5 text-[#B7F34A]" />
          <h3 className="font-bold text-base text-white">
            Histórico de Testes ({filtered.length})
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por período */}
          <div className="flex items-center gap-1 bg-[#131A2E] border border-[#1E2942] p-1 rounded-xl text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#8E9BB0] ml-1.5" />
            <button
              type="button"
              onClick={() => setFilterPeriod("all")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filterPeriod === "all"
                  ? "bg-[#B7F34A] text-[#0B1020] shadow-sm"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Todo o período
            </button>
            <button
              type="button"
              onClick={() => setFilterPeriod("30d")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filterPeriod === "30d"
                  ? "bg-[#B7F34A] text-[#0B1020] shadow-sm"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              30 dias
            </button>
            <button
              type="button"
              onClick={() => setFilterPeriod("90d")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filterPeriod === "90d"
                  ? "bg-[#B7F34A] text-[#0B1020] shadow-sm"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              90 dias
            </button>
          </div>

          {/* Filtro por duração */}
          <div className="flex items-center gap-1 bg-[#131A2E] border border-[#1E2942] p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setFilterDuration("12min")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterDuration === "12min"
                  ? "bg-[#B7F34A] text-[#0B1020] shadow-sm"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              12 Minutos (TAF)
            </button>
            <button
              type="button"
              onClick={() => setFilterDuration("all")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterDuration === "all"
                  ? "bg-[#B7F34A] text-[#0B1020] shadow-sm"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilterDuration("other")}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filterDuration === "other"
                  ? "bg-[#B7F34A] text-[#0B1020] shadow-sm"
                  : "text-[#8E9BB0] hover:text-white"
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
          className="bg-[#131A2E]/60 border border-dashed border-[#1E2942] rounded-3xl p-8 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-[#1E2942] text-[#B7F34A] flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-sm text-white mb-1">
            Nenhum teste registrado
          </h4>
          <p className="text-xs text-[#8E9BB0] max-w-sm mx-auto">
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
