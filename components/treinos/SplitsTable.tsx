"use client";

import React, { useMemo } from "react";
import { SplitDetail } from "@/types";
import {
  analyzeSplits,
  formatPaceDelta,
  SplitsAnalysis,
} from "@/lib/math/splitsAnalysis";
import { formatTime } from "@/lib/formatting/time";

interface SplitsTableProps {
  splits?: SplitDetail[];
  analysis?: SplitsAnalysis;
  compact?: boolean;
  testId?: string;
  className?: string;
}

export function SplitsTable({
  splits,
  analysis,
  compact = false,
  testId = "splits-table",
  className = "",
}: SplitsTableProps) {
  const resolved = useMemo(
    () => analysis ?? analyzeSplits(splits),
    [analysis, splits]
  );

  if (!resolved.hasSplits) {
    return (
      <div
        data-testid={testId}
        className={`bg-[#131A2E] border border-[#1E2942] rounded-xl p-4 text-xs text-[#8E9BB0] ${className}`}
      >
        Nenhuma parcial registrada para este treino.
      </div>
    );
  }

  const minPace = Math.min(...resolved.splits.map((s) => s.paceSeconds));
  const maxPace = Math.max(...resolved.splits.map((s) => s.paceSeconds));
  const span = Math.max(1, maxPace - minPace);

  return (
    <div
      data-testid={testId}
      className={`bg-[#131A2E] border border-[#1E2942] rounded-xl p-3 sm:p-4 overflow-x-auto ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="text-xs font-bold text-white">
          Parciais Detalhadas ({resolved.totalSplits}{" "}
          {resolved.totalSplits === 1 ? "parcial" : "parciais"})
        </span>
        <span className="text-[11px] text-[#8E9BB0]">
          Pace médio:{" "}
          <strong className="text-[#B7F34A]">
            {resolved.avgPaceFormatted}/km
          </strong>
        </span>
      </div>

      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[#8E9BB0] border-b border-[#1E2942]">
            <th className="py-1.5 pr-3 font-semibold">Parcial</th>
            <th className="py-1.5 pr-3 font-semibold">Distância</th>
            <th className="py-1.5 pr-3 font-semibold">Tempo</th>
            {!compact && (
              <th className="py-1.5 pr-3 font-semibold hidden sm:table-cell">
                Acumulado
              </th>
            )}
            <th className="py-1.5 pr-3 font-semibold">Pace</th>
            <th className="py-1.5 pr-3 font-semibold">Δ Média</th>
            <th className="py-1.5 pr-3 font-semibold">FC Média</th>
            <th className="py-1.5 font-semibold">Elevação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E2942]/60">
          {resolved.splits.map((s, idx) => {
            // Barra relativa: parcial mais rápida ocupa maior largura visual (100%..35%)
            const speedBarWidth =
              maxPace === minPace
                ? 70
                : Math.round(100 - ((s.paceSeconds - minPace) / span) * 65);

            return (
              <tr
                key={`${s.kilometer}-${idx}`}
                data-testid={`split-row-${s.kilometer}`}
                className="text-white hover:bg-[#0B1020]/40 transition-colors"
              >
                <td className="py-2 pr-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white">
                      Km {s.kilometer}:
                    </span>
                    {s.isFastest && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Mais rápido
                      </span>
                    )}
                    {s.isSlowest && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Mais lento
                      </span>
                    )}
                    {s.isPartial && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#1E2942] text-[#8E9BB0]">
                        Parcial
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-3 text-[#8E9BB0] whitespace-nowrap">
                  {s.distanceKm.toFixed(2)} km
                </td>
                <td className="py-2 pr-3 font-mono whitespace-nowrap">
                  {formatTime(s.durationSeconds)}
                </td>
                {!compact && (
                  <td className="py-2 pr-3 font-mono text-[#8E9BB0] hidden sm:table-cell whitespace-nowrap">
                    {formatTime(s.cumulativeDurationSeconds)}
                  </td>
                )}
                <td className="py-2 pr-3 whitespace-nowrap">
                  <div className="space-y-1 min-w-[78px]">
                    <span className="font-bold text-[#B7F34A] block">
                      {s.paceFormatted} /km
                    </span>
                    <div className="h-1 w-full bg-[#0B1020] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          s.isFastest
                            ? "bg-emerald-400"
                            : s.isSlowest
                              ? "bg-amber-400"
                              : "bg-[#B7F34A]/80"
                        }`}
                        style={{ width: `${speedBarWidth}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-3 font-mono whitespace-nowrap">
                  <span
                    className={
                      s.deltaFromAvgSeconds <= -3
                        ? "text-emerald-400 font-semibold"
                        : s.deltaFromAvgSeconds >= 3
                          ? "text-amber-300 font-semibold"
                          : "text-[#8E9BB0]"
                    }
                  >
                    {formatPaceDelta(s.deltaFromAvgSeconds)}
                  </span>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {s.avgHeartRate !== null ? `${s.avgHeartRate} bpm` : "—"}
                </td>
                <td className="py-2 whitespace-nowrap">
                  {s.elevationDiffM !== null
                    ? `${s.elevationDiffM > 0 ? `+${s.elevationDiffM}` : s.elevationDiffM} m`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#1E2942] text-[11px] font-bold text-[#8E9BB0] bg-[#0B1020]/50">
            <td className="py-2 pr-3 text-white">Total / Média</td>
            <td className="py-2 pr-3">{resolved.totalDistanceKm.toFixed(2)} km</td>
            <td className="py-2 pr-3 font-mono text-white">
              {formatTime(resolved.totalDurationSeconds)}
            </td>
            {!compact && <td className="py-2 pr-3 hidden sm:table-cell">—</td>}
            <td className="py-2 pr-3 text-[#B7F34A]">
              {resolved.avgPaceFormatted} /km
            </td>
            <td className="py-2 pr-3">
              {resolved.paceRangeSeconds > 0
                ? `Δ ${resolved.paceRangeSeconds}s`
                : "0 s/km"}
            </td>
            <td className="py-2 pr-3">
              {resolved.avgHeartRate !== null ? `${resolved.avgHeartRate} bpm` : "—"}
            </td>
            <td className="py-2">
              {resolved.netElevationM !== null
                ? `${resolved.netElevationM > 0 ? `+${resolved.netElevationM}` : resolved.netElevationM} m`
                : "—"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
