"use client";

import React, { useState, useEffect } from "react";
import {
  Target,
  Timer,
  Gauge,
  Milestone,
  RotateCcw,
  Calculator,
  AlertCircle,
  BookmarkPlus,
  Check,
  Flag,
  Compass,
  Medal,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResultBlock } from "@/components/ui/ResultBlock";
import { CopyButton } from "@/components/ui/CopyButton";
import { calcGoalFromPace, calcGoalFromTime } from "@/lib/math/goals";
import {
  formatDecimal,
  parsePace,
  parseTime,
} from "@/lib/formatting/time";
import {
  validateDistance,
  validatePaceString,
  validateTimeString,
} from "@/lib/validation/inputs";
import { historyStorage } from "@/lib/storage/localStorage";
import { tafService } from "@/lib/services/tafService";
import { GoalResult, PacingStrategy, TafGoalConfig } from "@/types";

type GoalMethod = "pace" | "time";

export default function MetasPage() {
  const [method, setMethod] = useState<GoalMethod>("pace");

  // Inputs
  const [distanceInput, setDistanceInput] = useState("5");
  const [paceInput, setPaceInput] = useState("5:00");
  const [timeInput, setTimeInput] = useState("25:00");
  const [splitDistanceMeters, setSplitDistanceMeters] = useState("1000");
  const [pacingStrategy, setPacingStrategy] = useState<PacingStrategy>("even");
  const [tafGoal, setTafGoal] = useState<TafGoalConfig | null>(null);

  // Carrega meta oficial do TAF se houver
  useEffect(() => {
    let isMounted = true;
    tafService
      .getGoal()
      .then((g: TafGoalConfig | null) => {
        if (isMounted && g) setTafGoal(g);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const handleApplyTafGoal = () => {
    const minMeters = tafGoal?.minDistanceMeters ?? 2400;
    const kmStr = (minMeters / 1000).toString();
    setDistanceInput(kmStr);
    if (method === "time") {
      setTimeInput("12:00");
    } else {
      const paceSec = Math.round(720 / (minMeters / 1000));
      const mins = Math.floor(paceSec / 60);
      const secs = paceSec % 60;
      setPaceInput(`${mins}:${secs.toString().padStart(2, "0")}`);
    }
    setErrors({});
  };

  // Erros
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Resultado
  const [goalResult, setGoalResult] = useState<GoalResult | null>(() => {
    try {
      return calcGoalFromPace({
        distanceKm: 5,
        paceSeconds: 300,
        splitDistanceMeters: 1000,
      });
    } catch {
      return null;
    }
  });

  const [savedToHistory, setSavedToHistory] = useState(false);

  // Atalhos de distância
  const distanceShortcuts = [
    { label: "1 km", value: "1" },
    { label: "1.6 km (Milha)", value: "1.6" },
    { label: "2.3 km (TAF)", value: "2.3" },
    { label: "3 km", value: "3" },
    { label: "5 km", value: "5" },
    { label: "10 km", value: "10" },
    { label: "21.1 km (Meia)", value: "21.1" },
    { label: "42.2 km (Maratona)", value: "42.2" },
  ];

  // Atalhos de splits
  const splitOptions = [
    { label: "400 m (Pista)", value: "400" },
    { label: "500 m", value: "500" },
    { label: "1 km (Padrão)", value: "1000" },
  ];

  const handleCalculate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    const distNum = Number(distanceInput.replace(",", "."));
    const distVal = validateDistance(distNum);
    if (!distVal.valid) newErrors.distance = distVal.message;

    const splitNum = Number(splitDistanceMeters);
    if (!Number.isFinite(splitNum) || splitNum <= 0) {
      newErrors.split = "Selecione um intervalo de parcial válido.";
    }

    if (method === "pace") {
      const paceVal = validatePaceString(paceInput);
      if (!paceVal.valid) newErrors.pace = paceVal.message;

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        setGoalResult(null);
        return;
      }

      try {
        const paceSec = parsePace(paceInput);
        const res = calcGoalFromPace({
          distanceKm: distNum,
          paceSeconds: paceSec,
          splitDistanceMeters: splitNum,
          pacingStrategy,
        });
        setGoalResult(res);
        setErrors({});
        setSavedToHistory(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro no cálculo da meta";
        setErrors({ form: msg });
        setGoalResult(null);
      }
    } else {
      const timeVal = validateTimeString(timeInput);
      if (!timeVal.valid) newErrors.time = timeVal.message;

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        setGoalResult(null);
        return;
      }

      try {
        const totalSec = parseTime(timeInput);
        const res = calcGoalFromTime({
          distanceKm: distNum,
          totalTimeSeconds: totalSec,
          splitDistanceMeters: splitNum,
          pacingStrategy,
        });
        setGoalResult(res);
        setErrors({});
        setSavedToHistory(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro no cálculo da meta";
        setErrors({ form: msg });
        setGoalResult(null);
      }
    }
  };

  const handleReset = () => {
    setDistanceInput("");
    setPaceInput("");
    setTimeInput("");
    setErrors({});
    setGoalResult(null);
    setSavedToHistory(false);
  };

  const handleSaveToHistory = () => {
    if (!goalResult) return;
    const distNum = Number(distanceInput.replace(",", "."));

    historyStorage.save({
      id: "meta-" + Date.now(),
      date: new Date().toISOString().split("T")[0],
      distanceKm: distNum,
      timeSeconds: goalResult.totalTimeSeconds,
      paceSeconds: goalResult.paceSeconds,
      paceFormatted: goalResult.paceFormatted,
      speedKmh: goalResult.speedKmh,
      notes: `Meta de Prova: ${distanceInput} km em ${goalResult.totalTimeFormatted} a pace ${goalResult.paceFormatted} min/km.`,
      createdAt: new Date().toISOString(),
    });

    setSavedToHistory(true);
    setTimeout(() => setSavedToHistory(false), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2">
          <Target className="w-3.5 h-3.5" />
          Planejamento de Provas & Treinos
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Calculadora de Metas e Parciais (Splits)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          Defina sua distância e ritmo-alvo para gerar a planilha completa de tempos de passagem em cada quilômetro ou parcial de prova.
        </p>
      </div>

      {/* Seletor de Método (Pace Alvo vs Tempo Alvo) */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setMethod("pace");
            setErrors({});
          }}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            method === "pace"
              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Timer className="w-4 h-4" />
          <span>Definir por Pace-Alvo</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMethod("time");
            setErrors({});
          }}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            method === "time"
              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>Definir por Tempo-Alvo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Configuração (7 colunas) */}
        <div className="lg:col-span-7 space-y-4">
          <Card
            title={
              method === "pace"
                ? "Configurar Distância e Pace Desejado"
                : "Configurar Distância e Tempo Total Desejado"
            }
            description="Escolha a distância da prova e o ritmo que pretende manter."
          >
            <form onSubmit={handleCalculate} className="space-y-4">
              {/* Campo de Distância com Atalhos */}
              <div>
                <Input
                  label="Distância da Prova"
                  id="input-goal-distance"
                  value={distanceInput}
                  onChange={(e) => {
                    setDistanceInput(e.target.value);
                    if (errors.distance) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.distance;
                        return next;
                      });
                    }
                  }}
                  rightAddon="km"
                  placeholder="Ex: 5 ou 10"
                  error={errors.distance}
                  inputMode="decimal"
                />

                {/* Atalhos Rápidos de Distância */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {tafGoal && (
                    <button
                      type="button"
                      onClick={handleApplyTafGoal}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 font-bold border border-amber-400/40 dark:border-amber-700/50 transition-colors"
                      title="Carregar meta oficial do concurso salva no seu perfil"
                    >
                      <Medal className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        Edital TAF: {(tafGoal.minDistanceMeters || 2400) / 1000} km em 12min ({tafGoal.institutionName || "Concurso"})
                      </span>
                    </button>
                  )}
                  {distanceShortcuts.map((sc) => (
                    <button
                      key={sc.value}
                      type="button"
                      onClick={() => {
                        setDistanceInput(sc.value);
                        if (errors.distance) {
                          setErrors((prev) => {
                            const next = { ...prev };
                            delete next.distance;
                            return next;
                          });
                        }
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-colors"
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campo de Ritmo (Pace vs Tempo) */}
              {method === "pace" ? (
                <Input
                  label="Pace Alvo (Ritmo por Km)"
                  id="input-goal-pace"
                  value={paceInput}
                  onChange={(e) => {
                    setPaceInput(e.target.value);
                    if (errors.pace) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.pace;
                        return next;
                      });
                    }
                  }}
                  rightAddon="min/km"
                  hint="Aceita formatos como 5:00 ou apenas 5 (minutos inteiros)"
                  placeholder="5:00"
                  error={errors.pace}
                />
              ) : (
                <Input
                  label="Tempo Alvo Total de Prova"
                  id="input-goal-time"
                  value={timeInput}
                  onChange={(e) => {
                    setTimeInput(e.target.value);
                    if (errors.time) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.time;
                        return next;
                      });
                    }
                  }}
                  rightAddon="tempo"
                  hint="Formatos: 25:00 (MM:SS), 1:45:00 (HH:MM:SS) ou minutos"
                  placeholder="25:00"
                  error={errors.time}
                />
              )}

              {/* Estratégia de Ritmo (Pacing) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Estratégia de Ritmo (Pacing)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPacingStrategy("even")}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                      pacingStrategy === "even"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 shadow-xs"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold">Constante</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Mesmo ritmo</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPacingStrategy("negative")}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                      pacingStrategy === "negative"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 shadow-xs"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold">Split Negativo</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">2ª metade veloz</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPacingStrategy("progressive")}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                      pacingStrategy === "progressive"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 shadow-xs"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <div className="font-bold">Progressivo</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Acelera por km</div>
                  </button>
                </div>
              </div>

              {/* Intervalo de Parcial (Splits) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Intervalo da Planilha de Splits
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {splitOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSplitDistanceMeters(opt.value)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                        splitDistanceMeters === opt.value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mensagem de Erro Geral */}
              {errors.form && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errors.form}</span>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                  Gerar Planilha de Splits
                </Button>
                <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                  Limpar
                </Button>
              </div>
            </form>
          </Card>

          {/* Tabela de Passagens e Splits Estratégicos */}
          {goalResult && goalResult.splits.length > 0 && (
            <Card
              title="Planilha de Passagem (Splits da Corrida)"
              description={`Passagens a cada ${
                Number(splitDistanceMeters) >= 1000
                  ? `${Number(splitDistanceMeters) / 1000} km`
                  : `${splitDistanceMeters}m`
              } para completar a meta:`}
              headerAction={
                <CopyButton
                  textToCopy={goalResult.splits
                    .map(
                      (s) =>
                        `#${s.index} (${s.accumulatedDistanceKm.toFixed(2)}km): Parcial ${s.splitTimeFormatted} | Ritmo ${s.paceFormatted || goalResult.paceFormatted} | Acumulado ${s.accumulatedTimeFormatted}`
                    )
                    .join("\n")}
                  label="Copiar Tabela"
                />
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 font-semibold">Parcial</th>
                      <th className="py-2.5 font-semibold">Distância do Trecho</th>
                      <th className="py-2.5 font-semibold">Distância Acumulada</th>
                      <th className="py-2.5 font-semibold">Ritmo /km</th>
                      <th className="py-2.5 font-semibold">Tempo da Parcial</th>
                      <th className="py-2.5 text-right font-semibold">Tempo Acumulado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {goalResult.splits.map((s) => (
                      <tr key={s.index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 font-bold text-slate-700 dark:text-slate-300 font-sans">
                          {s.index === goalResult.splits.length ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <Flag className="w-3 h-3" />
                              Chegada (#{s.index})
                            </span>
                          ) : (
                            `Split ${s.index}`
                          )}
                        </td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-400">
                          {s.distanceKm >= 1
                            ? `${s.distanceKm.toFixed(2)} km`
                            : `${(s.distanceKm * 1000).toFixed(0)} m`}
                        </td>
                        <td className="py-2.5 text-slate-800 dark:text-slate-200 font-semibold">
                          {s.accumulatedDistanceKm.toFixed(2)} km
                        </td>
                        <td className="py-2.5 text-slate-700 dark:text-slate-300">
                          <span>{s.paceFormatted ?? goalResult.paceFormatted}</span>
                          {s.strategyDiffPercent && s.strategyDiffPercent !== 0 ? (
                            <span
                              className={`ml-1.5 text-[10px] px-1 py-0.5 rounded font-mono ${
                                s.strategyDiffPercent < 0
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              }`}
                            >
                              {s.strategyDiffPercent > 0 ? `+${s.strategyDiffPercent}%` : `${s.strategyDiffPercent}%`}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-bold">
                          {s.splitTimeFormatted}
                        </td>
                        <td className="py-2.5 text-right text-slate-900 dark:text-slate-100 font-black">
                          {s.accumulatedTimeFormatted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Coluna de Resultados (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <Card
            title="Estratégia da Prova"
            description="Ritmo e tempos consolidados"
            headerAction={
              goalResult ? (
                <CopyButton
                  textToCopy={`Meta PaceLab: ${distanceInput} km em ${goalResult.totalTimeFormatted} (Pace: ${goalResult.paceFormatted} min/km | Velocidade: ${formatDecimal(goalResult.speedKmh, 2)} km/h)`}
                  label="Copiar Resumo"
                />
              ) : undefined
            }
          >
            {goalResult ? (
              <div className="space-y-4">
                {/* Tempo Total */}
                <ResultBlock
                  label="Tempo Total Alvo"
                  value={goalResult.totalTimeFormatted}
                  highlight
                  secondaryText={`Para completar exatamente ${distanceInput} km`}
                  icon={<Timer className="w-4 h-4" />}
                />

                {/* Pace Alvo */}
                <ResultBlock
                  label="Pace Alvo Médio"
                  value={goalResult.paceFormatted}
                  unit="min/km"
                  secondaryText="Ritmo constante planejado por quilômetro"
                  icon={<Milestone className="w-4 h-4" />}
                />

                {/* Velocidade Média */}
                <ResultBlock
                  label="Velocidade Equivalente"
                  value={formatDecimal(goalResult.speedKmh, 2)}
                  unit="km/h"
                  secondaryText="Velocidade constante na esteira ou asfalto"
                  icon={<Gauge className="w-4 h-4" />}
                />

                {/* Ação de Salvar no Histórico */}
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
                  {savedToHistory ? "Meta Salva no Histórico!" : "Salvar esta Meta no Histórico"}
                </Button>
              </div>
            ) : (
              <div className="text-center py-10 px-4 text-slate-400 dark:text-slate-500">
                <Target className="w-10 h-10 mx-auto mb-2.5 opacity-40" />
                <p className="text-sm font-medium">Informe a distância e o ritmo</p>
                <p className="text-xs mt-1">Os cálculos estratégicos aparecerão aqui.</p>
              </div>
            )}
          </Card>

          {/* Dica de Estratégia de Prova */}
          <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-950/60 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-900 dark:text-blue-200">
            <p className="font-bold flex items-center gap-1.5 mb-1">
              <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Dica: Estratégia de Ritmo Constante
            </p>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Em corridas de média e longa distância (de 5 km a maratonas), manter o ritmo homogêneo sem oscilações bruscas nos primeiros quilômetros economiza glicogênio muscular e previne a fadiga precoce.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
