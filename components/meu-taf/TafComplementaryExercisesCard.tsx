"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Dumbbell, ChevronDown, ChevronUp, Edit3 } from "lucide-react";
import { TafGoalConfig } from "@/types";

interface TafComplementaryExercisesCardProps {
  goal: TafGoalConfig;
}

export function TafComplementaryExercisesCard({
  goal,
}: TafComplementaryExercisesCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Verificação se há metas cadastradas
  const hasPullup = Boolean(
    goal.pullupMinReps || goal.pullupTargetReps || goal.pullupMinSeconds || goal.pullupTargetSeconds
  );
  const hasPushup = Boolean(goal.pushupMinReps || goal.pushupTargetReps);
  const hasAbs = Boolean(goal.absMinReps || goal.absTargetReps);

  return (
    <div
      data-testid="taf-complementary-exercises-card"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#B7F34A]/10 text-[#B7F34A] flex items-center justify-center">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              Exercícios Complementares do TAF
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#B7F34A]/15 text-[#B7F34A]">
                Barra • Flexão • Abdominal
              </span>
            </h4>
            <p className="text-xs text-[#8E9BB0]">
              Metas estabelecidas no edital para as provas de força e resistência muscular.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0B1020] hover:bg-[#1E2942] border border-[#1E2942] text-xs font-semibold text-white transition-colors"
        >
          <span>{isOpen ? "Recolher" : "Visualizar"}</span>
          {isOpen ? <ChevronUp className="w-4 h-4 text-[#B7F34A]" /> : <ChevronDown className="w-4 h-4 text-[#8E9BB0]" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-5 pt-4 border-t border-[#1E2942] space-y-4 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. Barra Fixa */}
            <div className="p-4 rounded-2xl bg-[#0B1020] border border-[#1E2942] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white">
                  Barra Fixa
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#B7F34A]/15 text-[#B7F34A]">
                  {goal.pullupType === "isometria"
                    ? "Isometria (Seg)"
                    : goal.pullupDurationSeconds
                    ? `Dinâmica (${goal.pullupDurationSeconds}s)`
                    : "Dinâmica (Tempo livre)"}
                </span>
              </div>

              {hasPullup ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-[#8E9BB0]">
                    <span>Mínimo do Edital:</span>
                    <strong className="text-white">
                      {goal.pullupType === "isometria"
                        ? `${goal.pullupMinSeconds || 15}s`
                        : `${goal.pullupMinReps || 3} reps ${goal.pullupDurationSeconds ? `em até ${goal.pullupDurationSeconds}s` : "(tempo livre)"}`}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[#8E9BB0]">
                    <span>Meta de Segurança:</span>
                    <strong className="text-[#B7F34A]">
                      {goal.pullupType === "isometria"
                        ? `${goal.pullupTargetSeconds || 25}s`
                        : `${goal.pullupTargetReps || 5} reps ${goal.pullupDurationSeconds ? `em até ${goal.pullupDurationSeconds}s` : "(tempo livre)"}`}
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#8E9BB0]/60 italic">
                  Nenhuma meta configurada ainda no perfil.
                </p>
              )}
            </div>

            {/* 2. Flexão de Braço */}
            <div className="p-4 rounded-2xl bg-[#0B1020] border border-[#1E2942] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white">
                  Flexão de Braço
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#B7F34A]/15 text-[#B7F34A]">
                  {goal.pushupDurationSeconds ? `Até ${goal.pushupDurationSeconds}s` : "Tempo livre"}
                </span>
              </div>

              {hasPushup ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-[#8E9BB0]">
                    <span>Mínimo do Edital:</span>
                    <strong className="text-white">
                      {goal.pushupMinReps || 20} reps {goal.pushupDurationSeconds ? `em até ${goal.pushupDurationSeconds}s` : "(tempo livre)"}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[#8E9BB0]">
                    <span>Meta de Segurança:</span>
                    <strong className="text-[#B7F34A]">
                      {goal.pushupTargetReps || 30} reps {goal.pushupDurationSeconds ? `em até ${goal.pushupDurationSeconds}s` : "(tempo livre)"}
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#8E9BB0]/60 italic">
                  Nenhuma meta configurada ainda no perfil.
                </p>
              )}
            </div>

            {/* 3. Abdominal Remador */}
            <div className="p-4 rounded-2xl bg-[#0B1020] border border-[#1E2942] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white">
                  Abdominal Remador
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#B7F34A]/15 text-[#B7F34A]">
                  {goal.absDurationSeconds ? `Até ${goal.absDurationSeconds}s` : "Tempo livre"}
                </span>
              </div>

              {hasAbs ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-[#8E9BB0]">
                    <span>Mínimo do Edital:</span>
                    <strong className="text-white">
                      {goal.absMinReps || 30} reps {goal.absDurationSeconds ? `em até ${goal.absDurationSeconds}s` : "(tempo livre)"}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-[#8E9BB0]">
                    <span>Meta de Segurança:</span>
                    <strong className="text-[#B7F34A]">
                      {goal.absTargetReps || 40} reps {goal.absDurationSeconds ? `em até ${goal.absDurationSeconds}s` : "(tempo livre)"}
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#8E9BB0]/60 italic">
                  Nenhuma meta configurada ainda no perfil.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[#8E9BB0]">
              Deseja ajustar os índices mínimos ou as metas de repetição?
            </span>
            <Link
              href="/perfil"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B7F34A] hover:underline"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Gerenciar Metas no Perfil →</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
