"use client";

import React from "react";
import { Zap, Trophy, Timer } from "lucide-react";

export interface PaceTableItem {
  paceFormatted: string;
  paceSeconds: number;
  speedKmh: number;
  lap400mFormatted: string;
  lap400mSeconds: number;
  tag?: string;
  isTafTarget?: boolean;
}

export const PACE_SPEED_REFERENCE_TABLE: PaceTableItem[] = [
  { paceFormatted: "3:00", paceSeconds: 180, speedKmh: 20.0, lap400mFormatted: "1:12", lap400mSeconds: 72, tag: "Sprint Máximo" },
  { paceFormatted: "3:30", paceSeconds: 210, speedKmh: 17.1, lap400mFormatted: "1:24", lap400mSeconds: 84, tag: "Tiro Forte" },
  { paceFormatted: "4:00", paceSeconds: 240, speedKmh: 15.0, lap400mFormatted: "1:36", lap400mSeconds: 96, tag: "Ritmo 5K" },
  { paceFormatted: "4:30", paceSeconds: 270, speedKmh: 13.3, lap400mFormatted: "1:48", lap400mSeconds: 108, tag: "Ritmo 10K" },
  { paceFormatted: "5:00", paceSeconds: 300, speedKmh: 12.0, lap400mFormatted: "2:00", lap400mSeconds: 120, tag: "Meta TAF (2.400m)", isTafTarget: true },
  { paceFormatted: "5:13", paceSeconds: 313, speedKmh: 11.5, lap400mFormatted: "2:05", lap400mSeconds: 125, tag: "Meta TAF (2.300m)", isTafTarget: true },
  { paceFormatted: "5:30", paceSeconds: 330, speedKmh: 10.9, lap400mFormatted: "2:12", lap400mSeconds: 132, tag: "Moderado" },
  { paceFormatted: "6:00", paceSeconds: 360, speedKmh: 10.0, lap400mFormatted: "2:24", lap400mSeconds: 144, tag: "Rodagem Base" },
  { paceFormatted: "6:30", paceSeconds: 390, speedKmh: 9.2, lap400mFormatted: "2:36", lap400mSeconds: 156, tag: "Rodagem Leve" },
  { paceFormatted: "7:00", paceSeconds: 420, speedKmh: 8.6, lap400mFormatted: "2:48", lap400mSeconds: 168, tag: "Trote Leve" },
  { paceFormatted: "7:30", paceSeconds: 450, speedKmh: 8.0, lap400mFormatted: "3:00", lap400mSeconds: 180, tag: "Regenerativo" },
  { paceFormatted: "8:00", paceSeconds: 480, speedKmh: 7.5, lap400mFormatted: "3:12", lap400mSeconds: 192, tag: "Caminhada Rápida" },
];

interface PaceSpeedTableProps {
  currentPaceSeconds?: number | null;
  onSelectPace?: (paceFormatted: string, speedKmh: number) => void;
}

export function PaceSpeedTable({
  currentPaceSeconds,
  onSelectPace,
}: PaceSpeedTableProps) {
  // Identifica a linha mais próxima ou exata
  const isRowActive = (item: PaceTableItem) => {
    if (!currentPaceSeconds) return false;
    return Math.abs(item.paceSeconds - currentPaceSeconds) <= 10;
  };

  return (
    <div
      data-testid="pace-speed-table-container"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 mb-1">
            <Zap className="w-3.5 h-3.5" />
            Guia de Consulta Rápida (Esteira & Pista)
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            Tabela de Correspondência Pace ↔ Velocidade
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ritmos de 30 em 30 segundos com parciais de volta (400m) e metas oficiais de concursos. Clique para preencher.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Trophy className="w-3 h-3" />
            Metas do TAF
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700/80">
            <tr>
              <th className="py-3 px-3.5 sm:px-4">Pace (min/km)</th>
              <th className="py-3 px-3.5 sm:px-4">Velocidade (km/h)</th>
              <th className="py-3 px-3.5 sm:px-4">Volta 400m (Pista)</th>
              <th className="py-3 px-3.5 sm:px-4 hidden sm:table-cell">Zona / Utilidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {PACE_SPEED_REFERENCE_TABLE.map((row) => {
              const active = isRowActive(row);

              return (
                <tr
                  key={row.paceFormatted}
                  data-testid={`pace-row-${row.paceFormatted.replace(":", "-")}`}
                  onClick={() => onSelectPace?.(row.paceFormatted, row.speedKmh)}
                  className={`cursor-pointer transition-colors ${
                    active
                      ? "bg-blue-50 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 font-semibold"
                      : row.isTafTarget
                      ? "bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/40"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {/* Pace */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4">
                    <div className="flex items-center gap-2">
                      {active ? (
                        <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                      )}
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {row.paceFormatted}
                      </span>
                      <span className="text-[10px] text-slate-400">/km</span>
                    </div>
                  </td>

                  {/* Velocidade */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                    {row.speedKmh.toFixed(1)} km/h
                  </td>

                  {/* Volta de 400m */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 text-slate-700 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Timer className="w-3 h-3 text-slate-400" />
                      {row.lap400mFormatted}
                    </span>
                  </td>

                  {/* Zona / Tag */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 hidden sm:table-cell">
                    {row.isTafTarget ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                        <Trophy className="w-3 h-3 text-amber-500" />
                        {row.tag}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {row.tag}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
