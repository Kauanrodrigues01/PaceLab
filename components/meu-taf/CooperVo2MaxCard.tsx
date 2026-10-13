"use client";

import React, { useState } from "react";
import { HeartPulse, Info, Sparkles, User } from "lucide-react";
import { classifyCooperVo2Max } from "@/lib/math/cooper";

interface CooperVo2MaxCardProps {
  distanceMeters: number;
  initialAge?: number | null;
  initialGender?: string | null;
}

const LEVELS = [
  { label: "Muito Fraco", short: "M. Fraco" },
  { label: "Fraco", short: "Fraco" },
  { label: "Médio", short: "Médio" },
  { label: "Bom", short: "Bom" },
  { label: "Muito Bom", short: "M. Bom" },
  { label: "Excelente", short: "Excelente" },
];

export function CooperVo2MaxCard({
  distanceMeters,
  initialAge,
  initialGender,
}: CooperVo2MaxCardProps) {
  const [age, setAge] = useState<number>(initialAge || 25);
  const [gender, setGender] = useState<string>(initialGender || "M");
  const [showDetails, setShowDetails] = useState(false);

  const result = classifyCooperVo2Max(distanceMeters, age, gender);

  if (!distanceMeters || distanceMeters <= 504.9) {
    return null;
  }

  const activeLevelIndex = LEVELS.findIndex(
    (lvl) => lvl.label === result.classification
  );

  return (
    <div
      data-testid="cooper-vo2max-card"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden transition-all"
    >
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              VO2 Máx Estimado (Teste de Cooper)
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                12 min
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Consumo máximo de oxigênio calculado para {distanceMeters.toLocaleString("pt-BR")} m
            </p>
          </div>
        </div>

        {/* Controles de Parâmetros Rápidos (Sexo e Idade) */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setGender("M")}
              className={`px-2 py-1 rounded-md transition-all ${
                gender === "M"
                  ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Masc
            </button>
            <button
              type="button"
              onClick={() => setGender("F")}
              className={`px-2 py-1 rounded-md transition-all ${
                gender === "F"
                  ? "bg-white dark:bg-slate-700 text-pink-600 dark:text-pink-400 shadow-xs"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Fem
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300">
            <User className="w-3 h-3 text-slate-400" />
            <select
              aria-label="Faixa Etária"
              value={age < 30 ? "25" : age < 40 ? "35" : age < 50 ? "45" : "55"}
              onChange={(e) => setAge(Number(e.target.value))}
              className="bg-transparent font-semibold cursor-pointer outline-none text-xs"
            >
              <option value="25" className="bg-white dark:bg-slate-800">
                &lt; 30 anos
              </option>
              <option value="35" className="bg-white dark:bg-slate-800">
                30-39 anos
              </option>
              <option value="45" className="bg-white dark:bg-slate-800">
                40-49 anos
              </option>
              <option value="55" className="bg-white dark:bg-slate-800">
                50+ anos
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Destaque Principal do Valor e Classificação */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 mb-4">
        <div className="sm:col-span-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">
            Índice Cardiorrespiratório
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">
              {result.vo2Max.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-slate-500">
              ml/kg/min
            </span>
          </div>
        </div>

        <div className="sm:col-span-2 flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold ${result.badgeBgClass}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {result.classification}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              ({result.genderLabel} • {result.ageGroupLabel})
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {result.description}
          </p>
        </div>
      </div>

      {/* Régua Visual dos Níveis de VO2 Máx */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>Escala de Aptidão Física (Cooper)</span>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Nível {activeLevelIndex + 1} de 6
          </span>
        </div>

        <div className="grid grid-cols-6 gap-1 sm:gap-1.5">
          {LEVELS.map((lvl, index) => {
            const isActive = index === activeLevelIndex;
            const isPassed = index <= activeLevelIndex;
            return (
              <div key={lvl.label} className="flex flex-col items-center">
                <div
                  className={`w-full h-2.5 sm:h-3 rounded-full transition-all duration-300 ${
                    isActive
                      ? "bg-blue-600 dark:bg-blue-500 ring-2 ring-blue-400 dark:ring-blue-300 shadow-sm"
                      : isPassed
                      ? "bg-blue-400/80 dark:bg-blue-600/70"
                      : "bg-slate-200 dark:bg-slate-800"
                  }`}
                />
                <span
                  className={`text-[9px] sm:text-[10px] mt-1 text-center font-medium leading-none ${
                    isActive
                      ? "font-black text-blue-600 dark:text-blue-400"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {lvl.short}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Botão de Explicação Expansível */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
        >
          <Info className="w-3.5 h-3.5" />
          <span>{showDetails ? "Ocultar explicação médica" : "Como o VO2 Máx ajuda no TAF?"}</span>
        </button>
        <span className="text-[11px] text-slate-400">
          Fórmula: (distância - 504.9) / 44.73
        </span>
      </div>

      {showDetails && (
        <div className="mt-3 p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 text-xs text-slate-600 dark:text-slate-300 space-y-2 animate-in fade-in">
          <p>
            O <strong>VO2 Máx</strong> representa o volume máximo de oxigênio que seu corpo consegue captar, transportar e utilizar durante o esforço físico exaustivo. No teste de 12 minutos (Cooper), ele se correlaciona diretamente com o pace sustentável em alta intensidade.
          </p>
          <p>
            Quanto maior for seu VO2 máx, menor será a sensação de fadiga em velocidades competitivas (ex: acima de 12 km/h ou pace abaixo de 5:00/km), garantindo margem de segurança contra imprevistos climáticos ou nervosismo no dia da prova.
          </p>
        </div>
      )}
    </div>
  );
}
