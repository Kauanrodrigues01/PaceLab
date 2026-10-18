"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, ShieldCheck, Trophy, Target } from "lucide-react";

interface TafApprovalRulerProps {
  currentDistance: number; // Melhor simulado ou último simulado
  minDistance: number; // Mínimo do edital (ex: 2400)
  targetDistance: number; // Meta de segurança do atleta (ex: 2600)
  institutionName?: string | null;
}

export function TafApprovalRuler({
  currentDistance,
  minDistance,
  targetDistance,
  institutionName,
}: TafApprovalRulerProps) {
  const safeMin = minDistance > 0 ? minDistance : 2400;
  const safeTarget = targetDistance >= safeMin ? targetDistance : safeMin + 200;

  // Escala visual calculada: limite superior da régua com 15% a mais que o maior valor
  const maxScale = Math.max(safeTarget * 1.15, currentDistance * 1.05, 3000);

  // Porcentagens na barra
  const minPercent = Math.min(100, Math.max(0, (safeMin / maxScale) * 100));
  const targetPercent = Math.min(100, Math.max(0, (safeTarget / maxScale) * 100));
  const currentPercent = Math.min(100, Math.max(0, (currentDistance / maxScale) * 100));

  // Clamps para evitar overflow horizontal do pin e das legendas em telas estreitas
  const clampedCurrentPercent = Math.min(94, Math.max(6, currentPercent));

  // Detecta se os marcadores de Corte e Meta estão muito próximos (evita colisão de texto no mobile)
  const isMarkersClose = Math.abs(targetPercent - minPercent) < 18;

  // Status
  const isApproved = currentDistance >= safeMin;
  const isTargetSecured = currentDistance >= safeTarget;
  const marginFromMin = currentDistance - safeMin;
  const deficitFromTarget = safeTarget - currentDistance;

  return (
    <div
      data-testid="taf-approval-ruler"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 overflow-hidden"
    >
      {/* Topo com Título e Status */}
      <div className="flex flex-col sm:flex-row sm:items-start md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#8E9BB0] uppercase tracking-wider">
              Régua Visual de Aprovação
            </span>
            {institutionName && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B7F34A]/15 text-[#B7F34A] border border-[#B7F34A]/30 truncate max-w-[200px]">
                {institutionName}
              </span>
            )}
          </div>
          <h4 className="text-base sm:text-lg font-black text-[#FFFFFF] flex items-center gap-1.5 mt-0.5 flex-wrap">
            {isTargetSecured ? (
              <span className="text-[#B7F34A] flex items-center gap-1.5">
                <ShieldCheck className="w-5 h-5 shrink-0" />
                Zona de Segurança Garantida!
              </span>
            ) : isApproved ? (
              <span className="text-[#B7F34A] flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                Aprovado no Corte (+{marginFromMin}m)
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                Abaixo do Edital ({Math.abs(marginFromMin)}m restantes)
              </span>
            )}
          </h4>
        </div>

        {/* Badges de Distâncias */}
        <div className="flex items-center gap-2 text-xs font-semibold flex-wrap shrink-0">
          <span className="px-2.5 py-1 rounded-xl bg-[#0B1020] border border-[#1E2942] text-[#8E9BB0] whitespace-nowrap">
            Corte: <strong className="text-[#FFFFFF]">{safeMin.toLocaleString("pt-BR")} m</strong>
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-[#0B1020] border border-[#1E2942] text-[#8E9BB0] whitespace-nowrap">
            Meta: <strong className="text-[#B7F34A]">{safeTarget.toLocaleString("pt-BR")} m</strong>
          </span>
        </div>
      </div>

      {/* Barra Visual Graduada */}
      <div className="relative pt-7 pb-12 sm:pt-6 sm:pb-8">
        {/* Barra base com as 3 zonas */}
        <div className="h-4 sm:h-5 w-full rounded-full overflow-hidden flex bg-[#0B1020] border border-[#1E2942]">
          {/* Zona 1: Abaixo do Mínimo */}
          <div
            style={{ width: `${minPercent}%` }}
            className="h-full bg-linear-to-r from-rose-500/80 to-amber-500/80 transition-all"
            title={`Zona de Reprovação (0m até ${safeMin}m)`}
          />
          {/* Zona 2: Entre o Mínimo e a Meta */}
          <div
            style={{ width: `${targetPercent - minPercent}%` }}
            className="h-full bg-linear-to-r from-[#B7F34A]/40 to-[#B7F34A]/80 transition-all"
            title={`Zona de Aprovação no Limite (${safeMin}m até ${safeTarget}m)`}
          />
          {/* Zona 3: Acima da Meta de Segurança */}
          <div
            style={{ width: `${100 - targetPercent}%` }}
            className="h-full bg-[#B7F34A] transition-all"
            title={`Zona de Segurança Máxima (Acima de ${safeTarget}m)`}
          />
        </div>

        {/* Pin indicador da posição do atleta (acima da barra) */}
        {currentDistance > 0 && (
          <div
            data-testid="athlete-pin"
            style={{ left: `${clampedCurrentPercent}%` }}
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-500 z-10"
          >
            <div className="px-2 py-0.5 rounded-md bg-[#B7F34A] text-[#0B1020] text-[10px] font-black shadow-md whitespace-nowrap flex items-center gap-1">
              <Trophy className="w-3 h-3 text-[#0B1020] shrink-0" />
              <span>{currentDistance.toLocaleString("pt-BR")} m</span>
            </div>
            <div className="w-2 h-2 bg-[#B7F34A] rotate-45 -mt-1 shadow-xs" />
          </div>
        )}

        {/* Marcador Vertical: Linha de Corte */}
        <div
          style={{ left: `${minPercent}%` }}
          className="absolute top-7 sm:top-6 -translate-x-1/2 flex flex-col items-center pointer-events-none z-[5]"
        >
          <div className="h-4 sm:h-5 w-0.5 bg-white/70" />
          <div className="h-2 w-0.5 bg-white/40" />
          <span
            className={`text-[10px] font-bold text-[#8E9BB0] whitespace-nowrap transition-transform ${
              isMarkersClose ? "mt-0.5" : "mt-1"
            }`}
          >
            Corte ({safeMin}m)
          </span>
        </div>

        {/* Marcador Vertical: Linha de Meta com Anti-Colisão */}
        <div
          style={{ left: `${targetPercent}%` }}
          className="absolute top-7 sm:top-6 -translate-x-1/2 flex flex-col items-center pointer-events-none z-[5]"
        >
          <div className="h-4 sm:h-5 w-0.5 bg-[#B7F34A]" />
          <div
            className={`w-0.5 bg-[#B7F34A]/60 transition-all ${
              isMarkersClose ? "h-6 sm:h-2" : "h-2"
            }`}
          />
          <span
            className={`text-[10px] font-black text-[#B7F34A] whitespace-nowrap flex items-center gap-0.5 transition-all ${
              isMarkersClose
                ? "mt-0 sm:mt-1 bg-[#0B1020]/95 px-1.5 py-0.5 rounded border border-[#B7F34A]/30 shadow-xs"
                : "mt-1"
            }`}
          >
            <Target className="w-2.5 h-2.5 shrink-0" />
            Meta ({safeTarget}m)
          </span>
        </div>
      </div>

      {/* Legenda Explicativa Inferior */}
      <div className="pt-3 border-t border-[#1E2942] flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-[11px] text-[#8E9BB0]">
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shrink-0" />
            Zona Crítica (&lt; {safeMin}m)
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B7F34A]/60 inline-block shrink-0" />
            Aprovado ({safeMin}m - {safeTarget}m)
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B7F34A] inline-block shrink-0" />
            Segurança (&ge; {safeTarget}m)
          </span>
        </div>

        <div className="text-left md:text-right">
          {isTargetSecured ? (
            <span className="text-[#B7F34A] font-bold">
              +{currentDistance - safeTarget}m além da sua meta pessoal!
            </span>
          ) : isApproved ? (
            <span className="text-[#B7F34A] font-bold">
              Faltam apenas {deficitFromTarget}m para a meta de segurança.
            </span>
          ) : (
            <span className="text-amber-400 font-bold">
              Faltam {Math.abs(marginFromMin)}m para alcançar a aprovação.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
