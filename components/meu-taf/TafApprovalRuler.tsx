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

  // Status
  const isApproved = currentDistance >= safeMin;
  const isTargetSecured = currentDistance >= safeTarget;
  const marginFromMin = currentDistance - safeMin;
  const deficitFromTarget = safeTarget - currentDistance;

  return (
    <div
      data-testid="taf-approval-ruler"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm space-y-4"
    >
      {/* Topo com Título e Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#8E9BB0] uppercase tracking-wider">
              Régua Visual de Aprovação
            </span>
            {institutionName && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B7F34A]/15 text-[#B7F34A] border border-[#B7F34A]/30">
                {institutionName}
              </span>
            )}
          </div>
          <h4 className="text-base sm:text-lg font-black text-[#FFFFFF] flex items-center gap-1.5 mt-0.5">
            {isTargetSecured ? (
              <span className="text-[#B7F34A] flex items-center gap-1.5">
                <ShieldCheck className="w-5 h-5" />
                Zona de Segurança Garantida!
              </span>
            ) : isApproved ? (
              <span className="text-[#B7F34A] flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5" />
                Aprovado no Corte (+{marginFromMin}m)
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-5 h-5" />
                Abaixo do Edital ({Math.abs(marginFromMin)}m restantes)
              </span>
            )}
          </h4>
        </div>

        {/* Badges de Distâncias */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="px-2.5 py-1 rounded-xl bg-[#0B1020] border border-[#1E2942] text-[#8E9BB0]">
            Corte: <strong className="text-[#FFFFFF]">{safeMin.toLocaleString("pt-BR")} m</strong>
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-[#0B1020] border border-[#1E2942] text-[#8E9BB0]">
            Meta: <strong className="text-[#B7F34A]">{safeTarget.toLocaleString("pt-BR")} m</strong>
          </span>
        </div>
      </div>

      {/* Barra Visual Graduada */}
      <div className="relative pt-6 pb-2">
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

        {/* Pin indicador da posição do atleta */}
        {currentDistance > 0 && (
          <div
            style={{ left: `${currentPercent}%` }}
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-500"
          >
            <div className="px-2 py-0.5 rounded-md bg-[#B7F34A] text-[#0B1020] text-[10px] font-black shadow-md whitespace-nowrap flex items-center gap-1">
              <Trophy className="w-3 h-3 text-[#0B1020]" />
              <span>{currentDistance.toLocaleString("pt-BR")} m</span>
            </div>
            <div className="w-2 h-2 bg-[#B7F34A] rotate-45 -mt-1 shadow-xs" />
          </div>
        )}

        {/* Marcadores Verticais das Linhas de Corte e Meta */}
        <div
          style={{ left: `${minPercent}%` }}
          className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
        >
          <div className="h-6 w-0.5 bg-[#FFFFFF]/60" />
          <span className="text-[10px] font-bold text-[#8E9BB0] mt-1 whitespace-nowrap">
            Corte ({safeMin}m)
          </span>
        </div>

        <div
          style={{ left: `${targetPercent}%` }}
          className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none"
        >
          <div className="h-6 w-0.5 bg-[#B7F34A]" />
          <span className="text-[10px] font-black text-[#B7F34A] mt-1 whitespace-nowrap flex items-center gap-0.5">
            <Target className="w-2.5 h-2.5" />
            Meta ({safeTarget}m)
          </span>
        </div>
      </div>

      {/* Legenda Explicativa Inferior */}
      <div className="pt-2 border-t border-[#1E2942] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8E9BB0]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            Zona Crítica (&lt; {safeMin}m)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B7F34A]/60 inline-block" />
            Aprovado ({safeMin}m - {safeTarget}m)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B7F34A] inline-block" />
            Segurança (&ge; {safeTarget}m)
          </span>
        </div>

        <div>
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
