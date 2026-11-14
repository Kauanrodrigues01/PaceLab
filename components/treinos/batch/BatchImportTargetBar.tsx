"use client";

import React from "react";
import { BatchImportTarget } from "@/types";
import { Layers } from "lucide-react";

interface BatchImportTargetBarProps {
  target: BatchImportTarget;
  onChange: (target: BatchImportTarget) => void;
  disabled?: boolean;
}

/**
 * Seleção única global para todo o lote: define se todos os arquivos
 * serão importados como Treinos do Diário ou como Simulados TAF (Cooper 12 min).
 */
export function BatchImportTargetBar({
  target,
  onChange,
  disabled = false,
}: BatchImportTargetBarProps) {
  return (
    <div
      data-testid="batch-target-selector"
      role="radiogroup"
      aria-label="Destino único para todos os arquivos do lote"
      className="bg-[#0B1020] border border-[#1E2942] rounded-2xl p-3.5 sm:p-4 space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-[#B7F34A]" />
          Destino Único do Lote:
        </span>
        <span className="text-[11px] text-[#8E9BB0]">
          Esta escolha vale para todos os arquivos da fila abaixo
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          role="radio"
          aria-checked={target === "training"}
          data-testid="batch-target-training"
          disabled={disabled}
          onClick={() => onChange("training")}
          className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 disabled:opacity-60 ${
            target === "training"
              ? "bg-[#B7F34A]/10 border-[#B7F34A] text-white"
              : "bg-[#131A2E] border-[#1E2942] text-[#8E9BB0] hover:border-[#8E9BB0]/40"
          }`}
        >
          <span
            className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
              target === "training" ? "border-[#B7F34A]" : "border-[#8E9BB0]"
            }`}
          >
            {target === "training" && (
              <span className="w-2 h-2 rounded-full bg-[#B7F34A]" />
            )}
          </span>
          <div>
            <span className="text-xs sm:text-sm font-bold block text-white">
              Todos como Treinos do Diário
            </span>
            <span className="text-[11px] text-[#8E9BB0]">
              Salva todas as sessões com rodagem, parciais por km e gasto calórico.
            </span>
          </div>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={target === "taf_attempt"}
          data-testid="batch-target-taf"
          disabled={disabled}
          onClick={() => onChange("taf_attempt")}
          className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 disabled:opacity-60 ${
            target === "taf_attempt"
              ? "bg-[#B7F34A]/10 border-[#B7F34A] text-white"
              : "bg-[#131A2E] border-[#1E2942] text-[#8E9BB0] hover:border-[#8E9BB0]/40"
          }`}
        >
          <span
            className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
              target === "taf_attempt"
                ? "border-[#B7F34A]"
                : "border-[#8E9BB0]"
            }`}
          >
            {target === "taf_attempt" && (
              <span className="w-2 h-2 rounded-full bg-[#B7F34A]" />
            )}
          </span>
          <div>
            <span className="text-xs sm:text-sm font-bold block text-white">
              Todos como Simulados TAF (Cooper 12 min)
            </span>
            <span className="text-[11px] text-[#8E9BB0]">
              Extrai a melhor janela contínua de 12 minutos e voltas de 400m de cada arquivo.
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
