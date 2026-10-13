"use client";

import React, { useState, useEffect } from "react";
import {
  profileService,
  isWeeklyWeightDue,
  isWeightPromptDismissed,
  dismissWeightPrompt,
} from "@/lib/services/profileService";
import { Scale, Check, X, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface WeeklyWeightModalProps {
  forceOpen?: boolean;
  onWeightSaved?: (weightKg: number) => void;
  onClose?: () => void;
}

export function WeeklyWeightModal({
  forceOpen = false,
  onWeightSaved,
  onClose,
}: WeeklyWeightModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [weightInput, setWeightInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
      profileService
        .getProfile()
        .then((prof) => {
          if (prof?.currentWeightKg) {
            setWeightInput((prev) => (prev ? prev : String(prof.currentWeightKg)));
          }
        })
        .catch(() => {});
      return;
    }

    if (isWeightPromptDismissed()) {
      return;
    }

    // Verifica se pesagem é devida buscando última pesagem ou perfil
    const checkDue = async () => {
      try {
        const weights = await profileService.getWeightHistory();
        const lastWeight = weights.length > 0 ? weights[0].recordedAt : null;
        if (isWeeklyWeightDue(lastWeight)) {
          const profile = await profileService.getProfile();
          if (profile.currentWeightKg) {
            setWeightInput(String(profile.currentWeightKg));
          }
          setIsOpen(true);
        }
      } catch {
        // Falha silenciosa
      }
    };

    checkDue();
  }, [forceOpen]);

  const handleDismiss = () => {
    dismissWeightPrompt(24);
    setIsOpen(false);
    if (onClose) onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedWeight = parseFloat(weightInput.replace(",", "."));
    if (isNaN(parsedWeight) || parsedWeight < 30 || parsedWeight > 250) {
      setError("Por favor, informe um peso corporal válido entre 30 e 250 kg.");
      return;
    }

    setIsSubmitting(true);
    try {
      await profileService.addWeightRecord({
        weightKg: Number(parsedWeight.toFixed(1)),
        recordedAt: new Date().toISOString(),
        source: "weekly_prompt",
        notes: "Pesagem semanal",
      });

      dismissWeightPrompt(24);
      setSuccessMessage("Peso atualizado com sucesso!");
      if (onWeightSaved) {
        onWeightSaved(parsedWeight);
      }

      setTimeout(() => {
        setIsOpen(false);
        if (onClose) onClose();
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar pesagem";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="weekly-weight-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl shadow-blue-900/10 dark:shadow-none overflow-hidden">
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Botão Fechar / Dispensar */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          aria-label="Dispensar lembrete de pesagem"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0 shadow-sm">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40 mb-1.5">
              <Clock className="w-3 h-3" />
              Pesagem Semanal
            </div>
            <h2
              id="weekly-weight-title"
              className="text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Hora de atualizar seu peso!
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Mantenha o cálculo de calorias e a evolução do seu condicionamento 100% precisos.
            </p>
          </div>
        </div>

        {successMessage ? (
          <div className="py-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <Check className="w-6 h-6" />
            </div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label
                htmlFor="weekly-weight-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Peso Corporal Atual (kg)
              </label>
              <div className="relative">
                <input
                  id="weekly-weight-input"
                  type="number"
                  step="0.1"
                  min="30"
                  max="250"
                  placeholder="Ex: 72.5"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3 text-lg font-bold rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all pr-12"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  kg
                </span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleDismiss}
                className="flex-1 rounded-xl text-xs py-2.5"
              >
                Pular por 24h
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !weightInput}
                className="flex-1 rounded-xl text-xs py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {isSubmitting ? "Salvando..." : "Confirmar Peso"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
