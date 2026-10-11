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
import { TafResult, FixedTargetResult } from "@/types";

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

  // Atalhos rápidos
  const targetShortcuts = [
    { label: "2.000 m", value: "2000" },
    { label: "2.300 m", value: "2300" },
    { label: "2.400 m", value: "2400" },
    { label: "2.800 m", value: "2800" },
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2">
          <Medal className="w-3.5 h-3.5" />
          Preparação para Concursos e Avaliações Físicas
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Calculadora de TAF (Teste de Aptidão Física)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          Descubra o ritmo exato (pace e velocidade), os tempos por volta na pista de 400 metros e monitore seu índice de aprovação.
        </p>
      </div>

      {/* Aviso Legal / Técnico Obrigatório */}
      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950 dark:text-amber-100">
            Aviso Importante e Termo de Referência
          </p>
          <p className="text-amber-800 dark:text-amber-300/90 leading-relaxed">
            Estes valores são parâmetros de cálculo matemáticos para auxílio em treinamentos e <strong>não garantem aprovação</strong> em nenhum concurso público, teste militar ou avaliação física. Sempre consulte as regras específicas do edital oficial do seu certame.
          </p>
        </div>
      </div>

      {/* Seletor de Modo (Subtabs) */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setMode("fixed-time");
            setErrors({});
          }}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            mode === "fixed-time"
              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
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
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            mode === "fixed-distance"
              ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
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
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {targetShortcuts.map((sc) => (
                        <button
                          key={sc.value}
                          type="button"
                          onClick={() => setTargetMetersInput(sc.value)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-colors"
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
                          className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-colors"
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
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 font-semibold">Volta</th>
                      <th className="py-2.5 font-semibold">Trecho</th>
                      <th className="py-2.5 font-semibold">Acumulado</th>
                      <th className="py-2.5 font-semibold">Tempo da Volta</th>
                      <th className="py-2.5 font-semibold">Tempo Acumulado</th>
                      <th className="py-2.5 text-right font-semibold">% Meta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {tafResult.splits.map((s) => (
                      <tr key={s.lap} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 font-bold text-slate-700 dark:text-slate-300 font-sans">
                          Volta {s.lap}
                        </td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-400">
                          {(s.distanceKm * 1000).toFixed(0)}m
                        </td>
                        <td className="py-2.5 text-slate-800 dark:text-slate-200 font-semibold">
                          {(s.accumulatedDistanceKm * 1000).toFixed(0)}m
                        </td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-bold">
                          {s.lapTimeFormatted}
                        </td>
                        <td className="py-2.5 text-slate-900 dark:text-slate-100 font-bold">
                          {s.accumulatedTimeFormatted}
                        </td>
                        <td className="py-2.5 text-right text-slate-500 dark:text-slate-400 font-sans text-[11px]">
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
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
                        : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        {tafResult.progressPercent >= 100 ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            Status: Apto na Meta
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            Status: Abaixo da Meta
                          </>
                        )}
                      </span>
                      <Badge variant={tafResult.progressPercent >= 100 ? "success" : "warning"}>
                        {tafResult.progressPercent.toFixed(1)}% Atingido
                      </Badge>
                    </div>

                    {/* Barra de Progresso */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          tafResult.progressPercent >= 100 ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${Math.min(100, tafResult.progressPercent)}%` }}
                      />
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400">
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
                  <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                        <Footprints className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        Tempo por Volta ({splitMetersInput}m)
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Mantenha esse tempo em cada parcial
                      </p>
                    </div>
                    <span className="text-lg font-black font-mono text-blue-600 dark:text-blue-400">
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
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <BookmarkPlus className="w-4 h-4 text-blue-500" />
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
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <BookmarkPlus className="w-4 h-4 text-blue-500" />
                    )
                  }
                >
                  {savedToHistory ? "Limite Salvo no Histórico!" : "Salvar Limite no Histórico"}
                </Button>
              </div>
            </Card>
          )}

          {/* Dica de Treinamento */}
          <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-950/60 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-900 dark:text-blue-200">
            <p className="font-bold flex items-center gap-1.5 mb-1">
              <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Dica Tática para o TAF
            </p>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Em provas de pista de atletismo oficial (400 metros), evite largar muito forte na primeira volta. Monitorar a passagem em cada volta de 400m ajuda a manter o ritmo constante e economizar energia para a volta final.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
