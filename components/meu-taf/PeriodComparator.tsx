"use client";

import React, { useState, useMemo } from "react";
import { TrainingSession, TafAttempt } from "@/types";
import { comparePeriods } from "@/lib/math/evolution";
import {
  GitCompare,
  Calendar,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Gauge,
  Flame,
  Trophy,
  Activity,
  Clock,
  Sparkles,
} from "lucide-react";

interface PeriodComparatorProps {
  trainings: TrainingSession[];
  attempts: TafAttempt[];
  targetDurationSeconds?: number;
}

export function PeriodComparator({
  trainings,
  attempts,
  targetDurationSeconds = 720,
}: PeriodComparatorProps) {
  // Configuração inicial de datas padrão (Últimos 30 dias vs 30 dias anteriores)
  const [dates, setDates] = useState(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const d30 = new Date(now);
    d30.setDate(now.getDate() - 30);
    const date30Ago = d30.toISOString().slice(0, 10);

    const d31 = new Date(now);
    d31.setDate(now.getDate() - 31);
    const date31Ago = d31.toISOString().slice(0, 10);

    const d60 = new Date(now);
    d60.setDate(now.getDate() - 60);
    const date60Ago = d60.toISOString().slice(0, 10);

    return {
      periodAStart: date60Ago,
      periodAEnd: date31Ago,
      periodBStart: date30Ago,
      periodBEnd: today,
    };
  });

  // Atalhos rápidos de períodos
  const handleShortcut = (type: "14d" | "30d" | "month") => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    if (type === "14d") {
      const d14 = new Date(now);
      d14.setDate(now.getDate() - 14);
      const d15 = new Date(now);
      d15.setDate(now.getDate() - 15);
      const d28 = new Date(now);
      d28.setDate(now.getDate() - 28);

      setDates({
        periodAStart: d28.toISOString().slice(0, 10),
        periodAEnd: d15.toISOString().slice(0, 10),
        periodBStart: d14.toISOString().slice(0, 10),
        periodBEnd: today,
      });
    } else if (type === "30d") {
      const d30 = new Date(now);
      d30.setDate(now.getDate() - 30);
      const d31 = new Date(now);
      d31.setDate(now.getDate() - 31);
      const d60 = new Date(now);
      d60.setDate(now.getDate() - 60);

      setDates({
        periodAStart: d60.toISOString().slice(0, 10),
        periodAEnd: d31.toISOString().slice(0, 10),
        periodBStart: d30.toISOString().slice(0, 10),
        periodBEnd: today,
      });
    } else if (type === "month") {
      const startCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const endPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
        .toISOString()
        .slice(0, 10);
      const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toISOString()
        .slice(0, 10);

      setDates({
        periodAStart: startPrevMonth,
        periodAEnd: endPrevMonth,
        periodBStart: startCurrentMonth,
        periodBEnd: today,
      });
    }
  };

  // Cálculo comparativo através do motor matemático
  const comparison = useMemo(() => {
    try {
      return comparePeriods(
        { startDate: dates.periodAStart, endDate: dates.periodAEnd },
        { startDate: dates.periodBStart, endDate: dates.periodBEnd },
        trainings,
        attempts,
        targetDurationSeconds
      );
    } catch {
      return null;
    }
  }, [dates, trainings, attempts, targetDurationSeconds]);

  if (!comparison) {
    return null;
  }

  const { periodA, periodB } = comparison;

  return (
    <div data-testid="period-comparator" className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-[#B7F34A]" />
              Comparador de Períodos de Treinamento
            </h3>
            <p className="text-xs text-[#8E9BB0] mt-0.5">
              Compare a sua evolução de volume, ritmo de corrida e simulados entre duas faixas de datas.
            </p>
          </div>

          {/* Atalhos Rápidos */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-[#8E9BB0] mr-1">
              Atalhos:
            </span>
            <button
              type="button"
              onClick={() => handleShortcut("14d")}
              className="text-xs px-2.5 py-1 rounded-xl bg-[#0B1020] hover:bg-[#1E2942] border border-[#1E2942] font-semibold text-[#8E9BB0] hover:text-white transition-colors"
            >
              Últimos 14 vs 14 dias
            </button>
            <button
              type="button"
              onClick={() => handleShortcut("30d")}
              className="text-xs px-2.5 py-1 rounded-xl bg-[#0B1020] hover:bg-[#1E2942] border border-[#1E2942] font-semibold text-[#8E9BB0] hover:text-white transition-colors"
            >
              Últimos 30 vs 30 dias
            </button>
            <button
              type="button"
              onClick={() => handleShortcut("month")}
              className="text-xs px-2.5 py-1 rounded-xl bg-[#0B1020] hover:bg-[#1E2942] border border-[#1E2942] font-semibold text-[#8E9BB0] hover:text-white transition-colors"
            >
              Este Mês vs Anterior
            </button>
          </div>
        </div>

        {/* Seletores de Datas dos Períodos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#0B1020]/60 border border-[#1E2942]">
          {/* Período A (Base / Passado) */}
          <div>
            <span className="text-xs font-bold text-white block mb-2 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#8E9BB0]" />
              Período A (Base de Comparação / Anterior)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-[#8E9BB0] block mb-1">
                  Data Inicial
                </label>
                <input
                  type="date"
                  value={dates.periodAStart}
                  onChange={(e) =>
                    setDates((prev) => ({ ...prev, periodAStart: e.target.value }))
                  }
                  className="w-full h-10 px-2.5 text-xs font-medium rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:border-[#B7F34A]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#8E9BB0] block mb-1">
                  Data Final
                </label>
                <input
                  type="date"
                  value={dates.periodAEnd}
                  onChange={(e) =>
                    setDates((prev) => ({ ...prev, periodAEnd: e.target.value }))
                  }
                  className="w-full h-10 px-2.5 text-xs font-medium rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:border-[#B7F34A]"
                />
              </div>
            </div>
          </div>

          {/* Período B (Atual / Comparado) */}
          <div>
            <span className="text-xs font-bold text-[#B7F34A] block mb-2 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B7F34A]" />
              Período B (Período Recente / Comparado)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-[#8E9BB0] block mb-1">
                  Data Inicial
                </label>
                <input
                  type="date"
                  value={dates.periodBStart}
                  onChange={(e) =>
                    setDates((prev) => ({ ...prev, periodBStart: e.target.value }))
                  }
                  className="w-full h-10 px-2.5 text-xs font-medium rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:border-[#B7F34A]"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-[#8E9BB0] block mb-1">
                  Data Final
                </label>
                <input
                  type="date"
                  value={dates.periodBEnd}
                  onChange={(e) =>
                    setDates((prev) => ({ ...prev, periodBEnd: e.target.value }))
                  }
                  className="w-full h-10 px-2.5 text-xs font-medium rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:border-[#B7F34A]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Aviso Metodológico se Amostragem for Baixa (< 3 treinos) */}
      {(periodA.hasLowSampleWarning || periodB.hasLowSampleWarning) && (
        <div
          data-testid="low-sample-warning"
          className="bg-amber-950/40 border border-amber-900/60 p-4 rounded-2xl flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200 leading-relaxed">
            <span className="font-bold block mb-0.5">
              Aviso Metodológico de Amostragem Reduzida
            </span>
            Um ou ambos os períodos selecionados possuem menos de 3 atividades registradas
            (Período A: {periodA.totalSessions} sessões; Período B: {periodB.totalSessions} sessões).
            Comparações estatísticas com baixa amostragem são orientativas e podem apresentar
            distorções em médias ponderadas.
          </div>
        </div>
      )}

      {/* Síntese Analítica do PaceLab */}
      <div className="bg-[#0B1020] border border-[#1E2942] rounded-3xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-[#B7F34A]" />
          <h4 className="font-bold text-xs uppercase tracking-wider text-[#B7F34A]">
            Diagnóstico de Evolução do Período
          </h4>
        </div>
        <p className="text-xs sm:text-sm text-white leading-relaxed font-medium">
          {comparison.summaryText}
        </p>
      </div>

      {/* Grade de Comparação de Métricas Lado a Lado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Métrica 1: Volume Total (km) */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8E9BB0] uppercase tracking-wider">
              Volume Total
            </span>
            <Flame className="w-4 h-4 text-[#B7F34A]" />
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-[11px] text-[#8E9BB0] block">Período A</span>
              <span className="text-lg font-bold text-white">
                {periodA.totalDistanceKm} km
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-[#8E9BB0] block">Período B</span>
              <span className="text-xl font-black text-white">
                {periodB.totalDistanceKm} km
              </span>
            </div>
          </div>

          {/* Delta de Volume */}
          <div className="pt-2 border-t border-[#1E2942] flex items-center justify-between text-xs">
            <span className="text-[#8E9BB0]">Variação:</span>
            <span
              className={`font-bold flex items-center gap-1 ${
                comparison.deltaDistanceKm >= 0
                  ? "text-[#B7F34A]"
                  : "text-amber-400"
              }`}
            >
              {comparison.deltaDistanceKm >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {comparison.deltaDistanceKm >= 0 ? "+" : ""}
              {comparison.deltaDistanceKm} km ({comparison.deltaDistancePercent}%)
            </span>
          </div>
        </div>

        {/* Métrica 2: Pace Médio Ponderado */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8E9BB0] uppercase tracking-wider">
              Pace Médio
            </span>
            <Gauge className="w-4 h-4 text-[#B7F34A]" />
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-[11px] text-[#8E9BB0] block">Período A</span>
              <span className="text-lg font-bold text-white">
                {periodA.averagePaceFormatted}/km
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-[#8E9BB0] block">Período B</span>
              <span className="text-xl font-black text-[#B7F34A]">
                {periodB.averagePaceFormatted}/km
              </span>
            </div>
          </div>

          {/* Delta de Pace */}
          <div className="pt-2 border-t border-[#1E2942] flex items-center justify-between text-xs">
            <span className="text-[#8E9BB0]">Evolução do Ritmo:</span>
            <span
              className={`font-bold ${
                comparison.deltaPaceSeconds < 0
                  ? "text-[#B7F34A]"
                  : comparison.deltaPaceSeconds > 0
                  ? "text-amber-400"
                  : "text-[#8E9BB0]"
              }`}
            >
              {comparison.deltaPaceSeconds < 0
                ? `${Math.abs(comparison.deltaPaceSeconds)}s/km mais rápido ⚡`
                : comparison.deltaPaceSeconds > 0
                ? `+${comparison.deltaPaceSeconds}s/km mais lento`
                : "= Mesmo ritmo"}
            </span>
          </div>
        </div>

        {/* Métrica 3: Quantidade de Sessões */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8E9BB0] uppercase tracking-wider">
              Total de Sessões
            </span>
            <Calendar className="w-4 h-4 text-[#8E9BB0]" />
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-[11px] text-[#8E9BB0] block">Período A</span>
              <span className="text-lg font-bold text-white">
                {periodA.totalSessions} treinos
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-[#8E9BB0] block">Período B</span>
              <span className="text-xl font-black text-white">
                {periodB.totalSessions} treinos
              </span>
            </div>
          </div>

          {/* Delta de Sessões */}
          <div className="pt-2 border-t border-[#1E2942] flex items-center justify-between text-xs">
            <span className="text-[#8E9BB0]">Frequência:</span>
            <span
              className={`font-bold ${
                periodB.totalSessions - periodA.totalSessions >= 0
                  ? "text-[#B7F34A]"
                  : "text-amber-400"
              }`}
            >
              {periodB.totalSessions - periodA.totalSessions >= 0 ? "+" : ""}
              {periodB.totalSessions - periodA.totalSessions} sessões
            </span>
          </div>
        </div>

        {/* Métrica 4: Melhor Teste de TAF 12m */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8E9BB0] uppercase tracking-wider">
              Melhor Simulado TAF
            </span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-[11px] text-[#8E9BB0] block">Período A</span>
              <span className="text-lg font-bold text-white">
                {periodA.bestTafDistanceMeters
                  ? `${periodA.bestTafDistanceMeters} m`
                  : "--"}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-[#8E9BB0] block">Período B</span>
              <span className="text-xl font-black text-amber-400">
                {periodB.bestTafDistanceMeters
                  ? `${periodB.bestTafDistanceMeters} m`
                  : "--"}
              </span>
            </div>
          </div>

          {/* Delta de TAF */}
          <div className="pt-2 border-t border-[#1E2942] flex items-center justify-between text-xs">
            <span className="text-[#8E9BB0]">Diferença do Melhor:</span>
            <span className="font-bold">
              {comparison.deltaTafDistanceMeters !== null ? (
                comparison.deltaTafDistanceMeters > 0 ? (
                  <span className="text-[#B7F34A]">
                    +{comparison.deltaTafDistanceMeters} m
                  </span>
                ) : comparison.deltaTafDistanceMeters < 0 ? (
                  <span className="text-amber-400">
                    {comparison.deltaTafDistanceMeters} m
                  </span>
                ) : (
                  <span>= Mesma distância</span>
                )
              ) : (
                <span className="text-[#8E9BB0]">Sem testes para comparar</span>
              )}
            </span>
          </div>
        </div>

        {/* Métrica 5: Esforço Médio RPE */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8E9BB0] uppercase tracking-wider">
              Esforço Médio (RPE)
            </span>
            <Activity className="w-4 h-4 text-[#B7F34A]" />
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-[11px] text-[#8E9BB0] block">Período A</span>
              <span className="text-lg font-bold text-white">
                {periodA.averageRpe ? `RPE ${periodA.averageRpe}` : "--"}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-[#8E9BB0] block">Período B</span>
              <span className="text-xl font-black text-white">
                {periodB.averageRpe ? `RPE ${periodB.averageRpe}` : "--"}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#1E2942] flex items-center justify-between text-xs text-[#8E9BB0]">
            <span>Escala Subjetiva:</span>
            <span>1 (Muito Leve) a 10 (Exaustão)</span>
          </div>
        </div>

        {/* Métrica 6: Velocidade Média */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#8E9BB0] uppercase tracking-wider">
              Velocidade Média
            </span>
            <Clock className="w-4 h-4 text-[#B7F34A]" />
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-[11px] text-[#8E9BB0] block">Período A</span>
              <span className="text-lg font-bold text-white">
                {periodA.averageSpeedKmh} km/h
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-[#8E9BB0] block">Período B</span>
              <span className="text-xl font-black text-white">
                {periodB.averageSpeedKmh} km/h
              </span>
            </div>
          </div>

          {/* Delta de Velocidade */}
          {(() => {
            const deltaSpeedKmh = Number(
              (periodB.averageSpeedKmh - periodA.averageSpeedKmh).toFixed(2)
            );
            return (
              <div className="pt-2 border-t border-[#1E2942] flex items-center justify-between text-xs">
                <span className="text-[#8E9BB0]">Delta de Velocidade:</span>
                <span
                  className={`font-bold ${
                    deltaSpeedKmh >= 0
                      ? "text-[#B7F34A]"
                      : "text-amber-400"
                  }`}
                >
                  {deltaSpeedKmh >= 0 ? "+" : ""}
                  {deltaSpeedKmh} km/h
                </span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
