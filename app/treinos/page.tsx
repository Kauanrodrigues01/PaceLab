"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { BatchImportSummary, TafAttempt, TrainingSession } from "@/types";
import { tafService } from "@/lib/services/tafService";
import {
  clearCrossPageSheetsCaches,
  formatBatchImportToast,
  formatSheetsSyncReportSummary,
  getSheetsSyncErrorMessage,
} from "@/lib/sheetsSyncUi";
import { formatPace } from "@/lib/formatting/time";
import { getTodayFortalezaDateKey, toFortalezaDateKey } from "@/lib/formatting/date";
import { parseSafeDate } from "@/lib/math/evolution";
import { TrainingForm } from "@/components/treinos/TrainingForm";
import { TrainingList } from "@/components/treinos/TrainingList";
import { GpxImportPanel } from "@/components/treinos/GpxImportPanel";
import { TrainingDetailModal } from "@/components/treinos/TrainingDetailModal";
import { TrainingEvolutionDashboard } from "@/components/treinos/TrainingEvolutionDashboard";
import { WeeklyAdherenceCard } from "@/components/dashboard/WeeklyAdherenceCard";
import { Button } from "@/components/ui/Button";
import {
  Activity,
  Plus,
  RefreshCw,
  Upload,
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
export type TrainingEntryMode = "manual" | "import";

const TRAININGS_CACHE_KEY = "pacelab_cache_trainings";

const getCachedTrainings = (): TrainingSession[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(TRAININGS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const setCachedTrainings = (data: TrainingSession[]) => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TRAININGS_CACHE_KEY, JSON.stringify(data));
  } catch {
    // QuotaExceededError ignorado defensivamente
  }
};

