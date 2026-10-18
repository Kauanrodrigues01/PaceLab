"use client";

import React, { useState } from "react";
import {
  Medal,
  Timer,
  Gauge,
  Milestone,
  RotateCcw,
  Calculator,
  AlertCircle,
  Check,
  BookmarkPlus,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Footprints,
  Compass,
  Trophy,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResultBlock } from "@/components/ui/ResultBlock";
import { CopyButton } from "@/components/ui/CopyButton";
import { Badge } from "@/components/ui/Badge";
import { calcTaf, calcFixedTargetTaf } from "@/lib/math/taf";
import { formatDecimal, parseTime } from "@/lib/formatting/time";
import { historyStorage } from "@/lib/storage/localStorage";
import { tafService } from "@/lib/services/tafService";
import { TafApprovalRuler } from "@/components/meu-taf/TafApprovalRuler";
import { TafResult, FixedTargetResult, TafGoalConfig } from "@/types";

type TafMode = "fixed-time" | "fixed-distance";

export default function TafPage() {
  const [mode, setMode] = useState<TafMode>("fixed-time");

  // Modo 1: Tempo Fixo (ex: 12 minutos)
  const [durationInput, setDurationInput] = useState("12");
  const [targetMetersInput, setTargetMetersInput] = useState("2300");
  const [currentMetersInput, setCurrentMetersInput] = useState("2100");
  const [splitMetersInput, setSplitMetersInput] = useState("400");

  // Modo 2: Distância Fixa (ex: 2.400 m em tempo máximo)
  const [fixedDistInput, setFixedDistInput] = useState("2400");
  const [maxTimeInput, setMaxTimeInput] = useState("12:00");

  // Erros
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Resultados
  const [tafResult, setTafResult] = useState<TafResult | null>(() => {
    try {
      return calcTaf(12, 2300, 400, 2100);
    } catch {
      return null;
    }
  });

  const [fixedResult, setFixedResult] = useState<FixedTargetResult | null>(null);
  const [savedToHistory, setSavedToHistory] = useState(false);

  // Metas dinâmicas do TAF
  const [goal, setGoal] = useState<TafGoalConfig | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    tafService
      .getGoal()
      .then((g) => {
        if (isMounted && g) {
          setGoal(g);
        }
      })
      .catch(() => null);

    return () => {
      isMounted = false;
    };
  }, []);

  // Atalhos rápidos (aumentando de 100 em 100 metros)
  const targetShortcuts = [
    { label: "2.000 m", value: "2000" },
    { label: "2.100 m", value: "2100" },
    { label: "2.200 m", value: "2200" },
    { label: "2.300 m", value: "2300" },
    { label: "2.400 m", value: "2400" },
    { label: "2.500 m", value: "2500" },
    { label: "2.600 m", value: "2600" },
    { label: "2.700 m", value: "2700" },
    { label: "2.800 m", value: "2800" },
    { label: "2.900 m", value: "2900" },
    { label: "3.000 m", value: "3000" },
  ];

  const splitShortcuts = [
    { label: "200 m", value: "200" },
    { label: "400 m (Pista)", value: "400" },
    { label: "500 m", value: "500" },
    { label: "1.000 m", value: "1000" },
  ];

  // Calcular Modo 1: Tempo Fixo
  const handleCalcFixedTime = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    const durationNum = Number(durationInput.replace(",", "."));
    if (!Number.isFinite(durationNum) || durationNum <= 0) {
      newErrors.duration = "A duração do teste deve ser maior que 0 minutos.";
    }

    const targetNum = Number(targetMetersInput.replace(",", "."));
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      newErrors.target = "A meta de distância deve ser maior que 0 metros.";
    }

    const splitNum = Number(splitMetersInput.replace(",", "."));
    if (!Number.isFinite(splitNum) || splitNum <= 0) {
      newErrors.split = "O intervalo da parcial deve ser maior que 0 metros.";
    }

    let currentNum: number | undefined;
    if (currentMetersInput.trim().length > 0) {
      const parsed = Number(currentMetersInput.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        newErrors.current = "A distância atual deve ser um número válido.";
      } else {
        currentNum = parsed;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setTafResult(null);
      return;
    }

    try {
      const res = calcTaf(durationNum, targetNum, splitNum, currentNum);
      setTafResult(res);
      setErrors({});
      setSavedToHistory(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro no cálculo do TAF";
      setErrors({ form: msg });
      setTafResult(null);
    }
  };

  // Calcular Modo 2: Distância Fixa
  const handleCalcFixedDistance = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    const distNum = Number(fixedDistInput.replace(",", "."));
    if (!Number.isFinite(distNum) || distNum <= 0) {
      newErrors.fixedDist = "A distância da meta deve ser maior que 0 metros.";
    }

    let maxMinutes = 0;
    try {
      if (maxTimeInput.includes(":")) {
        const totalSec = parseTime(maxTimeInput);
        maxMinutes = totalSec / 60;
      } else {
        const minNum = Number(maxTimeInput.replace(",", "."));
        if (!Number.isFinite(minNum) || minNum <= 0) {
          throw new Error("Informe minutos válidos");
        }
        maxMinutes = minNum;
      }
    } catch {
      newErrors.maxTime = "Formato de tempo inválido (use MM:SS ou minutos).";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setFixedResult(null);
      return;
    }

    try {
      const res = calcFixedTargetTaf(distNum, maxMinutes);
      setFixedResult(res);
      setErrors({});
      setSavedToHistory(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro no cálculo do TAF";
      setErrors({ form: msg });
      setFixedResult(null);
    }
  };

  const handleReset = () => {
    setDurationInput("");
    setTargetMetersInput("");
    setCurrentMetersInput("");
    setSplitMetersInput("400");
    setFixedDistInput("");
    setMaxTimeInput("");
    setErrors({});
    setTafResult(null);
    setFixedResult(null);
    setSavedToHistory(false);
  };

  // Salvar no Histórico
  const handleSaveToHistory = () => {
    if (mode === "fixed-time" && tafResult) {
      const distKm = tafResult.targetDistanceKm;
      const timeSec = Number(durationInput) * 60;

      historyStorage.save({
        id: "taf-" + Date.now(),
        date: new Date().toISOString().split("T")[0],
        distanceKm: distKm,
        timeSeconds: timeSec,
        paceSeconds: tafResult.paceSeconds,
        paceFormatted: tafResult.paceFormatted,
        speedKmh: tafResult.speedKmh,
        notes: `Simulação TAF: ${targetMetersInput}m em ${durationInput}min. Pace necessário: ${tafResult.paceFormatted} min/km.`,
        createdAt: new Date().toISOString(),
      });
      setSavedToHistory(true);
      setTimeout(() => setSavedToHistory(false), 3000);
    } else if (mode === "fixed-distance" && fixedResult) {
      historyStorage.save({
        id: "taf-fixed-" + Date.now(),
        date: new Date().toISOString().split("T")[0],
        distanceKm: fixedResult.targetDistanceKm,
        timeSeconds: fixedResult.maxTimeSeconds,
        paceSeconds: fixedResult.paceSeconds,
        paceFormatted: fixedResult.paceFormatted,
        speedKmh: fixedResult.speedKmh,
        notes: `Simulação TAF: ${fixedDistInput}m em até ${fixedResult.maxTimeFormatted}. Pace limite: ${fixedResult.paceFormatted} min/km.`,
        createdAt: new Date().toISOString(),
      });
      setSavedToHistory(true);
      setTimeout(() => setSavedToHistory(false), 3000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B7F34A]/10 border border-[#B7F34A]/30 text-[#B7F34A] text-xs font-semibold mb-2">
          <Medal className="w-3.5 h-3.5" />
          Preparação para Concursos e Avaliações Físicas
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#FFFFFF] tracking-tight">
          Calculadora de TAF (Teste de Aptidão Física)
        </h1>
        <p className="text-sm text-[#8E9BB0] mt-1 max-w-2xl">
          Descubra o ritmo exato (pace e velocidade), os tempos por volta na pista de 400 metros e monitore seu índice de aprovação.
        </p>
      </div>

      {/* Aviso Legal / Técnico Obrigatório */}
      <div className="p-4 rounded-2xl bg-[#131A2E] border border-amber-500/30 text-[#8E9BB0] text-xs sm:text-sm flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-300">
            Aviso Importante e Termo de Referência
          </p>
          <p className="text-[#8E9BB0] leading-relaxed">
            Estes valores são parâmetros de cálculo matemáticos para auxílio em treinamentos e <strong>não garantem aprovação</strong> em nenhum concurso público, teste militar ou avaliação física. Sempre consulte as regras específicas do edital oficial do seu certame.
          </p>
        </div>
      </div>

      {/* Banner de Edital Cadastrado */}
      {goal && (
        <div className="p-4 rounded-2xl bg-[#131A2E] border border-[#1E2942] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#B7F34A] text-[#0B1020] shrink-0">
              <Trophy className="w-4 h-4 text-[#0B1020]" />
            </div>
            <div>
              <p className="font-bold text-[#FFFFFF]">
                Seu Edital Cadastrado: <span className="text-[#B7F34A]">{goal.institutionName || "Edital Padrão"}</span>
              </p>
              <p className="text-[#8E9BB0] mt-0.5">
                Mínimo: <span className="font-semibold text-[#B7F34A]">{goal.minDistanceMeters || 2400}m</span> • Meta: <span className="font-semibold text-[#FFFFFF]">{goal.targetDistanceMeters}m</span> em {goal.targetDurationMinutes} min
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const minD = goal.minDistanceMeters || 2400;
                setDurationInput(String(goal.targetDurationMinutes));
                setTargetMetersInput(String(minD));
                setFixedDistInput(String(minD));
                setMaxTimeInput(`${goal.targetDurationMinutes}:00`);
                try {
                  const res = calcTaf(goal.targetDurationMinutes, minD, Number(splitMetersInput) || 400, Number(currentMetersInput) || undefined);
                  setTafResult(res);
                } catch {
                  // Fallback silencioso
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-[#0B1020] hover:bg-[#1E2942] border border-[#1E2942] text-[#8E9BB0] hover:text-[#FFFFFF] font-semibold text-xs transition-colors whitespace-nowrap cursor-pointer"
            >
              Aplicar Mínimo ({goal.minDistanceMeters || 2400}m)
            </button>
            <button
              type="button"
              onClick={() => {
                setDurationInput(String(goal.targetDurationMinutes));
                setTargetMetersInput(String(goal.targetDistanceMeters));
                setFixedDistInput(String(goal.targetDistanceMeters));
                setMaxTimeInput(`${goal.targetDurationMinutes}:00`);
                try {
                  const res = calcTaf(goal.targetDurationMinutes, goal.targetDistanceMeters, Number(splitMetersInput) || 400, Number(currentMetersInput) || undefined);
                  setTafResult(res);
                } catch {
                  // Fallback silencioso
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-[#B7F34A] hover:bg-[#a3db3f] text-[#0B1020] font-black text-xs shadow-xs transition-colors whitespace-nowrap cursor-pointer"
            >
              Aplicar Meta ({goal.targetDistanceMeters}m)
            </button>
          </div>
        </div>
      )}

      {/* Seletor de Modo (Subtabs) */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#131A2E] border border-[#1E2942] rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setMode("fixed-time");
            setErrors({});
          }}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            mode === "fixed-time"
              ? "bg-[#0B1020] text-[#B7F34A] border border-[#B7F34A]/40 shadow-xs font-bold"
              : "text-[#8E9BB0] hover:text-[#FFFFFF] hover:bg-[#0B1020]/60"
          }`}
        >
          <Timer className="w-4 h-4" />
          <span>Tempo Fixo (ex: 12 min)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("fixed-distance");
            setErrors({});
          }}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            mode === "fixed-distance"
              ? "bg-[#0B1020] text-[#B7F34A] border border-[#B7F34A]/40 shadow-xs font-bold"
              : "text-[#8E9BB0] hover:text-[#FFFFFF] hover:bg-[#0B1020]/60"
          }`}
        >
          <Milestone className="w-4 h-4" />
          <span>Distância Fixa (ex: 2.400 m)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Entrada (7 colunas) */}
        <div className="lg:col-span-7 space-y-4">
          {mode === "fixed-time" ? (
            <Card
              title="TAF com Duração Fixa"
              description="Configure a duração da prova e a distância mínima exigida no edital."
            >
              <form onSubmit={handleCalcFixedTime} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Duração do Teste"
                    id="input-taf-duration"
                    value={durationInput}
                    onChange={(e) => setDurationInput(e.target.value)}
                    rightAddon="minutos"
                    placeholder="12"
                    error={errors.duration}
                    inputMode="decimal"
                  />

                  <div>
                    <Input
                      label="Meta de Distância"
                      id="input-taf-target"
                      value={targetMetersInput}
                      onChange={(e) => setTargetMetersInput(e.target.value)}
                      rightAddon="metros"
                      placeholder="2300"
                      error={errors.target}
                      inputMode="numeric"
                    />
                    {/* Atalhos Rápidos de Meta */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {goal && (
                        <button
                          type="button"
                          onClick={() => setTargetMetersInput((goal.minDistanceMeters ?? 2400).toString())}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-[#B7F34A]/15 hover:bg-[#B7F34A]/25 text-[#B7F34A] font-bold border border-[#B7F34A]/30 transition-colors inline-flex items-center gap-1 cursor-pointer"
                          title="Carregar meta oficial do edital salva no perfil"
                        >
                          <Medal className="w-3 h-3 text-[#B7F34A] shrink-0" />
                          <span>Edital: {goal.minDistanceMeters ?? 2400}m</span>
                        </button>
                      )}
                      {targetShortcuts.map((sc) => (
                        <button
                          key={sc.value}
                          type="button"
                          onClick={() => setTargetMetersInput(sc.value)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-[#0B1020] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-[#FFFFFF] border border-[#1E2942] font-medium transition-colors cursor-pointer"
                        >
                          {sc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Input
                      label="Intervalo das Parciais"
                      id="input-taf-split"
                      value={splitMetersInput}
                      onChange={(e) => setSplitMetersInput(e.target.value)}
                      rightAddon="metros"
                      placeholder="400"
                      hint="Padrão: 400m (1 volta completa em pista oficial)"
                      error={errors.split}
                      inputMode="numeric"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {splitShortcuts.map((sc) => (
                        <button
                          key={sc.value}
                          type="button"
                          onClick={() => setSplitMetersInput(sc.value)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-[#0B1020] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-[#FFFFFF] border border-[#1E2942] font-medium transition-colors cursor-pointer"
                        >
                          {sc.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Input
                    label="Sua Distância Atual (Opcional)"
                    id="input-taf-current"
                    value={currentMetersInput}
                    onChange={(e) => setCurrentMetersInput(e.target.value)}
                    rightAddon="metros"
                    placeholder="Ex: 2100"
                    hint="Informe para calcular o % alcançado e o déficit"
                    error={errors.current}
                    inputMode="numeric"
                  />
                </div>

                {errors.form && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errors.form}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                    Calcular Metas do TAF
                  </Button>
                  <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                    Limpar
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card
              title="TAF com Distância Fixa e Tempo Limite"
              description="Exemplo: Percorrer 2.400 metros em até 12 minutos."
            >
              <form onSubmit={handleCalcFixedDistance} className="space-y-4">
                <div>
                  <Input
                    label="Distância a Percorrer"
                    id="input-fixed-dist"
                    value={fixedDistInput}
                    onChange={(e) => setFixedDistInput(e.target.value)}
                    rightAddon="metros"
                    placeholder="2400"
                    error={errors.fixedDist}
                    inputMode="numeric"
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {targetShortcuts.map((sc) => (
                      <button
                        key={sc.value}
                        type="button"
                        onClick={() => setFixedDistInput(sc.value)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#0B1020] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-[#FFFFFF] border border-[#1E2942] font-medium transition-colors cursor-pointer"
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Tempo Máximo Permitido"
                  id="input-fixed-time"
                  value={maxTimeInput}
                  onChange={(e) => setMaxTimeInput(e.target.value)}
                  rightAddon="MM:SS"
                  hint="Formatos: 12:00 ou minutos inteiros (ex: 12)"
                  placeholder="12:00"
                  error={errors.maxTime}
                />

                {errors.form && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errors.form}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Button type="submit" className="flex-1" icon={<Calculator className="w-4 h-4" />}>
                    Calcular Limite de Pace
                  </Button>
                  <Button type="button" variant="outline" onClick={handleReset} icon={<RotateCcw className="w-4 h-4" />}>
                    Limpar
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Tabela de Parciais de Pista (Modo 1) */}
          {mode === "fixed-time" && tafResult && tafResult.splits.length > 0 && (
            <Card
              title="Plano de Passagem por Volta (Splits da Pista)"
              description={`Divisão da corrida a cada ${splitMetersInput}m para atingir a meta em ${durationInput} min:`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1E2942] text-[#8E9BB0]">
                      <th className="py-2.5 font-semibold">Volta</th>
                      <th className="py-2.5 font-semibold">Trecho</th>
                      <th className="py-2.5 font-semibold">Acumulado</th>
                      <th className="py-2.5 font-semibold">Tempo da Volta</th>
                      <th className="py-2.5 font-semibold">Tempo Acumulado</th>
                      <th className="py-2.5 font-semibold">Tática da Volta</th>
                      <th className="py-2.5 text-right font-semibold">% Meta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E2942] font-mono">
                    {tafResult.splits.map((s) => (
                      <tr key={s.lap} className="hover:bg-[#0B1020]/60">
                        <td className="py-2.5 font-bold text-[#FFFFFF] font-sans">
                          Volta {s.lap}
                        </td>
                        <td className="py-2.5 text-[#8E9BB0]">
                          {(s.distanceKm * 1000).toFixed(0)}m
                        </td>
                        <td className="py-2.5 text-[#FFFFFF] font-semibold">
                          {(s.accumulatedDistanceKm * 1000).toFixed(0)}m
                        </td>
                        <td className="py-2.5 text-[#B7F34A] font-bold">
                          {s.lapTimeFormatted}
                        </td>
                        <td className="py-2.5 text-[#FFFFFF] font-bold">
                          {s.accumulatedTimeFormatted}
                        </td>
                        <td className="py-2.5 text-[#8E9BB0] font-sans text-[11px]">
                          {s.lap === 1
                            ? "🎯 Saída controlada (evite largar forte demais)"
                            : s.lap === tafResult.splits.length
                            ? "⚡ Sprint final (aceleração máxima)"
                            : s.lap === tafResult.splits.length - 1
                            ? "💪 Ajuste de ritmo e foco mental"
                            : "🏃 Manutenção de cadência"}
                        </td>
                        <td className="py-2.5 text-right text-[#8E9BB0] font-sans text-[11px]">
                          {s.progressPercent.toFixed(0)}%
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
          {/* Régua Visual de Aprovação */}
          {mode === "fixed-time" && (
            <TafApprovalRuler
              currentDistance={
                currentMetersInput.trim().length > 0 && Number(currentMetersInput) > 0
                  ? Number(currentMetersInput)
                  : Number(targetMetersInput) || 2400
              }
              minDistance={goal?.minDistanceMeters ?? 2400}
              targetDistance={
                goal?.targetDistanceMeters ??
                Math.max(Number(targetMetersInput) || 2400, (goal?.minDistanceMeters ?? 2400) + 200)
              }
              institutionName={goal?.institutionName ?? "Edital TAF"}
            />
          )}

          {mode === "fixed-time" && tafResult && (
            <Card
              title="Métricas do Teste"
              description="Ritmo necessário para aprovação"
              headerAction={
                <CopyButton
                  textToCopy={`Estratégia TAF: Meta de ${targetMetersInput}m em ${durationInput}min. Pace necessário: ${tafResult.paceFormatted} min/km (${formatDecimal(tafResult.speedKmh, 2)} km/h). Tempo por volta de 400m: ${tafResult.splits[0]?.lapTimeFormatted || "-"}.`}
                  label="Copiar Estratégia"
                />
              }
            >
              <div className="space-y-4">
                {/* Status de Aptidão (se informado) */}
                {tafResult.progressPercent !== undefined && (
                  <div
                    className={`p-4 rounded-xl border ${
                      tafResult.progressPercent >= 100
                        ? "bg-[#B7F34A]/10 border-[#B7F34A]/30"
                        : "bg-amber-500/10 border-amber-500/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF] flex items-center gap-1.5">
                        {tafResult.progressPercent >= 100 ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-[#B7F34A]" />
                            Status: Apto na Meta
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-amber-400" />
                            Status: Abaixo da Meta
                          </>
                        )}
                      </span>
                      <Badge variant={tafResult.progressPercent >= 100 ? "lime" : "warning"}>
                        {tafResult.progressPercent.toFixed(1)}% Atingido
                      </Badge>
                    </div>

                    {/* Barra de Progresso */}
                    <div className="w-full bg-[#0B1020] border border-[#1E2942] h-2.5 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          tafResult.progressPercent >= 100 ? "bg-[#B7F34A]" : "bg-amber-400"
                        }`}
                        style={{ width: `${Math.min(100, tafResult.progressPercent)}%` }}
                      />
                    </div>

                    <p className="text-xs text-[#8E9BB0]">
                      {tafResult.progressPercent >= 100
                        ? `Parabéns! Sua distância atual (${currentMetersInput}m) atinge ou supera a meta do edital.`
                        : `Faltam ${(
                            (tafResult.remainingDistanceKm || 0) * 1000
                          ).toFixed(0)}m para alcançar a distância mínima exigida.`}
                    </p>
                  </div>
                )}

                {/* Pace Necessário */}
                <ResultBlock
                  label="Pace Alvo Obrigatório"
                  value={tafResult.paceFormatted}
                  unit="min/km"
                  highlight
                  secondaryText={`Tempo máximo por km para completar ${targetMetersInput}m em ${durationInput} min`}
                  icon={<Timer className="w-4 h-4" />}
                />

                {/* Velocidade Necessária */}
                <ResultBlock
                  label="Velocidade Média Mínima"
                  value={formatDecimal(tafResult.speedKmh, 2)}
                  unit="km/h"
                  secondaryText="Velocidade média constante exigida"
                  icon={<Gauge className="w-4 h-4" />}
                />

                {/* Tempo por Volta de 400m */}
                {tafResult.splits[0] && (
                  <div className="p-3.5 rounded-xl bg-[#0B1020] border border-[#1E2942] flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-[#FFFFFF] flex items-center gap-1.5">
                        <Footprints className="w-4 h-4 text-[#B7F34A]" />
                        Tempo por Volta ({splitMetersInput}m)
                      </span>
                      <p className="text-[11px] text-[#8E9BB0] mt-0.5">
                        Mantenha esse tempo em cada parcial
                      </p>
                    </div>
                    <span className="text-lg font-black font-mono text-[#B7F34A]">
                      {tafResult.splits[0].lapTimeFormatted}
                    </span>
                  </div>
                )}

                {/* Salvar no Histórico */}
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
                  {savedToHistory ? "Estratégia Salva no Histórico!" : "Salvar esta Estratégia no Histórico"}
                </Button>
              </div>
            </Card>
          )}

          {/* Resultado do Modo 2: Distância Fixa */}
          {mode === "fixed-distance" && fixedResult && (
            <Card
              title="Limite de Ritmo"
              description="Valores máximos para aprovação"
              headerAction={
                <CopyButton
                  textToCopy={`TAF Distância Fixa: ${fixedDistInput}m em até ${fixedResult.maxTimeFormatted}. Pace máximo: ${fixedResult.paceFormatted} min/km (${formatDecimal(fixedResult.speedKmh, 2)} km/h).`}
                  label="Copiar Limites"
                />
              }
            >
              <div className="space-y-4">
                <ResultBlock
                  label="Pace Máximo Permitido"
                  value={fixedResult.paceFormatted}
                  unit="min/km"
                  highlight
                  secondaryText={`Para não estourar o tempo limite de ${fixedResult.maxTimeFormatted}`}
                  icon={<Timer className="w-4 h-4" />}
                />

                <ResultBlock
                  label="Velocidade Mínima"
                  value={formatDecimal(fixedResult.speedKmh, 2)}
                  unit="km/h"
                  secondaryText="Velocidade média que você precisa manter"
                  icon={<Gauge className="w-4 h-4" />}
                />

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
                  {savedToHistory ? "Limite Salvo no Histórico!" : "Salvar Limite no Histórico"}
                </Button>
              </div>
            </Card>
          )}

          {/* Dica de Treinamento */}
          <div className="p-4 rounded-xl border border-[#1E2942] bg-[#131A2E] text-xs text-[#8E9BB0]">
            <p className="font-bold flex items-center gap-1.5 mb-1 text-[#B7F34A]">
              <Compass className="w-4 h-4 text-[#B7F34A]" />
              Dica Tática para o TAF
            </p>
            <p className="text-[#8E9BB0] leading-relaxed">
              Em provas de pista de atletismo oficial (400 metros), evite largar muito forte na primeira volta. Monitorar a passagem em cada volta de 400m ajuda a manter o ritmo constante e economizar energia para a volta final.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
