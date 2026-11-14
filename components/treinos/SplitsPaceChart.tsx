"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SplitDetail } from "@/types";
import {
  analyzeSplits,
  formatPaceDelta,
  NormalizedSplit,
  SplitsAnalysis,
} from "@/lib/math/splitsAnalysis";
import { formatPace, formatTime } from "@/lib/formatting/time";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Gauge, HeartPulse, Mountain } from "lucide-react";

interface SplitsPaceChartProps {
  splits?: SplitDetail[];
  analysis?: SplitsAnalysis;
  compact?: boolean;
  defaultShowHr?: boolean;
  defaultShowElevation?: boolean;
  className?: string;
}

function SplitTooltipContent({
  active,
  payload,
  showHr,
  showElevation,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: NormalizedSplit }>;
  showHr: boolean;
  showElevation: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  const deltaText = formatPaceDelta(item.deltaFromAvgSeconds);

  return (
    <div className="bg-[#0B1020] text-white text-xs p-3 rounded-xl shadow-xl border border-[#1E2942] space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold text-white">{item.label}</span>
        <span className="text-[11px] text-[#8E9BB0]">
          {item.distanceKm.toFixed(2)} km • {formatTime(item.durationSeconds)}
        </span>
      </div>
      <div className="text-sm font-black text-[#B7F34A]">
        Pace: {item.paceFormatted} /km{" "}
        <span className="text-[11px] font-semibold text-[#8E9BB0]">
          ({deltaText} vs média)
        </span>
      </div>
      {showHr && item.avgHeartRate !== null && (
        <div className="text-[11px] text-rose-400 font-semibold">
          FC Média: {item.avgHeartRate} bpm
        </div>
      )}
      {showElevation && item.elevationDiffM !== null && (
        <div className="text-[11px] text-emerald-400 font-semibold">
          Elevação:{" "}
          {item.elevationDiffM > 0
            ? `+${item.elevationDiffM}`
            : item.elevationDiffM}{" "}
          m
        </div>
      )}
    </div>
  );
}

