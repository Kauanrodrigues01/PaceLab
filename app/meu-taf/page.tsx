"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TafAttempt, TafGoalConfig, TrainingSession } from "@/types";
import { tafService, DEFAULT_GOAL } from "@/lib/services/tafService";
import { getPersonalRecord, processTafAttempts } from "@/lib/math/evolution";
import { TafAttemptForm } from "@/components/meu-taf/TafAttemptForm";
import { TafAttemptList } from "@/components/meu-taf/TafAttemptList";
import { EvolutionDashboard } from "@/components/meu-taf/EvolutionDashboard";
import { PeriodComparator } from "@/components/meu-taf/PeriodComparator";
import { GoalAndBackupSettings } from "@/components/meu-taf/GoalAndBackupSettings";
import { CooperVo2MaxCard } from "@/components/meu-taf/CooperVo2MaxCard";
import { TafApprovalRuler } from "@/components/meu-taf/TafApprovalRuler";
import { TafComplementaryExercisesCard } from "@/components/meu-taf/TafComplementaryExercisesCard";
import { calculateAge } from "@/lib/math/cooper";
import { profileService } from "@/lib/services/profileService";
import { UserProfile } from "@/types";
import {
  Trophy,
  Target,
  CheckCircle2,
  AlertTriangle,
  Database,
  LineChart,
  GitCompare,
  Settings,
  Calendar,
  Zap,
  Activity,
  Dumbbell,
} from "lucide-react";

const TAF_ATTEMPTS_CACHE_KEY = "pacelab_cache_taf_attempts";
const TAF_GOAL_CACHE_KEY = "pacelab_cache_taf_goal";
const TAF_TRAININGS_CACHE_KEY = "pacelab_cache_taf_trainings";

