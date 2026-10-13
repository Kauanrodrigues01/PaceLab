"use client";

import React, { useMemo } from "react";
import { IntervalStage } from "@/types";
import { formatTime } from "@/lib/formatting/time";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Activity } from "lucide-react";

interface IntervalSpeedProfileChartProps {
  stages: IntervalStage[];
}

export function IntervalSpeedProfileChart({
  stages,
}: IntervalSpeedProfileChartProps) {
  // Transforma etapas em pontos temporais contínuos para gráfico de perfil escalonado
  const chartData = useMemo(() => {
    if (!stages || stages.length === 0) return [];

    let accumulatedSeconds = 0;
    const points: Array<{
      timeMinute: number;
      timeFormatted: string;
      speedKmh: number;
      stageName: string;
      stageType: string;
      paceFormatted: string;
    }> = [];

    const getStageLabel = (stage: IntervalStage) => {
      switch (stage.type) {
        case "warmup":
          return "Aquecimento";
        case "run":
          return `Tiro #${stage.index}`;
        case "walk":
          return `Recuperação #${stage.index}`;
        case "cooldown":
          return "Desaquecimento";
        default:
          return `Etapa #${stage.index}`;
      }
    };

    stages.forEach((stage) => {
      const startTime = accumulatedSeconds;
      const endTime = accumulatedSeconds + stage.durationSeconds;
      const stageName = getStageLabel(stage);

      // Ponto no início da etapa
      points.push({
        timeMinute: Number((startTime / 60).toFixed(2)),
        timeFormatted: formatTime(startTime),
        speedKmh: stage.speedKmh,
        stageName,
        stageType: stage.type,
        paceFormatted: stage.paceFormatted,
      });

      // Ponto no fim da etapa (mantém a mesma velocidade para criar o degrau)
      points.push({
        timeMinute: Number((endTime / 60).toFixed(2)),
        timeFormatted: formatTime(endTime),
        speedKmh: stage.speedKmh,
        stageName,
        stageType: stage.type,
        paceFormatted: stage.paceFormatted,
      });

      accumulatedSeconds = endTime;
    });

    return points;
  }, [stages]);

  if (stages.length === 0) return null;

  return (
    <div
      data-testid="interval-speed-profile-chart"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Perfil de Velocidade da Sessão
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                Linha do Tempo
              </span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Alternância de intensidade entre aquecimento, tiros e recuperações.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            Tiros Rápidos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            Recuperação / Aquec.
          </span>
        </div>
      </div>

      <div className="h-56 sm:h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} />
            <XAxis
              dataKey="timeMinute"
              tick={{ fontSize: 10 }}
              stroke="#94a3b8"
              unit=" min"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              stroke="#94a3b8"
              unit=" km/h"
              domain={[0, "auto"]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-slate-900/90 backdrop-blur-md text-white text-xs p-3 rounded-2xl shadow-2xl border border-slate-700/80 space-y-1">
                      <span className="font-bold text-slate-300 block">
                        {data.stageName} ({data.timeFormatted})
                      </span>
                      <div className="text-base font-black text-purple-400 font-mono">
                        {data.speedKmh} km/h
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Pace estimado: {data.paceFormatted} /km
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="stepAfter"
              dataKey="speedKmh"
              stroke="#8b5cf6"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#speedGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
