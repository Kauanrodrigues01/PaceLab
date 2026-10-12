"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  TrainingSession,
  TimeRangePreset,
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

export function TrainingEvolutionDashboard({
  trainings,
}: TrainingEvolutionDashboardProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangePreset>("90d");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ─── 1. Filtragem por Período ────────────────────────────────────────────────
  const filteredTrainings = useMemo(() => {
    if (trainings.length === 0) return [];

    const now = new Date();
    const nowTime = now.getTime();

    return trainings
      .filter((t) => {
        const tDate = parseSafeDate(t.sessionDate);
        if (!tDate) return false;
        const diffMs = nowTime - tDate.getTime();

        switch (timeRange) {
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
  }, [trainings, timeRange]);

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
      };
    }

    let totalKm = 0;
    let totalDurationSeconds = 0;
    let totalLoad = 0;
    let longestRunKm = 0;
    let rpeSum = 0;
    let rpeCount = 0;

    filteredTrainings.forEach((t) => {
      const km = t.distanceKm || 0;
      const dur = t.durationSeconds || 0;
      totalKm += km;
      totalDurationSeconds += dur;

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
      .filter((t) => t.distanceKm > 0 && t.durationSeconds > 0)
      .map((t, idx) => {
        const d = parseSafeDate(t.sessionDate);
        const dateLabel = d
          ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
          : `#${idx + 1}`;

        return {
          id: t.id,
          dateLabel,
          distanceKm: t.distanceKm,
          paceSeconds: t.paceSeconds,
          paceFormatted: t.paceFormatted,
          activityType: t.activityType,
          activityLabel: ACTIVITY_LABELS[t.activityType] || "Corrida",
        };
      });
  }, [filteredTrainings]);

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
      {/* ─── Barra Superior de Controle do Filtro Temporal ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Análise e Periodização de Treinamento
          </span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Métricas de carga, eficiência de pace e distribuição de esforço.
          </p>
        </div>

        {/* Seletor de Período */}
        <div
          data-testid="filter-time-range"
          className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80"
        >
          <button
            type="button"
            onClick={() => setTimeRange("30d")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeRange === "30d"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            30 dias
          </button>
          <button
            type="button"
            onClick={() => setTimeRange("90d")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeRange === "90d"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            90 dias
          </button>
          <button
            type="button"
            onClick={() => setTimeRange("year")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeRange === "year"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Ano Atual
          </button>
          <button
            type="button"
            onClick={() => setTimeRange("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              timeRange === "all"
                ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Tudo
          </button>
        </div>
      </div>

      {/* ─── Cards de KPIs Avançados do Período ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* 1. Volume Total */}
        <div
          data-testid="kpi-total-volume"
          className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span>Volume Total</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {metrics.totalKm} <span className="text-xs font-normal text-slate-400">km</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {metrics.totalSessions} {metrics.totalSessions === 1 ? "sessão" : "sessões"}
          </p>
        </div>

        {/* 2. Tempo em Movimento */}
        <div
          data-testid="kpi-total-time"
          className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
            <span>Tempo Total</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {formattedTotalTime}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Em movimento</p>
        </div>

        {/* 3. Pace Médio Ponderado */}
        <div
          data-testid="kpi-avg-pace"
          className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Pace Médio</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {metrics.avgPaceFormatted} <span className="text-xs font-normal text-slate-400">/km</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Ponderado por volume</p>
        </div>

        {/* 4. Carga de Treino (TRIMP) */}
        <div
          data-testid="kpi-training-load"
          className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            <HeartPulse className="w-3.5 h-3.5 text-purple-500" />
            <span>Carga Total</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {metrics.totalTrainingLoad}{" "}
            <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">TRIMP (Duração × RPE)</p>
        </div>

        {/* 5. Maior Longão */}
        <div
          data-testid="kpi-longest-run"
          className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 sm:col-span-1"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
            <Award className="w-3.5 h-3.5 text-rose-500" />
            <span>Maior Sessão</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {metrics.longestRunKm} <span className="text-xs font-normal text-slate-400">km</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Longão do período</p>
        </div>
      </div>

      {/* ─── Estado Vazio se não houver dados no período ─── */}
      {filteredTrainings.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl space-y-3">
          <Activity className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Nenhum treino registrado no período selecionado
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
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
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    Volume Semanal Acumulado (km)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit="km" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-800 space-y-1">
                                <span className="font-bold text-slate-300 block">
                                  Semana de {data.weekLabel}
                                </span>
                                <div className="text-sm font-black text-blue-400">
                                  {data.distanceKm} km rodados
                                </div>
                                <div className="text-slate-400 text-[11px]">
                                  {data.sessionsCount} sessões • {data.durationFormatted}
                                </div>
                                <div className="text-slate-400 text-[11px]">
                                  Pace médio: {data.avgPaceFormatted} /km
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="distanceKm" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
              )}
            </div>

            {/* Gráfico 2: Curva de Evolução do Pace */}
            <div
              data-testid="chart-pace-evolution"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-500" />
                    Evolução do Pace por Sessão
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Ritmo médio (min/km) ao longo do tempo. Valores menores = maior velocidade.
                  </p>
                </div>
              </div>

              {isMounted ? (
                <div className="h-64 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                    <LineChart
                      data={paceChartData}
                      margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis
                        tickFormatter={(sec: number) => formatPace(sec)}
                        tick={{ fontSize: 11 }}
                        stroke="#94a3b8"
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-800 space-y-1">
                                <span className="font-bold text-slate-300 block">
                                  {data.dateLabel} • {data.activityLabel}
                                </span>
                                <div className="text-sm font-black text-indigo-400">
                                  Pace: {data.paceFormatted} /km
                                </div>
                                <div className="text-slate-400 text-[11px]">
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
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: "#6366f1", strokeWidth: 1.5, stroke: "#fff" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
              )}
            </div>
          </div>

          {/* ─── Grid de Gráficos Secundários (Linha 2) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Gráfico 3: Carga de Treino & Monitor de Fadiga (TRIMP) */}
            <div
              data-testid="chart-training-load"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm lg:col-span-1"
            >
              <div className="mb-4">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-purple-500" />
                  Carga de Treinamento (TRIMP)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white text-xs p-2.5 rounded-xl shadow-xl border border-slate-800">
                                <span className="text-slate-400 block mb-0.5">
                                  Semana {data.weekLabel}
                                </span>
                                <div className="text-sm font-bold text-purple-400">
                                  {data.loadScore} pontos de carga
                                </div>
                                <span className="text-[10px] text-slate-400">
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
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorLoad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
              )}
            </div>

            {/* Gráfico 4: Distribuição de Esforço RPE (Polarização) */}
            <div
              data-testid="chart-rpe-distribution"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm lg:col-span-1"
            >
              <div className="mb-4">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Pirâmide de Intensidade (RPE)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Distribuição de sessões nas zonas aeróbia e anaeróbia.
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                {rpeDistributionData.map((item) => (
                  <div key={item.zone} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-700 dark:text-slate-300">
                        {item.zone} <span className="text-slate-400 text-[10px]">({item.range})</span>
                      </span>
                      <span className="text-slate-900 dark:text-slate-100 font-bold">
                        {item.percent}%{" "}
                        <span className="text-slate-400 font-normal text-[10px]">
                          ({item.count})
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
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

                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
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
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm lg:col-span-1"
            >
              <div className="mb-4">
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-500" />
                  Volume por Modalidade
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Divisão de quilômetros por tipo de locomoção.
                </p>
              </div>

              {activityDistributionData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-slate-400">
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
                              <div className="bg-slate-900 text-white text-xs p-2.5 rounded-xl shadow-xl border border-slate-800">
                                <span className="font-bold text-slate-300 block mb-0.5">
                                  {data.name}
                                </span>
                                <div className="text-sm font-black text-amber-400">
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
                <div className="h-44 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
              )}

              {/* Legenda do Donut */}
              <div className="grid grid-cols-1 gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                {activityDistributionData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-slate-700 dark:text-slate-300 font-medium">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {item.value} km <span className="text-slate-400 text-[10px]">({item.percent}%)</span>
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
