"use client";

import React, { useMemo } from "react";
import { ActivityParsePreview } from "@/types";
import { formatDateTimeFortaleza } from "@/lib/formatting/date";
import { formatTime } from "@/lib/formatting/time";
import { analyzeSplits } from "@/lib/math/splitsAnalysis";
import { SplitsInsights } from "./SplitsInsights";
import { SplitsPaceChart } from "./SplitsPaceChart";
import { SplitsTable } from "./SplitsTable";
import {
  Activity,
  AlertTriangle,
  Clock,
  Flame,
  Footprints,
  Gauge,
  Heart,
  Info,
  Mountain,
  Sparkles,
} from "lucide-react";

interface GpxPreviewCardProps {
  preview: ActivityParsePreview;
}

export function GpxPreviewCard({ preview }: GpxPreviewCardProps) {
  const splitsAnalysis = useMemo(
    () => analyzeSplits(preview.splits ?? []),
    [preview.splits]
  );

  const isMergedFitGpx =
    preview.filesUsed.includes("fit") && preview.filesUsed.includes("gpx");

  const sourceBadgeLabel = isMergedFitGpx
    ? "Strava FIT + GPX (Mesclado)"
    : preview.source === "fit_upload"
      ? "Strava / Garmin .FIT (Oficial)"
      : "Strava .GPX (Fallback)";

  const formattedDate = formatDateTimeFortaleza(
    preview.startedAt,
    preview.startedAt || "—"
  );

  const mismatchWarning = preview.warnings.find(
    (w) => w.code === "MISMATCHED_ACTIVITY_FILES"
  );

  const otherWarnings = preview.warnings.filter(
    (w) => w.code !== "MISMATCHED_ACTIVITY_FILES"
  );

  return (
    <div
      data-testid="gpx-preview-card"
      className="bg-[#0B1020] border border-[#1E2942] rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Cabeçalho do Painel Somente Leitura */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#1E2942]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-[#B7F34A] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Telemetria Extraída (Somente Leitura)
            </span>
            <span
              data-testid="preview-source-badge"
              className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#B7F34A]/10 text-[#B7F34A] border border-[#B7F34A]/30"
            >
              {sourceBadgeLabel}
            </span>
            {preview.isIndoor && (
              <span
                data-testid="preview-indoor-badge"
                className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-950/50 text-cyan-300 border border-cyan-500/30"
              >
                Indoor / Esteira
              </span>
            )}
          </div>
          <p className="text-xs text-[#8E9BB0] mt-1">
            Início registrado em <span className="text-white font-semibold">{formattedDate}</span>
            {preview.name ? (
              <>
                {" "}• Título detectado:{" "}
                <span className="text-[#B7F34A] font-semibold">&ldquo;{preview.name}&rdquo;</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Alerta Crítico de Divergência de Horário (> 5 min entre .FIT e .GPX) */}
      {mismatchWarning && (
        <div
          data-testid="preview-mismatch-warning"
          className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-amber-300">
              Possível divergência entre os arquivos .FIT e .GPX
            </span>
            <span>{mismatchWarning.message}</span>
          </div>
        </div>
      )}

      {/* Grid de Métricas Extraídas (Somente Leitura — Exibe "—" para sensores ausentes) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {/* 1. Distância */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
          <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-[#B7F34A]" />
            Distância
          </span>
          <div
            data-testid="preview-metric-distance"
            className="text-base sm:text-lg font-black text-white mt-0.5"
          >
            {preview.distanceKm.toFixed(2)}{" "}
            <span className="text-xs font-normal text-[#8E9BB0]">km</span>
          </div>
        </div>

        {/* 2. Tempo em Movimento */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
          <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#B7F34A]" />
            Tempo em Mov.
          </span>
          <div
            data-testid="preview-metric-duration"
            className="text-base sm:text-lg font-black text-white mt-0.5"
          >
            {formatTime(preview.durationSeconds)}
          </div>
          <span className="text-[10px] text-[#8E9BB0] block">
            Decorrido: {formatTime(preview.elapsedSeconds)}
          </span>
        </div>

        {/* 3. Pace & Velocidade */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
          <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-[#B7F34A]" />
            Pace Médio
          </span>
          <div
            data-testid="preview-metric-pace"
            className="text-base sm:text-lg font-black text-[#B7F34A] mt-0.5"
          >
            {preview.paceFormatted}{" "}
            <span className="text-xs font-normal text-[#8E9BB0]">/km</span>
          </div>
          <span className="text-[10px] text-[#8E9BB0] block">
            {preview.speedKmh.toFixed(2)} km/h
          </span>
        </div>

        {/* 4. Frequência Cardíaca (Média / Máx) */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3">
          <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
            <Heart className="w-3.5 h-3.5 text-rose-400" />
            FC Média / Máx
          </span>
          <div
            data-testid="preview-metric-hr"
            className="text-base sm:text-lg font-black text-white mt-0.5"
          >
            {preview.avgHeartRate !== null ? (
              <>
                {preview.avgHeartRate}
                {preview.maxHeartRate !== null ? ` / ${preview.maxHeartRate}` : ""}{" "}
                <span className="text-xs font-normal text-[#8E9BB0]">bpm</span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>

        {/* 5. Elevação & Cadência & Calorias */}
        <div className="bg-[#131A2E] border border-[#1E2942] rounded-xl p-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Mountain className="w-3.5 h-3.5 text-emerald-400" />
              Elevação:
            </span>
            <span
              data-testid="preview-metric-elevation"
              className="font-bold text-white"
            >
              {preview.elevationGainM !== null ? `+${preview.elevationGainM} m` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Footprints className="w-3.5 h-3.5 text-cyan-400" />
              Cadência:
            </span>
            <span
              data-testid="preview-metric-cadence"
              className="font-bold text-white"
            >
              {preview.avgCadence !== null ? `${preview.avgCadence} spm` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] text-[#8E9BB0] flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Calorias (FIT):
            </span>
            <span
              data-testid="preview-metric-calories"
              className="font-bold text-white"
            >
              {preview.activeCalories !== null ? `${preview.activeCalories} kcal` : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Análise, Gráfico e Tabela Completa de Parciais (Splits) */}
      {splitsAnalysis.hasSplits && (
        <div className="space-y-3" data-testid="preview-splits-section">
          <SplitsInsights analysis={splitsAnalysis} compact />
          <SplitsPaceChart analysis={splitsAnalysis} compact />
          <SplitsTable
            analysis={splitsAnalysis}
            compact
            testId="preview-splits-table"
          />
        </div>
      )}

      {/* Avisos Informativos do Parser */}
      {otherWarnings.length > 0 && (
        <div
          data-testid="preview-info-warnings"
          className="flex flex-wrap gap-1.5 pt-1"
        >
          {otherWarnings.map((w, idx) => (
            <span
              key={`${w.code}-${idx}`}
              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-[#131A2E] border border-[#1E2942] text-[#8E9BB0]"
            >
              <Info className="w-3 h-3 text-[#B7F34A] shrink-0" />
              <span>{w.message}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
