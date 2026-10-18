"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  TrainingSession,
  TimeRangePreset,
  SessionCountPreset,
  DashboardFilterMode,
  ActivityType,
  ACTIVITY_LABELS,
} from "@/types";
import { formatPace, formatTime } from "@/lib/formatting/time";
import { parseSafeDate } from "@/lib/math/evolution";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Activity,
  Calendar,
  Clock,
  Flame,
  Zap,
  HeartPulse,
  TrendingUp,
  Award,
  Info,
  ShieldCheck,
} from "lucide-react";
import { TrainingConsistencyHeatmap } from "./TrainingConsistencyHeatmap";

interface TrainingEvolutionDashboardProps {
  trainings: TrainingSession[];
}

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  corrida_continua: "#3b82f6", // azul
  corrida_intervalada: "#f59e0b", // âmbar
  caminhada: "#10b981", // verde esmeralda
};

const RPE_ZONE_COLORS = {
  leve: "#10b981", // Verde (RPE 1-3)
  moderado: "#3b82f6", // Azul (RPE 4-6)
  intenso: "#f59e0b", // Âmbar (RPE 7-8)
  maximo: "#ef4444", // Vermelho (RPE 9-10)
};

const PACE_ACTIVITY_OPTIONS: Array<{
  value: "all" | ActivityType;
  label: string;
}> = [
  { value: "all", label: "Todas" },
  { value: "corrida_continua", label: "Corrida Contínua" },
  { value: "corrida_intervalada", label: "Intervalado" },
  { value: "caminhada", label: "Caminhada" },
];

