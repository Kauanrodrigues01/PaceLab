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
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResultBlock } from "@/components/ui/ResultBlock";
import { CopyButton } from "@/components/ui/CopyButton";
import { Badge } from "@/components/ui/Badge";
import { calcIntervalSession } from "@/lib/math/intervals";
import { formatDecimal, formatTime, parseTime } from "@/lib/formatting/time";
import { historyStorage } from "@/lib/storage/localStorage";
import { IntervalSession } from "@/types";

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
      });
      setSessionResult(res);
      setErrors({});
      setSavedToHistory(false);
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
    setErrors({});
    setSessionResult(null);
    setSavedToHistory(false);
  };

  const handleSaveToHistory = () => {
    if (!sessionResult) return;

    historyStorage.save({
      id: "intervalado-" + Date.now(),
      date: new Date().toISOString().split("T")[0],
      distanceKm: sessionResult.totalDistanceKm,
      timeSeconds: sessionResult.totalTimeSeconds,
      paceSeconds: sessionResult.averagePaceSeconds,
      paceFormatted: sessionResult.averagePaceFormatted,
      speedKmh: sessionResult.averageSpeedKmh,
      notes: `Treino Intervalado: ${repetitions}x [${runDuration}min a ${runSpeed} km/h + ${walkDuration}min a ${walkSpeed} km/h]. Total: ${formatDecimal(sessionResult.totalDistanceKm, 2)} km em ${formatTime(sessionResult.totalTimeSeconds)}.`,
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2">
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          Treinamento de Alta Intensidade (HIIT / Tiros)
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Simulador de Corrida Intervalada
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
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
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Carregar Exemplo
              </button>
            }
          >
            <form onSubmit={handleCalculate} className="space-y-4">
              {/* 1. Aquecimento */}
              <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-2">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <HeartPulse className="w-3.5 h-3.5 text-amber-600" />
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
              <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 space-y-2">
                <span className="text-xs font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5 text-rose-600" />
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
              <div className="p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 space-y-2">
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5 uppercase tracking-wider">
                  <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
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
              <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <Repeat className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
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
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Milestone className="w-3.5 h-3.5 text-slate-500" />
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

              {errors.form && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
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
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 font-semibold">#</th>
                      <th className="py-2.5 font-semibold">Etapa</th>
                      <th className="py-2.5 font-semibold">Duração</th>
                      <th className="py-2.5 font-semibold">Velocidade</th>
                      <th className="py-2.5 font-semibold">Pace</th>
                      <th className="py-2.5 text-right font-semibold">Distância</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {sessionResult.stages.map((s) => (
                      <tr key={s.index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 text-slate-400 font-sans font-bold">
                          {s.index}
                        </td>
                        <td className="py-2.5 font-sans">
                          {getStageBadge(s.type)}
                        </td>
                        <td className="py-2.5 text-slate-800 dark:text-slate-200 font-semibold">
                          {formatTime(s.durationSeconds)}
                        </td>
                        <td className="py-2.5 text-slate-600 dark:text-slate-400">
                          {formatDecimal(s.speedKmh, 1)} km/h
                        </td>
                        <td className="py-2.5 text-blue-600 dark:text-blue-400 font-bold">
                          {s.paceFormatted}
                        </td>
                        <td className="py-2.5 text-right text-slate-900 dark:text-slate-100 font-black">
                          {formatDecimal(s.distanceKm, 2)} km
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
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
                {/* Tempo Total */}
                <ResultBlock
                  label="Duração Total do Treino"
                  value={formatTime(sessionResult.totalTimeSeconds)}
                  highlight
                  secondaryText={`Somatório de aquecimento, ${repetitions} séries e desaquecimento`}
                  icon={<Timer className="w-4 h-4" />}
                />

                {/* Distância Total */}
                <ResultBlock
                  label="Distância Total Percorrida"
                  value={formatDecimal(sessionResult.totalDistanceKm, 2)}
                  unit="km"
                  secondaryText="Volume total rodado na sessão"
                  icon={<Milestone className="w-4 h-4" />}
                />

                {/* Grid: Pace Médio & Velocidade Média */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl border border-blue-100 dark:border-blue-950/60 bg-blue-50/50 dark:bg-blue-950/20">
                    <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-1">
                      <Timer className="w-3.5 h-3.5" />
                      Pace Médio Geral
                    </div>
                    <div className="text-xl font-black text-blue-900 dark:text-blue-100 font-mono">
                      {sessionResult.averagePaceFormatted}
                    </div>
                    <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                      min/km
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                    <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5" />
                      Velocidade Média
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
                      {formatDecimal(sessionResult.averageSpeedKmh, 2)}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      km/h
                    </div>
                  </div>
                </div>

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
                  {savedToHistory ? "Sessão Salva no Histórico!" : "Salvar esta Sessão no Histórico"}
                </Button>
              </div>
            ) : (
              <div className="text-center py-10 px-4 text-slate-400 dark:text-slate-500">
                <Flame className="w-10 h-10 mx-auto mb-2.5 opacity-40" />
                <p className="text-sm font-medium">Configure as séries e clique em Simular</p>
                <p className="text-xs mt-1">O resumo e os ritmos médios aparecerão aqui.</p>
              </div>
            )}
          </Card>

          {/* Dica sobre Intervalados */}
          <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-950/60 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-blue-900 dark:text-blue-200">
            <p className="font-bold flex items-center gap-1.5 mb-1">
              <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Por que treinar intervalado?
            </p>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              O treino intervalado (tiros com recuperação controlada) eleva seu VO2 máx, melhora a tolerância ao lactato e permite correr em velocidades mais altas por períodos cumulativos maiores do que um treino contínuo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
