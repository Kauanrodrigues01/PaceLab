"use client";

import React, { useState } from "react";
import { IntervalSession } from "@/types";
import { formatTime, formatDecimal } from "@/lib/formatting/time";
import { X, CheckCircle2, Circle, Copy, Check } from "lucide-react";

interface TrackWorkoutCardModalProps {
  session: IntervalSession;
  isOpen: boolean;
  onClose: () => void;
}

export function TrackWorkoutCardModal({
  session,
  isOpen,
  onClose,
}: TrackWorkoutCardModalProps) {
  const [completedReps, setCompletedReps] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Filtra as etapas de tiro
  const runStages = session.stages.filter((s) => s.type === "run");
  const warmupStage = session.stages.find((s) => s.type === "warmup");
  const walkStage = session.stages.find((s) => s.type === "walk");
  const cooldownStage = session.stages.find((s) => s.type === "cooldown");

  const toggleRep = (index: number) => {
    setCompletedReps((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const completedCount = Object.values(completedReps).filter(Boolean).length;

  const handleCopyCompact = async () => {
    const lines = [
      `🏃‍♂️ Treino Intervalado de Pista - PaceLab`,
      `⏱️ Total: ${formatTime(session.totalTimeSeconds)} | 📍 Distância: ${formatDecimal(session.totalDistanceKm, 2)} km | Pace Médio: ${session.averagePaceFormatted}/km`,
      warmupStage ? `🔥 Aquecimento: ${formatTime(warmupStage.durationSeconds)} @ ${warmupStage.speedKmh} km/h (${warmupStage.paceFormatted}/km)` : "",
      `⚡ ${runStages.length} Tiros: ${formatTime(runStages[0]?.durationSeconds || 0)} @ ${runStages[0]?.speedKmh} km/h (${runStages[0]?.paceFormatted}/km)`,
      walkStage ? `🚶 Recuperação: ${formatTime(walkStage.durationSeconds)} @ ${walkStage.speedKmh} km/h` : "",
      cooldownStage ? `❄️ Desaquecimento: ${formatTime(cooldownStage.durationSeconds)} @ ${cooldownStage.speedKmh} km/h` : "",
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  return (
    <div
      data-testid="track-workout-card-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B1020]/90 backdrop-blur-md animate-in fade-in"
    >
      <div className="bg-[#0B1020] border border-[#1E2942] text-white w-full max-w-lg rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between pb-4 border-b border-[#1E2942]">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#B7F34A]/10 text-[#B7F34A] border border-[#B7F34A]/20">
              Modo Pista de Atletismo
            </div>
            <h3 className="text-xl font-black mt-1 text-white">Cartão de Treino</h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#131A2E] hover:bg-[#1E2942] border border-[#1E2942] flex items-center justify-center text-[#8E9BB0] hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo Rápido em Destaque */}
        <div className="grid grid-cols-3 gap-2.5 my-4 text-center">
          <div className="bg-[#131A2E] p-3 rounded-2xl border border-[#1E2942]">
            <span className="text-[10px] uppercase font-bold text-[#8E9BB0] block">Duração</span>
            <div className="text-lg font-black text-white font-mono mt-0.5">
              {formatTime(session.totalTimeSeconds)}
            </div>
          </div>

          <div className="bg-[#131A2E] p-3 rounded-2xl border border-[#1E2942]">
            <span className="text-[10px] uppercase font-bold text-[#8E9BB0] block">Distância</span>
            <div className="text-lg font-black text-white font-mono mt-0.5">
              {formatDecimal(session.totalDistanceKm, 2)} <span className="text-xs font-normal text-[#8E9BB0]">km</span>
            </div>
          </div>

          <div className="bg-[#131A2E] p-3 rounded-2xl border border-[#1E2942]">
            <span className="text-[10px] uppercase font-bold text-[#8E9BB0] block">Pace Médio</span>
            <div className="text-lg font-black text-[#B7F34A] font-mono mt-0.5">
              {session.averagePaceFormatted}
            </div>
          </div>
        </div>

        {/* Informações das Séries (Alto Contraste) */}
        <div className="bg-[#131A2E] border border-[#B7F34A]/30 rounded-2xl p-4 mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#B7F34A] font-bold">Configuração dos Tiros</div>
            <div className="text-2xl font-black text-white font-mono mt-0.5">
              {runStages.length}x {formatTime(runStages[0]?.durationSeconds || 0)}
            </div>
            <div className="text-xs text-[#8E9BB0] mt-0.5">
              Velocidade: <strong className="text-white">{runStages[0]?.speedKmh} km/h</strong> (Pace <strong className="text-[#B7F34A]">{runStages[0]?.paceFormatted}/km</strong>)
            </div>
          </div>

          {walkStage && (
            <div className="text-right">
              <div className="text-[11px] text-[#8E9BB0] font-semibold">Recuperação</div>
              <div className="text-lg font-black text-white font-mono mt-0.5">
                {formatTime(walkStage.durationSeconds)}
              </div>
              <div className="text-[11px] text-[#8E9BB0]">{walkStage.speedKmh} km/h</div>
            </div>
          )}
        </div>

        {/* Checklist Interativo das Séries */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
          <div className="flex items-center justify-between text-xs font-bold text-[#8E9BB0] mb-2">
            <span>Contador de Séries</span>
            <span className="text-[#B7F34A]">
              {completedCount} de {runStages.length} concluídas
            </span>
          </div>

          {runStages.map((stage, idx) => {
            const isDone = Boolean(completedReps[idx]);
            const distanceM = Math.round(stage.distanceKm * 1000);
            const lapsCount = (distanceM / 400).toFixed(1);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => toggleRep(idx)}
                className={`w-full p-3.5 rounded-2xl border transition-all text-left flex items-center justify-between ${
                  isDone
                    ? "bg-[#B7F34A]/10 border-[#B7F34A]/40 text-[#B7F34A]"
                    : "bg-[#131A2E] border-[#1E2942] text-white hover:bg-[#1E2942]/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-[#B7F34A] shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-[#8E9BB0] shrink-0" />
                  )}
                  <div>
                    <span className="font-black text-sm block">
                      Tiro #{idx + 1} ({formatTime(stage.durationSeconds)})
                    </span>
                    <span className="text-xs text-[#8E9BB0] font-mono">
                      ~{distanceM} m ({lapsCount} voltas na pista de 400m)
                    </span>
                  </div>
                </div>

                <div className="text-right font-mono text-sm font-bold">
                  {stage.speedKmh} km/h
                </div>
              </button>
            );
          })}
        </div>

        {/* Rodapé de Ações */}
        <div className="pt-4 mt-3 border-t border-[#1E2942] flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopyCompact}
            className="flex-1 py-3 px-4 rounded-xl bg-[#B7F34A] hover:bg-[#a3e038] text-[#0B1020] font-black text-xs flex items-center justify-center gap-2 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#0B1020]" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Resumo do Treino</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl bg-[#131A2E] hover:bg-[#1E2942] text-white font-bold text-xs border border-[#1E2942] transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
