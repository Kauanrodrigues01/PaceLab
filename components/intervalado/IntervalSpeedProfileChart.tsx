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
import { Activity, Flame, ShieldAlert, Timer } from "lucide-react";

interface IntervalSpeedProfileChartProps {
  stages: IntervalStage[];
}

export function IntervalSpeedProfileChart({
  stages,
}: IntervalSpeedProfileChartProps) {
  // Transforma etapas em pontos temporais limpos sem coordenadas duplicadas no Recharts
  const { chartData, gradientStops, strokeStops, stats } = useMemo(() => {
    if (!stages || stages.length === 0) {
      return {
        chartData: [],
        gradientStops: [],
        strokeStops: [],
        stats: null,
      };
    }

    const totalDurationSeconds = stages.reduce(
      (acc, s) => acc + s.durationSeconds,
      0
    );

    let accumulatedSeconds = 0;
    let runTimeSeconds = 0;
    let recoveryTimeSeconds = 0;
    let maxSpeed = 0;
    let minSpeed = Infinity;

    const points: Array<{
      timeMinute: number;
      timeFormatted: string;
      speedKmh: number;
      stageName: string;
      stageType: string;
      paceFormatted: string;
    }> = [];

    const gradStops: Array<{ offset: string; color: string; opacity: number }> = [];
    const strkStops: Array<{ offset: string; color: string }> = [];

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

    stages.forEach((stage, idx) => {
      const startTime = accumulatedSeconds;
      const endTime = accumulatedSeconds + stage.durationSeconds;
      const stageName = getStageLabel(stage);

      if (stage.type === "run") {
        runTimeSeconds += stage.durationSeconds;
      } else {
        recoveryTimeSeconds += stage.durationSeconds;
      }

      if (stage.speedKmh > maxSpeed) maxSpeed = stage.speedKmh;
      if (stage.speedKmh < minSpeed) minSpeed = stage.speedKmh;

      // Ponto temporal único no início da etapa para gráfico do tipo stepAfter
      points.push({
        timeMinute: Number((startTime / 60).toFixed(2)),
        timeFormatted: formatTime(startTime),
        speedKmh: stage.speedKmh,
        stageName,
        stageType: stage.type,
        paceFormatted: stage.paceFormatted,
      });

      // Cálculo de posições percentuais para gradiente dinâmico por etapa
      const startPercent = totalDurationSeconds > 0 ? (startTime / totalDurationSeconds) * 100 : 0;
      const endPercent = totalDurationSeconds > 0 ? (endTime / totalDurationSeconds) * 100 : 100;
      const color = stage.type === "run" ? "#B7F34A" : "#8E9BB0";

      gradStops.push({
        offset: `${startPercent.toFixed(2)}%`,
        color,
        opacity: stage.type === "run" ? 0.75 : 0.35,
      });
      gradStops.push({
        offset: `${endPercent.toFixed(2)}%`,
        color,
        opacity: stage.type === "run" ? 0.75 : 0.35,
      });

      strkStops.push({
        offset: `${startPercent.toFixed(2)}%`,
        color,
      });
      strkStops.push({
        offset: `${endPercent.toFixed(2)}%`,
        color,
      });

      accumulatedSeconds = endTime;

      // No último estágio, adiciona o ponto final na duração total para fechar o degrau perfeitamente
      if (idx === stages.length - 1) {
        points.push({
          timeMinute: Number((endTime / 60).toFixed(2)),
          timeFormatted: formatTime(endTime),
          speedKmh: stage.speedKmh,
          stageName,
          stageType: stage.type,
          paceFormatted: stage.paceFormatted,
        });
      }
    });

    return {
      chartData: points,
      gradientStops: gradStops,
      strokeStops: strkStops,
      stats: {
        totalDurationSeconds,
        runTimeSeconds,
        recoveryTimeSeconds,
        maxSpeed,
        minSpeed: minSpeed === Infinity ? 0 : minSpeed,
        runCount: stages.filter((s) => s.type === "run").length,
      },
    };
  }, [stages]);

  if (stages.length === 0 || !stats) return null;

  return (
    <div
      data-testid="interval-speed-profile-chart"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm space-y-4"
    >
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#B7F34A]/10 text-[#B7F34A] flex items-center justify-center font-bold">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              Perfil de Velocidade da Sessão
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B7F34A]/20 text-[#B7F34A]">
                Degraus Contínuos
              </span>
            </h4>
            <p className="text-xs text-[#8E9BB0]">
              Visualização temporal fiel da alternância entre tiros em alta intensidade e recuperação.
            </p>
          </div>
        </div>

        {/* Legenda com as Cores Oficiais */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-white">
            <span className="w-3 h-3 rounded-md bg-[#B7F34A] inline-block shadow-xs shadow-[#B7F34A]/40" />
            Tiros ({stats.runCount}x)
          </span>
          <span className="flex items-center gap-1.5 text-[#8E9BB0]">
            <span className="w-3 h-3 rounded-md bg-[#8E9BB0] inline-block" />
            Recuperação / Aquec.
          </span>
        </div>
      </div>

      {/* Mini-Badges de Síntese da Sessão */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
        <div className="p-2.5 rounded-xl bg-[#0B1020]/60 border border-[#1E2942] flex items-center gap-2">
          <Flame className="w-4 h-4 text-[#B7F34A] shrink-0" />
          <div>
            <span className="text-[10px] text-[#8E9BB0] block uppercase font-bold tracking-wider">
              Velocidade Máx
            </span>
            <span className="font-mono font-bold text-white">
              {stats.maxSpeed.toFixed(1)} km/h
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#0B1020]/60 border border-[#1E2942] flex items-center gap-2">
          <Timer className="w-4 h-4 text-[#B7F34A] shrink-0" />
          <div>
            <span className="text-[10px] text-[#8E9BB0] block uppercase font-bold tracking-wider">
              Tempo em Tiros
            </span>
            <span className="font-mono font-bold text-white">
              {formatTime(stats.runTimeSeconds)}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#0B1020]/60 border border-[#1E2942] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#8E9BB0] shrink-0" />
          <div>
            <span className="text-[10px] text-[#8E9BB0] block uppercase font-bold tracking-wider">
              Tempo Descanso
            </span>
            <span className="font-mono font-bold text-white">
              {formatTime(stats.recoveryTimeSeconds)}
            </span>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-[#0B1020]/60 border border-[#1E2942] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#8E9BB0] shrink-0" />
          <div>
            <span className="text-[10px] text-[#8E9BB0] block uppercase font-bold tracking-wider">
              Duração Total
            </span>
            <span className="font-mono font-bold text-white">
              {formatTime(stats.totalDurationSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* Gráfico Recharts */}
      <div className="h-56 sm:h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              {/* Gradiente dinâmico com cores por etapa para o preenchimento da Área */}
              <linearGradient id="intervalSpeedGradient" x1="0" y1="0" x2="1" y2="0">
                {gradientStops.map((stop, i) => (
                  <stop
                    key={i}
                    offset={stop.offset}
                    stopColor={stop.color}
                    stopOpacity={stop.opacity}
                  />
                ))}
              </linearGradient>

              {/* Gradiente dinâmico para a borda superior (stroke) */}
              <linearGradient id="intervalStrokeGradient" x1="0" y1="0" x2="1" y2="0">
                {strokeStops.map((stop, i) => (
                  <stop
                    key={i}
                    offset={stop.offset}
                    stopColor={stop.color}
                  />
                ))}
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1E2942" opacity={0.6} />

            <XAxis
              dataKey="timeMinute"
              tick={{ fontSize: 10, fill: "#8E9BB0" }}
              stroke="#1E2942"
              unit=" min"
            />

            <YAxis
              tick={{ fontSize: 10, fill: "#8E9BB0" }}
              stroke="#1E2942"
              unit=" km/h"
              domain={[0, "auto"]}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const isRun = data.stageType === "run";
                  return (
                    <div className="bg-[#0B1020]/95 backdrop-blur-md text-white text-xs p-3 rounded-2xl shadow-2xl border border-[#1E2942] space-y-1.5 font-sans">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-white">
                          {data.stageName}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            isRun
                              ? "bg-[#B7F34A]/20 text-[#B7F34A]"
                              : "bg-[#8E9BB0]/20 text-[#8E9BB0]"
                          }`}
                        >
                          {data.timeFormatted}
                        </span>
                      </div>

                      <div className="text-base font-black font-mono flex items-baseline gap-1 text-[#B7F34A]">
                        <span>{data.speedKmh}</span>
                        <span className="text-xs font-normal text-[#8E9BB0]">km/h</span>
                      </div>

                      <div className="text-[11px] text-[#8E9BB0] pt-0.5 border-t border-[#1E2942]/60">
                        Ritmo Estimado:{" "}
                        <strong className="text-white font-mono">
                          {data.paceFormatted} /km
                        </strong>
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
              stroke="url(#intervalStrokeGradient)"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#intervalSpeedGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