export function TrainingEvolutionDashboard({
  trainings,
}: TrainingEvolutionDashboardProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [filterMode, setFilterMode] = useState<DashboardFilterMode>("preset");
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("90d");
  const [sessionCount, setSessionCount] = useState<SessionCountPreset>(4);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [paceActivityFilter, setPaceActivityFilter] = useState<"all" | ActivityType>("all");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ─── 1. Filtragem por Período ou Quantidade de Sessões ──────────────────────
  const filteredTrainings = useMemo(() => {
    if (trainings.length === 0) return [];

    const now = new Date();
    const nowTime = now.getTime();

    // Modo 1: Por Quantidade de Sessões Recentes (2, 4 ou 6)
    if (filterMode === "sessions") {
      const validSortedDesc = trainings
        .filter((t) => parseSafeDate(t.sessionDate) !== null)
        .sort((a, b) => {
          const da = parseSafeDate(a.sessionDate)!.getTime();
          const db = parseSafeDate(b.sessionDate)!.getTime();
          return db - da; // Mais recente para mais antigo
        });

      const latestN = validSortedDesc.slice(0, sessionCount);

      // Reordena cronologicamente (mais antigo para mais recente) para gráficos temporais
      return latestN.sort((a, b) => {
        const da = parseSafeDate(a.sessionDate)!.getTime();
        const db = parseSafeDate(b.sessionDate)!.getTime();
        return da - db;
      });
    }

    // Modo 2: Período Personalizado (Datas Início e Fim)
    if (filterMode === "custom") {
      const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
      const endMs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;

      return trainings
        .filter((t) => {
          const tDate = parseSafeDate(t.sessionDate);
          if (!tDate) return false;
          const tMs = tDate.getTime();

          if (startMs !== null && !isNaN(startMs) && tMs < startMs) {
            return false;
          }
          if (endMs !== null && !isNaN(endMs) && tMs > endMs) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const da = parseSafeDate(a.sessionDate)?.getTime() ?? 0;
          const db = parseSafeDate(b.sessionDate)?.getTime() ?? 0;
          return da - db; // cronológico
        });
    }

    // Modo 3: Presets de Tempo Clássicos
    return trainings
      .filter((t) => {
        const tDate = parseSafeDate(t.sessionDate);
        if (!tDate) return false;
        const diffMs = nowTime - tDate.getTime();

        switch (timeRange) {
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
          case "all":
          default:
            return true;
        }
      })
      .sort((a, b) => {
        const da = parseSafeDate(a.sessionDate)?.getTime() ?? 0;
        const db = parseSafeDate(b.sessionDate)?.getTime() ?? 0;
        return da - db; // cronológico (mais antigo para mais recente)
      });
  }, [trainings, filterMode, timeRange, sessionCount, startDate, endDate]);

  // ─── 2. KPIs Agregados do Período ─────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (filteredTrainings.length === 0) {
      return {
        totalKm: 0,
        totalDurationSeconds: 0,
        totalSessions: 0,
        avgPaceSeconds: 0,
        avgPaceFormatted: "--:--",
        totalTrainingLoad: 0,
        longestRunKm: 0,
        avgRpe: null,
        totalCalories: 0,
        totalActiveCalories: 0,
      };
    }

    let totalKm = 0;
    let totalDurationSeconds = 0;
    let totalLoad = 0;
    let longestRunKm = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    let totalCalories = 0;
    let totalActiveCalories = 0;

    filteredTrainings.forEach((t) => {
      const km = t.distanceKm || 0;
      const dur = t.durationSeconds || 0;
      totalKm += km;
      totalDurationSeconds += dur;
      totalCalories += t.totalCalories || t.activeCalories || 0;
      totalActiveCalories += t.activeCalories || 0;

      if (km > longestRunKm) {
        longestRunKm = km;
      }

      const rpe = typeof t.perceivedEffort === "number" && t.perceivedEffort > 0
        ? t.perceivedEffort
        : 5; // Neutro caso não informado

      if (typeof t.perceivedEffort === "number" && t.perceivedEffort > 0) {
        rpeSum += t.perceivedEffort;
        rpeCount++;
      }

      // TRIMP simplificado: Duração (minutos) * RPE
      const durationMin = dur / 60;
      totalLoad += Math.round(durationMin * rpe);
    });

    const avgPaceSec = totalKm > 0 ? Math.round(totalDurationSeconds / totalKm) : 0;
    const avgRpe = rpeCount > 0 ? Number((rpeSum / rpeCount).toFixed(1)) : null;

    return {
      totalKm: Number(totalKm.toFixed(1)),
      totalDurationSeconds,
      totalSessions: filteredTrainings.length,
      avgPaceSeconds: avgPaceSec,
      avgPaceFormatted: avgPaceSec > 0 ? formatPace(avgPaceSec) : "--:--",
      totalTrainingLoad: totalLoad,
      longestRunKm: Number(longestRunKm.toFixed(1)),
      avgRpe,
      totalCalories: Math.round(totalCalories),
      totalActiveCalories: Math.round(totalActiveCalories),
    };
  }, [filteredTrainings]);

  // ─── 3. Gráfico 1: Volume Semanal Acumulado (BarChart) ────────────────────────
  const weeklyChartData = useMemo(() => {
    if (filteredTrainings.length === 0) return [];

    const weekMap: Record<
      string,
      {
        weekLabel: string;
        timestamp: number;
        distanceKm: number;
        durationSeconds: number;
        sessionsCount: number;
      }
    > = {};

    filteredTrainings.forEach((t) => {
      const date = parseSafeDate(t.sessionDate);
      if (!date) return;

      // Segunda-feira como início da semana
      const day = date.getDay();
      const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      const weekLabel = `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`;

      if (!weekMap[weekKey]) {
        weekMap[weekKey] = {
          weekLabel,
          timestamp: monday.getTime(),
          distanceKm: 0,
          durationSeconds: 0,
          sessionsCount: 0,
        };
      }

      weekMap[weekKey].distanceKm += t.distanceKm || 0;
      weekMap[weekKey].durationSeconds += t.durationSeconds || 0;
      weekMap[weekKey].sessionsCount += 1;
    });

    return Object.values(weekMap)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((w) => {
        const paceSec =
          w.distanceKm > 0 ? Math.round(w.durationSeconds / w.distanceKm) : 0;
        return {
          weekLabel: w.weekLabel,
          distanceKm: Number(w.distanceKm.toFixed(1)),
          sessionsCount: w.sessionsCount,
          durationFormatted: formatTime(w.durationSeconds),
          avgPaceFormatted: paceSec > 0 ? formatPace(paceSec) : "--:--",
        };
      });
  }, [filteredTrainings]);

  // ─── 4. Gráfico 2: Curva de Evolução do Pace (LineChart) ──────────────────────
  const paceChartData = useMemo(() => {
    return filteredTrainings
      .filter((t) => {
        if (t.distanceKm <= 0 || t.durationSeconds <= 0) return false;
        if (paceActivityFilter !== "all" && t.activityType !== paceActivityFilter) {
          return false;
        }
        return true;
      })
      .map((t, idx) => {
        const d = parseSafeDate(t.sessionDate);
        const dateLabel = d
          ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
          : `#${idx + 1}`;

        const paceSec =
          t.paceSeconds && t.paceSeconds > 0
            ? t.paceSeconds
            : Math.round(t.durationSeconds / t.distanceKm);

        return {
          id: t.id,
          dateLabel,
          distanceKm: t.distanceKm,
          paceSeconds: paceSec,
          paceFormatted: t.paceFormatted || formatPace(paceSec),
          activityType: t.activityType,
          activityLabel: ACTIVITY_LABELS[t.activityType] || "Corrida",
        };
      });
  }, [filteredTrainings, paceActivityFilter]);

  // ─── 5. Gráfico 3: Carga de Treino Semanal (Training Load / TRIMP) ─────────────
  const trainingLoadChartData = useMemo(() => {
    if (filteredTrainings.length === 0) return [];

    const loadMap: Record<
      string,
      {
        weekLabel: string;
        timestamp: number;
        loadScore: number;
        sessionsCount: number;
      }
    > = {};

    filteredTrainings.forEach((t) => {
      const date = parseSafeDate(t.sessionDate);
      if (!date) return;

      const day = date.getDay();
      const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      const weekLabel = `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`;

      const rpe =
        typeof t.perceivedEffort === "number" && t.perceivedEffort > 0
          ? t.perceivedEffort
          : 5;
      const durationMin = (t.durationSeconds || 0) / 60;
      const sessionLoad = Math.round(durationMin * rpe);

      if (!loadMap[weekKey]) {
        loadMap[weekKey] = {
          weekLabel,
          timestamp: monday.getTime(),
          loadScore: 0,
          sessionsCount: 0,
        };
      }

      loadMap[weekKey].loadScore += sessionLoad;
      loadMap[weekKey].sessionsCount += 1;
    });

    return Object.values(loadMap)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((l) => ({
        weekLabel: l.weekLabel,
        loadScore: l.loadScore,
        sessionsCount: l.sessionsCount,
      }));
  }, [filteredTrainings]);

  // ─── 6. Gráfico 4: Distribuição por Zonas de RPE (Polarização de Esforço) ──────
  const rpeDistributionData = useMemo(() => {
    if (filteredTrainings.length === 0) return [];

    let countLeve = 0;
    let countModerado = 0;
    let countIntenso = 0;
    let countMaximo = 0;

    filteredTrainings.forEach((t) => {
      const rpe = t.perceivedEffort || 5;
      if (rpe <= 3) countLeve++;
      else if (rpe <= 6) countModerado++;
      else if (rpe <= 8) countIntenso++;
      else countMaximo++;
    });

    const total = filteredTrainings.length;

    return [
      {
        zone: "Leve / Base",
        range: "RPE 1-3",
        count: countLeve,
        percent: total > 0 ? Math.round((countLeve / total) * 100) : 0,
        fill: RPE_ZONE_COLORS.leve,
      },
      {
        zone: "Moderado / Ritmo",
        range: "RPE 4-6",
        count: countModerado,
        percent: total > 0 ? Math.round((countModerado / total) * 100) : 0,
        fill: RPE_ZONE_COLORS.moderado,
      },
      {
        zone: "Intenso / Limiar",
        range: "RPE 7-8",
        count: countIntenso,
        percent: total > 0 ? Math.round((countIntenso / total) * 100) : 0,
        fill: RPE_ZONE_COLORS.intenso,
      },
      {
        zone: "Máximo / Tiros",
        range: "RPE 9-10",
        count: countMaximo,
        percent: total > 0 ? Math.round((countMaximo / total) * 100) : 0,
        fill: RPE_ZONE_COLORS.maximo,
      },
    ];
  }, [filteredTrainings]);

  // ─── 7. Gráfico 5: Composição por Modalidade (PieChart / Donut) ───────────────
  const activityDistributionData = useMemo(() => {
    if (filteredTrainings.length === 0) return [];

    let kmContinua = 0;
    let kmIntervalada = 0;
    let kmCaminhada = 0;

    filteredTrainings.forEach((t) => {
      const km = t.distanceKm || 0;
      if (t.activityType === "corrida_intervalada") kmIntervalada += km;
      else if (t.activityType === "caminhada") kmCaminhada += km;
      else kmContinua += km;
    });

    const totalKm = kmContinua + kmIntervalada + kmCaminhada;

    return [
      {
        name: "Corrida Contínua",
        value: Number(kmContinua.toFixed(1)),
        percent: totalKm > 0 ? Math.round((kmContinua / totalKm) * 100) : 0,
        color: ACTIVITY_COLORS.corrida_continua,
      },
      {
        name: "Intervalado / Tiros",
        value: Number(kmIntervalada.toFixed(1)),
        percent: totalKm > 0 ? Math.round((kmIntervalada / totalKm) * 100) : 0,
        color: ACTIVITY_COLORS.corrida_intervalada,
      },
      {
        name: "Caminhada",
        value: Number(kmCaminhada.toFixed(1)),
        percent: totalKm > 0 ? Math.round((kmCaminhada / totalKm) * 100) : 0,
        color: ACTIVITY_COLORS.caminhada,
      },
    ].filter((item) => item.value > 0);
  }, [filteredTrainings]);

  // ─── 8. Gráfico 6: Gasto Calórico Semanal Acumulado (BarChart) ────────────────
  const weeklyCaloriesChartData = useMemo(() => {
    if (filteredTrainings.length === 0) return [];

    const weekMap: Record<
      string,
      {
        weekLabel: string;
        timestamp: number;
        activeCalories: number;
        totalCalories: number;
        sessionsCount: number;
      }
    > = {};

    filteredTrainings.forEach((t) => {
      const date = parseSafeDate(t.sessionDate);
      if (!date) return;

      const day = date.getDay();
      const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      const weekLabel = `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`;

      if (!weekMap[weekKey]) {
        weekMap[weekKey] = {
          weekLabel,
          timestamp: monday.getTime(),
          activeCalories: 0,
          totalCalories: 0,
          sessionsCount: 0,
        };
      }

      weekMap[weekKey].activeCalories += t.activeCalories || 0;
      weekMap[weekKey].totalCalories += t.totalCalories || t.activeCalories || 0;
      weekMap[weekKey].sessionsCount += 1;
    });

    return Object.values(weekMap)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((w) => ({
        weekLabel: w.weekLabel,
        activeCalories: Math.round(w.activeCalories),
        totalCalories: Math.round(w.totalCalories),
        sessionsCount: w.sessionsCount,
      }));
  }, [filteredTrainings]);

  // ─── 9. Gráfico 7: Distribuição de Calorias por Modalidade (Donut) ────────────
  const activityCaloriesData = useMemo(() => {
    if (filteredTrainings.length === 0) return [];

    let calContinua = 0;
    let calIntervalada = 0;
    let calCaminhada = 0;

    filteredTrainings.forEach((t) => {
      const cal = t.activeCalories || 0;
      if (t.activityType === "corrida_intervalada") calIntervalada += cal;
      else if (t.activityType === "caminhada") calCaminhada += cal;
      else calContinua += cal;
    });

    const totalCal = calContinua + calIntervalada + calCaminhada;

    return [
      {
        name: "Corrida Contínua",
        value: Math.round(calContinua),
        percent: totalCal > 0 ? Math.round((calContinua / totalCal) * 100) : 0,
        color: ACTIVITY_COLORS.corrida_continua,
      },
      {
        name: "Intervalado / Tiros",
        value: Math.round(calIntervalada),
        percent: totalCal > 0 ? Math.round((calIntervalada / totalCal) * 100) : 0,
        color: ACTIVITY_COLORS.corrida_intervalada,
      },
      {
        name: "Caminhada",
        value: Math.round(calCaminhada),
        percent: totalCal > 0 ? Math.round((calCaminhada / totalCal) * 100) : 0,
        color: ACTIVITY_COLORS.caminhada,
      },
    ].filter((item) => item.value > 0);
  }, [filteredTrainings]);

  // Formata horas e minutos totais
  const formattedTotalTime = useMemo(() => {
    const totalMinutes = Math.floor(metrics.totalDurationSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    return `${hours}h ${minutes}m`;
  }, [metrics.totalDurationSeconds]);

  return (
    <div
      data-testid="training-evolution-dashboard"
      className="space-y-6 animate-in fade-in duration-200"
    >
      {/* ─── Barra Superior de Controle do Filtro Temporal & Avançado ─── */}
      <div className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#B7F34A]" />
              Análise e Periodização de Treinamento
            </span>
            <p className="text-[11px] text-[#8E9BB0] mt-0.5">
              Métricas de carga, eficiência de pace e distribuição de esforço.
            </p>
          </div>

          {/* Seletor de Filtros (Presets, Sessões Recentes e Personalizado) */}
          <div
            data-testid="filter-time-range"
            className="flex items-center p-1 bg-[#0B1020] rounded-2xl border border-[#1E2942] overflow-x-auto max-w-full"
          >
            {/* Presets Temporais */}
            <button
              type="button"
              onClick={() => {
                setFilterMode("preset");
                setTimeRange("7d");
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                filterMode === "preset" && timeRange === "7d"
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
                setTimeRange("30d");
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                filterMode === "preset" && timeRange === "30d"
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
                setTimeRange("90d");
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                filterMode === "preset" && timeRange === "90d"
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
                setTimeRange("year");
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                filterMode === "preset" && timeRange === "year"
                  ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Ano Atual
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterMode("preset");
                setTimeRange("all");
              }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                filterMode === "preset" && timeRange === "all"
                  ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Tudo
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
        </div>

        {/* Painel Retrátil de Data Inicial e Final (quando Personalizado está ativo) */}
        {filterMode === "custom" && (
          <div
            data-testid="filter-custom-date-panel"
            className="pt-3 border-t border-[#1E2942] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[#8E9BB0] font-semibold">De:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-[#0B1020] border border-[#1E2942] rounded-xl px-2.5 py-1 text-white text-xs focus:outline-hidden focus:border-[#B7F34A] transition-colors"
                  data-testid="input-filter-start-date"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#8E9BB0] font-semibold">Até:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-[#0B1020] border border-[#1E2942] rounded-xl px-2.5 py-1 text-white text-xs focus:outline-hidden focus:border-[#B7F34A] transition-colors"
                  data-testid="input-filter-end-date"
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
              {filteredTrainings.length} {filteredTrainings.length === 1 ? "sessão filtrada" : "sessões filtradas"}
            </div>
          </div>
        )}
      </div>

      {/* ─── Cards de KPIs Avançados do Período ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Volume Total */}
        <div
          data-testid="kpi-total-volume"
          className="p-4 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8E9BB0] mb-1">
            <Activity className="w-3.5 h-3.5 text-[#B7F34A]" />
            <span>Volume Total</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {metrics.totalKm} <span className="text-xs font-normal text-[#8E9BB0]">km</span>
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-0.5">
            {metrics.totalSessions} {metrics.totalSessions === 1 ? "sessão" : "sessões"}
          </p>
        </div>

        {/* 2. Tempo em Movimento */}
        <div
          data-testid="kpi-total-time"
          className="p-4 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8E9BB0] mb-1">
            <Clock className="w-3.5 h-3.5 text-[#B7F34A]" />
            <span>Tempo Total</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {formattedTotalTime}
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-0.5">Em movimento</p>
        </div>

        {/* 3. Gasto Calórico Ativo (Fase 5) */}
        <div
          data-testid="kpi-total-calories"
          className="p-4 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8E9BB0] mb-1">
            <Flame className="w-3.5 h-3.5 text-[#B7F34A]" />
            <span>Gasto Calórico</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-[#B7F34A]">
            {metrics.totalActiveCalories}{" "}
            <span className="text-xs font-normal text-[#8E9BB0]">kcal</span>
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-0.5">
            {metrics.totalCalories > 0
              ? `${metrics.totalCalories} kcal totais`
              : "Calorias ativas"}
          </p>
        </div>

        {/* 4. Pace Médio Ponderado */}
        <div
          data-testid="kpi-avg-pace"
          className="p-4 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8E9BB0] mb-1">
            <Zap className="w-3.5 h-3.5 text-[#B7F34A]" />
            <span>Pace Médio</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {metrics.avgPaceFormatted} <span className="text-xs font-normal text-[#8E9BB0]">/km</span>
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-0.5">Ponderado por volume</p>
        </div>

        {/* 5. Carga de Treino (TRIMP) */}
        <div
          data-testid="kpi-training-load"
          className="p-4 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8E9BB0] mb-1">
            <HeartPulse className="w-3.5 h-3.5 text-purple-400" />
            <span>Carga Total</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {metrics.totalTrainingLoad}{" "}
            <span className="text-xs font-normal text-[#8E9BB0]">pts</span>
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-0.5">TRIMP (Duração × RPE)</p>
        </div>

        {/* 6. Maior Longão */}
        <div
          data-testid="kpi-longest-run"
          className="p-4 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8E9BB0] mb-1">
            <Award className="w-3.5 h-3.5 text-rose-400" />
            <span>Maior Sessão</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {metrics.longestRunKm} <span className="text-xs font-normal text-[#8E9BB0]">km</span>
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-0.5">Longão do período</p>
        </div>
      </div>

      {/* ─── Heatmap de Consistência e Streaks ─── */}
      <TrainingConsistencyHeatmap trainings={trainings} weeksCount={12} />

      {/* ─── Estado Vazio se não houver dados no período ─── */}
      {filteredTrainings.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-[#131A2E] border border-dashed border-[#1E2942] rounded-3xl space-y-3">
          <Activity className="w-10 h-10 text-[#8E9BB0]/40 mx-auto" />
          <h4 className="text-sm font-bold text-white">
            Nenhum treino registrado no período selecionado
          </h4>
          <p className="text-xs text-[#8E9BB0] max-w-sm mx-auto">
            Alterne o filtro temporal acima ou cadastre novos treinos no diário para visualizar
            os gráficos analíticos de evolução e carga.
          </p>
        </div>
      ) : (
        <>
          {/* ─── Grid Principal de Gráficos (Linha 1) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Gráfico 1: Volume Semanal Acumulado (km) */}
            <div
              data-testid="chart-weekly-volume"
              className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#B7F34A]" />
                    Volume Semanal Acumulado (km)
                  </h4>
                  <p className="text-xs text-[#8E9BB0] mt-0.5">
                    Quilometragem somada por semana do calendário (Segunda a Domingo).
                  </p>
                </div>
              </div>

              {isMounted ? (
                <div className="h-64 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                    <BarChart
                      data={weeklyChartData}
                      margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="#1E2942" />
                      <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} stroke="#8E9BB0" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#8E9BB0" unit="km" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0B1020] text-white text-xs p-3 rounded-xl shadow-xl border border-[#1E2942] space-y-1">
                                <span className="font-bold text-[#8E9BB0] block">
                                  Semana de {data.weekLabel}
                                </span>
                                <div className="text-sm font-black text-[#B7F34A]">
                                  {data.distanceKm} km rodados
                                </div>
                                <div className="text-[#8E9BB0] text-[11px]">
                                  {data.sessionsCount} sessões • {data.durationFormatted}
                                </div>
                                <div className="text-[#8E9BB0] text-[11px]">
                                  Pace médio: {data.avgPaceFormatted} /km
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="distanceKm" fill="#B7F34A" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 w-full animate-pulse bg-[#0B1020] rounded-2xl" />
              )}
            </div>

            {/* Gráfico 2: Curva de Evolução do Pace */}
            <div
              data-testid="chart-pace-evolution"
              className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h4 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#B7F34A] shrink-0" />
                    <span>Evolução do Pace por Sessão</span>
                  </h4>
                  <p className="text-xs text-[#8E9BB0] mt-0.5">
                    Ritmo médio (min/km) ao longo do tempo. Valores menores = maior velocidade.
                  </p>
                </div>

                {/* Filtro por Modalidade / Tipo de Exercício */}
                <div
                  data-testid="filter-pace-activity-group"
                  className="flex items-center gap-1 bg-[#0B1020] p-1 rounded-2xl border border-[#1E2942] self-start sm:self-center overflow-x-auto max-w-full shrink-0"
                >
                  {PACE_ACTIVITY_OPTIONS.map((opt) => {
                    const isActive = paceActivityFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`filter-pace-activity-${opt.value}`}
                        onClick={() => setPaceActivityFilter(opt.value)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                          isActive
                            ? "bg-[#B7F34A] text-[#0B1020] shadow-xs"
                            : "text-[#8E9BB0] hover:text-white"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isMounted ? (
                paceChartData.length === 0 ? (
                  <div
                    data-testid="pace-chart-empty"
                    className="h-64 sm:h-72 w-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-[#1E2942] rounded-2xl bg-[#0B1020]/40 space-y-2"
                  >
                    <Zap className="w-8 h-8 text-[#8E9BB0]/40 mx-auto" />
                    <p className="text-xs font-bold text-white">
                      Nenhum treino de{" "}
                      {paceActivityFilter === "all"
                        ? "corrida ou caminhada"
                        : (ACTIVITY_LABELS[paceActivityFilter] || paceActivityFilter)}{" "}
                      no período
                    </p>
                    <p className="text-[11px] text-[#8E9BB0] max-w-xs mx-auto">
                      {paceActivityFilter !== "all" ? (
                        <>
                          Alterne o filtro para{" "}
                          <button
                            type="button"
                            data-testid="button-reset-pace-filter"
                            onClick={() => setPaceActivityFilter("all")}
                            className="text-[#B7F34A] underline font-semibold hover:opacity-80"
                          >
                            Todas
                          </button>{" "}
                          ou altere o período selecionado acima.
                        </>
                      ) : (
                        "Nenhum treino com registro de pace e distância encontrado no período."
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="h-64 sm:h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                      <LineChart
                        data={paceChartData}
                        margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="#1E2942" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} stroke="#8E9BB0" />
                        <YAxis
                          tickFormatter={(sec: number) => formatPace(sec)}
                          tick={{ fontSize: 11 }}
                          stroke="#8E9BB0"
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-[#0B1020] text-white text-xs p-3 rounded-xl shadow-xl border border-[#1E2942] space-y-1">
                                  <span className="font-bold text-[#8E9BB0] block">
                                    {data.dateLabel} • {data.activityLabel}
                                  </span>
                                  <div className="text-sm font-black text-[#B7F34A]">
                                    Pace: {data.paceFormatted} /km
                                  </div>
                                  <div className="text-[#8E9BB0] text-[11px]">
                                    Distância: {data.distanceKm} km
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="paceSeconds"
                          stroke="#B7F34A"
                          strokeWidth={2.5}
                          dot={{ r: 3.5, fill: "#B7F34A", strokeWidth: 1.5, stroke: "#0B1020" }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )
              ) : (
                <div className="h-64 w-full animate-pulse bg-[#0B1020] rounded-2xl" />
              )}
            </div>
          </div>

          {/* ─── Grid de Gráficos Secundários (Linha 2) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Gráfico 3: Carga de Treino & Monitor de Fadiga (TRIMP) */}
            <div
              data-testid="chart-training-load"
              className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm lg:col-span-1"
            >
              <div className="mb-4">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-purple-400" />
                  Carga de Treinamento (TRIMP)
                </h4>
                <p className="text-xs text-[#8E9BB0] mt-0.5">
                  Estresse acumulado por semana (minutos × RPE).
                </p>
              </div>

              {isMounted ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={180}>
                    <AreaChart
                      data={trainingLoadChartData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="#1E2942" />
                      <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} stroke="#8E9BB0" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#8E9BB0" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0B1020] text-white text-xs p-2.5 rounded-xl shadow-xl border border-[#1E2942]">
                                <span className="text-[#8E9BB0] block mb-0.5">
                                  Semana {data.weekLabel}
                                </span>
                                <div className="text-sm font-bold text-purple-400">
                                  {data.loadScore} pontos de carga
                                </div>
                                <span className="text-[10px] text-[#8E9BB0]">
                                  {data.sessionsCount} sessões no período
                                </span>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="loadScore"
                        stroke="#a855f7"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorLoad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 w-full animate-pulse bg-[#0B1020] rounded-2xl" />
              )}
            </div>

            {/* Gráfico 4: Distribuição de Esforço RPE (Polarização) */}
            <div
              data-testid="chart-rpe-distribution"
              className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm lg:col-span-1"
            >
              <div className="mb-4">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#B7F34A]" />
                  Pirâmide de Intensidade (RPE)
                </h4>
                <p className="text-xs text-[#8E9BB0] mt-0.5">
                  Distribuição de sessões nas zonas aeróbia e anaeróbia.
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                {rpeDistributionData.map((item) => (
                  <div key={item.zone} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-[#8E9BB0]">
                        {item.zone} <span className="text-[#8E9BB0]/70 text-[10px]">({item.range})</span>
                      </span>
                      <span className="text-white font-bold">
                        {item.percent}%{" "}
                        <span className="text-[#8E9BB0] font-normal text-[10px]">
                          ({item.count})
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#0B1020] rounded-full overflow-hidden border border-[#1E2942]">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${item.percent}%`,
                          backgroundColor: item.fill,
                        }}
                      />
                    </div>
                  </div>
                ))}

                <div className="mt-3 pt-3 border-t border-[#1E2942] flex items-start gap-1.5 text-[10px] text-[#8E9BB0]">
                  <Info className="w-3.5 h-3.5 text-[#B7F34A] shrink-0 mt-0.5" />
                  <span>
                    💡 <strong>Regra 80/20:</strong> Idealmente, ~80% do volume deve ser Leve/Moderado
                    (RPE 1-6) e ~20% em intensidade alta (RPE 7-10).
                  </span>
                </div>
              </div>
            </div>

            {/* Gráfico 5: Composição por Modalidade (Donut) */}
            <div
              data-testid="chart-activity-distribution"
              className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm lg:col-span-1"
            >
              <div className="mb-4">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-[#B7F34A]" />
                  Volume por Modalidade
                </h4>
                <p className="text-xs text-[#8E9BB0] mt-0.5">
                  Divisão de quilômetros por tipo de locomoção.
                </p>
              </div>

              {activityDistributionData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-[#8E9BB0]">
                  Sem dados no período
                </div>
              ) : isMounted ? (
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={150}>
                    <PieChart>
                      <Pie
                        data={activityDistributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {activityDistributionData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0B1020] text-white text-xs p-2.5 rounded-xl shadow-xl border border-[#1E2942]">
                                <span className="font-bold text-[#8E9BB0] block mb-0.5">
                                  {data.name}
                                </span>
                                <div className="text-sm font-black text-[#B7F34A]">
                                  {data.value} km ({data.percent}%)
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-44 w-full animate-pulse bg-[#0B1020] rounded-2xl" />
              )}

              {/* Legenda do Donut */}
              <div className="grid grid-cols-1 gap-1.5 pt-2 border-t border-[#1E2942]">
                {activityDistributionData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-[#8E9BB0] font-medium">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-bold text-white">
                      {item.value} km <span className="text-[#8E9BB0] text-[10px]">({item.percent}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Grid de Análise Calórica (Fase 5) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            {/* Gráfico 6: Gasto Calórico Semanal Acumulado (kcal) */}
            <div
              data-testid="chart-weekly-calories"
              className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    Gasto Calórico Semanal Acumulado (kcal)
                  </h4>
                  <p className="text-xs text-[#8E9BB0] mt-0.5">
                    Calorias ativas queimadas durante as sessões de cada semana (Compêndio 2024).
                  </p>
                </div>
              </div>

              {isMounted ? (
                <div className="h-64 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                    <BarChart
                      data={weeklyCaloriesChartData}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="#1E2942" />
                      <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} stroke="#8E9BB0" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#8E9BB0" unit=" kcal" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0B1020] text-white text-xs p-3 rounded-xl shadow-xl border border-[#1E2942] space-y-1">
                                <span className="font-bold text-[#8E9BB0] block">
                                  Semana de {data.weekLabel}
                                </span>
                                <div className="text-sm font-black text-amber-400">
                                  {data.activeCalories} kcal ativas
                                </div>
                                <div className="text-[#8E9BB0] text-[11px]">
                                  {data.totalCalories} kcal totais • {data.sessionsCount} sessões
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="activeCalories" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 w-full animate-pulse bg-[#0B1020] rounded-2xl" />
              )}
            </div>

            {/* Gráfico 7: Distribuição de Calorias por Modalidade */}
            <div
              data-testid="chart-activity-calories"
              className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm"
            >
              <div className="mb-4">
                <h4 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  Calorias por Modalidade
                </h4>
                <p className="text-xs text-[#8E9BB0] mt-0.5">
                  Proporção de energia gasta em corrida contínua, tiros e caminhada.
                </p>
              </div>

              {activityCaloriesData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-[#8E9BB0]">
                  Sem dados calóricos no período
                </div>
              ) : isMounted ? (
                <div className="h-44 sm:h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={150}>
                    <PieChart>
                      <Pie
                        data={activityCaloriesData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {activityCaloriesData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-[#0B1020] text-white text-xs p-2.5 rounded-xl shadow-xl border border-[#1E2942]">
                                <span className="font-bold text-[#8E9BB0] block mb-0.5">
                                  {data.name}
                                </span>
                                <div className="text-sm font-black text-amber-400">
                                  {data.value} kcal ({data.percent}%)
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-44 w-full animate-pulse bg-[#0B1020] rounded-2xl" />
              )}

              {/* Legenda do Donut de Calorias */}
              <div className="grid grid-cols-1 gap-1.5 pt-2 border-t border-[#1E2942]">
                {activityCaloriesData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-[#8E9BB0] font-medium">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-bold text-white">
                      {item.value} kcal{" "}
                      <span className="text-[#8E9BB0] text-[10px]">({item.percent}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
