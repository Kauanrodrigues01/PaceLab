"use client";

import React, { useState } from "react";
import {
  Flame,
  Timer,
  Gauge,
  Milestone,
  RotateCcw,
  Calculator,
  AlertCircle,
  BookmarkPlus,
  Check,
  Sparkles,
  Zap,
  Repeat,
  HeartPulse,
  Compass,
  Target,
  Scissors,
  Smartphone,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResultBlock } from "@/components/ui/ResultBlock";
import { CopyButton } from "@/components/ui/CopyButton";
import { Badge } from "@/components/ui/Badge";
import { calcIntervalSession } from "@/lib/math/intervals";
import { calcIntervalCalories } from "@/lib/math/calories";
import { profileService } from "@/lib/services/profileService";
import { tafService } from "@/lib/services/tafService";
import { formatDecimal, formatTime, parseTime } from "@/lib/formatting/time";
import { historyStorage } from "@/lib/storage/localStorage";
import { IntervalLimitType, IntervalSession, TafGoalConfig } from "@/types";
import { IntervalSpeedProfileChart } from "@/components/intervalado/IntervalSpeedProfileChart";
import { TrackWorkoutCardModal } from "@/components/intervalado/TrackWorkoutCardModal";

const INTERVAL_DRAFT_KEY = "pacelab_draft_interval";

interface IntervalDraft {
  warmupDuration: string;
  warmupSpeed: string;
  runDuration: string;
  runSpeed: string;
  walkDuration: string;
  walkSpeed: string;
  repetitions: string;
  cooldownDuration: string;
  cooldownSpeed: string;
  limitType: IntervalLimitType;
  limitDistance: string;
  limitTime: string;
}

