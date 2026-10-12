"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { TrainingSession } from "@/types";
import { tafService } from "@/lib/services/tafService";
import { formatPace } from "@/lib/formatting/time";
import { parseSafeDate } from "@/lib/math/evolution";
import { TrainingForm } from "@/components/meu-taf/TrainingForm";
import { TrainingList } from "@/components/meu-taf/TrainingList";
import { TrainingEvolutionDashboard } from "@/components/treinos/TrainingEvolutionDashboard";
import { Button } from "@/components/ui/Button";
import {
  Activity,
  Plus,
  TrendingUp,
  Clock,
  HeartPulse,
  Trophy,
  Calculator,
  AlertCircle,
  CheckCircle2,
  X,
  Flame,
} from "lucide-react";

export type TreinosTab = "diario" | "graficos";

export default function TreinosPage() {
  const [activeTab, setActiveTab] = useState<TreinosTab>("diario");
  const [trainings, setTrainings] = useState<TrainingSession[]>([]);
  const [editingTraining, setEditingTraining] = useState<TrainingSession | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Sincroniza aba com query param ?tab=graficos
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "graficos") {
        setActiveTab("graficos");
      }
    }
  }, []);

  const handleTabChange = (tab: TreinosTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "diario") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", tab);
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Carrega a lista de treinos via tafService
  const loadTrainings = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await tafService.getTrainings();
      setTrainings(data);
    } catch (err) {
      console.error("Erro ao carregar treinos:", err);
      setErrorMessage("Não foi possível carregar os treinos. Verifique sua conexão.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrainings();
  }, [loadTrainings]);

  // Salvar treino (novo ou atualização)
  const handleSaveTraining = async (session: TrainingSession) => {
    try {
      const isUpdate = Boolean(editingTraining) || trainings.some((t) => t.id === session.id);
      const saved = await tafService.saveTraining(session, isUpdate);

      setTrainings((prev) => {
        const index = prev.findIndex((t) => t.id === saved.id);
        if (index >= 0) {
          return prev.map((t) => (t.id === saved.id ? saved : t));
        }
        return [saved, ...prev];
      });

      setEditingTraining(null);
      setIsFormOpen(false);
      showToast(
        editingTraining
          ? "Treino atualizado com sucesso!"
          : "Novo treino registrado no diário com sucesso!"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar treino";
      showToast(msg, "error");
      throw err;
    }
  };

  // Iniciar edição
  const handleEdit = (session: TrainingSession) => {
    setEditingTraining(session);
    setIsFormOpen(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Cancelar edição
  const handleCancelEdit = () => {
    setEditingTraining(null);
    setIsFormOpen(false);
  };

  // Excluir treino
  const handleDeleteTraining = async (id: string) => {
    try {
      await tafService.deleteTraining(id);
      setTrainings((prev) => prev.filter((t) => t.id !== id));
      if (editingTraining?.id === id) {
        setEditingTraining(null);
        setIsFormOpen(false);
      }
      showToast("Treino excluído com sucesso.");
    } catch {
      showToast("Erro ao excluir treino", "error");
    }
  };

  // Cálculos de Indicadores de Consistência e Volume Semanal/Mensal
  const stats = useMemo(() => {
    const now = new Date().getTime();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    let weekCurrentKm = 0;
    let weekPrevKm = 0;
    let monthKm = 0;
    let weekDurationSeconds = 0;
    let weekRpeSum = 0;
    let weekRpeCount = 0;

    trainings.forEach((t) => {
      const time = parseSafeDate(t.sessionDate)?.getTime() ?? 0;
      const diff = now - time;

      // Semana atual (últimos 7 dias, aceitando tolerância para fuso horário local)
      if (diff <= oneWeekMs && diff >= -86400000) {
        weekCurrentKm += t.distanceKm || 0;
        weekDurationSeconds += t.durationSeconds || 0;
        if (typeof t.perceivedEffort === "number" && t.perceivedEffort > 0) {
          weekRpeSum += t.perceivedEffort;
          weekRpeCount++;
        }
      } else if (diff > oneWeekMs && diff <= twoWeeksMs) {
        // Semana anterior (de 7 a 14 dias atrás)
        weekPrevKm += t.distanceKm || 0;
      }

      // Mês atual (últimos 30 dias)
      if (diff <= thirtyDaysMs && diff >= -86400000) {
        monthKm += t.distanceKm || 0;
      }
    });

    const weekDiffKm = Number((weekCurrentKm - weekPrevKm).toFixed(1));
    const avgPaceSec =
      weekCurrentKm > 0 ? Math.round(weekDurationSeconds / weekCurrentKm) : 0;
    const avgRpe =
      weekRpeCount > 0 ? Number((weekRpeSum / weekRpeCount).toFixed(1)) : null;

    return {
      weekCurrentKm: Number(weekCurrentKm.toFixed(1)),
      weekPrevKm: Number(weekPrevKm.toFixed(1)),
      weekDiffKm,
      monthKm: Number(monthKm.toFixed(1)),
      avgPaceFormatted: avgPaceSec > 0 ? formatPace(avgPaceSec) : "--:--",
      avgRpe,
      totalTrainings: trainings.length,
    };
  }, [trainings]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          data-testid="toast-notification"
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold border transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-950/90 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          )}
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2">
            <Activity className="w-3.5 h-3.5" />
            Diário de Treinos • Consistência & Volume
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Diário de Treinos & Consistência
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Acompanhe a sua rotina semanal de treinos, volume de quilômetros, pace médio e escala de esforço percebido (RPE).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => {
              if (isFormOpen && !editingTraining) {
                setIsFormOpen(false);
              } else {
                setEditingTraining(null);
                setIsFormOpen(true);
              }
            }}
            icon={isFormOpen && !editingTraining ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          >
            {isFormOpen && !editingTraining ? "Fechar Formulário" : "Registrar Treino"}
          </Button>

          <Link
            href="/calculadora"
            className="inline-flex items-center justify-center font-medium transition-all duration-150 select-none active:scale-[0.98] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs px-3 py-2 rounded-xl gap-1.5 cursor-pointer shadow-2xs"
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Calculadoras</span>
          </Link>
          <Link
            href="/meu-taf"
            className="inline-flex items-center justify-center font-medium transition-all duration-150 select-none active:scale-[0.98] border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs px-3 py-2 rounded-xl gap-1.5 cursor-pointer shadow-2xs"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            <span>Meu TAF</span>
          </Link>
        </div>
      </div>

      {/* Seletor de Abas da Página */}
      <div
        className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "diario"}
          data-testid="tab-diario"
          onClick={() => handleTabChange("diario")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === "diario"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Diário & Registro</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === "diario"
                ? "bg-white/20 text-white"
                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
            }`}
          >
            {trainings.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "graficos"}
          data-testid="tab-graficos"
          onClick={() => handleTabChange("graficos")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === "graficos"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Evolução & Gráficos</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              activeTab === "graficos"
                ? "bg-white/20 text-white"
                : "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
            }`}
          >
            Análise
          </span>
        </button>
      </div>

      {/* Conteúdo da Aba 2: Evolução & Gráficos */}
      {activeTab === "graficos" && (
        <TrainingEvolutionDashboard trainings={trainings} />
      )}

      {/* Conteúdo da Aba 1: Diário & Registro */}
      {activeTab === "diario" && (
        <>
          {/* Alerta de erro de conexão */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 text-xs sm:text-sm flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={loadTrainings}
                className="font-bold underline hover:no-underline ml-4 text-xs"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Painel de Indicadores de Consistência e Volume */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Volume Semanal */}
            <div
              data-testid="kpi-weekly-volume"
              className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                <span>Volume Semanal</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                {stats.weekCurrentKm} <span className="text-xs font-normal text-slate-400">km</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                {stats.weekDiffKm >= 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    +{stats.weekDiffKm} km
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    {stats.weekDiffKm} km
                  </span>
                )}{" "}
                vs semana anterior
              </p>
            </div>

            {/* 2. Volume Mensal */}
            <div
              data-testid="kpi-monthly-volume"
              className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                <span>Volume Mensal</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                {stats.monthKm} <span className="text-xs font-normal text-slate-400">km</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Últimos 30 dias</p>
            </div>

            {/* 3. Pace Médio da Semana */}
            <div
              data-testid="kpi-avg-pace"
              className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Pace Médio</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                {stats.avgPaceFormatted} <span className="text-xs font-normal text-slate-400">/km</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Nesta semana</p>
            </div>

            {/* 4. Média de Esforço (RPE) */}
            <div
              data-testid="kpi-avg-rpe"
              className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <HeartPulse className="w-3.5 h-3.5 text-rose-500" />
                <span>Esforço (RPE)</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                {stats.avgRpe ? `${stats.avgRpe}` : "--"}{" "}
                <span className="text-xs font-normal text-slate-400">/ 10</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {stats.avgRpe && stats.avgRpe >= 8
                  ? "Carga intensa (Atenção)"
                  : stats.avgRpe
                  ? "Carga controlada"
                  : "Sem registros"}
              </p>
            </div>
          </div>

          {/* Formulário de Registro / Edição (exibido quando aberto ou editando) */}
          {isFormOpen && (
            <div className="pt-2 animate-in fade-in slide-in-from-top-4 duration-200">
              <TrainingForm
                editingTraining={editingTraining}
                onSave={handleSaveTraining}
                onCancelEdit={handleCancelEdit}
              />
            </div>
          )}

          {/* Lista e Timeline de Treinos */}
          <div className="pt-2">
            {isLoading ? (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500 space-y-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
                <Flame className="w-8 h-8 mx-auto animate-pulse text-blue-500" />
                <p className="text-sm font-semibold">Carregando seu histórico de treinos...</p>
              </div>
            ) : (
              <TrainingList
                trainings={trainings}
                onEdit={handleEdit}
                onDelete={handleDeleteTraining}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