const getCachedAttempts = (): TafAttempt[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(TAF_ATTEMPTS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getCachedGoal = (): TafGoalConfig => {
  if (typeof window === "undefined") return DEFAULT_GOAL;
  try {
    const raw = sessionStorage.getItem(TAF_GOAL_CACHE_KEY);
    if (!raw) return DEFAULT_GOAL;
    return JSON.parse(raw) || DEFAULT_GOAL;
  } catch {
    return DEFAULT_GOAL;
  }
};

const getCachedTrainings = (): TrainingSession[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(TAF_TRAININGS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function MeuTafPage() {
  const [activeTab, setActiveTab] = useState<
    "testes" | "graficos" | "comparador" | "config"
  >("testes");

  const [goal, setGoal] = useState<TafGoalConfig>(DEFAULT_GOAL);
  const [attempts, setAttempts] = useState<TafAttempt[]>([]);
  const [editingAttempt, setEditingAttempt] = useState<TafAttempt | null>(null);

  // Treinos mantidos para os gráficos agregados, comparador e backup
  const [trainings, setTrainings] = useState<TrainingSession[]>([]);

  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    orm: string;
    database?: string;
  }>({ connected: false, orm: "Prisma" });

  const [athleteProfile, setAthleteProfile] = useState<UserProfile | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Carrega dados do Supabase em segundo plano (Stale-While-Revalidate)
  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [fetchedGoal, fetchedAttempts, fetchedTrainings, health, profile] = await Promise.all([
        tafService.getGoal(),
        tafService.getAttempts(),
        tafService.getTrainings(),
        tafService.checkDatabaseHealth(),
        profileService.getProfile().catch(() => null),
      ]);

      setGoal(fetchedGoal);
      setAttempts(fetchedAttempts);
      setTrainings(fetchedTrainings);
      setDbStatus(health);
      if (profile) setAthleteProfile(profile);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(TAF_GOAL_CACHE_KEY, JSON.stringify(fetchedGoal));
          sessionStorage.setItem(TAF_ATTEMPTS_CACHE_KEY, JSON.stringify(fetchedAttempts));
          sessionStorage.setItem(TAF_TRAININGS_CACHE_KEY, JSON.stringify(fetchedTrainings));
        } catch {
          // Ignorado defensivamente
        }
      }
    } catch (err) {
      console.error("Erro ao carregar dados do Meu TAF:", err);
      setLoadError("Não foi possível carregar os dados do Supabase. Verifique sua conexão com a internet.");
      setDbStatus({ connected: false, orm: "Prisma" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Hidratação rápida com cache de sessão se disponível
    const cachedAttempts = getCachedAttempts();
    if (cachedAttempts.length > 0) {
      setAttempts(cachedAttempts);
      setIsLoading(false);
    }
    const cachedGoal = getCachedGoal();
    if (cachedGoal && cachedGoal.targetDistanceMeters) {
      setGoal(cachedGoal);
    }
    const cachedTrainings = getCachedTrainings();
    if (cachedTrainings.length > 0) {
      setTrainings(cachedTrainings);
    }
    loadData();
  }, [loadData]);

  // Mensagem temporária
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Salvar tentativa
  const handleSaveAttempt = async (attempt: TafAttempt) => {
    try {
      const isUpdate = Boolean(editingAttempt) || attempts.some((a) => a.id === attempt.id);
      const saved = await tafService.saveAttempt(attempt, isUpdate);

      setAttempts((prev) => {
        const index = prev.findIndex((a) => a.id === saved.id);
        const updated = index >= 0
          ? prev.map((a) => (a.id === saved.id ? saved : a))
          : [saved, ...prev];
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(TAF_ATTEMPTS_CACHE_KEY, JSON.stringify(updated));
          } catch {}
        }
        return updated;
      });

      setEditingAttempt(null);
      showToast(
        editingAttempt
          ? "Teste atualizado com sucesso!"
          : "Novo teste registrado no histórico com sucesso!"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar teste";
      showToast(msg, "error");
      throw err;
    }
  };

  // Excluir tentativa
  const handleDeleteAttempt = async (id: string) => {
    try {
      await tafService.deleteAttempt(id);
      setAttempts((prev) => {
        const updated = prev.filter((a) => a.id !== id);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem(TAF_ATTEMPTS_CACHE_KEY, JSON.stringify(updated));
          } catch {}
        }
        return updated;
      });
      if (editingAttempt?.id === id) {
        setEditingAttempt(null);
      }
      showToast("Teste excluído com sucesso.");
    } catch {
      showToast("Erro ao excluir teste", "error");
    }
  };

  // Cálculos de KPI para os Cards do Topo
  const processedAttempts = processTafAttempts(
    attempts,
    goal.targetDistanceMeters || 2300
  );
  const personalRecord12m = getPersonalRecord(attempts, 720);
  const targetDistance = goal.targetDistanceMeters || 2300;
  const isTargetAchieved =
    personalRecord12m && personalRecord12m.distanceMeters >= targetDistance;
  const deficitFromRecord = personalRecord12m
    ? targetDistance - personalRecord12m.distanceMeters
    : targetDistance;

  // Último teste de 12 minutos
  const latest12mAttempt = processedAttempts.find(
    (a) => (a.targetDurationSeconds || 720) === 720
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          data-testid="toast-notification"
          className={`fixed top-20 right-4 sm:right-8 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs sm:text-sm font-semibold transition-all animate-in fade-in slide-in-from-top-4 ${
            notification.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#131A2E] border border-[#1E2942] text-white p-6 sm:p-8 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#0B1020] text-[#B7F34A] mb-3 border border-[#1E2942]">
            <Trophy className="w-3.5 h-3.5 text-[#B7F34A]" />
            {goal.institutionName || "Edital Oficial"} — TAF 12 Min
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2 text-white">
            Meu TAF
          </h1>
          <p className="text-xs sm:text-sm text-[#8E9BB0] leading-relaxed">
            Painel oficial dos simulados de 12 minutos. Acompanhe a evolução da distância percorrida,
            recordes pessoais e índice de aprovação da meta do edital.
          </p>
        </div>

        {/* Status do Banco Supabase e Links */}
        <div className="relative z-10 flex flex-col items-start md:items-end justify-center gap-2">
          <div
            data-testid="db-status-badge"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border ${
              dbStatus.connected
                ? "bg-[#B7F34A]/10 text-[#B7F34A] border-[#B7F34A]/30"
                : "bg-rose-500/20 text-rose-300 border-rose-500/30"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {dbStatus.connected
                ? "Supabase • PostgreSQL Conectado"
                : "Offline • Conexão Indisponível"}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/treinos"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#0B1020] hover:bg-[#1E2942] text-white transition-colors border border-[#1E2942]"
            >
              <Activity className="w-3 h-3 text-[#B7F34A]" />
              <span>Diário de Treinos</span>
            </Link>
            <span className="text-[11px] text-[#8E9BB0] font-medium">
              Meta: {targetDistance.toLocaleString("pt-BR")} m
            </span>
          </div>
        </div>

        {/* Grafismo decorativo de fundo */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#B7F34A]/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Seletor Multimodal do TAF (Prontidão para Barra, Flexão, Abdominal) */}
      <div
        data-testid="taf-multimodal-selector"
        className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-4 sm:p-5 shadow-xs"
      >
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-[#B7F34A]" />
              Modalidades do TAF do Concurso
            </span>
            <p className="text-[11px] text-[#8E9BB0] mt-0.5">
              Simulações de prova física para avaliação da banca examinadora.
            </p>
          </div>
          <Link
            href="/treinos"
            className="text-xs font-bold text-[#B7F34A] hover:underline flex items-center gap-1"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Acessar Diário de Treinos Semanais →</span>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
          {/* Modalidade 1: Corrida 12 Minutos (Ativa) */}
          <button
            type="button"
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#B7F34A] text-[#0B1020] font-bold text-xs shadow-md shadow-[#B7F34A]/20 transition-transform"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Trophy className="w-4 h-4 text-[#0B1020]" />
              <span>Corrida 12 Min</span>
            </div>
            <span className="text-[10px] font-semibold opacity-90">Módulo Ativo</span>
          </button>

          {/* Modalidade 2: Barra Fixa (Em breve) */}
          <button
            type="button"
            disabled
            title="Módulo de Barra Fixa em preparação"
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#0B1020]/40 text-[#8E9BB0]/60 font-semibold text-xs border border-dashed border-[#1E2942] cursor-not-allowed opacity-75"
          >
            <span className="mb-1">Barra Fixa</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1E2942] text-[#8E9BB0]">
              Em breve
            </span>
          </button>

          {/* Modalidade 3: Flexão de Braço (Em breve) */}
          <button
            type="button"
            disabled
            title="Módulo de Flexão de Braço em preparação"
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#0B1020]/40 text-[#8E9BB0]/60 font-semibold text-xs border border-dashed border-[#1E2942] cursor-not-allowed opacity-75"
          >
            <span className="mb-1">Flexão de Braço</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1E2942] text-[#8E9BB0]">
              Em breve
            </span>
          </button>

          {/* Modalidade 4: Abdominal Remador (Em breve) */}
          <button
            type="button"
            disabled
            title="Módulo de Abdominal em preparação"
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#0B1020]/40 text-[#8E9BB0]/60 font-semibold text-xs border border-dashed border-[#1E2942] cursor-not-allowed opacity-75"
          >
            <span className="mb-1">Abdominal Remador</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1E2942] text-[#8E9BB0]">
              Em breve
            </span>
          </button>
        </div>
      </div>

      {/* Banner de Erro de Conexão com o Supabase */}
      {loadError && (
        <div
          data-testid="db-load-error-banner"
          className="bg-rose-950/40 border border-rose-900/60 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-200 text-xs font-medium"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition-colors shrink-0"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Grid de KPIs do Topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Recorde Pessoal 12 Min */}
        <div className="bg-[#131A2E] border border-[#1E2942] p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#8E9BB0]">
              Recorde 12 Min
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#1E2942] text-amber-400 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {personalRecord12m
              ? `${personalRecord12m.distanceMeters.toLocaleString("pt-BR")} m`
              : "--"}
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-1">
            {personalRecord12m
              ? `Pace ${personalRecord12m.paceFormatted || "--"}/km (${
                  typeof personalRecord12m.speedKmh === "number"
                    ? personalRecord12m.speedKmh.toFixed(1)
                    : personalRecord12m.distanceMeters > 0
                    ? ((personalRecord12m.distanceMeters / 1000) / (720 / 3600)).toFixed(1)
                    : "--"
                } km/h)`
              : "Nenhum teste ainda"}
          </p>
        </div>

        {/* KPI 2: Status da Meta */}
        <div className="bg-[#131A2E] border border-[#1E2942] p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#8E9BB0]">
              Meta ({targetDistance}m)
            </span>
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isTargetAchieved
                  ? "bg-[#B7F34A]/10 text-[#B7F34A]"
                  : "bg-[#1E2942] text-[#B7F34A]"
              }`}
            >
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-xl sm:text-2xl font-black ${
              isTargetAchieved
                ? "text-[#B7F34A]"
                : "text-amber-400"
            }`}
          >
            {isTargetAchieved
              ? "Meta Atingida! 🎉"
              : personalRecord12m
              ? `Faltam ${deficitFromRecord} m`
              : `Alvo: ${targetDistance} m`}
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-1">
            Exige pace ≤ 5:13/km (11.5 km/h)
          </p>
        </div>

        {/* KPI 3: Último Teste */}
        <div className="bg-[#131A2E] border border-[#1E2942] p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#8E9BB0]">
              Último Teste 12m
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#1E2942] text-[#B7F34A] flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {latest12mAttempt
              ? `${latest12mAttempt.distanceMeters.toLocaleString("pt-BR")} m`
              : "--"}
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-1">
            {latest12mAttempt
              ? new Date(latest12mAttempt.testDate).toLocaleDateString("pt-BR")
              : "Sem registros"}
          </p>
        </div>

        {/* KPI 4: Total de Simulados */}
        <div className="bg-[#131A2E] border border-[#1E2942] p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#8E9BB0]">
              Simulados Feitos
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#1E2942] text-[#8E9BB0] flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">
            {attempts.length}
          </div>
          <p className="text-[11px] text-[#8E9BB0] mt-1">
            {attempts.length === 1
              ? "1 teste registrado"
              : `${attempts.length} testes no histórico`}
          </p>
        </div>
      </div>

      {/* Indicador de Carregamento Inicial do Supabase */}
      {isLoading && (
        <div data-testid="loading-indicator" className="flex items-center justify-center gap-2 py-1 text-xs text-[#B7F34A] font-medium animate-pulse">
          <div className="w-3.5 h-3.5 border-2 border-[#B7F34A] border-t-transparent rounded-full animate-spin" />
          <span>Carregando dados do Supabase...</span>
        </div>
      )}

      {/* Navegação por Abas do Hub Meu TAF */}
      <div className="flex items-center gap-1.5 border-b border-[#1E2942] overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab("testes")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "testes"
              ? "bg-[#B7F34A] text-[#0B1020] shadow-sm shadow-[#B7F34A]/30"
              : "text-[#8E9BB0] hover:text-white hover:bg-[#131A2E]"
          }`}
        >
          <Trophy className="w-4 h-4" />
          Testes de 12 Min
        </button>

        <button
          onClick={() => setActiveTab("graficos")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "graficos"
              ? "bg-[#B7F34A] text-[#0B1020] shadow-sm shadow-[#B7F34A]/30"
              : "text-[#8E9BB0] hover:text-white hover:bg-[#131A2E]"
          }`}
        >
          <LineChart className="w-4 h-4" />
          Gráficos de Evolução
        </button>

        <button
          onClick={() => setActiveTab("comparador")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "comparador"
              ? "bg-[#B7F34A] text-[#0B1020] shadow-sm shadow-[#B7F34A]/30"
              : "text-[#8E9BB0] hover:text-white hover:bg-[#131A2E]"
          }`}
        >
          <GitCompare className="w-4 h-4" />
          Comparar Períodos
        </button>

        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "config"
              ? "bg-[#B7F34A] text-[#0B1020] shadow-sm shadow-[#B7F34A]/30"
              : "text-[#8E9BB0] hover:text-white hover:bg-[#131A2E]"
          }`}
        >
          <Settings className="w-4 h-4" />
          Meta & Banco
        </button>
      </div>

      {/* Conteúdo da Aba 1: Simulados de 12 Minutos */}
      {activeTab === "testes" && (
        <div className="space-y-6">
          {/* Régua Visual de Aprovação */}
          <TafApprovalRuler
            currentDistance={
              personalRecord12m?.distanceMeters || latest12mAttempt?.distanceMeters || 0
            }
            minDistance={goal?.minDistanceMeters || 2400}
            targetDistance={targetDistance}
            institutionName={goal?.institutionName}
          />

          {/* Estimativa de VO2 Máx pelo Teste de Cooper */}
          {(personalRecord12m?.distanceMeters || latest12mAttempt?.distanceMeters) ? (
            <CooperVo2MaxCard
              distanceMeters={
                personalRecord12m?.distanceMeters || latest12mAttempt?.distanceMeters || 0
              }
              initialAge={calculateAge(athleteProfile?.birthDate)}
              initialGender={athleteProfile?.gender}
            />
          ) : null}

          {/* Exercícios Complementares do TAF (Barra, Flexão, Abdominal) */}
          <TafComplementaryExercisesCard goal={goal} />

          {/* Formulário de Registro Rápido */}
          <TafAttemptForm
            targetDistanceMeters={targetDistance}
            minDistanceMeters={goal?.minDistanceMeters || 2400}
            targetDurationMinutes={goal?.targetDurationMinutes || 12}
            institutionName={goal?.institutionName || "Edital Padrão"}
            previousBestAttempt={personalRecord12m}
            lastAttemptSameDuration={latest12mAttempt}
            editingAttempt={editingAttempt}
            onSave={handleSaveAttempt}
            onCancelEdit={() => setEditingAttempt(null)}
          />

          {/* Listagem de Tentativas */}
          <TafAttemptList
            attempts={attempts}
            targetDistanceMeters={targetDistance}
            onEdit={(att) => {
              setEditingAttempt(att);
              window.scrollTo({ top: 200, behavior: "smooth" });
            }}
            onDelete={handleDeleteAttempt}
          />
        </div>
      )}

      {/* Conteúdo da Aba 2: Painel de Evolução & Gráficos do TAF */}
      {activeTab === "graficos" && (
        <EvolutionDashboard
          attempts={attempts}
          trainings={trainings}
          goal={goal}
        />
      )}

      {/* Conteúdo da Aba 3: Comparador de Simulados & Períodos */}
      {activeTab === "comparador" && (
        <PeriodComparator
          trainings={trainings}
          attempts={attempts}
          targetDurationSeconds={720}
        />
      )}

      {/* Conteúdo da Aba 4: Meta Oficial & Backup */}
      {activeTab === "config" && (
        <GoalAndBackupSettings
          goal={goal}
          attempts={attempts}
          trainings={trainings}
          onGoalSaved={(savedGoal) => setGoal(savedGoal)}
          onDataRefreshed={loadData}
          showToast={showToast}
        />
      )}
    </div>
  );
}
