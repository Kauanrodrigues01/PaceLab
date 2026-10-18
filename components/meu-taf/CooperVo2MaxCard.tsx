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
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden transition-all"
    >
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#B7F34A]/10 text-[#B7F34A] flex items-center justify-center">
            <HeartPulse className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              VO2 Máx Estimado (Teste de Cooper)
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0B1020] text-[#8E9BB0] border border-[#1E2942]">
                12 min
              </span>
            </h3>
            <p className="text-xs text-[#8E9BB0]">
              Consumo máximo de oxigênio calculado para {distanceMeters.toLocaleString("pt-BR")} m
            </p>
          </div>
        </div>

        {/* Controles de Parâmetros Rápidos (Sexo e Idade) */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg bg-[#0B1020] border border-[#1E2942] p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setGender("M")}
              className={`px-2 py-1 rounded-md transition-all ${
                gender === "M"
                  ? "bg-[#B7F34A] text-[#0B1020] font-black shadow-xs"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Masc
            </button>
            <button
              type="button"
              onClick={() => setGender("F")}
              className={`px-2 py-1 rounded-md transition-all ${
                gender === "F"
                  ? "bg-[#B7F34A] text-[#0B1020] font-black shadow-xs"
                  : "text-[#8E9BB0] hover:text-white"
              }`}
            >
              Fem
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#0B1020] border border-[#1E2942] px-2 py-1 rounded-lg text-xs font-medium text-white">
            <User className="w-3 h-3 text-[#8E9BB0]" />
            <select
              aria-label="Faixa Etária"
              value={age < 30 ? "25" : age < 40 ? "35" : age < 50 ? "45" : "55"}
              onChange={(e) => setAge(Number(e.target.value))}
              className="bg-transparent font-semibold cursor-pointer outline-none text-xs text-white"
            >
              <option value="25" className="bg-[#131A2E] text-white">
                &lt; 30 anos
              </option>
              <option value="35" className="bg-[#131A2E] text-white">
                30-39 anos
              </option>
              <option value="45" className="bg-[#131A2E] text-white">
                40-49 anos
              </option>
              <option value="55" className="bg-[#131A2E] text-white">
                50+ anos
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Destaque Principal do Valor e Classificação */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-[#0B1020]/80 p-4 rounded-2xl border border-[#1E2942] mb-4">
        <div className="sm:col-span-1">
          <span className="text-[11px] font-semibold text-[#8E9BB0] uppercase tracking-wider block mb-0.5">
            Índice Cardiorrespiratório
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
              {result.vo2Max.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-[#8E9BB0]">
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
            <span className="text-xs text-[#8E9BB0] font-medium">
              ({result.genderLabel} • {result.ageGroupLabel})
            </span>
          </div>
          <p className="text-xs text-[#8E9BB0] leading-relaxed">
            {result.description}
          </p>
        </div>
      </div>

      {/* Régua Visual dos Níveis de VO2 Máx */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[#8E9BB0]">
          <span>Escala de Aptidão Física (Cooper)</span>
          <span className="text-xs font-bold text-white">
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
                      ? "bg-[#B7F34A] ring-2 ring-[#B7F34A]/40 shadow-sm"
                      : isPassed
                      ? "bg-[#B7F34A]/50"
                      : "bg-[#0B1020] border border-[#1E2942]"
                  }`}
                />
                <span
                  className={`text-[9px] sm:text-[10px] mt-1 text-center font-medium leading-none ${
                    isActive
                      ? "font-black text-[#B7F34A]"
                      : "text-[#8E9BB0]"
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
      <div className="mt-4 pt-3 border-t border-[#1E2942] flex items-center justify-between text-xs text-[#8E9BB0]">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="inline-flex items-center gap-1.5 text-[#B7F34A] font-semibold hover:underline"
        >
          <Info className="w-3.5 h-3.5" />
          <span>{showDetails ? "Ocultar explicação médica" : "Como o VO2 Máx ajuda no TAF?"}</span>
        </button>
        <span className="text-[11px] text-[#8E9BB0]">
          Fórmula: (distância - 504.9) / 44.73
        </span>
      </div>

      {showDetails && (
        <div className="mt-3 p-3.5 rounded-xl bg-[#0B1020]/80 border border-[#1E2942] text-xs text-[#8E9BB0] space-y-2 animate-in fade-in">
          <p>
            O <strong className="text-white">VO2 Máx</strong> representa o volume máximo de oxigênio que seu corpo consegue captar, transportar e utilizar durante o esforço físico exaustivo. No teste de 12 minutos (Cooper), ele se correlaciona diretamente com o pace sustentável em alta intensidade.
          </p>
          <p>
            Quanto maior for seu VO2 máx, menor será a sensação de fadiga em velocidades competitivas (ex: acima de 12 km/h ou pace abaixo de 5:00/km), garantindo margem de segurança contra imprevistos climáticos ou nervosismo no dia da prova.
          </p>
        </div>
      )}
    </div>
  );
}
