"use client";

import React, { useState, useEffect } from "react";
import {
  Calculator,
  RotateCcw,
  Gauge,
  Timer,
  Milestone,
  ArrowRightLeft,
  BookmarkPlus,
  Check,
  Medal,
  Target,
  Flame,
  History,
  Layers,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResultBlock } from "@/components/ui/ResultBlock";
import { CopyButton } from "@/components/ui/CopyButton";
import { PaceSpeedTable } from "@/components/calculadora/PaceSpeedTable";
import TafPage from "@/app/taf/page";
import MetasPage from "@/app/metas/page";
import IntervaladoPage from "@/app/intervalado/page";
import HistoricoPage from "@/app/historico/page";
import {
  calcDistanceFromTimeAndSpeed,
  calcPaceFromDistanceAndTime,
  calcPaceFromSpeed,
  calcSpeedFromPace,
  calcTimeForDistance,
} from "@/lib/math/pace";
import {
  formatDecimal,
  formatPace,
  formatTime,
  parsePace,
  parseTime,
} from "@/lib/formatting/time";
import {
  validateDistance,
  validatePaceString,
  validateSpeed,
  validateTimeString,
} from "@/lib/validation/inputs";
import { historyStorage } from "@/lib/storage/localStorage";

export type CalcMode =
  | "distance-time"
  | "pace-speed"
  | "time-needed"
  | "distance-covered"
  // Retrocompatibilidade
  | "pace-to-speed"
  | "speed-to-pace";

export type HubTab = "pace" | "taf" | "metas" | "intervalado" | "historico";

const HUB_TABS = [
  { id: "pace", label: "Pace & Ritmo", icon: Calculator, badge: "Principal" },
  { id: "taf", label: "Estratégia TAF", icon: Medal, badge: "Concursos" },
  { id: "metas", label: "Metas & Splits", icon: Target, badge: "Provas" },
  { id: "intervalado", label: "Intervalado", icon: Flame, badge: "HIIT" },
  { id: "historico", label: "Histórico", icon: History, badge: "Local" },
] as const;

interface DistanceTimeResult {
  pace: string;
  speed: string;
  paceSeconds: number;
  speedKmh: number;
}

interface PaceSpeedResult {
  paceFormatted: string;
  speedKmh: number;
  speedFormatted: string;
  paceSeconds: number;
  lap400mFormatted: string;
  taf12mDistanceMeters: number;
}

const CALC_DRAFT_KEY = "pacelab_draft_calc";

interface CalcDraft {
  mode: CalcMode;
  distanceInput: string;
  timeInput: string;
  paceInput: string;
  speedInput: string;
}

