"use client";

import React, { useState, useEffect, useMemo } from "react";
import { TafAttempt, TrainingSession, TafGoalConfig } from "@/types";
import {
  getPersonalRecord,
  processTafAttempts,
  getWeeklyVolume,
  parseSafeDate,
} from "@/lib/math/evolution";
import { formatPace, formatTime } from "@/lib/formatting/time";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  Trophy,
  Target,
  Flame,
  Calendar,
  TrendingUp,
  TrendingDown,
  Info,
  Clock,
  Sparkles,
} from "lucide-react";

interface EvolutionDashboardProps {
  attempts: TafAttempt[];
  trainings: TrainingSession[];
  goal: TafGoalConfig;
}

// Cores por modalidade para o Gráfico B
const ACTIVITY_COLORS: Record<string, string> = {
  corrida_continua: "#3b82f6", // azul
  corrida_intervalada: "#f59e0b", // âmbar
  caminhada: "#10b981", // verde
};

const ACTIVITY_LABELS: Record<string, string> = {
  corrida_continua: "Corrida Contínua",
  corrida_intervalada: "Intervalado / Tiros",
  caminhada: "Caminhada",
};

export function EvolutionDashboard({
  attempts,
  trainings,
  goal,
}: EvolutionDashboardProps) {
  // Evita erros de hidratação do ResponsiveContainer do Recharts no Next.js
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const targetDistance = goal.targetDistanceMeters || 2300;

  // ─── 1. KPIs do Topo ────────────────────────────────────────────────────────
  const personalRecord12m = useMemo(
    () => getPersonalRecord(attempts, 720),
    [attempts]
  );

  const processedAttempts = useMemo(
    () => processTafAttempts(attempts, targetDistance),
    [attempts, targetDistance]
  );

  // Progresso em relação à meta
  const bestDistance = personalRecord12m ? personalRecord12m.distanceMeters : 0;
  const progressPercent = Math.min(
    100,
    Number(((bestDistance / targetDistance) * 100).toFixed(1))
  );
  const deficitFromTarget = Math.max(0, targetDistance - bestDistance);
  const isTargetAchieved = bestDistance >= targetDistance;

  // Volume Semanal (Semana atual vs Semana anterior)
  const weeklyData = useMemo(
    () => getWeeklyVolume(trainings, attempts),
    [trainings, attempts]
  );

  const currentWeekVol =
    weeklyData.length > 0 ? weeklyData[weeklyData.length - 1].distanceKm : 0;
  const previousWeekVol =
    weeklyData.length > 1 ? weeklyData[weeklyData.length - 2].distanceKm : 0;
  const weekVolumeDelta = Number((currentWeekVol - previousWeekVol).toFixed(2));

  // ─── 2. Dados Formatados para os 5 Gráficos ─────────────────────────────────

  // Gráfico A: Testes de 12 minutos ordenados cronologicamente
  const chartATestsData = useMemo(() => {
    const tests12m = processedAttempts
      .filter((a) => (a.targetDurationSeconds || 720) === 720)
      .slice()
      .reverse(); // cronológico (mais antigo para mais recente)

    return tests12m.map((att, idx) => {
      const d = parseSafeDate(att.testDate);
      const label = d
        ? `${String(d.getDate()).padStart(2, "0")}/${String(
            d.getMonth() + 1
          ).padStart(2, "0")}`
        : `T${idx + 1}`;

      return {
        id: att.id,
        index: idx + 1,
        dateLabel: label,
        fullDate: d ? d.toLocaleDateString("pt-BR") : "",
        distanceMeters: att.distanceMeters,
        paceFormatted: att.paceFormatted,
        speedKmh: att.speedKmh,
        isPersonalRecord: att.isPersonalRecord,
      };
    });
  }, [processedAttempts]);

  // Gráfico B: Distância por Treino
  const chartBTrainingsData = useMemo(() => {
    const sorted = [...trainings].sort((a, b) => {
      const da = parseSafeDate(a.sessionDate)?.getTime() ?? 0;
      const db = parseSafeDate(b.sessionDate)?.getTime() ?? 0;
      return da - db;
    });

    return sorted.map((t, idx) => {
      const d = parseSafeDate(t.sessionDate);
      const label = d
        ? `${String(d.getDate()).padStart(2, "0")}/${String(
            d.getMonth() + 1
          ).padStart(2, "0")}`
        : `#${idx + 1}`;

      return {
        id: t.id,
        index: idx + 1,
        dateLabel: label,
        distanceKm: Number(t.distanceKm.toFixed(2)),
        activityType: t.activityType,
        color: ACTIVITY_COLORS[t.activityType] || ACTIVITY_COLORS.corrida_continua,
        activityLabel: ACTIVITY_LABELS[t.activityType] || "Corrida Contínua",
        paceFormatted: t.paceFormatted,
        durationFormatted: formatTime(t.durationSeconds),
      };
    });
  }, [trainings]);

  // Gráfico C: Pace Médio por Treino ao longo do tempo (apenas treinos com pace válido)
  const chartCPaceData = useMemo(() => {
    return chartBTrainingsData
      .filter((t) => t.distanceKm > 0)
      .map((t) => {
        // Encontra o treino original para pegar paceSeconds
        const original = trainings.find((orig) => orig.id === t.id);
        const paceSec = original ? original.paceSeconds : 300;
        return {
          id: t.id,
          dateLabel: t.dateLabel,
          paceSeconds: paceSec,
          paceFormatted: t.paceFormatted,
          distanceKm: t.distanceKm,
          activityLabel: t.activityLabel,
        };
      });
  }, [chartBTrainingsData, trainings]);

  // Gráfico D: Volume Semanal (acumulado de km por semana)
  const chartDWeeklyData = useMemo(() => {
    return weeklyData.map((w) => ({
      weekLabel: w.weekLabel,
      distanceKm: w.distanceKm,
      sessionsCount: w.sessionsCount,
    }));
  }, [weeklyData]);

  // Gráfico E: Evolução dos Recordes (Step Line comparando recorde acumulado vs tentativas)
  const chartERecordStepsData = useMemo(() => {
    const tests12m = processedAttempts
      .filter((a) => (a.targetDurationSeconds || 720) === 720)
      .slice()
      .reverse();

    let maxSoFar = 0;
    return tests12m.map((att, idx) => {
      const d = parseSafeDate(att.testDate);
      const label = d
        ? `${String(d.getDate()).padStart(2, "0")}/${String(
            d.getMonth() + 1
          ).padStart(2, "0")}`
        : `T${idx + 1}`;

      if (att.distanceMeters > maxSoFar) {
        maxSoFar = att.distanceMeters;
      }

      return {
        index: idx + 1,
        dateLabel: label,
        tentativaMeters: att.distanceMeters,
        recordeAcumulado: maxSoFar,
        paceFormatted: att.paceFormatted,
      };
    });
  }, [processedAttempts]);

  return (
    <div data-testid="evolution-dashboard" className="space-y-6">
      {/* ─── Topo: 4 Cards de Indicadores (KPIs) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Recorde Pessoal 12 Min */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Recorde 12 Min
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {personalRecord12m
              ? `${personalRecord12m.distanceMeters.toLocaleString("pt-BR")} m`
              : "--"}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            {personalRecord12m ? (
              <>
                <span>Pace {personalRecord12m.paceFormatted}/km</span>
                <span>•</span>
                <span>{personalRecord12m.speedKmh.toFixed(1)} km/h</span>
              </>
            ) : (
              "Nenhum teste de 12 min registrado"
            )}
          </div>
        </div>

        {/* KPI 2: Status da Meta e Barra de Progresso */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Meta ({targetDistance} m)
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                isTargetAchieved
                  ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600"
                  : "bg-blue-100 dark:bg-blue-950/80 text-blue-600"
              }`}
            >
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-2xl font-black ${
              isTargetAchieved
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {isTargetAchieved
              ? "Aprovado! 🎉"
              : personalRecord12m
              ? `Faltam ${deficitFromTarget} m`
              : `Alvo: ${targetDistance} m`}
          </div>

          {/* Barra de Progresso em % */}
          <div className="mt-2">
            <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
              <span>{progressPercent}% alcançado</span>
              <span>{bestDistance} / {targetDistance} m</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isTargetAchieved ? "bg-emerald-500" : "bg-blue-600"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 3: Volume Semanal (Atual vs Anterior) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Volume da Semana
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {currentWeekVol.toFixed(1)} km
          </div>
          <div className="text-xs mt-1 flex items-center gap-1 font-semibold">
            {weeklyData.length > 1 ? (
              weekVolumeDelta >= 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  +{weekVolumeDelta} km vs semana anterior
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5">
                  <TrendingDown className="w-3.5 h-3.5" />
                  {weekVolumeDelta} km vs semana anterior
                </span>
              )
            ) : (
              <span className="text-slate-400 font-normal">
                Primeira semana de registros
              </span>
            )}
          </div>
        </div>

        {/* KPI 4: Total de Registros */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total de Atividades
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {attempts.length + trainings.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {attempts.length} simulados TAF • {trainings.length} treinos no diário
          </div>
        </div>
      </div>

      {/* ─── Grid Principal de Gráficos ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Gráfico A: Testes de 12 Minutos (Meta e Recordes) ─── */}
        <div
          data-testid="chart-a-container"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Gráfico A: Evolução nos Testes de 12 Minutos
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Distância percorrida por simulado e linha de corte oficial ({targetDistance} m).
              </p>
            </div>
          </div>

          {chartATestsData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Trophy className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Nenhum simulado de 12 minutos registrado
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                Cadastre seus testes na aba &quot;Testes de 12 Min&quot; para visualizar sua curva
                de desempenho e distância para a meta.
              </p>
            </div>
          ) : isMounted ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                <AreaChart
                  data={chartATestsData}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorDistance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                  />
                  <YAxis
                    domain={[
                      (dataMin: number) => Math.max(0, Math.floor(dataMin / 100) * 100 - 200),
                      (dataMax: number) => Math.max(targetDistance + 100, Math.ceil(dataMax / 100) * 100 + 100),
                    ]}
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    unit="m"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-800">
                            <span className="font-bold text-slate-300 block mb-1">
                              {data.fullDate || data.dateLabel}
                            </span>
                            <div className="text-sm font-black text-blue-400">
                              {data.distanceMeters.toLocaleString("pt-BR")} metros
                            </div>
                            <div className="text-slate-300 text-[11px] mt-0.5">
                              Pace: {data.paceFormatted}/km • {data.speedKmh.toFixed(1)} km/h
                            </div>
                            {data.isPersonalRecord && (
                              <span className="mt-1.5 inline-block text-[10px] font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                                🏆 Recorde Pessoal
                              </span>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine
                    y={targetDistance}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={{
                      value: `Meta: ${targetDistance}m`,
                      fill: "#10b981",
                      fontSize: 11,
                      position: "top",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="distanceMeters"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorDistance)"
                    dot={{ r: 5, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 7 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
          )}
        </div>

        {/* ─── Gráfico B: Distância por Treino ─── */}
        <div
          data-testid="chart-b-container"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Flame className="w-5 h-5 text-blue-500" />
                Gráfico B: Distância por Sessão de Treino
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Quilometragem de cada treino com cores por modalidade esportiva.
              </p>
            </div>
          </div>

          {chartBTrainingsData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Flame className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Nenhum treino registrado no diário
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                Registre suas corridas, caminhadas e tiros na aba &quot;Diário de Treinos&quot;
                para visualizar a barra de volume por sessão.
              </p>
            </div>
          ) : isMounted ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                <BarChart
                  data={chartBTrainingsData}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    unit="km"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-800">
                            <span className="font-bold text-slate-300 block mb-1">
                              {data.dateLabel} • {data.activityLabel}
                            </span>
                            <div className="text-sm font-black text-blue-400">
                              {data.distanceKm} km
                            </div>
                            <div className="text-slate-300 text-[11px] mt-0.5">
                              Tempo: {data.durationFormatted} • Pace: {data.paceFormatted}/km
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="distanceKm" radius={[6, 6, 0, 0]}>
                    {chartBTrainingsData.map((entry) => (
                      <Cell key={`cell-${entry.id}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
          )}

          {/* Legenda de cores das modalidades */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-3 flex-wrap text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Corrida
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Intervalado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Caminhada
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Simulado TAF
            </span>
          </div>
        </div>

        {/* ─── Gráfico C: Pace Médio por Treino ─── */}
        <div
          data-testid="chart-c-container"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" />
                Gráfico C: Evolução do Pace Médio por Treino
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Velocidade de corrida ao longo do tempo (minutos por quilômetro).
              </p>
            </div>
          </div>

          {/* Aviso Metodológico do Pace */}
          <div className="mb-4 bg-blue-50/80 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-700 p-2.5 rounded-xl flex items-center gap-2 text-[11px] text-blue-700 dark:text-blue-300 font-medium">
            <Info className="w-4 h-4 shrink-0 text-blue-500" />
            <span>
              💡 <strong>Regra do Pace:</strong> Valores menores indicam maior velocidade (tempo
              menor gasto para percorrer cada km).
            </span>
          </div>

          {chartCPaceData.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Clock className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Sem dados suficientes de pace
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                Adicione sessões com distância e tempo no diário para acompanhar sua evolução de
                ritmo.
              </p>
            </div>
          ) : isMounted ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                <LineChart
                  data={chartCPaceData}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                  />
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
                          <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-800">
                            <span className="font-bold text-slate-300 block mb-1">
                              {data.dateLabel} • {data.activityLabel}
                            </span>
                            <div className="text-sm font-black text-indigo-400">
                              Pace: {data.paceFormatted} /km
                            </div>
                            <div className="text-slate-400 text-[11px] mt-0.5">
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
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#6366f1", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
          )}
        </div>

        {/* ─── Gráfico D: Volume Semanal ─── */}
        <div
          data-testid="chart-d-container"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-500" />
                Gráfico D: Volume Semanal Acumulado (km)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Quilômetros totais rodados por semana do calendário (Segunda a Domingo).
              </p>
            </div>
          </div>

          {chartDWeeklyData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Sem volume semanal acumulado
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                Conforme você registrar treinos e simulados, o PaceLab somará o volume semanal
                para monitorar sua carga de treino.
              </p>
            </div>
          ) : isMounted ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                <BarChart
                  data={chartDWeeklyData}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis
                    dataKey="weekLabel"
                    tick={{ fontSize: 10 }}
                    stroke="#94a3b8"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#94a3b8"
                    unit="km"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-800">
                            <span className="font-bold text-slate-300 block mb-1">
                              Semana: {data.weekLabel}
                            </span>
                            <div className="text-sm font-black text-emerald-400">
                              {data.distanceKm} km rodados
                            </div>
                            <div className="text-slate-400 text-[11px] mt-0.5">
                              {data.sessionsCount} sessões registradas
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="distanceKm"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
          )}
        </div>
      </div>

      {/* ─── Gráfico E: Degrau dos Recordes Históricos (Largura Total) ─── */}
      <div
        data-testid="chart-e-container"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Gráfico E: Evolução em Degrau dos Recordes Pessoais (12 Min)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comparação da linha de recorde histórico acumulado contra as tentativas individuais.
            </p>
          </div>
        </div>

        {chartERecordStepsData.length < 2 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <Sparkles className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Necessário ao menos 2 simulados de 12 minutos
            </p>
            <p className="text-[11px] text-slate-400 max-w-sm mt-1">
              {chartERecordStepsData.length === 1
                ? "Você possui 1 simulado registrado. Registre seu segundo teste para acompanhar a curva de degraus de superação do recorde!"
                : "Cadastre seus simulados para visualizar a linha contínua de recordes pessoais."}
            </p>
          </div>
        ) : isMounted ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
              <LineChart
                data={chartERecordStepsData}
                margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                />
                <YAxis
                  domain={[
                    (dataMin: number) => Math.max(0, Math.floor(dataMin / 100) * 100 - 100),
                    (dataMax: number) => Math.ceil(dataMax / 100) * 100 + 100,
                  ]}
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                  unit="m"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white text-xs p-3 rounded-xl shadow-xl border border-slate-800">
                          <span className="font-bold text-slate-300 block mb-1">
                            Simulado em {data.dateLabel}
                          </span>
                          <div className="text-sm font-black text-amber-400">
                            Recorde Acumulado: {data.recordeAcumulado} m
                          </div>
                          <div className="text-slate-300 text-[11px] mt-0.5">
                            Distância do Teste: {data.tentativaMeters} m (Pace {data.paceFormatted}/km)
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {/* Linha de degrau para o Recorde Pessoal acumulado */}
                <Line
                  type="stepAfter"
                  dataKey="recordeAcumulado"
                  name="Recorde Pessoal Acumulado"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={false}
                />
                {/* Pontos das tentativas individuais */}
                <Line
                  type="monotone"
                  dataKey="tentativaMeters"
                  name="Tentativa Individual"
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-72 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />
        )}

        {/* Legenda Explicativa do Gráfico E */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-6 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-amber-500" /> Linha Degrau: Recorde Histórico Acumulado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Pontos: Desempenho de Cada Teste
          </span>
        </div>
      </div>
    </div>
  );
}
