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
  Sparkles,
  Clock,
  Infinity as InfinityIcon,
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

  // Estados de controle se cada exercício complementar possui tempo estipulado
  const [hasPullupTime, setHasPullupTime] = useState(false);
  const [hasPushupTime, setHasPushupTime] = useState(false);
  const [hasAbsTime, setHasAbsTime] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchGoal() {
      try {
        const loaded = await tafService.getGoal();
        if (isMounted) {
          setGoal(loaded);
          setHasPullupTime(Boolean(loaded.pullupDurationSeconds && loaded.pullupDurationSeconds > 0));
          setHasPushupTime(Boolean(loaded.pushupDurationSeconds && loaded.pushupDurationSeconds > 0));
          setHasAbsTime(Boolean(loaded.absDurationSeconds && loaded.absDurationSeconds > 0));
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

  // Carregar Presets Oficiais de Concursos
  const handleApplyPreset = (presetName: string) => {
    if (presetName === "PM-SP") {
      setGoal((prev) => ({
        ...prev,
        institutionName: "Polícia Militar SP (PM-SP)",
        minDistanceMeters: 2400,
        targetDistanceMeters: 2600,
        targetDurationMinutes: 12,
        pullupType: "dinamica",
        pullupMinReps: 3,
        pullupTargetReps: 5,
        pullupDurationSeconds: null,
        pushupMinReps: 20,
        pushupTargetReps: 30,
        pushupDurationSeconds: 60,
        absMinReps: 30,
        absTargetReps: 40,
        absDurationSeconds: 60,
      }));
      setHasPullupTime(false);
      setHasPushupTime(true);
      setHasAbsTime(true);
    } else if (presetName === "PF") {
      setGoal((prev) => ({
        ...prev,
        institutionName: "Polícia Federal (PF)",
        minDistanceMeters: 2350,
        targetDistanceMeters: 2500,
        targetDurationMinutes: 12,
        pullupType: "dinamica",
        pullupMinReps: 2,
        pullupTargetReps: 5,
        pullupDurationSeconds: null,
        pushupMinReps: 20,
        pushupTargetReps: 30,
        pushupDurationSeconds: null,
        absMinReps: 36,
        absTargetReps: 44,
        absDurationSeconds: 60,
      }));
      setHasPullupTime(false);
      setHasPushupTime(false);
      setHasAbsTime(true);
    } else if (presetName === "PRF") {
      setGoal((prev) => ({
        ...prev,
        institutionName: "Polícia Rodoviária Federal (PRF)",
        minDistanceMeters: 2300,
        targetDistanceMeters: 2500,
        targetDurationMinutes: 12,
        pullupType: "dinamica",
        pullupMinReps: 3,
        pullupTargetReps: 6,
        pullupDurationSeconds: null,
        pushupMinReps: 21,
        pushupTargetReps: 30,
        pushupDurationSeconds: null,
        absMinReps: 35,
        absTargetReps: 45,
        absDurationSeconds: 60,
      }));
      setHasPullupTime(false);
      setHasPushupTime(false);
      setHasAbsTime(true);
    } else if (presetName === "PMPR") {
      setGoal((prev) => ({
        ...prev,
        institutionName: "Polícia Militar PR (PMPR)",
        minDistanceMeters: 2400,
        targetDistanceMeters: 2600,
        targetDurationMinutes: 12,
        pullupType: "dinamica",
        pullupMinReps: 3,
        pullupTargetReps: 6,
        pullupDurationSeconds: null,
        pushupMinReps: 20,
        pushupTargetReps: 30,
        pushupDurationSeconds: null,
        absMinReps: 30,
        absTargetReps: 40,
        absDurationSeconds: 60,
      }));
      setHasPullupTime(false);
      setHasPushupTime(false);
      setHasAbsTime(true);
    }
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

      // Prepara payload garantindo null quando o tempo estiver desmarcado
      const payload: TafGoalConfig = {
        ...goal,
        pullupDurationSeconds:
          goal.pullupType === "dinamica" && hasPullupTime && goal.pullupDurationSeconds
            ? goal.pullupDurationSeconds
            : null,
        pushupDurationSeconds:
          hasPushupTime && goal.pushupDurationSeconds ? goal.pushupDurationSeconds : null,
        absDurationSeconds:
          hasAbsTime && goal.absDurationSeconds ? goal.absDurationSeconds : null,
      };

      const saved = await tafService.saveGoal(payload);
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
      <Card className="p-6 bg-[#131A2E] border border-[#1E2942] rounded-3xl">
        <div className="flex items-center gap-3 text-[#8E9BB0]">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#B7F34A]" />
          <span className="text-sm font-medium">Carregando metas do edital...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8 bg-[#131A2E] border border-[#1E2942] rounded-3xl">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-6 border-b border-[#1E2942]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#B7F34A]/10 text-[#B7F34A]">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
              Metas do TAF & Edital
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#B7F34A]/10 text-[#B7F34A] border border-[#B7F34A]/20 font-bold">
                Multimodal
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-[#8E9BB0]">
              Defina o mínimo para aprovação e a sua margem de segurança. Os valores alimentarão todos os simulados e calculadoras.
            </p>
          </div>
        </div>

        {/* Atalhos de Editais Populares */}
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-center">
          <span className="text-xs text-[#8E9BB0] flex items-center gap-1 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-[#B7F34A]" />
            Presets:
          </span>
          {["PM-SP", "PF", "PRF", "PMPR"].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleApplyPreset(preset)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#0B1020] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-[#B7F34A] border border-[#1E2942] hover:border-[#B7F34A]/40 transition-all"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Concurso e Data da Prova */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#8E9BB0] uppercase tracking-wider mb-1.5">
              Concurso / Instituição
            </label>
            <input
              type="text"
              value={goal.institutionName || ""}
              onChange={(e) => handleChange("institutionName", e.target.value)}
              placeholder="Ex: Polícia Federal, PM-SP, PRF"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#8E9BB0] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#8E9BB0]" />
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
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] [color-scheme:dark] transition-all"
            />
          </div>
        </div>

        {/* Bloco Corrida */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1020]/60 border border-[#1E2942] space-y-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#B7F34A]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Prova de Corrida (Tempo e Metas)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#8E9BB0] mb-1 flex items-center justify-between">
                <span>Duração da Prova</span>
                <span className="text-[10px] text-[#8E9BB0] font-mono">minutos</span>
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={goal.targetDurationMinutes}
                onChange={(e) =>
                  handleChange("targetDurationMinutes", Number(e.target.value))
                }
                className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8E9BB0] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Mínimo do Edital
                </span>
                <span className="text-[10px] text-[#8E9BB0] font-mono">metros</span>
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
                className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-[#1E2942] bg-[#131A2E] text-emerald-400 focus:outline-none focus:border-[#B7F34A] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#8E9BB0] mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[#B7F34A] font-bold">
                  <Award className="w-3.5 h-3.5" />
                  Meta de Segurança
                </span>
                <span className="text-[10px] text-[#8E9BB0] font-mono">metros</span>
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
                className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-[#1E2942] bg-[#131A2E] text-[#B7F34A] focus:outline-none focus:border-[#B7F34A] transition-all"
              />
            </div>
          </div>
        </div>

        {/* Bloco Exercícios Complementares */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1020]/60 border border-[#1E2942] space-y-4">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-[#B7F34A]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Exercícios Complementares (Barra, Flexão e Abdominal)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Barra Fixa */}
            <div className="p-4 rounded-xl bg-[#131A2E] border border-[#1E2942] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">
                  Barra Fixa
                </span>
                <select
                  value={goal.pullupType || "dinamica"}
                  onChange={(e) =>
                    handleChange("pullupType", e.target.value as "dinamica" | "isometria")
                  }
                  className="text-xs px-2 py-1 rounded-lg border border-[#1E2942] bg-[#0B1020] text-white font-medium"
                >
                  <option value="dinamica">Dinâmica (Reps)</option>
                  <option value="isometria">Isometria (Seg)</option>
                </select>
              </div>

              {goal.pullupType === "isometria" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-[#8E9BB0] block font-medium">Mínimo (s)</span>
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
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#8E9BB0] block font-medium">Meta (s)</span>
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
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-[#8E9BB0] block font-medium">Mínimo (reps)</span>
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
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#8E9BB0] block font-medium">Meta (reps)</span>
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
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                      />
                    </div>
                  </div>

                  {/* Controle de Tempo Máximo na Barra Dinâmica */}
                  <div className="pt-2 border-t border-[#1E2942] space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                      <input
                        type="checkbox"
                        aria-label="Definir tempo máximo para barra"
                        checked={hasPullupTime}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setHasPullupTime(checked);
                          if (!checked) handleChange("pullupDurationSeconds", null);
                          else if (!goal.pullupDurationSeconds) handleChange("pullupDurationSeconds", 60);
                        }}
                        className="rounded border-[#1E2942] accent-[#B7F34A]"
                      />
                      <span className="font-semibold text-white">
                        Tempo Máximo de Prova
                      </span>
                    </label>

                    {hasPullupTime ? (
                      <div className="space-y-1.5 pl-6">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="10"
                            max="600"
                            value={goal.pullupDurationSeconds ?? 60}
                            onChange={(e) =>
                              handleChange(
                                "pullupDurationSeconds",
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            placeholder="60"
                            className="w-20 px-2 py-1 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white font-mono font-bold focus:outline-none focus:border-[#B7F34A]"
                          />
                          <span className="text-xs text-[#8E9BB0]">segundos</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px]">
                          {[30, 60, 90].map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleChange("pullupDurationSeconds", s)}
                              className="px-1.5 py-0.5 rounded bg-[#0B1020] border border-[#1E2942] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-white font-mono"
                            >
                              {s}s
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#8E9BB0] flex items-center gap-1 pl-6">
                        <InfinityIcon className="w-3 h-3 text-[#B7F34A]" />
                        Sem limite de tempo (tempo livre)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Flexão de Braço */}
            <div className="p-4 rounded-xl bg-[#131A2E] border border-[#1E2942] space-y-3">
              <span className="text-xs font-bold text-white block">
                Flexão de Braço
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#8E9BB0] block font-medium">Mínimo (reps)</span>
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
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#8E9BB0] block font-medium">Meta (reps)</span>
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
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                  />
                </div>
              </div>

              {/* Controle de Tempo Máximo na Flexão */}
              <div className="pt-2 border-t border-[#1E2942] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                  <input
                    type="checkbox"
                    aria-label="Definir tempo máximo para flexão"
                    checked={hasPushupTime}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHasPushupTime(checked);
                      if (!checked) handleChange("pushupDurationSeconds", null);
                      else if (!goal.pushupDurationSeconds) handleChange("pushupDurationSeconds", 60);
                    }}
                    className="rounded border-[#1E2942] accent-[#B7F34A]"
                  />
                  <span className="font-semibold text-white flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#8E9BB0]" />
                    Tempo Máximo de Prova
                  </span>
                </label>

                {hasPushupTime ? (
                  <div className="space-y-1.5 pl-6">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="600"
                        value={goal.pushupDurationSeconds ?? 60}
                        onChange={(e) =>
                          handleChange(
                            "pushupDurationSeconds",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        placeholder="60"
                        className="w-20 px-2 py-1 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white font-mono font-bold focus:outline-none focus:border-[#B7F34A]"
                      />
                      <span className="text-xs text-[#8E9BB0]">segundos</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      {[30, 60, 90].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleChange("pushupDurationSeconds", s)}
                          className="px-1.5 py-0.5 rounded bg-[#0B1020] border border-[#1E2942] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-white font-mono"
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#8E9BB0] flex items-center gap-1 pl-6">
                    <InfinityIcon className="w-3 h-3 text-[#B7F34A]" />
                    Sem limite de tempo (tempo livre)
                  </p>
                )}
              </div>
            </div>

            {/* 3. Abdominal */}
            <div className="p-4 rounded-xl bg-[#131A2E] border border-[#1E2942] space-y-3">
              <span className="text-xs font-bold text-white block">
                Abdominal
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#8E9BB0] block font-medium">Mínimo (reps)</span>
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
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[#8E9BB0] block font-medium">Meta (reps)</span>
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
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                  />
                </div>
              </div>

              {/* Controle de Tempo Máximo no Abdominal */}
              <div className="pt-2 border-t border-[#1E2942] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                  <input
                    type="checkbox"
                    aria-label="Definir tempo máximo para abdominal"
                    checked={hasAbsTime}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHasAbsTime(checked);
                      if (!checked) handleChange("absDurationSeconds", null);
                      else if (!goal.absDurationSeconds) handleChange("absDurationSeconds", 60);
                    }}
                    className="rounded border-[#1E2942] accent-[#B7F34A]"
                  />
                  <span className="font-semibold text-white flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#8E9BB0]" />
                    Tempo Máximo de Prova
                  </span>
                </label>

                {hasAbsTime ? (
                  <div className="space-y-1.5 pl-6">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="10"
                        max="600"
                        value={goal.absDurationSeconds ?? 60}
                        onChange={(e) =>
                          handleChange(
                            "absDurationSeconds",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        placeholder="60"
                        className="w-20 px-2 py-1 text-xs rounded-lg border border-[#1E2942] bg-[#0B1020] text-white font-mono font-bold focus:outline-none focus:border-[#B7F34A]"
                      />
                      <span className="text-xs text-[#8E9BB0]">segundos</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      {[30, 60, 90].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleChange("absDurationSeconds", s)}
                          className="px-1.5 py-0.5 rounded bg-[#0B1020] border border-[#1E2942] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-white font-mono"
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#8E9BB0] flex items-center gap-1 pl-6">
                    <InfinityIcon className="w-3 h-3 text-[#B7F34A]" />
                    Sem limite de tempo (tempo livre)
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#B7F34A] hover:bg-[#a6e03f] text-[#0B1020] font-black py-2.5 px-6 rounded-xl shadow-lg shadow-[#B7F34A]/20 transition-all"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#0B1020]" />
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
