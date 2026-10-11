"use client";

import React, { useState, useId } from "react";
import {
  Layers,
  Sparkles,
  RotateCcw,
  Calculator,
  AlertCircle,
  Plus,
  Trash2,
  TrendingUp,
  Award,
  Zap,
  BookmarkPlus,
  Check,
  BarChart3,
  Timer,
  Gauge,
  ArrowUpDown,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ResultBlock } from "@/components/ui/ResultBlock";
import { CopyButton } from "@/components/ui/CopyButton";
import { PaceBarChart, PaceChartDataPoint } from "@/components/charts/PaceBarChart";
import {
  calcAveragePaces,
  calcWeightedAveragePaces,
} from "@/lib/math/averages";
import {
  formatDecimal,
  formatPace,
  parsePace,
} from "@/lib/formatting/time";
import { validateDistance, validatePaceString } from "@/lib/validation/inputs";
import { historyStorage } from "@/lib/storage/localStorage";
import { PaceAverageResult } from "@/types";

interface WeightedEntry {
  id: string;
  pace: string;
  distance: string;
}

const EXAMPLE_SIMPLE_PACES = `6:13
6:33
6:14
6:55
7:34
6:11
7:15
6:02
7:13`;

const PROJECTION_LABELS: Record<string, string> = {
  "1km": "1 km",
  "1.6km": "1,6 km (Milha / TAF)",
  "2km": "2 km",
  "2.3km": "2,3 km (TAF Típico)",
  "3km": "3 km",
  "5km": "5 km",
  "10km": "10 km",
};