const getInitialIntervalDraft = (): IntervalDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(INTERVAL_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function IntervaladoPage() {
  // Aquecimento
  const [warmupDuration, setWarmupDuration] = useState("5");
  const [warmupSpeed, setWarmupSpeed] = useState("8");

  // Tiro (Corrida de Alta Intensidade)
  const [runDuration, setRunDuration] = useState("2");
  const [runSpeed, setRunSpeed] = useState("13");

  // Recuperação (Caminhada ou Trote Leve)
  const [walkDuration, setWalkDuration] = useState("1.5");
  const [walkSpeed, setWalkSpeed] = useState("6");

  // Séries / Repetições
  const [repetitions, setRepetitions] = useState("6");

  // Desaquecimento
  const [cooldownDuration, setCooldownDuration] = useState("5");
  const [cooldownSpeed, setCooldownSpeed] = useState("7");

  // Limite da Sessão (Opcional)
  const [limitType, setLimitType] = useState<IntervalLimitType>("none");
  const [limitDistance, setLimitDistance] = useState("2.4");
  const [limitTime, setLimitTime] = useState("12");

  // Restaura rascunho de inputs se disponível no sessionStorage
  React.useEffect(() => {
    const draft = getInitialIntervalDraft();
    if (draft) {
      if (draft.warmupDuration !== undefined) setWarmupDuration(draft.warmupDuration);
      if (draft.warmupSpeed !== undefined) setWarmupSpeed(draft.warmupSpeed);
      if (draft.runDuration !== undefined) setRunDuration(draft.runDuration);
      if (draft.runSpeed !== undefined) setRunSpeed(draft.runSpeed);
      if (draft.walkDuration !== undefined) setWalkDuration(draft.walkDuration);
      if (draft.walkSpeed !== undefined) setWalkSpeed(draft.walkSpeed);
      if (draft.repetitions !== undefined) setRepetitions(draft.repetitions);
      if (draft.cooldownDuration !== undefined) setCooldownDuration(draft.cooldownDuration);
      if (draft.cooldownSpeed !== undefined) setCooldownSpeed(draft.cooldownSpeed);
      if (draft.limitType !== undefined) setLimitType(draft.limitType);
      if (draft.limitDistance !== undefined) setLimitDistance(draft.limitDistance);
      if (draft.limitTime !== undefined) setLimitTime(draft.limitTime);
    }
  }, []);

  // Metas dinâmicas do TAF
  const [userGoal, setUserGoal] = useState<TafGoalConfig | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    tafService
      .getGoal()
      .then((g) => {
        if (isMounted && g) {
          setUserGoal(g);
        }
      })
      .catch(() => null);

    return () => {
      isMounted = false;
    };
  }, []);

  // Erros
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Resultado
  const [sessionResult, setSessionResult] = useState<IntervalSession | null>(() => {
    try {
      return calcIntervalSession({
        warmupDurationSeconds: 5 * 60,
        warmupSpeedKmh: 8,
        runDurationSeconds: 2 * 60,
        runSpeedKmh: 13,
        walkDurationSeconds: 1.5 * 60,
        walkSpeedKmh: 6,
        repetitions: 6,
        cooldownDurationSeconds: 5 * 60,
        cooldownSpeedKmh: 7,
      });
    } catch {
      return null;
    }
  });

  const [savedToHistory, setSavedToHistory] = useState(false);
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);

  // Peso corporal do atleta para estimativa de gasto calórico
  const [athleteWeightKg, setAthleteWeightKg] = useState<number | null>(null);

  React.useEffect(() => {
    profileService
      .getProfile()
      .then((prof) => {
        if (prof?.currentWeightKg) {
          setAthleteWeightKg(prof.currentWeightKg);
        }
      })
      .catch(() => {});
  }, []);

  // Estimativa de gasto calórico da sessão intervalada (Compêndio 2024 Herrmann et al.)
  const calorieResult = React.useMemo(() => {
    if (!sessionResult) return null;
    const weightToUse = athleteWeightKg && athleteWeightKg > 0 ? athleteWeightKg : 70;
    try {
      return calcIntervalCalories(sessionResult, weightToUse);
    } catch {
      return null;
    }
  }, [sessionResult, athleteWeightKg]);

  // Parse de duração flexível (aceita minutos inteiros, decimais como 1.5 ou MM:SS como 1:30)
  const parseFlexibleDuration = (value: string): number => {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (trimmed.includes(":")) {
      return parseTime(trimmed);
    }
    const num = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      throw new Error("Duração inválida");
    }
    return Math.round(num * 60);
  };

  const handleCalculate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    let warmupSec = 0;
    let runSec = 0;
    let walkSec = 0;
    let cooldownSec = 0;

    try {
      warmupSec = parseFlexibleDuration(warmupDuration);
    } catch {
      newErrors.warmupDuration = "Duração de aquecimento inválida.";
    }

    try {
      runSec = parseFlexibleDuration(runDuration);
      if (runSec <= 0) newErrors.runDuration = "O tiro deve ter duração maior que zero.";
    } catch {
      newErrors.runDuration = "Duração de corrida inválida.";
    }

    try {
      walkSec = parseFlexibleDuration(walkDuration);
    } catch {
      newErrors.walkDuration = "Duração de recuperação inválida.";
    }

    try {
      cooldownSec = parseFlexibleDuration(cooldownDuration);
    } catch {
      newErrors.cooldownDuration = "Duração de desaquecimento inválida.";
    }

    const repNum = Number(repetitions);
    if (!Number.isInteger(repNum) || repNum <= 0) {
      newErrors.repetitions = "O número de repetições deve ser um número inteiro maior que zero.";
    }

    const warmupSpdNum = Number(warmupSpeed.replace(",", "."));
    if (warmupSec > 0 && (!Number.isFinite(warmupSpdNum) || warmupSpdNum <= 0)) {
      newErrors.warmupSpeed = "Velocidade deve ser maior que zero.";
    }

    const runSpdNum = Number(runSpeed.replace(",", "."));
    if (!Number.isFinite(runSpdNum) || runSpdNum <= 0) {
      newErrors.runSpeed = "Velocidade do tiro deve ser maior que zero.";
    }

    const walkSpdNum = Number(walkSpeed.replace(",", "."));
    if (walkSec > 0 && (!Number.isFinite(walkSpdNum) || walkSpdNum <= 0)) {
      newErrors.walkSpeed = "Velocidade de recuperação deve ser maior que zero.";
    }

    const cdSpdNum = Number(cooldownSpeed.replace(",", "."));
    if (cooldownSec > 0 && (!Number.isFinite(cdSpdNum) || cdSpdNum <= 0)) {
      newErrors.cooldownSpeed = "Velocidade deve ser maior que zero.";
    }

    let parsedMaxDistKm: number | undefined = undefined;
    let parsedMaxDurSec: number | undefined = undefined;

    if (limitType === "distance") {
      const dNum = Number(limitDistance.replace(",", "."));
      if (!Number.isFinite(dNum) || dNum <= 0) {
        newErrors.limitDistance = "A distância máxima deve ser maior que zero.";
      } else {
        parsedMaxDistKm = dNum;
      }
    } else if (limitType === "time") {
      try {
        const tSec = parseFlexibleDuration(limitTime);
        if (tSec <= 0) {
          newErrors.limitTime = "O tempo máximo deve ser maior que zero.";
        } else {
          parsedMaxDurSec = tSec;
        }
      } catch {
        newErrors.limitTime = "Duração de limite inválida.";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setSessionResult(null);
      return;
    }

    try {
      const res = calcIntervalSession({
        warmupDurationSeconds: warmupSec,
        warmupSpeedKmh: warmupSpdNum,
        runDurationSeconds: runSec,
        runSpeedKmh: runSpdNum,
        walkDurationSeconds: walkSec,
        walkSpeedKmh: walkSpdNum,
        repetitions: repNum,
        cooldownDurationSeconds: cooldownSec,
        cooldownSpeedKmh: cdSpdNum,
        limitType,
        maxDistanceKm: parsedMaxDistKm,
        maxDurationSeconds: parsedMaxDurSec,
      });
      setSessionResult(res);
      setErrors({});
      setSavedToHistory(false);

      if (typeof window !== "undefined") {
        try {
          const draft: IntervalDraft = {
            warmupDuration,
            warmupSpeed,
            runDuration,
            runSpeed,
            walkDuration,
            walkSpeed,
            repetitions,
            cooldownDuration,
            cooldownSpeed,
            limitType,
            limitDistance,
            limitTime,
          };
          sessionStorage.setItem(INTERVAL_DRAFT_KEY, JSON.stringify(draft));
        } catch {}
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro no cálculo do intervalado";
      setErrors({ form: msg });
      setSessionResult(null);
    }
  };

  const handleLoadExample = () => {
    setWarmupDuration("5");
    setWarmupSpeed("8");
    setRunDuration("2");
    setRunSpeed("13");
    setWalkDuration("1.5");
    setWalkSpeed("6");
    setRepetitions("6");
    setCooldownDuration("5");
    setCooldownSpeed("7");
    setLimitType("none");
    setLimitDistance("2.4");
    setLimitTime("12");
    setErrors({});
    const res = calcIntervalSession({
      warmupDurationSeconds: 300,
      warmupSpeedKmh: 8,
      runDurationSeconds: 120,
      runSpeedKmh: 13,
      walkDurationSeconds: 90,
      walkSpeedKmh: 6,
      repetitions: 6,
      cooldownDurationSeconds: 300,
      cooldownSpeedKmh: 7,
    });
    setSessionResult(res);
  };

  const handleReset = () => {
    setWarmupDuration("");
    setWarmupSpeed("");
    setRunDuration("");
    setRunSpeed("");
    setWalkDuration("");
    setWalkSpeed("");
    setRepetitions("");
    setCooldownDuration("");
    setCooldownSpeed("");
    setLimitType("none");
    setLimitDistance("2.4");
    setLimitTime("12");
    setErrors({});
    setSessionResult(null);
    setSavedToHistory(false);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(INTERVAL_DRAFT_KEY);
      } catch {}
    }
  };

  const handleSaveToHistory = () => {
    if (!sessionResult) return;

    let limitText = "";
    if (sessionResult.limitInfo && sessionResult.limitInfo.type !== "none") {
      limitText =
        sessionResult.limitInfo.type === "distance"
          ? ` [Trava: ${sessionResult.limitInfo.targetValue} km]`
          : ` [Trava: ${formatTime(sessionResult.limitInfo.targetValue)}]`;
    }

    historyStorage.save({
      id: "intervalado-" + Date.now(),
      date: new Date().toISOString().split("T")[0],
      distanceKm: sessionResult.totalDistanceKm,
      timeSeconds: sessionResult.totalTimeSeconds,
      paceSeconds: sessionResult.averagePaceSeconds,
      paceFormatted: sessionResult.averagePaceFormatted,
      speedKmh: sessionResult.averageSpeedKmh,
      notes: `Treino Intervalado${limitText}: ${repetitions}x [${runDuration}min a ${runSpeed} km/h + ${walkDuration}min a ${walkSpeed} km/h]. Total: ${formatDecimal(sessionResult.totalDistanceKm, 2)} km em ${formatTime(sessionResult.totalTimeSeconds)}${
        calorieResult ? ` (${calorieResult.activeCalories} kcal ativas)` : ""
      }.`,
      createdAt: new Date().toISOString(),
    });

    setSavedToHistory(true);
    setTimeout(() => setSavedToHistory(false), 3000);
  };

  const getStageBadge = (type: string) => {
    switch (type) {
      case "warmup":
        return <Badge variant="warning">Aquecimento</Badge>;
      case "run":
        return <Badge variant="danger">Tiro Rápido</Badge>;
      case "walk":
        return <Badge variant="info">Recuperação</Badge>;
      case "cooldown":
        return <Badge variant="default">Desaquecimento</Badge>;
      default:
        return <Badge variant="default">{type}</Badge>;
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B7F34A]/10 border border-[#B7F34A]/20 text-[#B7F34A] text-xs font-semibold mb-2">
          <Flame className="w-3.5 h-3.5 text-[#B7F34A]" />
          Treinamento de Alta Intensidade (HIIT / Tiros)
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Simulador de Corrida Intervalada
        </h1>
        <p className="text-sm text-[#8E9BB0] mt-1 max-w-2xl">
          Projete suas sessões de tiros na esteira ou pista: calcule tempo total, volume de quilometragem e o ritmo médio real ponderado.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Configuração das Séries (7 colunas) */}
        <div className="lg:col-span-7 space-y-4">
          <Card
            title="Estrutura da Sessão de Treino"
            description="Defina os parâmetros para aquecimento, séries de tiro e desaquecimento."
            headerAction={
              <button
                type="button"
                onClick={handleLoadExample}
                className="inline-flex items-center gap-1.5 text-xs text-[#B7F34A] hover:text-white font-semibold px-2 py-1 rounded-lg bg-[#B7F34A]/10 hover:bg-[#B7F34A]/20 border border-[#B7F34A]/20 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Carregar Exemplo
              </button>
            }
          >
            <form onSubmit={handleCalculate} className="space-y-4">
              {/* 1. Aquecimento */}
              <div className="p-3.5 rounded-xl bg-[#0B1020]/60 border border-[#1E2942] space-y-2">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <HeartPulse className="w-3.5 h-3.5 text-amber-400" />
                  1. Aquecimento Inicial
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Duração do Aquecimento"
                    id="input-warmup-dur"
                    value={warmupDuration}
                    onChange={(e) => setWarmupDuration(e.target.value)}
                    rightAddon="minutos"
                    placeholder="5"
                    error={errors.warmupDuration}
                  />
                  <Input
                    label="Velocidade do Aquecimento"
                    id="input-warmup-spd"
                    value={warmupSpeed}
                    onChange={(e) => setWarmupSpeed(e.target.value)}
                    rightAddon="km/h"
                    placeholder="8"
                    error={errors.warmupSpeed}
                    inputMode="decimal"
                  />
                </div>
              </div>

              {/* 2. Tiros de Corrida (Alta Intensidade) */}
              <div className="p-3.5 rounded-xl bg-[#B7F34A]/5 border border-[#B7F34A]/20 space-y-2">
                <span className="text-xs font-bold text-[#B7F34A] flex items-center gap-1.5 uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5 text-[#B7F34A]" />
                  2. Tiro de Corrida (Fase Forte)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Duração do Tiro"
                    id="input-run-dur"
                    value={runDuration}
                    onChange={(e) => setRunDuration(e.target.value)}
                    rightAddon="minutos"
                    placeholder="2"
                    hint="Ex: 2 min ou 1:30"
                    error={errors.runDuration}
                  />
                  <Input
                    label="Velocidade do Tiro"
                    id="input-run-spd"
                    value={runSpeed}
                    onChange={(e) => setRunSpeed(e.target.value)}
                    rightAddon="km/h"
                    placeholder="13"
                    error={errors.runSpeed}
                    inputMode="decimal"
                  />
                </div>
              </div>

              {/* 3. Recuperação / Caminhada */}
              <div className="p-3.5 rounded-xl bg-[#0B1020]/60 border border-[#1E2942] space-y-2">
                <span className="text-xs font-bold text-[#8E9BB0] flex items-center gap-1.5 uppercase tracking-wider">
                  <RotateCcw className="w-3.5 h-3.5 text-[#8E9BB0]" />
                  3. Recuperação (Fase Fraca / Caminhada)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Duração da Pausa"
                    id="input-walk-dur"
                    value={walkDuration}
                    onChange={(e) => setWalkDuration(e.target.value)}
                    rightAddon="minutos"
                    placeholder="1.5"
                    hint="Ex: 1.5 ou 1:30"
                    error={errors.walkDuration}
                  />
                  <Input
                    label="Velocidade de Pausa"
                    id="input-walk-spd"
                    value={walkSpeed}
                    onChange={(e) => setWalkSpeed(e.target.value)}
                    rightAddon="km/h"
                    placeholder="6"
                    error={errors.walkSpeed}
                    inputMode="decimal"
                  />
                </div>
              </div>

              {/* 4. Número de Séries / Repetições */}
              <div className="p-3.5 rounded-xl bg-[#0B1020]/60 border border-[#1E2942] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                    <Repeat className="w-3.5 h-3.5 text-[#B7F34A]" />
                    4. Número de Repetições (Séries de Tiros)
                  </span>
                </div>
                <Input
                  label="Quantidade de Repetições"
                  id="input-rep-count"
                  value={repetitions}
                  onChange={(e) => setRepetitions(e.target.value)}
                  rightAddon="séries"
                  placeholder="6"
                  error={errors.repetitions}
                  inputMode="numeric"
                />
              </div>

              {/* 5. Desaquecimento */}
              <div className="p-3.5 rounded-xl bg-[#0B1020]/60 border border-[#1E2942] space-y-2">
                <span className="text-xs font-bold text-[#8E9BB0] flex items-center gap-1.5 uppercase tracking-wider">
                  <Milestone className="w-3.5 h-3.5 text-[#8E9BB0]" />
                  5. Desaquecimento / Volta à Calma
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Duração do Desaquecimento"
                    id="input-cooldown-dur"
                    value={cooldownDuration}
                    onChange={(e) => setCooldownDuration(e.target.value)}
                    rightAddon="minutos"
                    placeholder="5"
                    error={errors.cooldownDuration}
                  />
                  <Input
                    label="Velocidade do Desaquecimento"
                    id="input-cooldown-spd"
                    value={cooldownSpeed}
                    onChange={(e) => setCooldownSpeed(e.target.value)}
                    rightAddon="km/h"
                    placeholder="7"
                    error={errors.cooldownSpeed}
                    inputMode="decimal"
                  />
                </div>
              </div>

              {/* 6. Limite da Sessão (Opcional) */}
              <div className="p-3.5 rounded-xl bg-[#0B1020]/80 border border-[#1E2942] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                    <Target className="w-3.5 h-3.5 text-[#B7F34A]" />
                    6. Limite da Sessão (Opcional)
                  </span>
                  <span className="text-[11px] text-[#B7F34A] font-medium">
                    {limitType === "none"
                      ? "Sem trava"
                      : limitType === "distance"
                      ? "Corte por km"
                      : "Corte por tempo"}
                  </span>
                </div>

                {/* Seletor do tipo de limite */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#131A2E] rounded-xl border border-[#1E2942]">
                  <button
                    type="button"
                    onClick={() => setLimitType("none")}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      limitType === "none"
                        ? "bg-[#B7F34A] text-[#0B1020] font-black shadow-sm"
                        : "text-[#8E9BB0] hover:text-white"
                    }`}
                  >
                    Sem Limite
                  </button>
                  <button
                    type="button"
                    onClick={() => setLimitType("distance")}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      limitType === "distance"
                        ? "bg-[#B7F34A] text-[#0B1020] font-black shadow-sm"
                        : "text-[#8E9BB0] hover:text-white"
                    }`}
                  >
                    Por Distância
                  </button>
                  <button
                    type="button"
                    onClick={() => setLimitType("time")}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      limitType === "time"
                        ? "bg-[#B7F34A] text-[#0B1020] font-black shadow-sm"
                        : "text-[#8E9BB0] hover:text-white"
                    }`}
                  >
                    Por Tempo
                  </button>
                </div>

                {/* Inputs de Limite */}
                {limitType === "distance" && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <Input
                        label="Distância Máxima"
                        id="input-limit-dist"
                        value={limitDistance}
                        onChange={(e) => setLimitDistance(e.target.value)}
                        rightAddon="km"
                        placeholder="2.4"
                        error={errors.limitDistance}
                        inputMode="decimal"
                      />
                      <div className="flex gap-1.5 flex-wrap pb-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setLimitDistance(
                              userGoal?.minDistanceMeters
                                ? (userGoal.minDistanceMeters / 1000).toFixed(1)
                                : "2.4"
                            )
                          }
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#131A2E] hover:bg-[#1E2942] text-white font-medium transition-colors"
                        >
                          {userGoal?.minDistanceMeters
                            ? `${(userGoal.minDistanceMeters / 1000)
                                .toFixed(1)
                                .replace(".", ",")} km (TAF)`
                            : "2,4 km (TAF)"}
                        </button>
                        {userGoal?.targetDistanceMeters &&
                          userGoal.targetDistanceMeters !==
                            userGoal.minDistanceMeters && (
                            <button
                              type="button"
                              onClick={() =>
                                setLimitDistance(
                                  (userGoal.targetDistanceMeters / 1000).toFixed(1)
                                )
                              }
                              className="px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#131A2E] hover:bg-[#1E2942] text-[#B7F34A] font-medium transition-colors"
                            >
                              {(userGoal.targetDistanceMeters / 1000)
                                .toFixed(1)
                                .replace(".", ",")}{" "}
                              km (Meta)
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => setLimitDistance("5.0")}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#131A2E] hover:bg-[#1E2942] text-white font-medium transition-colors"
                        >
                          5,0 km
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#8E9BB0]">
                      Caso a última etapa exceda o limite, ela será cortada no tempo exato para cravar a distância. Se o tiro forte anterior já atingir a meta, a recuperação seguinte é removida.
                    </p>
                  </div>
                )}

                {limitType === "time" && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <Input
                        label="Duração Máxima"
                        id="input-limit-dur"
                        value={limitTime}
                        onChange={(e) => setLimitTime(e.target.value)}
                        rightAddon="minutos"
                        placeholder={String(userGoal?.targetDurationMinutes || 12)}
                        hint={`Ex: ${userGoal?.targetDurationMinutes || 12} ou ${userGoal?.targetDurationMinutes || 12}:00`}
                        error={errors.limitTime}
                      />
                      <div className="flex gap-1.5 flex-wrap pb-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setLimitTime(String(userGoal?.targetDurationMinutes || 12))
                          }
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#131A2E] hover:bg-[#1E2942] text-white font-medium transition-colors"
                        >
                          {userGoal?.targetDurationMinutes || 12} min (TAF)
                        </button>
                        <button
                          type="button"
                          onClick={() => setLimitTime("20")}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-[#1E2942] bg-[#131A2E] hover:bg-[#1E2942] text-white font-medium transition-colors"
                        >
                          20 min
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#8E9BB0]">
                      O treino será encerrado no minuto/segundo exato configurado, cortando a etapa ativa proporcionalmente.
                    </p>
                  </div>
                )}
              </div>

              {errors.form && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errors.form}</span>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                  Simular Sessão Intervalada
                </Button>
                <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                  Limpar
                </Button>
              </div>
            </form>
          </Card>

          {/* Tabela de Etapas Detalhadas */}
          {sessionResult && sessionResult.stages.length > 0 && (
            <Card
              title="Quadro de Etapas da Sessão"
              description={`Detalhamento passo a passo de todas as ${sessionResult.stages.length} etapas do treino:`}
              headerAction={
                <CopyButton
                  textToCopy={sessionResult.stages
                    .map(
                      (s) =>
                        `#${s.index} [${s.type.toUpperCase()}] ${formatTime(s.durationSeconds)} a ${s.speedKmh} km/h (${s.paceFormatted} min/km) -> ${formatDecimal(s.distanceKm, 2)} km`
                    )
                    .join("\n")}
                  label="Copiar Etapas"
                />
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1E2942] text-[#8E9BB0]">
                      <th className="py-2.5 font-semibold">#</th>
                      <th className="py-2.5 font-semibold">Etapa</th>
                      <th className="py-2.5 font-semibold">Duração</th>
                      <th className="py-2.5 font-semibold">Velocidade</th>
                      <th className="py-2.5 font-semibold">Pace</th>
                      <th className="py-2.5 text-right font-semibold">Distância</th>
                      <th className="py-2.5 text-right font-semibold">Calorias</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2942]/60 font-mono">
                    {sessionResult.stages.map((s) => {
                      const seg = calorieResult?.segments.find((g) => g.stageIndex === s.index);
                      return (
                        <tr key={s.index} className="hover:bg-[#1E2942]/20">
                          <td className="py-2.5 text-[#8E9BB0] font-sans font-bold">
                            {s.index}
                          </td>
                          <td className="py-2.5 font-sans">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {getStageBadge(s.type)}
                              {s.isTruncated && (
                                <Badge variant="warning" className="text-[10px] py-0 px-1.5 gap-0.5">
                                  <Scissors className="w-2.5 h-2.5" />
                                  Cortada no Limite
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 text-white font-semibold">
                            {formatTime(s.durationSeconds)}
                          </td>
                          <td className="py-2.5 text-[#8E9BB0]">
                            {formatDecimal(s.speedKmh, 1)} km/h
                          </td>
                          <td className="py-2.5 text-[#B7F34A] font-bold">
                            {s.paceFormatted}
                          </td>
                          <td className="py-2.5 text-right text-white font-black">
                            {formatDecimal(s.distanceKm, 2)} km
                          </td>
                          <td className="py-2.5 text-right text-amber-400 font-bold">
                            {seg ? `${seg.activeCalories} kcal` : "--"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Gráfico de Perfil de Velocidade em Linha do Tempo */}
          {sessionResult && sessionResult.stages.length > 0 && (
            <IntervalSpeedProfileChart stages={sessionResult.stages} />
          )}
        </div>

        {/* Coluna de Resultados Consolidados (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <Card
            title="Balanço Total da Sessão"
            description="Métricas consolidadas do treino"
            headerAction={
              sessionResult ? (
                <CopyButton
                  textToCopy={`Treino Intervalado PaceLab: ${formatTime(sessionResult.totalTimeSeconds)} total | Distância: ${formatDecimal(sessionResult.totalDistanceKm, 2)} km | Pace Médio: ${sessionResult.averagePaceFormatted} min/km | Velocidade Média: ${formatDecimal(sessionResult.averageSpeedKmh, 2)} km/h`}
                  label="Copiar Resumo"
                />
              ) : undefined
            }
          >
            {sessionResult ? (
              <div className="space-y-4">
                {/* Banner de Limite Aplicado */}
                {sessionResult.limitInfo && sessionResult.limitInfo.type !== "none" && (
                  <div className="p-3 rounded-xl bg-[#0B1020]/80 border border-[#1E2942] text-white text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-[#B7F34A]">
                      <Scissors className="w-4 h-4 text-[#B7F34A]" />
                      {sessionResult.limitInfo.type === "distance"
                        ? `Limite de Distância: ${sessionResult.limitInfo.targetValue} km`
                        : `Limite de Tempo: ${formatTime(sessionResult.limitInfo.targetValue)}`}
                    </div>
                    <p className="text-[#8E9BB0] text-[11px] leading-relaxed">
                      {sessionResult.limitInfo.truncatedStageIndex
                        ? `A etapa #${sessionResult.limitInfo.truncatedStageIndex} foi cortada proporcionalmente para cravar a meta.`
                        : "Meta alcançada na última etapa executada."}
                      {sessionResult.limitInfo.stagesRemovedCount
                        ? ` (${sessionResult.limitInfo.stagesRemovedCount} etapa(s) subsequente(s) foram descartadas).`
                        : ""}
                    </p>
                  </div>
                )}

                {/* Tempo Total */}
                <ResultBlock
                  label="Duração Total do Treino"
                  value={formatTime(sessionResult.totalTimeSeconds)}
                  highlight
                  secondaryText={
                    sessionResult.limitInfo && sessionResult.limitInfo.type !== "none"
                      ? `Sessão finalizada por limite (${sessionResult.stages.length} etapas executadas)`
                      : `Somatório de aquecimento, ${repetitions} séries e desaquecimento`
                  }
                  icon={<Timer className="w-4 h-4" />}
                />

                {/* Distância Total */}
                <ResultBlock
                  label="Distância Total Percorrida"
                  value={formatDecimal(sessionResult.totalDistanceKm, 2)}
                  unit="km"
                  secondaryText={
                    sessionResult.limitInfo && sessionResult.limitInfo.type !== "none"
                      ? "Volume cravado conforme limite estipulado"
                      : "Volume total rodado na sessão"
                  }
                  icon={<Milestone className="w-4 h-4" />}
                />

                {/* Grid: Pace Médio & Velocidade Média */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl border border-[#1E2942] bg-[#0B1020]/60">
                    <div className="text-[11px] font-bold text-[#8E9BB0] mb-1 flex items-center gap-1">
                      <Timer className="w-3.5 h-3.5 text-[#B7F34A]" />
                      Pace Médio Geral
                    </div>
                    <div className="text-xl font-black text-[#B7F34A] font-mono">
                      {sessionResult.averagePaceFormatted}
                    </div>
                    <div className="text-[10px] text-[#8E9BB0] mt-0.5">
                      min/km
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-[#1E2942] bg-[#0B1020]/60">
                    <div className="text-[11px] font-bold text-[#8E9BB0] mb-1 flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5 text-white" />
                      Velocidade Média
                    </div>
                    <div className="text-xl font-black text-white font-mono">
                      {formatDecimal(sessionResult.averageSpeedKmh, 2)}
                    </div>
                    <div className="text-[10px] text-[#8E9BB0] mt-0.5">
                      km/h
                    </div>
                  </div>
                </div>

                {/* Estimativa de Gasto Calórico (Compêndio 2024 Herrmann et al.) */}
                {calorieResult && (
                  <div
                    data-testid="interval-calories-card"
                    className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                        <Flame className="w-4 h-4 text-amber-400 fill-amber-400" />
                        <span>Gasto Calórico Estimado</span>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        MET Médio {calorieResult.metValue.toFixed(1)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="p-2.5 rounded-lg bg-[#0B1020]/80 border border-[#1E2942]">
                        <span className="text-[10px] uppercase font-bold text-[#8E9BB0] block">
                          Ativas (Exercício)
                        </span>
                        <span
                          data-testid="interval-active-calories"
                          className="text-lg font-black text-amber-400"
                        >
                          {calorieResult.activeCalories}{" "}
                          <span className="text-xs font-normal">kcal</span>
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-[#0B1020]/80 border border-[#1E2942]">
                        <span className="text-[10px] uppercase font-bold text-[#8E9BB0] block">
                          Totais
                        </span>
                        <span
                          data-testid="interval-total-calories"
                          className="text-lg font-black text-white"
                        >
                          {calorieResult.totalCalories}{" "}
                          <span className="text-xs font-normal">kcal</span>
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-[#8E9BB0] text-center">
                      {athleteWeightKg
                        ? `Cálculo com seu peso corporal cadastrado (${athleteWeightKg} kg)`
                        : "Baseado no peso padrão (70 kg) • Atualize em seu Perfil"}
                    </p>
                  </div>
                )}

                {/* Ações de Modo Pista e Salvar no Histórico */}
                <div className="space-y-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsTrackModalOpen(true)}
                    icon={<Smartphone className="w-4 h-4" />}
                  >
                    Modo Pista (Cartão de Treino)
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleSaveToHistory}
                    icon={
                      savedToHistory ? (
                        <Check className="w-4 h-4 text-[#B7F34A]" />
                      ) : (
                        <BookmarkPlus className="w-4 h-4 text-[#B7F34A]" />
                      )
                    }
                  >
                    {savedToHistory ? "Sessão Salva no Histórico!" : "Salvar esta Sessão no Histórico"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 px-4 text-[#8E9BB0]">
                <Flame className="w-10 h-10 mx-auto mb-2.5 opacity-40 text-[#B7F34A]" />
                <p className="text-sm font-medium text-white">Configure as séries e clique em Simular</p>
                <p className="text-xs mt-1 text-[#8E9BB0]">O resumo e os ritmos médios aparecerão aqui.</p>
              </div>
            )}
          </Card>

          {/* Dica sobre Intervalados */}
          <div className="p-4 rounded-xl border border-[#1E2942] bg-[#131A2E] text-xs text-white">
            <p className="font-bold flex items-center gap-1.5 mb-1 text-white">
              <Compass className="w-4 h-4 text-[#B7F34A]" />
              Por que treinar intervalado?
            </p>
            <p className="text-[#8E9BB0] leading-relaxed">
              O treino intervalado (tiros com recuperação controlada) eleva seu VO2 máx, melhora a tolerância ao lactato e permite correr em velocidades mais altas por períodos cumulativos maiores do que um treino contínuo.
            </p>
          </div>
        </div>
      </div>

      {/* Modal do Cartão de Treino de Pista */}
      {sessionResult && (
        <TrackWorkoutCardModal
          session={sessionResult}
          isOpen={isTrackModalOpen}
          onClose={() => setIsTrackModalOpen(false)}
        />
      )}
    </div>
  );
}