export default function TreinosPage() {
  const [activeTab, setActiveTab] = useState<TreinosTab>("diario");
  const [trainings, setTrainings] = useState<TrainingSession[]>([]);
  const [editingTraining, setEditingTraining] = useState<TrainingSession | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<TrainingEntryMode>("manual");
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [weeklyRefreshTrigger, setWeeklyRefreshTrigger] = useState(0);
  const [selectedDetailTraining, setSelectedDetailTraining] = useState<TrainingSession | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpWeeklyRefresh = useCallback(() => {
    setWeeklyRefreshTrigger((prev) => prev + 1);
  }, []);

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

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setNotification({ message, type });
      toastTimeoutRef.current = setTimeout(() => {
        setNotification(null);
        toastTimeoutRef.current = null;
      }, 4000);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // Carrega a lista de treinos via tafService (Stale-While-Revalidate)
  const loadTrainings = useCallback(async (): Promise<boolean> => {
    setErrorMessage(null);
    try {
      const data = await tafService.getTrainings();
      setTrainings(data);
      setCachedTrainings(data);
      return true;
    } catch (err) {
      console.error("Erro ao carregar treinos:", err);
      setErrorMessage("Não foi possível carregar os treinos. Verifique sua conexão.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Hidratação imediata via cache de sessão para evitar tela branca/spinner
    const cached = getCachedTrainings();
    if (cached.length > 0) {
      setTrainings(cached);
      setIsLoading(false);
    }
    loadTrainings();
  }, [loadTrainings]);

  // Abre modal de detalhes automaticamente quando ?trainingId= está presente na URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const trainingIdParam = params.get("trainingId")?.trim();
    if (!trainingIdParam) return;

    let cancelled = false;
    const clearTrainingIdFromUrl = () => {
      try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has("trainingId")) return;
        url.searchParams.delete("trainingId");
        const remainingSearch = url.searchParams.toString();
        window.history.replaceState(
          window.history.state,
          "",
          remainingSearch ? `${url.pathname}?${remainingSearch}` : url.pathname
        );
      } catch {}
    };

    const openByTrainingId = async () => {
      try {
        const session = await tafService.getTrainingById(trainingIdParam);
        if (!cancelled) {
          setSelectedDetailTraining(session);
        }
      } catch {
        if (!cancelled) {
          showToast("Treino selecionado não encontrado no diário.", "error");
        }
      } finally {
        if (!cancelled) {
          clearTrainingIdFromUrl();
        }
      }
    };

    void openByTrainingId();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // Salvar treino (novo ou atualização)
  const handleSaveTraining = async (session: TrainingSession) => {
    try {
      const isUpdate = Boolean(editingTraining) || trainings.some((t) => t.id === session.id);
      const saved = await tafService.saveTraining(session, isUpdate);

      clearCrossPageSheetsCaches({ includeGoal: false });
      setTrainings((prev) => {
        const index = prev.findIndex((t) => t.id === saved.id);
        const updated = index >= 0
          ? prev.map((t) => (t.id === saved.id ? saved : t))
          : [saved, ...prev];
        setCachedTrainings(updated);
        return updated;
      });
      bumpWeeklyRefresh();

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
    setFormMode("manual");
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

  // Callback ao importar treino via .FIT / .GPX
  const handleImportedTraining = (saved: TrainingSession, isUpdated = false) => {
    clearCrossPageSheetsCaches({ includeGoal: false });
    setTrainings((prev) => {
      const index = prev.findIndex((t) => t.id === saved.id);
      const updated =
        index >= 0
          ? prev.map((t) => (t.id === saved.id ? saved : t))
          : [saved, ...prev];
      setCachedTrainings(updated);
      return updated;
    });
    bumpWeeklyRefresh();

    setEditingTraining(null);
    setIsFormOpen(false);
    setFormMode("manual");
    showToast(
      isUpdated
        ? "Treino existente atualizado com sucesso!"
        : "Treino importado do Strava com sucesso!"
    );
  };

  // Atualiza lista local e cache após salvar ou espelhar um treino
  const upsertTrainingInState = useCallback((saved: TrainingSession) => {
    clearCrossPageSheetsCaches({ includeGoal: false });
    setTrainings((prev) => {
      const index = prev.findIndex((t) => t.id === saved.id);
      const updated =
        index >= 0
          ? prev.map((t) => (t.id === saved.id ? saved : t))
          : [saved, ...prev];
      setCachedTrainings(updated);
      return updated;
    });
    bumpWeeklyRefresh();
  }, [bumpWeeklyRefresh]);

  // Callback ao importar Simulado TAF via .FIT / .GPX no Diário de Treinos
  const handleImportedAttempt = (
    saved: TafAttempt,
    isUpdated = false,
    meta?: { mirrored?: boolean; mirrorError?: string | null }
  ) => {
    clearCrossPageSheetsCaches({ includeGoal: false });
    bumpWeeklyRefresh();
    setEditingTraining(null);
    setIsFormOpen(false);
    setFormMode("manual");
    if (meta?.mirrorError) {
      showToast(
        `Simulado TAF (${saved.distanceMeters}m) salvo, mas falha ao espelhar no Diário: ${meta.mirrorError}`,
        "error"
      );
      return;
    }
    if (meta?.mirrored) {
      showToast(
        `Simulado TAF (${saved.distanceMeters}m) salvo e espelhado no Diário de Treinos!`
      );
      return;
    }
    showToast(
      isUpdated
        ? `Simulado TAF existente (${saved.distanceMeters}m) atualizado no Meu TAF!`
        : `Simulado TAF (${saved.distanceMeters}m) salvo no histórico do Meu TAF!`
    );
  };

  // Callback consolidado ao finalizar importação em massa (.FIT / .GPX)
  const handleBatchImported = useCallback(
    async (summary: BatchImportSummary) => {
      clearCrossPageSheetsCaches({ includeGoal: false });
      await loadTrainings();
      bumpWeeklyRefresh();
      if (summary.failedCount === 0 && !summary.aborted) {
        setEditingTraining(null);
        setIsFormOpen(false);
        setFormMode("manual");
      }
      const toast = formatBatchImportToast(summary);
      showToast(toast.message, toast.type);
    },
    [loadTrainings, bumpWeeklyRefresh, showToast]
  );

  // Sincronização manual bidirecional com Google Sheets
  const handleSyncSheets = async () => {
    if (isSyncingSheets) return;
    setIsSyncingSheets(true);
    try {
      const report = await tafService.syncGoogleSheets({
        direction: "bidirectional",
        forceFullResync: false,
      });

      clearCrossPageSheetsCaches();
      bumpWeeklyRefresh();

      const reloaded = await loadTrainings();
      if (!reloaded) {
        showToast(
          "Planilha sincronizada, mas falha ao atualizar a lista local.",
          "error"
        );
        return;
      }
      showToast(formatSheetsSyncReportSummary(report), "success");
    } catch (err) {
      showToast(
        getSheetsSyncErrorMessage(
          err,
          "Erro ao sincronizar planilha Google Sheets."
        ),
        "error"
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Excluir treino
  const handleDeleteTraining = async (id: string) => {
    try {
      await tafService.deleteTraining(id);
      clearCrossPageSheetsCaches({ includeGoal: false });
      setTrainings((prev) => {
        const updated = prev.filter((t) => t.id !== id);
        setCachedTrainings(updated);
        return updated;
      });
      bumpWeeklyRefresh();
      if (editingTraining?.id === id) {
        setEditingTraining(null);
        setIsFormOpen(false);
      }
      if (selectedDetailTraining?.id === id) {
        setSelectedDetailTraining(null);
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

    let weekActiveCalories = 0;
    let weekPrevActiveCalories = 0;
    let todayActiveCalories = 0;
    let monthActiveCalories = 0;

    const todayKey = getTodayFortalezaDateKey();

    trainings.forEach((t) => {
      const parsedDate = parseSafeDate(t.sessionDate);
      const time = parsedDate?.getTime() ?? 0;
      const diff = now - time;
      const actCalories = t.activeCalories || 0;

      // Hoje no calendário oficial de America/Fortaleza
      if (parsedDate && toFortalezaDateKey(parsedDate) === todayKey) {
        todayActiveCalories += actCalories;
      }

      // Semana atual (últimos 7 dias, aceitando tolerância para fuso horário local)
      if (diff <= oneWeekMs && diff >= -86400000) {
        weekCurrentKm += t.distanceKm || 0;
        weekDurationSeconds += t.durationSeconds || 0;
        weekActiveCalories += actCalories;
        if (typeof t.perceivedEffort === "number" && t.perceivedEffort > 0) {
          weekRpeSum += t.perceivedEffort;
          weekRpeCount++;
        }
      } else if (diff > oneWeekMs && diff <= twoWeeksMs) {
        // Semana anterior (de 7 a 14 dias atrás)
        weekPrevKm += t.distanceKm || 0;
        weekPrevActiveCalories += actCalories;
      }

      // Mês atual (últimos 30 dias)
      if (diff <= thirtyDaysMs && diff >= -86400000) {
        monthKm += t.distanceKm || 0;
        monthActiveCalories += actCalories;
      }
    });

    const weekDiffKm = Number((weekCurrentKm - weekPrevKm).toFixed(1));
    const weekDiffCalories = Math.round(weekActiveCalories - weekPrevActiveCalories);
    const avgPaceSec =
      weekCurrentKm > 0 ? Math.round(weekDurationSeconds / weekCurrentKm) : 0;
    const avgRpe =
      weekRpeCount > 0 ? Number((weekRpeSum / weekRpeCount).toFixed(1)) : null;

    return {
      weekCurrentKm: Number(weekCurrentKm.toFixed(1)),
      weekPrevKm: Number(weekPrevKm.toFixed(1)),
      weekDiffKm,
      monthKm: Number(monthKm.toFixed(1)),
      weekActiveCalories: Math.round(weekActiveCalories),
      weekPrevActiveCalories: Math.round(weekPrevActiveCalories),
      weekDiffCalories,
      todayActiveCalories: Math.round(todayActiveCalories),
      monthActiveCalories: Math.round(monthActiveCalories),
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
          className={`fixed top-4 right-4 z-50 max-w-[calc(100vw-2rem)] flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold border transition-all ${
            notification.type === "success"
              ? "bg-emerald-950/90 text-emerald-200 border-emerald-800"
              : "bg-red-950/90 text-red-200 border-red-800"
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
            onClick={() => {
              if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = null;
              }
              setNotification(null);
            }}
            className="text-[#8E9BB0] hover:text-[#FFFFFF] ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2942] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0B1020] border border-[#1E2942] text-[#B7F34A] text-xs font-semibold mb-2">
            <Activity className="w-3.5 h-3.5 text-[#B7F34A]" />
            Diário de Treinos • Consistência & Volume
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Diário de Treinos & Consistência
          </h1>
          <p className="text-sm text-[#8E9BB0] mt-1 max-w-xl">
            Acompanhe a sua rotina semanal de treinos, volume de quilômetros, pace médio e escala de esforço percebido (RPE).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => {
              if (
                activeTab === "diario" &&
                isFormOpen &&
                !editingTraining &&
                formMode === "manual"
              ) {
                setIsFormOpen(false);
              } else {
                if (activeTab !== "diario") {
                  handleTabChange("diario");
                }
                setEditingTraining(null);
                setFormMode("manual");
                setIsFormOpen(true);
              }
            }}
            icon={
              activeTab === "diario" &&
              isFormOpen &&
              !editingTraining &&
              formMode === "manual" ? (
                <X className="w-4 h-4" />
              ) : (
                <Plus className="w-4 h-4" />
              )
            }
          >
            {activeTab === "diario" &&
            isFormOpen &&
            !editingTraining &&
            formMode === "manual"
              ? "Fechar Formulário"
              : "Registrar Treino"}
          </Button>

          <button
            type="button"
            data-testid="open-import-panel-btn"
            onClick={() => {
              if (
                activeTab === "diario" &&
                isFormOpen &&
                !editingTraining &&
                formMode === "import"
              ) {
                setIsFormOpen(false);
              } else {
                if (activeTab !== "diario") {
                  handleTabChange("diario");
                }
                setEditingTraining(null);
                setFormMode("import");
                setIsFormOpen(true);
              }
            }}
            className={`inline-flex items-center justify-center font-bold transition-all duration-150 select-none active:scale-[0.98] border text-xs px-3.5 py-2.5 rounded-xl gap-1.5 cursor-pointer shadow-sm ${
              activeTab === "diario" &&
              isFormOpen &&
              !editingTraining &&
              formMode === "import"
                ? "bg-orange-500 text-white border-orange-500"
                : "border-orange-500/40 bg-orange-950/30 hover:bg-orange-950/60 text-orange-300"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importar .FIT / .GPX</span>
          </button>

          <button
            type="button"
            data-testid="sync-sheets-btn"
            onClick={handleSyncSheets}
            disabled={isSyncingSheets}
            className="inline-flex items-center justify-center font-bold transition-all duration-150 select-none active:scale-[0.98] border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-950/60 text-emerald-300 text-xs px-3.5 py-2.5 rounded-xl gap-1.5 cursor-pointer shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncingSheets ? "animate-spin" : ""}`}
            />
            <span>
              {isSyncingSheets ? "Sincronizando..." : "Sincronizar Planilha"}
            </span>
          </button>

          <Link
            href="/calculadora"
            className="inline-flex items-center justify-center font-medium transition-all duration-150 select-none active:scale-[0.98] border border-[#1E2942] bg-[#0B1020] hover:bg-[#1E2942] text-white text-xs px-3 py-2 rounded-xl gap-1.5 cursor-pointer shadow-sm"
          >
            <Calculator className="w-3.5 h-3.5 text-[#B7F34A]" />
            <span>Calculadoras</span>
          </Link>
          <Link
            href="/meu-taf"
            className="inline-flex items-center justify-center font-medium transition-all duration-150 select-none active:scale-[0.98] border border-[#1E2942] bg-[#0B1020] hover:bg-[#1E2942] text-white text-xs px-3 py-2 rounded-xl gap-1.5 cursor-pointer shadow-sm"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Meu TAF</span>
          </Link>
        </div>
      </div>

      {/* Seletor de Abas da Página */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-[#1E2942] pb-3"
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
              ? "bg-[#B7F34A] text-[#0B1020] shadow-md shadow-[#B7F34A]/25"
              : "bg-[#131A2E] border border-[#1E2942] text-[#8E9BB0] hover:text-white"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Diário & Registro</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === "diario"
                ? "bg-[#0B1020]/20 text-[#0B1020]"
                : "bg-[#0B1020] text-[#8E9BB0]"
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
              ? "bg-[#B7F34A] text-[#0B1020] shadow-md shadow-[#B7F34A]/25"
              : "bg-[#131A2E] border border-[#1E2942] text-[#8E9BB0] hover:text-white"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Evolução & Gráficos</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              activeTab === "graficos"
                ? "bg-[#0B1020]/20 text-[#0B1020]"
                : "bg-[#0B1020] text-[#8E9BB0]"
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
            <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-900/60 text-amber-200 text-xs sm:text-sm flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* 1. Volume Semanal */}
            <div
              data-testid="kpi-weekly-volume"
              className="p-4 sm:p-5 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-sm"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8E9BB0] mb-1">
                <Activity className="w-3.5 h-3.5 text-[#B7F34A]" />
                <span>Volume Semanal</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {stats.weekCurrentKm} <span className="text-xs font-normal text-[#8E9BB0]">km</span>
              </div>
              <p className="text-[11px] text-[#8E9BB0] mt-1 flex items-center gap-1">
                {stats.weekDiffKm >= 0 ? (
                  <span className="text-[#B7F34A] font-semibold">
                    +{stats.weekDiffKm} km
                  </span>
                ) : (
                  <span className="text-amber-400 font-semibold">
                    {stats.weekDiffKm} km
                  </span>
                )}{" "}
                vs semana anterior
              </p>
            </div>

            {/* 2. Volume Mensal */}
            <div
              data-testid="kpi-monthly-volume"
              className="p-4 sm:p-5 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-sm"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8E9BB0] mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#B7F34A]" />
                <span>Volume Mensal</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {stats.monthKm} <span className="text-xs font-normal text-[#8E9BB0]">km</span>
              </div>
              <p className="text-[11px] text-[#8E9BB0] mt-1">Últimos 30 dias</p>
            </div>

            {/* 3. Gasto Calórico Semanal (Fase 5) */}
            <div
              data-testid="kpi-weekly-calories"
              className="p-4 sm:p-5 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-sm"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8E9BB0] mb-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Calorias Semanais</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-400">
                {stats.weekActiveCalories}{" "}
                <span className="text-xs font-normal text-[#8E9BB0]">kcal</span>
              </div>
              <p className="text-[11px] text-[#8E9BB0] mt-1 flex items-center gap-1">
                {stats.weekDiffCalories >= 0 ? (
                  <span className="text-[#B7F34A] font-semibold">
                    +{stats.weekDiffCalories} kcal
                  </span>
                ) : (
                  <span className="text-amber-400 font-semibold">
                    {stats.weekDiffCalories} kcal
                  </span>
                )}{" "}
                vs anterior
              </p>
              <div className="text-[10px] text-[#8E9BB0] mt-1 border-t border-[#1E2942] pt-1">
                Hoje: <span className="font-semibold text-white">{stats.todayActiveCalories}</span> • Mês: <span className="font-semibold text-white">{stats.monthActiveCalories}</span>
              </div>
            </div>

            {/* 4. Pace Médio da Semana */}
            <div
              data-testid="kpi-avg-pace"
              className="p-4 sm:p-5 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-sm"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8E9BB0] mb-1">
                <Clock className="w-3.5 h-3.5 text-[#B7F34A]" />
                <span>Pace Médio</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {stats.avgPaceFormatted} <span className="text-xs font-normal text-[#8E9BB0]">/km</span>
              </div>
              <p className="text-[11px] text-[#8E9BB0] mt-1">Nesta semana</p>
            </div>

            {/* 5. Média de Esforço (RPE) */}
            <div
              data-testid="kpi-avg-rpe"
              className="p-4 sm:p-5 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-sm col-span-2 lg:col-span-1"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8E9BB0] mb-1">
                <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
                <span>Esforço (RPE)</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">
                {stats.avgRpe ? `${stats.avgRpe}` : "--"}{" "}
                <span className="text-xs font-normal text-[#8E9BB0]">/ 10</span>
              </div>
              <p className="text-[11px] text-[#8E9BB0] mt-1">
                {stats.avgRpe && stats.avgRpe >= 8
                  ? "Carga intensa (Atenção)"
                  : stats.avgRpe
                  ? "Carga controlada"
                  : "Sem registros"}
              </p>
            </div>
          </div>

          {/* Plano Semanal & Aderência */}
          <WeeklyAdherenceCard
            refreshTrigger={weeklyRefreshTrigger}
            onOpenSession={(session) => setSelectedDetailTraining(session)}
            onSyncSheets={handleSyncSheets}
            isSyncingSheets={isSyncingSheets}
          />

          {/* Formulário de Registro / Importação / Edição (exibido quando aberto ou editando) */}
          {isFormOpen && (
            <div className="pt-2 space-y-3 animate-fade-in">
              {!editingTraining && (
                <div
                  role="tablist"
                  aria-label="Modo de registro de treino"
                  data-testid="training-entry-mode-switcher"
                  className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#131A2E] border border-[#1E2942] rounded-2xl max-w-full"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={formMode === "manual"}
                    data-testid="mode-manual-btn"
                    onClick={() => setFormMode("manual")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      formMode === "manual"
                        ? "bg-[#B7F34A] text-[#0B1020] shadow-sm"
                        : "text-[#8E9BB0] hover:text-white"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Registro Manual</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={formMode === "import"}
                    data-testid="mode-import-btn"
                    onClick={() => setFormMode("import")}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      formMode === "import"
                        ? "bg-orange-500 text-white shadow-sm"
                        : "text-[#8E9BB0] hover:text-white"
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importar .FIT / .GPX (Strava)</span>
                  </button>
                </div>
              )}

              {editingTraining || formMode === "manual" ? (
                <TrainingForm
                  editingTraining={editingTraining}
                  onSave={handleSaveTraining}
                  onCancelEdit={handleCancelEdit}
                />
              ) : (
                <GpxImportPanel
                  onImported={handleImportedTraining}
                  onAttemptImported={handleImportedAttempt}
                  onMirroredTraining={upsertTrainingInState}
                  onBatchImported={handleBatchImported}
                  onCancel={() => {
                    setIsFormOpen(false);
                    setFormMode("manual");
                  }}
                />
              )}
            </div>
          )}

          {/* Lista e Timeline de Treinos */}
          <div className="pt-2">
            {isLoading ? (
              <div className="py-16 text-center text-[#8E9BB0] space-y-3 bg-[#131A2E] rounded-3xl border border-[#1E2942] p-8">
                <Flame className="w-8 h-8 mx-auto animate-pulse text-[#B7F34A]" />
                <p className="text-sm font-semibold text-white">Carregando seu histórico de treinos...</p>
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

      <TrainingDetailModal
        training={selectedDetailTraining}
        isOpen={Boolean(selectedDetailTraining)}
        onClose={() => setSelectedDetailTraining(null)}
        onEdit={(training) => {
          setSelectedDetailTraining(null);
          handleEdit(training);
        }}
      />
    </div>
  );
}

