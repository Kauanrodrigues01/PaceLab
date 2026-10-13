"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Scale,
  Flame,
  Calendar,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { tafService } from "@/lib/services/tafService";
import { profileService } from "@/lib/services/profileService";
import { TafGoalConfig, TafAttempt, TrainingSession, UserProfile } from "@/types";

export function AthleteActiveStatusCard() {
  const [goal, setGoal] = useState<TafGoalConfig | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<TafAttempt | null>(null);
  const [personalBest, setPersonalBest] = useState<number | null>(null);
  const [recentCalories, setRecentCalories] = useState<number>(0);
  const [recentTrainingsCount, setRecentTrainingsCount] = useState<number>(0);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [goalRes, attemptsRes, trainingsRes, profileRes] = await Promise.allSettled([
          tafService.getGoal(),
          tafService.getAttempts(),
          tafService.getTrainings(),
          profileService.getProfile(),
        ]);

        if (!isMounted) return;

        if (goalRes.status === "fulfilled" && goalRes.value) {
          setGoal(goalRes.value);
        }

        if (attemptsRes.status === "fulfilled" && Array.isArray(attemptsRes.value)) {
          const attempts = attemptsRes.value;
          if (attempts.length > 0) {
            setLatestAttempt(attempts[0]);
            const maxMeters = Math.max(...attempts.map((a) => a.distanceMeters));
            setPersonalBest(maxMeters);
          }
        }

        if (trainingsRes.status === "fulfilled" && Array.isArray(trainingsRes.value)) {
          const trainings: TrainingSession[] = trainingsRes.value;
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const recent = trainings.filter((t) => {
            const d = new Date(t.sessionDate);
            return d >= sevenDaysAgo;
          });

          const totalCalories = recent.reduce((acc, t) => acc + (t.totalCalories || t.activeCalories || 0), 0);
          setRecentCalories(totalCalories);
          setRecentTrainingsCount(recent.length);
        }

        if (profileRes.status === "fulfilled" && profileRes.value) {
          setProfile(profileRes.value);
        }
      } catch {
        // Silencioso em caso de erro de rede ou mock vazio
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Contagem regressiva
  let daysToExam: number | null = null;
  if (goal?.targetExamDate) {
    const examDate = new Date(goal.targetExamDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    examDate.setHours(0, 0, 0, 0);
    const diffTime = examDate.getTime() - today.getTime();
    daysToExam = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  const minDistance = goal?.minDistanceMeters ?? 2400;
  const isApproved = latestAttempt ? latestAttempt.distanceMeters >= minDistance : false;

  return (
    <div
      data-testid="athlete-active-status-card"
      className="relative overflow-hidden rounded-3xl bg-linear-to-br from-slate-900/90 via-slate-900/70 to-blue-950/40 border border-slate-700/60 p-6 sm:p-7 backdrop-blur-xl shadow-xl transition-all duration-300"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Painel do Atleta
              {goal?.institutionName && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                  {goal.institutionName}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Resumo integrado do seu desempenho e metas em tempo real
            </p>
          </div>
        </div>

        <Link
          href="/meu-taf"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors group"
        >
          <span>Acompanhar evolução</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Card 1: Último Simulado / TAF */}
        <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Último Simulado</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          {latestAttempt ? (
            <div>
              <div className="text-lg sm:text-xl font-black text-white">
                {latestAttempt.distanceMeters.toLocaleString("pt-BR")}{" "}
                <span className="text-xs font-normal text-slate-400">m</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {isApproved ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                    <ShieldCheck className="w-3 h-3" /> Apto Edital
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400">
                    <AlertTriangle className="w-3 h-3" /> Abaixo Edital
                  </span>
                )}
                {personalBest && personalBest > latestAttempt.distanceMeters && (
                  <span className="text-[10px] text-slate-400 ml-auto">
                    PB: {personalBest}m
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-bold text-slate-300">Sem simulados</div>
              <Link
                href="/meu-taf"
                className="text-[11px] text-blue-400 hover:underline mt-1 inline-block"
              >
                Fazer 1º Simulado →
              </Link>
            </div>
          )}
        </div>

        {/* Card 2: Peso Corporal Atual */}
        <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Peso Corporal</span>
            <Scale className="w-4 h-4 text-emerald-400" />
          </div>
          {profile?.currentWeightKg ? (
            <div>
              <div className="text-lg sm:text-xl font-black text-white">
                {profile.currentWeightKg}{" "}
                <span className="text-xs font-normal text-slate-400">kg</span>
              </div>
              <div className="text-[11px] text-emerald-400 font-medium mt-1">
                Monitorado no perfil
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-bold text-slate-300">Não informado</div>
              <Link
                href="/perfil"
                className="text-[11px] text-blue-400 hover:underline mt-1 inline-block"
              >
                Registrar no Perfil →
              </Link>
            </div>
          )}
        </div>

        {/* Card 3: Calorias (Últimos 7 dias) */}
        <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Gasto 7 Dias</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <div className="text-lg sm:text-xl font-black text-white">
              {recentCalories > 0 ? (
                <>
                  {recentCalories.toLocaleString("pt-BR")}{" "}
                  <span className="text-xs font-normal text-slate-400">kcal</span>
                </>
              ) : (
                <span className="text-sm font-bold text-slate-300">0 kcal</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-rose-400" />
              <span>{recentTrainingsCount} {recentTrainingsCount === 1 ? "sessão" : "sessões"}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Contagem Regressiva para a Prova */}
        <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-medium">Data do TAF</span>
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          {daysToExam !== null ? (
            <div>
              <div className="text-lg sm:text-xl font-black text-white">
                {daysToExam > 0 ? (
                  <>
                    {daysToExam}{" "}
                    <span className="text-xs font-normal text-slate-400">dias</span>
                  </>
                ) : daysToExam === 0 ? (
                  <span className="text-sm font-black text-amber-400">É hoje!</span>
                ) : (
                  <span className="text-xs font-medium text-slate-400">Realizada</span>
                )}
              </div>
              <div className="text-[11px] text-purple-300 font-medium mt-1 truncate">
                {goal?.targetExamDate
                  ? new Date(goal.targetExamDate).toLocaleDateString("pt-BR")
                  : "Definida"}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-bold text-slate-300">Sem data</div>
              <Link
                href="/perfil"
                className="text-[11px] text-blue-400 hover:underline mt-1 inline-block"
              >
                Definir data do edital →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
