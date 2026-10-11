"use client";

import React, { useState } from "react";
import {
  Calculator,
  RotateCcw,
  Gauge,
  Timer,
  Milestone,
  ArrowRightLeft,
  BookmarkPlus,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResultBlock } from "@/components/ui/ResultBlock";
import { CopyButton } from "@/components/ui/CopyButton";
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

type CalcMode =
  | "distance-time"
  | "pace-to-speed"
  | "speed-to-pace"
  | "time-needed"
  | "distance-covered";

interface DistanceTimeResult {
  pace: string;
  speed: string;
  paceSeconds: number;
  speedKmh: number;
}

export default function CalculadoraPage() {
  const [mode, setMode] = useState<CalcMode>("distance-time");

  // Estados dos inputs
  const [distanceInput, setDistanceInput] = useState("3");
  const [timeInput, setTimeInput] = useState("20:00");
  const [paceInput, setPaceInput] = useState("6:40");
  const [speedInput, setSpeedInput] = useState("9");

  // Tipo de entrada secundária para tempo/distância
  const [timeCalcMethod, setTimeCalcMethod] = useState<"pace" | "speed">("pace");
  const [distCalcMethod, setDistCalcMethod] = useState<"speed" | "pace">("speed");

  // Erros de validação
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Resultados
  const [dtResult, setDtResult] = useState<DistanceTimeResult | null>({
    pace: "6:40",
    speed: "9.0",
    paceSeconds: 400,
    speedKmh: 9,
  });
  const [speedResult, setSpeedResult] = useState<string | null>(null);
  const [paceResult, setPaceResult] = useState<string | null>(null);
  const [timeResult, setTimeResult] = useState<{ formatted: string; speed: string; pace: string } | null>(null);
  const [distResult, setDistResult] = useState<{ formatted: string; speed: string; pace: string } | null>(null);

  // Estado de salvar no histórico
  const [savedToHistory, setSavedToHistory] = useState(false);

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao calcular";
      setErrors({ form: message });
    }
  };

  // 2. Modo Pace -> Velocidade
  const handleCalcPaceToSpeed = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const pVal = validatePaceString(paceInput);
    if (!pVal.valid) {
      setErrors({ pace: pVal.message });
      setSpeedResult(null);
      return;
    }

    try {
      const sec = parsePace(paceInput);
      const kmh = calcSpeedFromPace(sec);
      setSpeedResult(formatDecimal(kmh, 2));
      setErrors({});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao calcular";
      setErrors({ pace: message });
    }
  };

  // 3. Modo Velocidade -> Pace
  const handleCalcSpeedToPace = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const speedNum = Number(speedInput.replace(",", "."));
    const sVal = validateSpeed(speedNum);
    if (!sVal.valid) {
      setErrors({ speed: sVal.message });
      setPaceResult(null);
      return;
    }

    try {
      const paceSec = calcPaceFromSpeed(speedNum);
      setPaceResult(formatPace(paceSec));
      setErrors({});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao calcular";
      setErrors({ speed: message });
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
    setSpeedResult(null);
    setPaceResult(null);
    setTimeResult(null);
    setDistResult(null);
    setSavedToHistory(false);
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header da Página */}
      <div className="mb-6 sm:mb-8 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2">
          <Calculator className="w-3.5 h-3.5" />
          Calculadora Principal
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Cálculos de Corrida e Ritmo
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
          Calcule pace, velocidade média, tempo previsto e distância percorrida com validação instantânea.
        </p>
      </div>

      {/* Seletor de Modo (Tabs Responsivas) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 p-1.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-2xl mb-6">
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
            setMode("pace-to-speed");
            setErrors({});
          }}
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            mode === "pace-to-speed"
              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>Pace → Vel</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("speed-to-pace");
            setErrors({});
          }}
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            mode === "speed-to-pace"
              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          <span>Vel → Pace</span>
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
          className={`col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            mode === "distance-covered"
              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Milestone className="w-4 h-4" />
          <span>Distância Total</span>
        </button>
      </div>

      {/* Conteúdo do Modo Ativo */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Entrada */}
        <div className="lg:col-span-7">
          <Card
            title={
              mode === "distance-time"
                ? "Calcular Pace e Velocidade Média"
                : mode === "pace-to-speed"
                ? "Converter Pace em Velocidade"
                : mode === "speed-to-pace"
                ? "Converter Velocidade em Pace"
                : mode === "time-needed"
                ? "Calcular Tempo Necessário"
                : "Calcular Distância Percorrida"
            }
            description={
              mode === "distance-time"
                ? "Informe a distância e o tempo total da corrida."
                : mode === "pace-to-speed"
                ? "Digite seu pace no formato MM:SS para obter a velocidade em km/h."
                : mode === "speed-to-pace"
                ? "Digite a velocidade em km/h para descobrir o pace equivalente."
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

            {/* 2. MODO: PACE -> VELOCIDADE */}
            {mode === "pace-to-speed" && (
              <form onSubmit={handleCalcPaceToSpeed} className="space-y-4">
                <Input
                  label="Pace de Corrida"
                  id="input-pace"
                  value={paceInput}
                  onChange={(e) => {
                    setPaceInput(e.target.value);
                    clearError("pace");
                  }}
                  rightAddon="min/km"
                  hint="Digite MM:SS (ex: 6:40) ou apenas minutos (ex: 6 para 6:00)"
                  error={errors.pace}
                  placeholder="Ex: 6 ou 6:40"
                />

                <div className="flex items-center gap-3 pt-3">
                  <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                    Calcular Velocidade
                  </Button>
                  <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                    Limpar
                  </Button>
                </div>
              </form>
            )}

            {/* 3. MODO: VELOCIDADE -> PACE */}
            {mode === "speed-to-pace" && (
              <form onSubmit={handleCalcSpeedToPace} className="space-y-4">
                <Input
                  label="Velocidade"
                  id="input-speed"
                  value={speedInput}
                  onChange={(e) => {
                    setSpeedInput(e.target.value);
                    clearError("speed");
                  }}
                  rightAddon="km/h"
                  hint="Exemplo: 9 para 9 km/h ou 12.5"
                  error={errors.speed}
                  placeholder="9"
                  inputMode="decimal"
                />

                <div className="flex items-center gap-3 pt-3">
                  <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                    Calcular Pace
                  </Button>
                  <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
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
                  secondaryText={`Tempo por cada quilômetro percorrido`}
                  icon={<Timer className="w-4 h-4" />}
                />
                <ResultBlock
                  label="Velocidade Média"
                  value={dtResult.speed}
                  unit="km/h"
                  secondaryText={`Distância percorrida em 1 hora nesse ritmo`}
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

            {/* Resultados do Modo 2: Pace -> Velocidade */}
            {mode === "pace-to-speed" && speedResult && (
              <div className="space-y-3.5">
                <ResultBlock
                  label="Velocidade Equivalente"
                  value={speedResult}
                  unit="km/h"
                  highlight
                  secondaryText={`Para um ritmo constante de ${paceInput} min/km`}
                  icon={<Gauge className="w-4 h-4" />}
                />
                <ResultBlock
                  label="Pace Informado"
                  value={paceInput}
                  unit="min/km"
                  copyable={false}
                />
              </div>
            )}

            {/* Resultados do Modo 3: Velocidade -> Pace */}
            {mode === "speed-to-pace" && paceResult && (
              <div className="space-y-3.5">
                <ResultBlock
                  label="Pace Equivalente"
                  value={paceResult}
                  unit="min/km"
                  highlight
                  secondaryText={`Para uma velocidade de ${speedInput} km/h`}
                  icon={<Timer className="w-4 h-4" />}
                />
                <ResultBlock
                  label="Velocidade Informada"
                  value={speedInput}
                  unit="km/h"
                  copyable={false}
                />
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
              (mode === "pace-to-speed" && !speedResult) ||
              (mode === "speed-to-pace" && !paceResult) ||
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
              💡 O que é Pace?
            </p>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Pace é o tempo necessário para percorrer exatamente 1 quilômetro (min/km). Por exemplo: um pace de <strong>6:40</strong> significa que cada quilômetro é corrido em 6 minutos e 40 segundos, equivalente a uma velocidade de <strong>9,0 km/h</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
