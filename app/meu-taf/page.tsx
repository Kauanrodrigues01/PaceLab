"use client";

import React, { useState, useEffect, useCallback } from "react";
import { TafAttempt, TafGoalConfig, TrainingSession } from "@/types";
import { tafService, DEFAULT_GOAL } from "@/lib/services/tafService";
import { getPersonalRecord, processTafAttempts } from "@/lib/math/evolution";
import { TafAttemptForm } from "@/components/meu-taf/TafAttemptForm";
import { TafAttemptList } from "@/components/meu-taf/TafAttemptList";
import { TrainingForm } from "@/components/meu-taf/TrainingForm";
import { TrainingList } from "@/components/meu-taf/TrainingList";
import { EvolutionDashboard } from "@/components/meu-taf/EvolutionDashboard";
import { PeriodComparator } from "@/components/meu-taf/PeriodComparator";
import { GoalAndBackupSettings } from "@/components/meu-taf/GoalAndBackupSettings";
import {
  Trophy,
  Target,
  CheckCircle2,
  AlertTriangle,
  Database,
  Flame,
  LineChart,
  GitCompare,
  Settings,
  Calendar,
  Zap,
} from "lucide-react";

export default function MeuTafPage() {
  const [activeTab, setActiveTab] = useState<
    "testes" | "resumo" | "treinos" | "graficos" | "comparador" | "config"
  >("testes");

  const [goal, setGoal] = useState<TafGoalConfig>(DEFAULT_GOAL);
  const [attempts, setAttempts] = useState<TafAttempt[]>([]);
  const [editingAttempt, setEditingAttempt] = useState<TafAttempt | null>(null);

  // Estados do Diário de Treinos (Fase D)
  const [trainings, setTrainings] = useState<TrainingSession[]>([]);
  const [editingTraining, setEditingTraining] = useState<TrainingSession | null>(null);

  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    orm: string;
    database?: string;
  }>({ connected: false, orm: "Prisma" });

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Carrega dados iniciais
  const loadData = useCallback(async () => {
    try {
      const [fetchedGoal, fetchedAttempts, fetchedTrainings, health] = await Promise.all([
        tafService.getGoal(),
        tafService.getAttempts(),
        tafService.getTrainings(),
        tafService.checkDatabaseHealth(),
      ]);

      setGoal(fetchedGoal);
      setAttempts(fetchedAttempts);
      setTrainings(fetchedTrainings);
      setDbStatus(health);
    } catch (err) {
      console.error("Erro ao carregar dados do Meu TAF:", err);
    }
  }, []);

  useEffect(() => {
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
      const saved = await tafService.saveAttempt(attempt);

      setAttempts((prev) => {
        const index = prev.findIndex((a) => a.id === saved.id);
        if (index >= 0) {
          return prev.map((a) => (a.id === saved.id ? saved : a));
        }
        return [saved, ...prev];
      });

      setEditingAttempt(null);
      showToast(
        editingAttempt
          ? "Teste atualizado com sucesso!"
          : "Novo teste registrado no histórico com sucesso!"
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Erro ao salvar teste",
        "error"
      );
    }
  };

  // Excluir tentativa
  const handleDeleteAttempt = async (id: string) => {
    try {
      await tafService.deleteAttempt(id);
      setAttempts((prev) => prev.filter((a) => a.id !== id));
      if (editingAttempt?.id === id) {
        setEditingAttempt(null);
      }
      showToast("Teste excluído com sucesso.");
    } catch {
      showToast("Erro ao excluir teste", "error");
    }
  };

  // Salvar sessão de treino (Fase D)
  const handleSaveTraining = async (training: TrainingSession) => {
    try {
      const saved = await tafService.saveTraining(training);

      setTrainings((prev) => {
        const index = prev.findIndex((t) => t.id === saved.id);
        if (index >= 0) {
          return prev.map((t) => (t.id === saved.id ? saved : t));
        }
        return [saved, ...prev];
      });

      setEditingTraining(null);
      showToast(
        editingTraining
          ? "Treino atualizado com sucesso!"
          : "Novo treino registrado no diário com sucesso!"
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Erro ao salvar treino no diário",
        "error"
      );
    }
  };

  // Excluir sessão de treino (Fase D)
  const handleDeleteTraining = async (id: string) => {
    try {
      await tafService.deleteTraining(id);
      setTrainings((prev) => prev.filter((t) => t.id !== id));
      if (editingTraining?.id === id) {
        setEditingTraining(null);
      }
      showToast("Treino excluído com sucesso.");
    } catch {
      showToast("Erro ao excluir treino", "error");
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white p-6 sm:p-8 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/15 backdrop-blur-md text-blue-100 mb-3 border border-white/20">
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            Guarda Municipal de Fortaleza — TAF 12 Min
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
            Meu TAF
          </h1>
          <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
            Acompanhe a sua evolução real para a prova física. Registre cada simulado de 12
            minutos, visualize seus recordes pessoais e mantenha o ritmo ideal para a aprovação.
          </p>
        </div>

        {/* Status do Banco / Offline */}
        <div className="relative z-10 flex flex-col items-start md:items-end justify-center">
          <div
            data-testid="db-status-badge"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-md border ${
              dbStatus.connected
                ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/30"
                : "bg-amber-500/20 text-amber-200 border-amber-400/30"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {dbStatus.connected
                ? "Prisma ORM • PostgreSQL Conectado"
                : "Modo Local • Offline First"}
            </span>
          </div>
          <span className="text-[11px] text-blue-200/70 mt-1">
            Meta: {targetDistance.toLocaleString("pt-BR")} m em 12 min
          </span>
        </div>

        {/* Grafismo decorativo de fundo */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Grid de KPIs do Topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Recorde Pessoal 12 Min */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Recorde 12 Min
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {personalRecord12m
              ? `${personalRecord12m.distanceMeters.toLocaleString("pt-BR")} m`
              : "--"}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {personalRecord12m
              ? `Pace ${personalRecord12m.paceFormatted}/km (${personalRecord12m.speedKmh.toFixed(1)} km/h)`
              : "Nenhum teste ainda"}
          </p>
        </div>

        {/* KPI 2: Status da Meta */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Meta ({targetDistance}m)
            </span>
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isTargetAchieved
                  ? "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600"
                  : "bg-blue-100 dark:bg-blue-950/80 text-blue-600"
              }`}
            >
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-xl sm:text-2xl font-black ${
              isTargetAchieved
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {isTargetAchieved
              ? "Meta Atingida! 🎉"
              : personalRecord12m
              ? `Faltam ${deficitFromRecord} m`
              : `Alvo: ${targetDistance} m`}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Exige pace ≤ 5:13/km (11.5 km/h)
          </p>
        </div>

        {/* KPI 3: Último Teste */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Último Teste 12m
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {latest12mAttempt
              ? `${latest12mAttempt.distanceMeters.toLocaleString("pt-BR")} m`
              : "--"}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {latest12mAttempt
              ? new Date(latest12mAttempt.testDate).toLocaleDateString("pt-BR")
              : "Sem registros"}
          </p>
        </div>

        {/* KPI 4: Total de Simulados */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Simulados Feitos
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {attempts.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {attempts.length === 1
              ? "1 teste registrado"
              : `${attempts.length} testes no histórico`}
          </p>
        </div>
      </div>

      {/* Navegação por Abas do Hub */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab("testes")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "testes"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Trophy className="w-4 h-4" />
          Testes de 12 Min
        </button>

        <button
          onClick={() => setActiveTab("treinos")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "treinos"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Flame className="w-4 h-4" />
          Diário de Treinos
        </button>

        <button
          onClick={() => setActiveTab("graficos")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "graficos"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <LineChart className="w-4 h-4" />
          Gráficos de Evolução
        </button>

        <button
          onClick={() => setActiveTab("comparador")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "comparador"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <GitCompare className="w-4 h-4" />
          Comparar Períodos
        </button>

        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "config"
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Settings className="w-4 h-4" />
          Meta & Banco
        </button>
      </div>

      {/* Conteúdo da Aba 1: Testes de 12 Minutos (Fase C) */}
      {activeTab === "testes" && (
        <div className="space-y-6">
          {/* Formulário de Registro Rápido */}
          <TafAttemptForm
            targetDistanceMeters={targetDistance}
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

      {/* Conteúdo da Aba 2: Diário de Treinos (Fase D) */}
      {activeTab === "treinos" && (
        <div className="space-y-6">
          <TrainingForm
            editingTraining={editingTraining}
            onSave={handleSaveTraining}
            onCancelEdit={() => setEditingTraining(null)}
          />

          <TrainingList
            trainings={trainings}
            onEdit={(trn) => {
              setEditingTraining(trn);
              window.scrollTo({ top: 200, behavior: "smooth" });
            }}
            onDelete={handleDeleteTraining}
          />
        </div>
      )}

      {/* Conteúdo da Aba 3: Painel de Evolução & 5 Gráficos (Fase E) */}
      {activeTab === "graficos" && (
        <EvolutionDashboard
          attempts={attempts}
          trainings={trainings}
          goal={goal}
        />
      )}

      {/* Conteúdo da Aba 4: Comparador de Períodos (Fase F) */}
      {activeTab === "comparador" && (
        <PeriodComparator
          trainings={trainings}
          attempts={attempts}
          targetDurationSeconds={720}
        />
      )}

      {/* Conteúdo da Aba 5: Meta da Prova & Backup (Fase F) */}
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
