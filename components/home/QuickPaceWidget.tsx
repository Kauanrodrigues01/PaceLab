"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Zap,
  ArrowRight,
} from "lucide-react";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import { formatDecimal, formatTime, parseTime } from "@/lib/formatting/time";
import { validateDistance, validateTimeString } from "@/lib/validation/inputs";

export function QuickPaceWidget() {
  const [distance, setDistance] = useState("5");
  const [time, setTime] = useState("25:00");

  const presets = [
    { label: "2.4 km TAF", dist: "2.4", time: "12:00" },
    { label: "5 km", dist: "5", time: "25:00" },
    { label: "10 km", dist: "10", time: "50:00" },
    { label: "21.1 km", dist: "21.1", time: "1:45:00" },
  ];

  // Cálculo instantâneo
  let paceFormatted = "5:00";
  let speedFormatted = "12.00";
  let lap400mFormatted = "2:00";
  let isValid = true;

  const distNum = Number(distance.replace(",", "."));
  const distVal = validateDistance(distNum);
  const timeVal = validateTimeString(time);

  if (distVal.valid && timeVal.valid) {
    try {
      const totalSec = parseTime(time);
      if (totalSec > 0 && distNum > 0) {
        const res = calcPaceFromDistanceAndTime(distNum, totalSec);
        paceFormatted = res.paceFormatted;
        speedFormatted = formatDecimal(res.speedKmh, 2);
        lap400mFormatted = formatTime(Math.round(res.paceSeconds * 0.4));
      } else {
        isValid = false;
      }
    } catch {
      isValid = false;
    }
  } else {
    isValid = false;
  }

  const handleApplyPreset = (pDist: string, pTime: string) => {
    setDistance(pDist);
    setTime(pTime);
  };

  return (
    <div
      data-testid="quick-pace-widget"
      className="p-5 sm:p-6 rounded-3xl bg-[#131A2E] border border-[#1E2942] shadow-xl space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#B7F34A]/10 text-[#B7F34A]">
            <Zap className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-[#FFFFFF]">
            Cálculo Rápido de Ritmo & Velocidade
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#B7F34A]/15 text-[#B7F34A] font-semibold border border-[#B7F34A]/30 hidden sm:inline-block">
            Instantâneo
          </span>
        </div>

        {/* Atalhos Rápidos */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handleApplyPreset(p.dist, p.time)}
              className="text-xs px-2.5 py-1 rounded-lg bg-[#0B1020] hover:bg-[#1E2942] text-[#8E9BB0] hover:text-[#FFFFFF] border border-[#1E2942] hover:border-[#B7F34A]/40 transition-all shrink-0 cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-center">
        {/* Input Distância */}
        <div className="sm:col-span-3">
          <label className="block text-[11px] font-semibold text-[#8E9BB0] uppercase tracking-wider mb-1">
            Distância (km)
          </label>
          <input
            type="text"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="Ex: 5"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-[#1E2942] text-[#FFFFFF] font-mono text-sm focus:outline-hidden focus:border-[#B7F34A] focus:ring-1 focus:ring-[#B7F34A] transition-all"
          />
        </div>

        {/* Input Tempo */}
        <div className="sm:col-span-3">
          <label className="block text-[11px] font-semibold text-[#8E9BB0] uppercase tracking-wider mb-1">
            Tempo (MM:SS ou Horas)
          </label>
          <input
            type="text"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="Ex: 25:00"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-[#1E2942] text-[#FFFFFF] font-mono text-sm focus:outline-hidden focus:border-[#B7F34A] focus:ring-1 focus:ring-[#B7F34A] transition-all"
          />
        </div>

        {/* Resultados Instantâneos */}
        <div className="sm:col-span-6 grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-[#0B1020] border border-[#1E2942]">
          <div className="text-center">
            <span className="text-[10px] text-[#8E9BB0] font-semibold block uppercase">
              Pace
            </span>
            <span className="text-sm sm:text-base font-black text-[#B7F34A] font-mono">
              {isValid ? `${paceFormatted}` : "--:--"}
            </span>
            <span className="text-[9px] text-[#8E9BB0] block">min/km</span>
          </div>

          <div className="text-center border-x border-[#1E2942]">
            <span className="text-[10px] text-[#8E9BB0] font-semibold block uppercase">
              Velocidade
            </span>
            <span className="text-sm sm:text-base font-black text-[#FFFFFF] font-mono">
              {isValid ? `${speedFormatted}` : "--"}
            </span>
            <span className="text-[9px] text-[#8E9BB0] block">km/h</span>
          </div>

          <div className="text-center">
            <span className="text-[10px] text-[#8E9BB0] font-semibold block uppercase">
              Volta 400m
            </span>
            <span className="text-sm sm:text-base font-black text-[#B7F34A] font-mono">
              {isValid ? `${lap400mFormatted}` : "--:--"}
            </span>
            <span className="text-[9px] text-[#8E9BB0] block">pista</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-[#8E9BB0] text-[11px]">
          Precisa de parciais km a km, estimativas ou simulação de esteira?
        </span>
        <Link
          href="/calculadora"
          className="inline-flex items-center gap-1 text-[#B7F34A] hover:text-[#a3db3f] font-bold transition-colors"
        >
          <span>Abrir Calculadora Completa</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
