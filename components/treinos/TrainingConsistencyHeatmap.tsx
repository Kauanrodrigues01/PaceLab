"use client";

import React, { useMemo } from "react";
import { TrainingSession } from "@/types";
import { parseSafeDate } from "@/lib/math/evolution";
import { Flame, Trophy } from "lucide-react";

interface TrainingConsistencyHeatmapProps {
  trainings: TrainingSession[];
  weeksCount?: number;
}

interface DayData {
  dateStr: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Domingo, 1 = Segunda, etc.
  totalKm: number;
  sessionCount: number;
  sessions: TrainingSession[];
}

export function TrainingConsistencyHeatmap({
  trainings,
  weeksCount = 12,
}: TrainingConsistencyHeatmapProps) {
  // Mapa de treinos por data (YYYY-MM-DD)
  const trainingByDay = useMemo(() => {
    const map = new Map<string, { totalKm: number; sessions: TrainingSession[] }>();
    trainings.forEach((t) => {
      const d = parseSafeDate(t.sessionDate);
      if (!d) return;
      const key = d.toISOString().split("T")[0];
      const current = map.get(key) || { totalKm: 0, sessions: [] };
      current.totalKm += Number(t.distanceKm) || 0;
      current.sessions.push(t);
      map.set(key, current);
    });
    return map;
  }, [trainings]);

  // Gera a matriz das últimas `weeksCount` semanas
  const { weeks, totalDaysTrained, totalKmPeriod, currentStreak, maxStreak } = useMemo(() => {
    const now = new Date();
    // Começa no domingo da semana `weeksCount` atrás
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - (weeksCount * 7) + (6 - now.getDay()));
    startDate.setHours(0, 0, 0, 0);

    const generatedWeeks: DayData[][] = [];
    let currentWeek: DayData[] = [];
    let daysTrained = 0;
    let kmSum = 0;

    const pointer = new Date(startDate);
    while (pointer <= now) {
      const dateStr = pointer.toISOString().split("T")[0];
      const dayData = trainingByDay.get(dateStr);
      const totalKm = dayData?.totalKm || 0;
      const sessionCount = dayData?.sessions.length || 0;

      if (totalKm > 0) {
        daysTrained++;
        kmSum += totalKm;
      }

      currentWeek.push({
        dateStr,
        dayOfWeek: pointer.getDay(),
        totalKm,
        sessionCount,
        sessions: dayData?.sessions || [],
      });

      if (pointer.getDay() === 6) {
        generatedWeeks.push(currentWeek);
        currentWeek = [];
      }

      pointer.setDate(pointer.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      generatedWeeks.push(currentWeek);
    }

    // Cálculo do Streak Atual e Maior Streak
    // Ordena todas as datas únicas que tiveram treino
    const sortedActiveDates = Array.from(trainingByDay.keys()).sort();
    let curStreak = 0;
    let highestStreak = 0;
    let runningStreak = 0;
    let prevDate: Date | null = null;

    sortedActiveDates.forEach((dStr) => {
      const d = new Date(dStr + "T00:00:00");
      if (!prevDate) {
        runningStreak = 1;
      } else {
        const diffDays = Math.round((d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          runningStreak++;
        } else {
          runningStreak = 1;
        }
      }
      if (runningStreak > highestStreak) highestStreak = runningStreak;
      prevDate = d;
    });

    // Se treinou hoje ou ontem, streak continua ativo
    const todayStr = now.toISOString().split("T")[0];
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yestStr = yesterday.toISOString().split("T")[0];

    if (trainingByDay.has(todayStr) || trainingByDay.has(yestStr)) {
      curStreak = runningStreak;
    } else {
      curStreak = 0;
    }

    return {
      weeks: generatedWeeks,
      totalDaysTrained: daysTrained,
      totalKmPeriod: Number(kmSum.toFixed(1)),
      currentStreak: curStreak,
      maxStreak: highestStreak,
    };
  }, [trainingByDay, weeksCount]);

  const getCellColor = (km: number) => {
    if (km === 0) return "bg-[#0B1020] border border-[#1E2942] text-transparent";
    if (km < 4) return "bg-[#B7F34A]/30 text-white";
    if (km < 8) return "bg-[#B7F34A]/70 text-[#0B1020]";
    return "bg-[#B7F34A] text-[#0B1020] font-black shadow-xs shadow-[#B7F34A]/20";
  };

  const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div
      data-testid="training-consistency-heatmap"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm space-y-4"
    >
      {/* Topo com Título e Streaks */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Flame className="w-5 h-5 fill-amber-500/20" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              Consistência de Treinos (Últimas {weeksCount} Semanas)
            </h4>
            <p className="text-xs text-[#8E9BB0]">
              Distribuição semanal da sua rotina e dias rodados.
            </p>
          </div>
        </div>

        {/* Badges de Sequência e Volume */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-900/60 text-amber-300 font-bold">
            <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>Streak: {currentStreak} {currentStreak === 1 ? "dia" : "dias"}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#B7F34A]/10 border border-[#B7F34A]/20 text-[#B7F34A] font-bold">
            <Trophy className="w-4 h-4 text-[#B7F34A]" />
            <span>Recorde: {maxStreak} dias</span>
          </div>
        </div>
      </div>

      {/* Grade Heatmap Responsiva */}
      <div className="overflow-x-auto pb-2 scrollbar-none">
        <div className="inline-flex gap-1.5 min-w-full">
          {/* Coluna com rótulos dos dias da semana */}
          <div className="flex flex-col gap-1.5 pr-2 pt-0.5 text-[10px] text-[#8E9BB0] select-none font-medium">
            {dayLabels.map((lbl, idx) => (
              <div key={lbl} className="h-4 sm:h-5 flex items-center justify-end leading-none">
                {idx % 2 === 1 ? lbl : ""}
              </div>
            ))}
          </div>

          {/* Colunas de Semanas */}
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1.5">
              {week.map((day) => {
                const isTrained = day.totalKm > 0;
                const formattedDate = new Date(day.dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                });

                return (
                  <div
                    key={day.dateStr}
                    title={`${formattedDate}: ${
                      isTrained
                        ? `${day.totalKm.toFixed(1)} km em ${day.sessionCount} sessão(ões)`
                        : "Sem treino registrado"
                    }`}
                    className={`w-4 h-4 sm:w-5 sm:h-5 rounded-md cursor-pointer transition-transform hover:scale-125 hover:z-10 relative flex items-center justify-center ${getCellColor(
                      day.totalKm
                    )}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legenda de Intensidade */}
      <div className="pt-2 border-t border-[#1E2942] flex flex-wrap items-center justify-between gap-3 text-xs text-[#8E9BB0]">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>Menos</span>
          <div className="w-3.5 h-3.5 rounded bg-[#0B1020] border border-[#1E2942]" />
          <div className="w-3.5 h-3.5 rounded bg-[#B7F34A]/30" />
          <div className="w-3.5 h-3.5 rounded bg-[#B7F34A]/70" />
          <div className="w-3.5 h-3.5 rounded bg-[#B7F34A]" />
          <span>Mais km</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-semibold text-[#8E9BB0]">
          <span>{totalDaysTrained} dias com treino</span>
          <span>•</span>
          <span>{totalKmPeriod} km percorridos</span>
        </div>
      </div>
    </div>
  );
}