const getInitialCalcDraft = (): CalcDraft | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CALC_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function CalculadoraPage() {
  // Aba ativa do Hub de Calculadoras
  const [activeHubTab, setActiveHubTab] = useState<HubTab>("pace");

  // Sincroniza aba com query param ?tab= se presente
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab") as HubTab;
      if (tabParam && ["pace", "taf", "metas", "intervalado", "historico"].includes(tabParam)) {
        setActiveHubTab(tabParam);
      }
    }
  }, []);

  const handleHubTabChange = (tabId: HubTab) => {
    setActiveHubTab(tabId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tabId === "pace") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", tabId);
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Modo interno da Calculadora de Pace
  const [mode, setMode] = useState<CalcMode>("distance-time");

  // Estados dos inputs
  const [distanceInput, setDistanceInput] = useState("3");
  const [timeInput, setTimeInput] = useState("20:00");
  const [paceInput, setPaceInput] = useState("6:40");
  const [speedInput, setSpeedInput] = useState("9.0");

  // Restaura rascunho do sessionStorage ao montar no cliente
  useEffect(() => {
    const draft = getInitialCalcDraft();
    if (draft) {
      if (draft.mode) setMode(draft.mode);
      if (draft.distanceInput !== undefined) setDistanceInput(draft.distanceInput);
      if (draft.timeInput !== undefined) setTimeInput(draft.timeInput);
      if (draft.paceInput !== undefined) setPaceInput(draft.paceInput);
      if (draft.speedInput !== undefined) setSpeedInput(draft.speedInput);
    }
  }, []);

  // Tipo de entrada secundária para tempo/distância
  const [timeCalcMethod, setTimeCalcMethod] = useState<"pace" | "speed">("pace");
  const [distCalcMethod, setDistCalcMethod] = useState<"speed" | "pace">("speed");
  const [lastEditedField, setLastEditedField] = useState<"pace" | "speed">("pace");

  // Erros de validação
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Resultados
  const [dtResult, setDtResult] = useState<DistanceTimeResult | null>({
    pace: "6:40",
    speed: "9.0",
    paceSeconds: 400,
    speedKmh: 9,
  });

  const [paceSpeedResult, setPaceSpeedResult] = useState<PaceSpeedResult | null>({
    paceFormatted: "6:40",
    speedKmh: 9.0,
    speedFormatted: "9.00",
    paceSeconds: 400,
    lap400mFormatted: "2:40",
    taf12mDistanceMeters: 1800,
  });

  const [timeResult, setTimeResult] = useState<{ formatted: string; speed: string; pace: string } | null>(null);
  const [distResult, setDistResult] = useState<{ formatted: string; speed: string; pace: string } | null>(null);

  // Estado de salvar no histórico
  const [savedToHistory, setSavedToHistory] = useState(false);

  // Sincroniza rascunho de cálculo no sessionStorage
  const saveCalcDraft = (override?: Partial<CalcDraft>) => {
    if (typeof window === "undefined") return;
    try {
      const draft: CalcDraft = {
        mode,
        distanceInput,
        timeInput,
        paceInput,
        speedInput,
        ...override,
      };
      sessionStorage.setItem(CALC_DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  };

  // Limpar erros
  const clearError = (field: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // 1. Modo Distância + Tempo
  const handleCalcDistanceTime = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    const distNum = Number(distanceInput.replace(",", "."));
    const distVal = validateDistance(distNum);
    if (!distVal.valid) newErrors.distance = distVal.message;

    const timeVal = validateTimeString(timeInput);
    if (!timeVal.valid) newErrors.time = timeVal.message;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setDtResult(null);
      return;
    }

    try {
      const totalSeconds = parseTime(timeInput);
      const res = calcPaceFromDistanceAndTime(distNum, totalSeconds);
      setDtResult({
        pace: res.paceFormatted,
        speed: formatDecimal(res.speedKmh, 1),
        paceSeconds: res.paceSeconds,
        speedKmh: res.speedKmh,
      });
      setErrors({});
      setSavedToHistory(false);
      saveCalcDraft();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao calcular";
      setErrors({ form: message });
    }
  };

  // Helper para atualizar resultado unificado a partir de segundos de pace
  const updatePaceSpeedFromSeconds = (sec: number, overrideKmh?: number) => {
    const kmh = overrideKmh ?? calcSpeedFromPace(sec);
    const formattedPace = formatPace(sec);
    const formattedSpeed = formatDecimal(kmh, 2);
    const lap400mSec = Math.round(sec * 0.4);
    const tafMeters = Math.round((kmh * 12 * 1000) / 60);

    const result: PaceSpeedResult = {
      paceFormatted: formattedPace,
      speedKmh: kmh,
      speedFormatted: formattedSpeed,
      paceSeconds: sec,
      lap400mFormatted: formatTime(lap400mSec),
      taf12mDistanceMeters: tafMeters,
    };

    setPaceSpeedResult(result);
    setErrors({});
  };

  // Sincronização ao digitar no Pace
  const handlePaceSyncChange = (val: string) => {
    setPaceInput(val);
    clearError("pace");
    clearError("speed");
    setLastEditedField("pace");

    if (!val.trim()) return;

    const pVal = validatePaceString(val);
    if (pVal.valid) {
      try {
        const sec = parsePace(val);
        const kmh = calcSpeedFromPace(sec);
        setSpeedInput(formatDecimal(kmh, 2));
        updatePaceSpeedFromSeconds(sec, kmh);
      } catch {
        // Ignora erros temporários durante a digitação
      }
    }
  };

  // Sincronização ao digitar na Velocidade
  const handleSpeedSyncChange = (val: string) => {
    setSpeedInput(val);
    clearError("speed");
    clearError("pace");
    setLastEditedField("speed");

    if (!val.trim()) return;

    const num = Number(val.replace(",", "."));
    const sVal = validateSpeed(num);
    if (sVal.valid) {
      try {
        const paceSec = calcPaceFromSpeed(num);
        setPaceInput(formatPace(paceSec));
        updatePaceSpeedFromSeconds(paceSec, num);
      } catch {
        // Ignora erros temporários durante a digitação
      }
    }
  };

  // Submissão do formulário unificado Pace ↔ Velocidade
  const handleCalcPaceSpeed = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (lastEditedField === "speed") {
      const num = Number(speedInput.replace(",", "."));
      const sVal = validateSpeed(num);
      if (sVal.valid) {
        try {
          const paceSec = calcPaceFromSpeed(num);
          setPaceInput(formatPace(paceSec));
          updatePaceSpeedFromSeconds(paceSec, num);
          return;
        } catch (err: unknown) {
          newErrors.speed = err instanceof Error ? err.message : "Velocidade inválida";
        }
      } else {
        newErrors.speed = sVal.message;
      }
    } else {
      const pVal = validatePaceString(paceInput);
      if (pVal.valid) {
        try {
          const sec = parsePace(paceInput);
          const kmh = calcSpeedFromPace(sec);
          setSpeedInput(formatDecimal(kmh, 2));
          updatePaceSpeedFromSeconds(sec, kmh);
          return;
        } catch (err: unknown) {
          newErrors.pace = err instanceof Error ? err.message : "Pace inválido";
        }
      } else {
        newErrors.pace = pVal.message;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setPaceSpeedResult(null);
    }
  };

  // Seleção via clique na Tabela de Referência
  const handleSelectFromTable = (paceFormatted: string, speedKmh: number) => {
    setPaceInput(paceFormatted);
    setSpeedInput(formatDecimal(speedKmh, 2));
    setLastEditedField("pace");
    try {
      const sec = parsePace(paceFormatted);
      updatePaceSpeedFromSeconds(sec, speedKmh);
    } catch {
      // noop
    }
  };

  // 4. Modo Tempo Necessário
  const handleCalcTimeNeeded = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    const distNum = Number(distanceInput.replace(",", "."));
    const distVal = validateDistance(distNum);
    if (!distVal.valid) newErrors.distance = distVal.message;

    let paceSec = 0;
    let speedVal = 0;

    if (timeCalcMethod === "pace") {
      const pVal = validatePaceString(paceInput);
      if (!pVal.valid) newErrors.pace = pVal.message;
      else {
        paceSec = parsePace(paceInput);
        speedVal = calcSpeedFromPace(paceSec);
      }
    } else {
      const sNum = Number(speedInput.replace(",", "."));
      const sVal = validateSpeed(sNum);
      if (!sVal.valid) newErrors.speed = sVal.message;
      else {
        speedVal = sNum;
        paceSec = calcPaceFromSpeed(sNum);
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setTimeResult(null);
      return;
    }

    const neededSeconds = calcTimeForDistance(distNum, paceSec);
    setTimeResult({
      formatted: formatTime(neededSeconds),
      pace: formatPace(paceSec),
      speed: formatDecimal(speedVal, 1),
    });
    setErrors({});
  };

  // 5. Modo Distância Percorrida
  const handleCalcDistanceCovered = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    const tVal = validateTimeString(timeInput);
    if (!tVal.valid) newErrors.time = tVal.message;

    let speedVal = 0;
    let paceSec = 0;

    if (distCalcMethod === "speed") {
      const sNum = Number(speedInput.replace(",", "."));
      const sVal = validateSpeed(sNum);
      if (!sVal.valid) newErrors.speed = sVal.message;
      else {
        speedVal = sNum;
        paceSec = calcPaceFromSpeed(sNum);
      }
    } else {
      const pVal = validatePaceString(paceInput);
      if (!pVal.valid) newErrors.pace = pVal.message;
      else {
        paceSec = parsePace(paceInput);
        speedVal = calcSpeedFromPace(paceSec);
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setDistResult(null);
      return;
    }

    const totalSec = parseTime(timeInput);
    const coveredKm = calcDistanceFromTimeAndSpeed(totalSec, speedVal);
    setDistResult({
      formatted: formatDecimal(coveredKm, 2),
      speed: formatDecimal(speedVal, 1),
      pace: formatPace(paceSec),
    });
    setErrors({});
  };

  // Limpar campos
  const handleReset = () => {
    setDistanceInput("");
    setTimeInput("");
    setPaceInput("");
    setSpeedInput("");
    setErrors({});
    setDtResult(null);
    setPaceSpeedResult(null);
    setTimeResult(null);
    setDistResult(null);
    setSavedToHistory(false);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(CALC_DRAFT_KEY);
      } catch {}
    }
  };

  // Salvar no histórico
  const handleSaveToHistory = () => {
    if (!dtResult) return;
    const distNum = Number(distanceInput.replace(",", "."));
    const sec = parseTime(timeInput);

    historyStorage.save({
      id: "hist-" + Date.now(),
      date: new Date().toISOString().split("T")[0],
      distanceKm: distNum,
      timeSeconds: sec,
      paceSeconds: dtResult.paceSeconds,
      paceFormatted: dtResult.pace,
      speedKmh: dtResult.speedKmh,
      notes: "Calculado via Calculadora Principal",
      createdAt: new Date().toISOString(),
    });

    setSavedToHistory(true);
    setTimeout(() => setSavedToHistory(false), 3000);
  };

  // Atalhos de distância
  const distanceShortcuts = [
    { label: "1 km", value: "1" },
    { label: "3 km", value: "3" },
    { label: "5 km", value: "5" },
    { label: "10 km", value: "10" },
    { label: "21.1 km", value: "21.1" },
    { label: "42.2 km", value: "42.2" },
  ];

  const isPaceSpeedMode =
    mode === "pace-speed" || mode === "pace-to-speed" || mode === "speed-to-pace";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header Central do Hub de Calculadoras */}
      <div className="mb-2 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2">
          <Layers className="w-3.5 h-3.5" />
          Hub Central de Calculadoras
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Cálculos de Corrida e Ritmo
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          Todas as ferramentas de ritmo, TAF, metas de prova e treino intervalado reunidas em um único lugar.
        </p>
      </div>

      {/* Navegação Superior de Abas do Hub */}
      <div
        data-testid="hub-tabs-container"
        className="flex items-center gap-1.5 p-1.5 bg-slate-200/80 dark:bg-slate-800/90 rounded-2xl overflow-x-auto scrollbar-none"
      >
        {HUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeHubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleHubTabChange(tab.id as HubTab)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
                isActive
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo da Aba 1: Calculadora Principal de Pace & Ritmo */}
      {activeHubTab === "pace" && (
        <div className="space-y-6">
          {/* Seletor de Modo da Calculadora de Pace */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 p-1.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setMode("distance-time");
                setErrors({});
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                mode === "distance-time"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Gauge className="w-4 h-4" />
              <span>Pace & Velocidade</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("pace-speed");
                setErrors({});
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                isPaceSpeedMode
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Pace ↔ Vel</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("time-needed");
                setErrors({});
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                mode === "time-needed"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Timer className="w-4 h-4" />
              <span>Tempo Estimado</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("distance-covered");
                setErrors({});
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                mode === "distance-covered"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Milestone className="w-4 h-4" />
              <span>Distância Total</span>
            </button>
          </div>

          {/* Grid de Formulário e Resultados */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Formulário de Entrada */}
            <div className="lg:col-span-7">
              <Card
                title={
                  mode === "distance-time"
                    ? "Calcular Pace e Velocidade Média"
                    : isPaceSpeedMode
                    ? "Converter Pace ↔ Velocidade"
                    : mode === "time-needed"
                    ? "Calcular Tempo Necessário"
                    : "Calcular Distância Percorrida"
                }
                description={
                  mode === "distance-time"
                    ? "Informe a distância e o tempo total da corrida."
                    : isPaceSpeedMode
                    ? "Digite o pace ou a velocidade. Os valores são sincronizados em tempo real."
                    : mode === "time-needed"
                    ? "Descubra quanto tempo levará para completar uma distância."
                    : "Veja qual distância você percorre em um determinado tempo."
                }
              >
                {/* 1. MODO: DISTÂNCIA + TEMPO */}
                {mode === "distance-time" && (
                  <form onSubmit={handleCalcDistanceTime} className="space-y-4">
                    <div>
                      <Input
                        label="Distância"
                        id="input-distance"
                        value={distanceInput}
                        onChange={(e) => {
                          setDistanceInput(e.target.value);
                          clearError("distance");
                        }}
                        rightAddon="km"
                        error={errors.distance}
                        placeholder="Ex: 3 ou 5"
                        inputMode="decimal"
                      />
                      {/* Atalhos Rápidos */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {distanceShortcuts.map((sc) => (
                          <button
                            key={sc.value}
                            type="button"
                            onClick={() => {
                              setDistanceInput(sc.value);
                              clearError("distance");
                            }}
                            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-colors"
                          >
                            {sc.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Input
                      label="Tempo total"
                      id="input-time"
                      value={timeInput}
                      onChange={(e) => {
                        setTimeInput(e.target.value);
                        clearError("time");
                      }}
                      rightAddon="MM:SS"
                      hint="Formatos aceitos: 20:00, 1:00:00 ou apenas 20 (minutos)"
                      error={errors.time}
                      placeholder="Ex: 20:00"
                    />

                    <div className="flex items-center gap-3 pt-3">
                      <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                        Calcular
                      </Button>
                      <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                        Limpar
                      </Button>
                    </div>
                  </form>
                )}

                {/* 2. MODO UNIFICADO: PACE ↔ VELOCIDADE */}
                {isPaceSpeedMode && (
                  <form onSubmit={handleCalcPaceSpeed} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Pace de Corrida"
                        id="input-pace"
                        value={paceInput}
                        onChange={(e) => handlePaceSyncChange(e.target.value)}
                        rightAddon="min/km"
                        hint="Digite MM:SS (ex: 5:00) ou minutos (ex: 6)"
                        error={errors.pace}
                        placeholder="Ex: 5:00 ou 6:40"
                      />

                      <Input
                        label="Velocidade"
                        id="input-speed"
                        value={speedInput}
                        onChange={(e) => handleSpeedSyncChange(e.target.value)}
                        rightAddon="km/h"
                        hint="Digite a velocidade (ex: 12 ou 9.0)"
                        error={errors.speed}
                        placeholder="Ex: 12.0 ou 9.0"
                        inputMode="decimal"
                      />
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      ⚡ <strong>Sincronização instantânea:</strong> altere qualquer um dos campos ou selecione um ritmo na tabela abaixo para preenchimento imediato.
                    </p>

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        type="submit"
                        className="flex-1"
                        icon={<Calculator className="w-4 h-4" />}
                      >
                        Calcular
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleReset}
                        icon={<RotateCcw className="w-4 h-4" />}
                      >
                        Limpar
                      </Button>
                    </div>
                  </form>
                )}

                {/* 4. MODO: TEMPO NECESSÁRIO */}
                {mode === "time-needed" && (
                  <form onSubmit={handleCalcTimeNeeded} className="space-y-4">
                    <div>
                      <Input
                        label="Distância desejada"
                        id="input-dist-needed"
                        value={distanceInput}
                        onChange={(e) => {
                          setDistanceInput(e.target.value);
                          clearError("distance");
                        }}
                        rightAddon="km"
                        error={errors.distance}
                        placeholder="Ex: 5 ou 10"
                        inputMode="decimal"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {distanceShortcuts.map((sc) => (
                          <button
                            key={sc.value}
                            type="button"
                            onClick={() => {
                              setDistanceInput(sc.value);
                              clearError("distance");
                            }}
                            className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium"
                          >
                            {sc.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Alternar entre Pace ou Velocidade */}
                    <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setTimeCalcMethod("pace")}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          timeCalcMethod === "pace"
                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                            : "text-slate-500"
                        }`}
                      >
                        Usar Pace (min/km)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimeCalcMethod("speed")}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          timeCalcMethod === "speed"
                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                            : "text-slate-500"
                        }`}
                      >
                        Usar Velocidade (km/h)
                      </button>
                    </div>

                    {timeCalcMethod === "pace" ? (
                      <Input
                        label="Pace Alvo"
                        id="input-pace-needed"
                        value={paceInput}
                        onChange={(e) => {
                          setPaceInput(e.target.value);
                          clearError("pace");
                        }}
                        rightAddon="min/km"
                        error={errors.pace}
                        placeholder="6:40"
                      />
                    ) : (
                      <Input
                        label="Velocidade Alvo"
                        id="input-speed-needed"
                        value={speedInput}
                        onChange={(e) => {
                          setSpeedInput(e.target.value);
                          clearError("speed");
                        }}
                        rightAddon="km/h"
                        error={errors.speed}
                        placeholder="9"
                        inputMode="decimal"
                      />
                    )}

                    <div className="flex items-center gap-3 pt-3">
                      <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                        Calcular Tempo
                      </Button>
                      <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                        Limpar
                      </Button>
                    </div>
                  </form>
                )}

                {/* 5. MODO: DISTÂNCIA PERCORRIDA */}
                {mode === "distance-covered" && (
                  <form onSubmit={handleCalcDistanceCovered} className="space-y-4">
                    <Input
                      label="Tempo de corrida"
                      id="input-time-dist"
                      value={timeInput}
                      onChange={(e) => {
                        setTimeInput(e.target.value);
                        clearError("time");
                      }}
                      rightAddon="MM:SS"
                      hint="Exemplo: 20:00 ou 45:00"
                      error={errors.time}
                      placeholder="20:00"
                    />

                    <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setDistCalcMethod("speed")}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          distCalcMethod === "speed"
                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                            : "text-slate-500"
                        }`}
                      >
                        Usar Velocidade (km/h)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDistCalcMethod("pace")}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                          distCalcMethod === "pace"
                            ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                            : "text-slate-500"
                        }`}
                      >
                        Usar Pace (min/km)
                      </button>
                    </div>

                    {distCalcMethod === "speed" ? (
                      <Input
                        label="Velocidade média"
                        id="input-speed-dist"
                        value={speedInput}
                        onChange={(e) => {
                          setSpeedInput(e.target.value);
                          clearError("speed");
                        }}
                        rightAddon="km/h"
                        error={errors.speed}
                        placeholder="9"
                        inputMode="decimal"
                      />
                    ) : (
                      <Input
                        label="Pace médio"
                        id="input-pace-dist"
                        value={paceInput}
                        onChange={(e) => {
                          setPaceInput(e.target.value);
                          clearError("pace");
                        }}
                        rightAddon="min/km"
                        error={errors.pace}
                        placeholder="6:40"
                      />
                    )}

                    <div className="flex items-center gap-3 pt-3">
                      <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                        Calcular Distância
                      </Button>
                      <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                        Limpar
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            </div>

            {/* Coluna de Resultados em Destaque */}
            <div className="lg:col-span-5 space-y-4">
              <Card
                title="Resultados"
                description="Valores calculados em destaque"
                headerAction={
                  dtResult && mode === "distance-time" ? (
                    <CopyButton
                      textToCopy={`Pace: ${dtResult.pace} min/km | Velocidade: ${dtResult.speed} km/h (Distância: ${distanceInput} km em ${timeInput})`}
                      label="Copiar Tudo"
                    />
                  ) : isPaceSpeedMode && paceSpeedResult ? (
                    <CopyButton
                      textToCopy={`Pace: ${paceSpeedResult.paceFormatted} min/km | Velocidade: ${paceSpeedResult.speedFormatted} km/h | 400m: ${paceSpeedResult.lap400mFormatted}`}
                      label="Copiar"
                    />
                  ) : undefined
                }
              >
                {/* Resultados do Modo 1: Distância + Tempo */}
                {mode === "distance-time" && dtResult && (
                  <div className="space-y-3.5">
                    <ResultBlock
                      label="Pace Médio"
                      value={dtResult.pace}
                      unit="min/km"
                      highlight
                      secondaryText="Tempo por cada quilômetro percorrido"
                      icon={<Timer className="w-4 h-4" />}
                    />
                    <ResultBlock
                      label="Velocidade Média"
                      value={dtResult.speed}
                      unit="km/h"
                      secondaryText="Distância percorrida em 1 hora nesse ritmo"
                      icon={<Gauge className="w-4 h-4" />}
                    />

                    {/* Ação rápida de salvar no histórico */}
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleSaveToHistory}
                        icon={
                          savedToHistory ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <BookmarkPlus className="w-4 h-4 text-blue-500" />
                          )
                        }
                      >
                        {savedToHistory ? "Salvo no Histórico!" : "Salvar esta atividade no Histórico"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Resultados do Modo Unificado: Pace ↔ Velocidade */}
                {isPaceSpeedMode && paceSpeedResult && (
                  <div className="space-y-3.5">
                    <ResultBlock
                      label="Pace Equivalente"
                      value={paceSpeedResult.paceFormatted}
                      unit="min/km"
                      highlight
                      secondaryText="Ritmo por quilômetro"
                      icon={<Timer className="w-4 h-4" />}
                    />
                    <ResultBlock
                      label="Velocidade Equivalente"
                      value={paceSpeedResult.speedFormatted}
                      unit="km/h"
                      secondaryText="Velocidade para esteira ou rua"
                      icon={<Gauge className="w-4 h-4" />}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <ResultBlock
                        label="Volta 400m"
                        value={paceSpeedResult.lap400mFormatted}
                        unit="pista"
                        secondaryText="Tempo por volta"
                      />
                      <ResultBlock
                        label="TAF 12 min"
                        value={`${paceSpeedResult.taf12mDistanceMeters}m`}
                        secondaryText="Distância prevista"
                      />
                    </div>
                  </div>
                )}

                {/* Resultados do Modo 4: Tempo Necessário */}
                {mode === "time-needed" && timeResult && (
                  <div className="space-y-3.5">
                    <ResultBlock
                      label="Tempo Previsto"
                      value={timeResult.formatted}
                      highlight
                      secondaryText={`Para completar ${distanceInput} km a ${timeResult.pace} min/km`}
                      icon={<Timer className="w-4 h-4" />}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <ResultBlock
                        label="Pace"
                        value={timeResult.pace}
                        unit="min/km"
                      />
                      <ResultBlock
                        label="Velocidade"
                        value={timeResult.speed}
                        unit="km/h"
                      />
                    </div>
                  </div>
                )}

                {/* Resultados do Modo 5: Distância Percorrida */}
                {mode === "distance-covered" && distResult && (
                  <div className="space-y-3.5">
                    <ResultBlock
                      label="Distância Estimada"
                      value={distResult.formatted}
                      unit="km"
                      highlight
                      secondaryText={`Percorrida em ${timeInput} a ${distResult.speed} km/h`}
                      icon={<Milestone className="w-4 h-4" />}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <ResultBlock
                        label="Velocidade"
                        value={distResult.speed}
                        unit="km/h"
                      />
                      <ResultBlock
                        label="Pace"
                        value={distResult.pace}
                        unit="min/km"
                      />
                    </div>
                  </div>
                )}

                {/* Estado Vazio de Resultado */}
                {((mode === "distance-time" && !dtResult) ||
                  (isPaceSpeedMode && !paceSpeedResult) ||
                  (mode === "time-needed" && !timeResult) ||
                  (mode === "distance-covered" && !distResult)) && (
                  <div className="text-center py-10 px-4 text-slate-400 dark:text-slate-500">
                    <Calculator className="w-10 h-10 mx-auto mb-2.5 opacity-40" />
                    <p className="text-sm font-medium">Preencha os campos e clique em Calcular</p>
                    <p className="text-xs mt-1">Os resultados detalhados aparecerão aqui.</p>
                  </div>
                )}
              </Card>

              {/* Dica / Info Card */}
              <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-950/60 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-900 dark:text-blue-200">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  💡 Dica de Treino
                </p>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Use a tabela de referência rápida abaixo para configurar a velocidade na esteira elétrica ou monitorar o tempo de cada volta de 400m em pista de atletismo.
                </p>
              </div>
            </div>
          </div>

          {/* Tabela de Referência Rápida de 30 em 30 segundos */}
          {isPaceSpeedMode && (
            <div className="mt-8">
              <PaceSpeedTable
                currentPaceSeconds={paceSpeedResult?.paceSeconds}
                onSelectPace={handleSelectFromTable}
              />
            </div>
          )}
        </div>
      )}

      {/* Conteúdo da Aba 2: Estratégia TAF */}
      {activeHubTab === "taf" && (
        <div data-testid="hub-tab-taf-content" className="pt-2">
          <TafPage />
        </div>
      )}

      {/* Conteúdo da Aba 3: Metas & Splits */}
      {activeHubTab === "metas" && (
        <div data-testid="hub-tab-metas-content" className="pt-2">
          <MetasPage />
        </div>
      )}

      {/* Conteúdo da Aba 4: Treino Intervalado */}
      {activeHubTab === "intervalado" && (
        <div data-testid="hub-tab-intervalado-content" className="pt-2">
          <IntervaladoPage />
        </div>
      )}

      {/* Conteúdo da Aba 5: Histórico Rápido */}
      {activeHubTab === "historico" && (
        <div data-testid="hub-tab-historico-content" className="pt-2">
          <HistoricoPage />
        </div>
      )}
    </div>
  );
}