export default function MediasPage() {
  const [isWeighted, setIsWeighted] = useState(false);
  const [simpleText, setSimpleText] = useState(EXAMPLE_SIMPLE_PACES);
  const [weightedEntries, setWeightedEntries] = useState<WeightedEntry[]>([
    { id: "1", pace: "6:00", distance: "1" },
    { id: "2", pace: "6:30", distance: "1.5" },
    { id: "3", pace: "7:00", distance: "0.5" },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaceAverageResult | null>(() => {
    try {
      const initialLines = EXAMPLE_SIMPLE_PACES.split("\n").filter((l) => l.trim().length > 0);
      return calcAveragePaces(initialLines);
    } catch {
      return null;
    }
  });

  const [chartData, setChartData] = useState<PaceChartDataPoint[]>(() => {
    try {
      const initialLines = EXAMPLE_SIMPLE_PACES.split("\n").filter((l) => l.trim().length > 0);
      return initialLines.map((p, idx) => ({
        label: `Km ${idx + 1}`,
        paceSeconds: parsePace(p),
        formatted: p,
      }));
    } catch {
      return [];
    }
  });

  const [savedToHistory, setSavedToHistory] = useState(false);
  const textareaId = useId();

  // Calcular modo simples
  const handleCalculateSimple = () => {
    setError(null);
    const rawLines = simpleText
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (rawLines.length === 0) {
      setError("Informe ao menos um pace para calcular a média.");
      setResult(null);
      setChartData([]);
      return;
    }

    // Validar cada linha
    for (let i = 0; i < rawLines.length; i++) {
      const val = validatePaceString(rawLines[i]);
      if (!val.valid) {
        setError(`Linha ${i + 1} ("${rawLines[i]}") inválida: ${val.message}`);
        setResult(null);
        setChartData([]);
        return;
      }
    }

    try {
      const res = calcAveragePaces(rawLines);
      setResult(res);

      const points: PaceChartDataPoint[] = rawLines.map((p, idx) => {
        const sec = parsePace(p);
        return {
          label: `Km ${idx + 1}`,
          paceSeconds: sec,
          formatted: formatPace(sec),
        };
      });
      setChartData(points);
      setSavedToHistory(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro no cálculo das médias";
      setError(msg);
      setResult(null);
      setChartData([]);
    }
  };

  // Calcular modo ponderado
  const handleCalculateWeighted = () => {
    setError(null);
    if (weightedEntries.length === 0) {
      setError("Adicione pelo menos uma parcial com pace e distância.");
      setResult(null);
      setChartData([]);
      return;
    }

    // Validar entradas
    for (let i = 0; i < weightedEntries.length; i++) {
      const entry = weightedEntries[i];
      const paceVal = validatePaceString(entry.pace);
      if (!paceVal.valid) {
        setError(`Parcial ${i + 1}: Pace "${entry.pace}" inválido (${paceVal.message})`);
        return;
      }
      const distNum = Number(entry.distance.replace(",", "."));
      const distVal = validateDistance(distNum);
      if (!distVal.valid) {
        setError(`Parcial ${i + 1}: Distância inválida (${distVal.message})`);
        return;
      }
    }

    try {
      const formattedEntries = weightedEntries.map((e) => ({
        paceStr: e.pace,
        distanceKm: Number(e.distance.replace(",", ".")),
      }));

      const res = calcWeightedAveragePaces(formattedEntries);
      setResult(res);

      const points: PaceChartDataPoint[] = weightedEntries.map((e, idx) => {
        const sec = parsePace(e.pace);
        return {
          label: `Trecho ${idx + 1} (${e.distance}km)`,
          paceSeconds: sec,
          formatted: formatPace(sec),
        };
      });
      setChartData(points);
      setSavedToHistory(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro no cálculo ponderado";
      setError(msg);
      setResult(null);
      setChartData([]);
    }
  };

  const handleCalculate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isWeighted) {
      handleCalculateWeighted();
    } else {
      handleCalculateSimple();
    }
  };

  const handleLoadExample = () => {
    setError(null);
    setIsWeighted(false);
    setSimpleText(EXAMPLE_SIMPLE_PACES);
    const lines = EXAMPLE_SIMPLE_PACES.split("\n").filter((l) => l.trim().length > 0);
    const res = calcAveragePaces(lines);
    setResult(res);
    setChartData(
      lines.map((p, idx) => ({
        label: `Km ${idx + 1}`,
        paceSeconds: parsePace(p),
        formatted: p,
      }))
    );
  };

  const handleReset = () => {
    setError(null);
    setSimpleText("");
    setWeightedEntries([
      { id: "1", pace: "", distance: "" },
      { id: "2", pace: "", distance: "" },
    ]);
    setResult(null);
    setChartData([]);
    setSavedToHistory(false);
  };

  const handleAddWeightedEntry = () => {
    setWeightedEntries((prev) => [
      ...prev,
      { id: Date.now().toString(), pace: "", distance: "1" },
    ]);
  };

  const handleRemoveWeightedEntry = (id: string) => {
    if (weightedEntries.length <= 1) return;
    setWeightedEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleUpdateWeightedEntry = (
    id: string,
    field: "pace" | "distance",
    value: string
  ) => {
    setWeightedEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
    setError(null);
  };

  // Salvar no histórico
  const handleSaveToHistory = () => {
    if (!result) return;
    const totalDistKm = isWeighted
      ? weightedEntries.reduce((acc, curr) => acc + Number(curr.distance.replace(",", ".") || 0), 0)
      : result.count; // no simples, cada parcial pressupõe 1 km

    const totalSeconds = result.averagePaceSeconds * totalDistKm;

    historyStorage.save({
      id: "media-" + Date.now(),
      date: new Date().toISOString().split("T")[0],
      distanceKm: totalDistKm,
      timeSeconds: totalSeconds,
      paceSeconds: result.averagePaceSeconds,
      paceFormatted: result.averagePaceFormatted,
      speedKmh: result.speedKmh,
      notes: `Média de ${result.count} parciais (${isWeighted ? "ponderada" : "simples"}). Mais rápido: ${result.fastestPaceFormatted}, mais lento: ${result.slowestPaceFormatted}.`,
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
          <Layers className="w-3.5 h-3.5" />
          Média de Ritmos & Splits
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Calculadora de Médias de Paces
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          Cole seus splits de treino ou prova para calcular o ritmo médio real, analisar oscilações e visualizar a evolução em cada quilômetro.
        </p>
      </div>

      {/* Aviso de Premissa de Distância */}
      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950 dark:text-amber-100">
            Aviso Importante sobre Cálculo de Média
          </p>
          <p className="text-amber-800 dark:text-amber-300/90 leading-relaxed">
            A média simples pressupõe <strong>trechos de igual distância</strong> (ex: 1 km cada parcial). Se seus trechos tiveram distâncias diferentes, ative a opção <strong>Com distâncias de parcial</strong> para calcular a média ponderada exata.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Entrada (7 colunas) */}
        <div className="lg:col-span-7 space-y-4">
          <Card
            title={isWeighted ? "Parciais Ponderadas (com distâncias)" : "Lista de Paces (trechos iguais)"}
            description={
              isWeighted
                ? "Informe o pace e a distância correspondente de cada trecho."
                : "Digite um pace por linha (ex: 6:13 ou 6 para 6:00)."
            }
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
            {/* Toggle Simples vs Ponderada */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 mb-4">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Distâncias Variáveis por Parcial
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isWeighted}
                onClick={() => {
                  setIsWeighted(!isWeighted);
                  setError(null);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  isWeighted ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isWeighted ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <form onSubmit={handleCalculate} className="space-y-4">
              {!isWeighted ? (
                // MODO SIMPLES: TEXTAREA
                <div>
                  <label
                    htmlFor={textareaId}
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5"
                  >
                    Paces por Linha
                  </label>
                  <textarea
                    id={textareaId}
                    rows={8}
                    value={simpleText}
                    onChange={(e) => {
                      setSimpleText(e.target.value);
                      setError(null);
                    }}
                    placeholder={`6:13\n6:33\n6:14\n6:55\n7:34`}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Aceita formatos como <strong>6:13</strong>, <strong>06:13</strong> ou números inteiros como <strong>6</strong> (equivalente a 6:00).
                  </p>
                </div>
              ) : (
                // MODO PONDERADO: LISTA DINÂMICA
                <div className="space-y-2.5">
                  <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
                    <span className="col-span-1">#</span>
                    <span className="col-span-6">Pace (MM:SS)</span>
                    <span className="col-span-4">Distância (km)</span>
                    <span className="col-span-1 text-right">Ação</span>
                  </div>

                  {weightedEntries.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800"
                    >
                      <span className="col-span-1 text-xs font-bold text-slate-400">
                        {idx + 1}
                      </span>
                      <div className="col-span-6">
                        <Input
                          id={`entry-pace-${entry.id}`}
                          aria-label={`Pace da parcial ${idx + 1}`}
                          value={entry.pace}
                          onChange={(e) =>
                            handleUpdateWeightedEntry(entry.id, "pace", e.target.value)
                          }
                          placeholder="Ex: 6:15 ou 6"
                          className="py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div className="col-span-4">
                        <Input
                          id={`entry-dist-${entry.id}`}
                          aria-label={`Distância da parcial ${idx + 1}`}
                          value={entry.distance}
                          onChange={(e) =>
                            handleUpdateWeightedEntry(entry.id, "distance", e.target.value)
                          }
                          placeholder="1"
                          rightAddon="km"
                          className="py-1.5 text-xs"
                          inputMode="decimal"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveWeightedEntry(entry.id)}
                          disabled={weightedEntries.length <= 1}
                          aria-label={`Remover parcial ${idx + 1}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={handleAddWeightedEntry}
                    icon={<Plus className="w-4 h-4" />}
                  >
                    Adicionar Nova Parcial
                  </Button>
                </div>
              )}

              {/* Mensagem de Erro */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  className="flex-1"
                  icon={<Calculator className="w-4 h-4" />}
                >
                  Calcular Médias
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
          </Card>

          {/* Gráfico de Parciais */}
          {chartData.length > 0 && (
            <Card
              title="Distribuição do Ritmo por Parcial"
              description="Visualização gráfica das oscilações de pace durante o treino"
              headerAction={
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    Mais Rápido
                  </span>
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    Parciais
                  </span>
                </div>
              }
            >
              <PaceBarChart data={chartData} />
            </Card>
          )}
        </div>

        {/* Coluna de Resultados & Projeções (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <Card
            title="Estatísticas do Treino"
            description="Média e amplitude calculadas"
            headerAction={
              result ? (
                <CopyButton
                  textToCopy={`Média de Paces: ${result.averagePaceFormatted} min/km (${formatDecimal(result.speedKmh, 2)} km/h) | Parciais: ${result.count} | Mais Rápido: ${result.fastestPaceFormatted} | Mais Lento: ${result.slowestPaceFormatted} | Diferença: ${result.differenceFormatted}`}
                  label="Copiar Resumo"
                />
              ) : undefined
            }
          >
            {result ? (
              <div className="space-y-3.5">
                {/* Destaque Principal: Pace Médio */}
                <ResultBlock
                  label="Pace Médio Geral"
                  value={result.averagePaceFormatted}
                  unit="min/km"
                  highlight
                  secondaryText={`Calculado a partir de ${result.count} parciais`}
                  icon={<Timer className="w-4 h-4" />}
                />

                {/* Velocidade Média */}
                <ResultBlock
                  label="Velocidade Média Equivalente"
                  value={formatDecimal(result.speedKmh, 2)}
                  unit="km/h"
                  secondaryText="Velocidade constante correspondente"
                  icon={<Gauge className="w-4 h-4" />}
                />

                {/* Grid: Mais Rápido e Mais Lento */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div className="p-3 rounded-xl border border-emerald-100 dark:border-emerald-950/60 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 text-xs font-semibold mb-1">
                      <Award className="w-3.5 h-3.5" />
                      Mais Rápido
                    </div>
                    <div className="text-lg font-black text-emerald-900 dark:text-emerald-100 font-mono">
                      {result.fastestPaceFormatted}
                    </div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      min/km
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-rose-100 dark:border-rose-950/60 bg-rose-50/50 dark:bg-rose-950/20">
                    <div className="flex items-center gap-1 text-rose-700 dark:text-rose-300 text-xs font-semibold mb-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Mais Lento
                    </div>
                    <div className="text-lg font-black text-rose-900 dark:text-rose-100 font-mono">
                      {result.slowestPaceFormatted}
                    </div>
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                      min/km
                    </div>
                  </div>
                </div>

                {/* Variação / Diferença */}
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-blue-500" />
                    Oscilação (Diferença)
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {result.differenceFormatted} min/km
                  </span>
                </div>

                {/* Ação de Salvar no Histórico */}
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
                    {savedToHistory ? "Média Salva no Histórico!" : "Salvar esta Média no Histórico"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 px-4 text-slate-400 dark:text-slate-500">
                <BarChart3 className="w-10 h-10 mx-auto mb-2.5 opacity-40" />
                <p className="text-sm font-medium">Insira as parciais e clique em Calcular</p>
                <p className="text-xs mt-1">O ritmo médio e as projeções aparecerão aqui.</p>
              </div>
            )}
          </Card>

          {/* Tabela de Projeções de Distâncias */}
          {result && (
            <Card
              title="Projeção de Tempos Estimados"
              description={`Se você mantiver o pace médio de ${result.averagePaceFormatted} min/km:`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 font-semibold">Distância</th>
                      <th className="py-2 text-right font-semibold">Tempo Estimado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {Object.entries(result.estimatedTimes).map(([key, timeStr]) => (
                      <tr key={key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 text-slate-700 dark:text-slate-300 font-sans font-medium flex items-center gap-1.5">
                          <Zap className="w-3 h-3 text-blue-500" />
                          {PROJECTION_LABELS[key] || key}
                        </td>
                        <td className="py-2.5 text-right font-bold text-blue-600 dark:text-blue-400">
                          {timeStr}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