export function SplitsPaceChart({
  splits,
  analysis,
  compact = false,
  defaultShowHr = false,
  defaultShowElevation = false,
  className = "",
}: SplitsPaceChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  const resolved = useMemo(
    () => analysis ?? analyzeSplits(splits),
    [analysis, splits]
  );

  const [showHr, setShowHr] = useState(
    Boolean(defaultShowHr && resolved.hasHeartRateData)
  );
  const [showElevation, setShowElevation] = useState(
    Boolean(defaultShowElevation && resolved.hasElevationData)
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!resolved.hasSplits) {
    return null;
  }

  const effectiveShowHr = showHr && resolved.hasHeartRateData;
  const effectiveShowElevation = showElevation && resolved.hasElevationData;

  return (
    <div
      data-testid="splits-pace-chart"
      className={`bg-[#0B1020]/70 border border-[#1E2942] rounded-2xl p-3.5 sm:p-4 space-y-3 ${className}`}
    >
      {/* Cabeçalho e Seletor de Camadas (Pace | + FC | + Elevação) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
            <Gauge className="w-4 h-4 text-[#B7F34A]" />
            <span>Ritmo por Parcial (Pace Invertido)</span>
          </h4>
          <p className="text-[11px] text-[#8E9BB0]">
            Quanto mais alto na curva, mais rápido o km • Média:{" "}
            <strong className="text-[#B7F34A]">
              {resolved.avgPaceFormatted}/km
            </strong>
          </p>
        </div>

        <div
          data-testid="splits-chart-layers"
          className="inline-flex items-center gap-1 bg-[#131A2E] border border-[#1E2942] p-1 rounded-xl self-start sm:self-center"
        >
          <button
            type="button"
            data-testid="splits-layer-pace"
            aria-pressed={!effectiveShowHr && !effectiveShowElevation}
            onClick={() => {
              setShowHr(false);
              setShowElevation(false);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
              !effectiveShowHr && !effectiveShowElevation
                ? "bg-[#B7F34A] text-[#0B1020]"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            Pace
          </button>

          <button
            type="button"
            data-testid="splits-layer-hr"
            disabled={!resolved.hasHeartRateData}
            title={
              resolved.hasHeartRateData
                ? "Sobrepor frequência cardíaca por km"
                : "Sem dados de frequência cardíaca neste treino"
            }
            onClick={() => setShowHr((prev) => !prev)}
            aria-pressed={effectiveShowHr}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              effectiveShowHr
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            <HeartPulse className="w-3 h-3" />
            <span>+ FC</span>
          </button>

          <button
            type="button"
            data-testid="splits-layer-elevation"
            disabled={!resolved.hasElevationData}
            title={
              resolved.hasElevationData
                ? "Sobrepor variação de elevação por km"
                : "Sem dados de elevação neste treino"
            }
            onClick={() => setShowElevation((prev) => !prev)}
            aria-pressed={effectiveShowElevation}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              effectiveShowElevation
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "text-[#8E9BB0] hover:text-white"
            }`}
          >
            <Mountain className="w-3 h-3" />
            <span>+ Elevação</span>
          </button>
        </div>
      </div>

      {/* Gráfico Recharts com Eixo Y Invertido e Camadas Opcionais */}
      <div className={compact ? "h-48 w-full" : "h-56 sm:h-64 w-full"}>
        {isMounted ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={100}
            minHeight={180}
          >
            <ComposedChart
              data={resolved.splits}
              margin={{ top: 10, right: effectiveShowHr ? 8 : 12, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                opacity={0.15}
                stroke="#1E2942"
              />
              <XAxis
                dataKey="label"
                stroke="#8E9BB0"
                tick={{ fontSize: 10 }}
                tickLine={false}
              />
              <YAxis
                yAxisId="pace"
                reversed
                stroke="#8E9BB0"
                tick={{ fontSize: 11 }}
                tickLine={false}
                allowDecimals={false}
                tickFormatter={(sec: number) => formatPace(Math.round(sec))}
                domain={[
                  (dataMin: number) => Math.max(0, Math.floor(dataMin - 12)),
                  (dataMax: number) => Math.ceil(dataMax + 12),
                ]}
              />
              {effectiveShowHr && (
                <YAxis
                  yAxisId="hr"
                  orientation="right"
                  stroke="#fb7185"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  allowDecimals={false}
                  domain={["dataMin - 8", "dataMax + 8"]}
                />
              )}
              {effectiveShowElevation && (
                <YAxis
                  yAxisId="ele"
                  orientation="right"
                  hide
                  domain={["dataMin - 5", "dataMax + 5"]}
                />
              )}

              <Tooltip
                content={(tooltipProps) => (
                  <SplitTooltipContent
                    active={tooltipProps.active}
                    payload={
                      tooltipProps.payload as unknown as ReadonlyArray<{
                        payload: NormalizedSplit;
                      }>
                    }
                    showHr={effectiveShowHr}
                    showElevation={effectiveShowElevation}
                  />
                )}
              />

              <ReferenceLine
                yAxisId="pace"
                y={resolved.avgPaceSeconds}
                stroke="#8E9BB0"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />

              {effectiveShowElevation && (
                <Bar
                  yAxisId="ele"
                  dataKey="elevationDiffM"
                  barSize={18}
                  radius={[4, 4, 0, 0]}
                  opacity={0.45}
                >
                  {resolved.splits.map((entry, idx) => (
                    <Cell
                      key={`ele-cell-${entry.kilometer}-${idx}`}
                      fill={
                        (entry.elevationDiffM ?? 0) >= 0 ? "#10b981" : "#38bdf8"
                      }
                    />
                  ))}
                </Bar>
              )}

              <Line
                yAxisId="pace"
                type="monotone"
                dataKey="paceSeconds"
                stroke="#B7F34A"
                strokeWidth={2.5}
                dot={(dotProps) => {
                  const payload = dotProps.payload as NormalizedSplit;
                  if (
                    typeof dotProps.cx !== "number" ||
                    typeof dotProps.cy !== "number"
                  ) {
                    return <g key={`pace-dot-empty-${dotProps.index}`} />;
                  }
                  const fillColor = payload.isFastest
                    ? "#10b981"
                    : payload.isSlowest
                      ? "#f59e0b"
                      : "#B7F34A";
                  return (
                    <circle
                      key={`pace-dot-${payload.kilometer}-${dotProps.index}`}
                      cx={dotProps.cx}
                      cy={dotProps.cy}
                      r={payload.isFastest || payload.isSlowest ? 5 : 3.5}
                      fill={fillColor}
                      stroke="#0B1020"
                      strokeWidth={1.5}
                    />
                  );
                }}
                activeDot={{ r: 6 }}
              />

              {effectiveShowHr && (
                <Line
                  yAxisId="hr"
                  type="monotone"
                  dataKey="avgHeartRate"
                  stroke="#fb7185"
                  strokeWidth={2}
                  connectNulls
                  dot={{
                    r: 3,
                    fill: "#fb7185",
                    stroke: "#0B1020",
                    strokeWidth: 1,
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs text-[#8E9BB0]">
            Carregando gráfico de parciais...
          </div>
        )}
      </div>

      {/* Legenda compacta */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8E9BB0] pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#B7F34A]" />
          Pace (min/km)
        </span>
        {resolved.paceRangeSeconds > 0 && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Mais rápido
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Mais lento
            </span>
          </>
        )}
        {effectiveShowHr && (
          <span className="inline-flex items-center gap-1.5 text-rose-300">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            FC Média (bpm)
          </span>
        )}
        {effectiveShowElevation && (
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" />
            Elevação (±m)
          </span>
        )}
      </div>
    </div>
  );
}
