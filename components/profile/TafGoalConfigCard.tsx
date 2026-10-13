"use client";

import React, { useState, useEffect } from "react";
import { TafGoalConfig } from "@/types";
import { tafService, DEFAULT_GOAL } from "@/lib/services/tafService";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Trophy,
  Target,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Dumbbell,
  ShieldCheck,
  Award,
} from "lucide-react";

interface TafGoalConfigCardProps {
  onSaved?: (goal: TafGoalConfig) => void;
}

export function TafGoalConfigCard({ onSaved }: TafGoalConfigCardProps) {
  const [goal, setGoal] = useState<TafGoalConfig>(DEFAULT_GOAL);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchGoal() {
      try {
        const loaded = await tafService.getGoal();
        if (isMounted) {
          setGoal(loaded);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    fetchGoal();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (
    field: keyof TafGoalConfig,
    value: string | number | null
  ) => {
    setGoal((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      if (goal.minDistanceMeters && goal.targetDistanceMeters) {
        if (goal.targetDistanceMeters < goal.minDistanceMeters) {
          setErrorMessage(
            "Atenção: A sua meta de segurança é menor que o mínimo do edital. Recomendamos uma meta igual ou superior ao corte."
          );
        }
      }

      const saved = await tafService.saveGoal(goal);
      setGoal(saved);
      setSuccessMessage("Metas do edital TAF atualizadas com sucesso!");
      onSaved?.(saved);

      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Erro ao salvar metas do TAF"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          <span className="text-sm font-medium">Carregando metas do edital...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              Metas do TAF & Edital
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-bold">
                Multimodal
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Defina o mínimo para aprovação e a sua margem de segurança. Os valores alimentarão todos os simulados e calculadoras.
            </p>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-sm flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Concurso e Data da Prova */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Concurso / Instituição
            </label>
            <input
              type="text"
              value={goal.institutionName || ""}
              onChange={(e) => handleChange("institutionName", e.target.value)}
              placeholder="Ex: Polícia Federal, PM-SP, PRF"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Data Prevista da Prova (Opcional)
            </label>
            <input
              type="date"
              value={
                goal.targetExamDate
                  ? new Date(goal.targetExamDate).toISOString().split("T")[0]
                  : ""
              }
              onChange={(e) =>
                handleChange("targetExamDate", e.target.value ? e.target.value : null)
              }
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        {/* Bloco Corrida */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Prova de Corrida (Tempo e Metas)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                <span>Duração da Prova</span>
                <span className="text-[10px] text-slate-400 font-mono">minutos</span>
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={goal.targetDurationMinutes}
                onChange={(e) =>
                  handleChange("targetDurationMinutes", Number(e.target.value))
                }
                className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Mínimo do Edital
                </span>
                <span className="text-[10px] text-slate-400 font-mono">metros</span>
              </label>
              <input
                type="number"
                step="50"
                min="500"
                max="10000"
                value={goal.minDistanceMeters || 2400}
                onChange={(e) =>
                  handleChange("minDistanceMeters", Number(e.target.value))
                }
                className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold">
                  <Award className="w-3.5 h-3.5" />
                  Meta de Segurança
                </span>
                <span className="text-[10px] text-slate-400 font-mono">metros</span>
              </label>
              <input
                type="number"
                step="50"
                min="500"
                max="10000"
                value={goal.targetDistanceMeters}
                onChange={(e) =>
                  handleChange("targetDistanceMeters", Number(e.target.value))
                }
                className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Bloco Exercícios Complementares */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Exercícios Complementares (Barra, Flexão e Abdominal)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Barra Fixa */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Barra Fixa
                </span>
                <select
                  value={goal.pullupType || "dinamica"}
                  onChange={(e) =>
                    handleChange("pullupType", e.target.value as "dinamica" | "isometria")
                  }
                  className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="dinamica">Dinâmica (Reps)</option>
                  <option value="isometria">Isometria (Seg)</option>
                </select>
              </div>

              {goal.pullupType === "isometria" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Mínimo (s)</span>
                    <input
                      type="number"
                      min="0"
                      value={goal.pullupMinSeconds ?? ""}
                      onChange={(e) =>
                        handleChange(
                          "pullupMinSeconds",
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      placeholder="Ex: 20"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Meta (s)</span>
                    <input
                      type="number"
                      min="0"
                      value={goal.pullupTargetSeconds ?? ""}
                      onChange={(e) =>
                        handleChange(
                          "pullupTargetSeconds",
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      placeholder="Ex: 30"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Mínimo (reps)</span>
                    <input
                      type="number"
                      min="0"
                      value={goal.pullupMinReps ?? 3}
                      onChange={(e) =>
                        handleChange(
                          "pullupMinReps",
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Meta (reps)</span>
                    <input
                      type="number"
                      min="0"
                      value={goal.pullupTargetReps ?? 5}
                      onChange={(e) =>
                        handleChange(
                          "pullupTargetReps",
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Flexão de Braço */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Flexão de Braço
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 block">Mínimo (reps)</span>
                  <input
                    type="number"
                    min="0"
                    value={goal.pushupMinReps ?? 20}
                    onChange={(e) =>
                      handleChange(
                        "pushupMinReps",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Meta (reps)</span>
                  <input
                    type="number"
                    min="0"
                    value={goal.pushupTargetReps ?? 30}
                    onChange={(e) =>
                      handleChange(
                        "pushupTargetReps",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* Abdominal */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Abdominal
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 block">Mínimo (reps)</span>
                  <input
                    type="number"
                    min="0"
                    value={goal.absMinReps ?? 30}
                    onChange={(e) =>
                      handleChange(
                        "absMinReps",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Meta (reps)</span>
                  <input
                    type="number"
                    min="0"
                    value={goal.absTargetReps ?? 40}
                    onChange={(e) =>
                      handleChange(
                        "absTargetReps",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-sm transition-all"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Metas do Edital
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
