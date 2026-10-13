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
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Exercícios Complementares do TAF
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300">
                Barra • Flexão • Abdominal
              </span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Metas estabelecidas no edital para as provas de força e resistência muscular.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
        >
          <span>{isOpen ? "Recolher" : "Visualizar"}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-4 animate-in fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 1. Barra Fixa */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  Barra Fixa
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {goal.pullupType === "isometria" ? "Isometria (Seg)" : "Dinâmica (Reps)"}
                </span>
              </div>

              {hasPullup ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Mínimo do Edital:</span>
                    <strong className="text-slate-900 dark:text-slate-100">
                      {goal.pullupType === "isometria"
                        ? `${goal.pullupMinSeconds || 15}s`
                        : `${goal.pullupMinReps || 3} reps`}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Meta de Segurança:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {goal.pullupType === "isometria"
                        ? `${goal.pullupTargetSeconds || 25}s`
                        : `${goal.pullupTargetReps || 5} reps`}
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                  Nenhuma meta configurada ainda no perfil.
                </p>
              )}
            </div>

            {/* 2. Flexão de Braço */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  Flexão de Braço
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                  {goal.pushupDurationSeconds ? `${goal.pushupDurationSeconds}s` : "Livre / 60s"}
                </span>
              </div>

              {hasPushup ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Mínimo do Edital:</span>
                    <strong className="text-slate-900 dark:text-slate-100">
                      {goal.pushupMinReps || 20} reps
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Meta de Segurança:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {goal.pushupTargetReps || 30} reps
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                  Nenhuma meta configurada ainda no perfil.
                </p>
              )}
            </div>

            {/* 3. Abdominal Remador */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  Abdominal Remador
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  {goal.absDurationSeconds ? `${goal.absDurationSeconds}s` : "60 segundos"}
                </span>
              </div>

              {hasAbs ? (
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Mínimo do Edital:</span>
                    <strong className="text-slate-900 dark:text-slate-100">
                      {goal.absMinReps || 30} reps
                    </strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                    <span>Meta de Segurança:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {goal.absTargetReps || 40} reps
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                  Nenhuma meta configurada ainda no perfil.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Deseja ajustar os índices mínimos ou as metas de repetição?
            </span>
            <Link
              href="/perfil"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
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
