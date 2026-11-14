"use client";

import React from "react";
import {
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  ActivityType,
  BatchDuplicatePolicy,
  BatchImportTarget,
  LOCATION_LABELS,
  LocationType,
} from "@/types";
import { LOCATION_TYPES_ORDER } from "@/lib/activityParser/batchPayloads";
import {
  Footprints,
  MapPin,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

interface BatchImportDefaultsBarProps {
  target: BatchImportTarget;
  duplicatePolicy: BatchDuplicatePolicy;
  onDuplicatePolicyChange: (policy: BatchDuplicatePolicy) => void;
  bodyWeightKg: string;
  onBodyWeightKgChange: (value: string) => void;
  activityTypeDefault: ActivityType | "auto";
  onActivityTypeDefaultChange: (value: ActivityType | "auto") => void;
  locationTypeDefault: LocationType | "auto";
  onLocationTypeDefaultChange: (value: LocationType | "auto") => void;
  defaultShoeName: string;
  onDefaultShoeNameChange: (value: string) => void;
  onApplyShoeToAll?: () => void;
  defaultPerceivedEffort: number | null;
  onDefaultPerceivedEffortChange: (value: number | null) => void;
  alsoSaveToDiary: boolean;
  onAlsoSaveToDiaryChange: (checked: boolean) => void;
  disabled?: boolean;
  hasItems?: boolean;
}

/**
 * Painel de configuração rápida aplicada em massa a todos os itens da fila,
 * contextualizado para a seleção única global (`Treino` vs `Simulado TAF`).
 */
export function BatchImportDefaultsBar({
  target,
  duplicatePolicy,
  onDuplicatePolicyChange,
  bodyWeightKg,
  onBodyWeightKgChange,
  activityTypeDefault,
  onActivityTypeDefaultChange,
  locationTypeDefault,
  onLocationTypeDefaultChange,
  defaultShoeName,
  onDefaultShoeNameChange,
  onApplyShoeToAll,
  defaultPerceivedEffort,
  onDefaultPerceivedEffortChange,
  alsoSaveToDiary,
  onAlsoSaveToDiaryChange,
  disabled = false,
  hasItems = false,
}: BatchImportDefaultsBarProps) {
  return (
    <div
      data-testid="batch-defaults-bar"
      className="bg-[#0B1020] border border-[#1E2942] rounded-2xl p-3.5 sm:p-4 space-y-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1E2942]">
        <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#B7F34A]" />
          Configuração Rápida do Lote (Aplicar a Todos)
        </h4>
        <span className="text-[11px] text-[#8E9BB0]">
          Alterações aqui preenchem os itens da fila automaticamente
        </span>
      </div>

      {target === "training" ? (
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Tipo de Treino do Lote */}
            <div>
              <label
                htmlFor="batch-default-activity-type"
                className="block text-xs font-bold text-[#8E9BB0] mb-1.5"
              >
                Tipo de Treino do Lote
              </label>
              <select
                id="batch-default-activity-type"
                data-testid="batch-default-activity-select"
                disabled={disabled}
                value={activityTypeDefault}
                onChange={(e) =>
                  onActivityTypeDefaultChange(
                    e.target.value as ActivityType | "auto"
                  )
                }
                className="w-full h-10 px-3 text-xs font-bold rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
              >
                <option value="auto">
                  Automático por arquivo (sugestão .FIT/.GPX)
                </option>
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    Aplicar a todos: {ACTIVITY_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>

            {/* Peso Corporal (kg) */}
            <div>
              <label
                htmlFor="batch-default-weight"
                className="text-xs font-bold text-[#8E9BB0] mb-1.5 flex items-center gap-1"
              >
                <Scale className="w-3.5 h-3.5 text-[#B7F34A]" />
                Peso Corporal (kg) — Calorias MET
              </label>
              <input
                id="batch-default-weight"
                data-testid="batch-default-weight-input"
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={bodyWeightKg}
                onChange={(e) => onBodyWeightKgChange(e.target.value)}
                placeholder="Ex: 75.5"
                className="w-full h-10 px-3 text-xs rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
              />
            </div>

            {/* Tênis Padrão */}
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <label
                  htmlFor="batch-default-shoe"
                  className="text-xs font-bold text-[#8E9BB0] flex items-center gap-1"
                >
                  <Footprints className="w-3.5 h-3.5 text-[#B7F34A]" />
                  Tênis Padrão (Opcional)
                </label>
                {hasItems && onApplyShoeToAll && defaultShoeName.trim() !== "" && (
                  <button
                    type="button"
                    disabled={disabled}
                    data-testid="batch-apply-shoe-all-btn"
                    onClick={onApplyShoeToAll}
                    className="text-[10px] font-bold text-[#B7F34A] hover:underline disabled:opacity-50"
                  >
                    Sobrescrever todos
                  </button>
                )}
              </div>
              <input
                id="batch-default-shoe"
                data-testid="batch-default-shoe-input"
                type="text"
                disabled={disabled}
                value={defaultShoeName}
                onChange={(e) => onDefaultShoeNameChange(e.target.value)}
                placeholder="Ex: Nike Pegasus 40"
                className="w-full h-10 px-3 text-xs rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
              />
            </div>
          </div>

          {/* Esforço Percebido (RPE 1 a 10) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-[#8E9BB0]">
                RPE Padrão do Lote — Esforço 1 a 10 (Opcional)
              </span>
              {defaultPerceivedEffort !== null && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDefaultPerceivedEffortChange(null)}
                  className="text-[11px] text-[#8E9BB0] hover:text-white underline disabled:opacity-50"
                >
                  Limpar RPE do lote
                </button>
              )}
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
                const isSelected = defaultPerceivedEffort === val;
                return (
                  <button
                    key={val}
                    type="button"
                    disabled={disabled}
                    data-testid={`batch-default-rpe-btn-${val}`}
                    onClick={() =>
                      onDefaultPerceivedEffortChange(
                        isSelected ? null : val
                      )
                    }
                    className={`h-8 rounded-xl text-xs font-black transition-all disabled:opacity-60 ${
                      isSelected
                        ? "bg-[#B7F34A] text-[#0B1020] ring-2 ring-[#B7F34A]"
                        : "bg-[#131A2E] border border-[#1E2942] text-[#8E9BB0] hover:text-white"
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Local do Teste do Lote */}
            <div>
              <label
                htmlFor="batch-default-location"
                className="text-xs font-bold text-[#8E9BB0] mb-1.5 flex items-center gap-1"
              >
                <MapPin className="w-3.5 h-3.5 text-[#B7F34A]" />
                Local do Teste do Lote
              </label>
              <select
                id="batch-default-location"
                data-testid="batch-default-location-select"
                disabled={disabled}
                value={locationTypeDefault}
                onChange={(e) =>
                  onLocationTypeDefaultChange(
                    e.target.value as LocationType | "auto"
                  )
                }
                className="w-full h-10 px-3 text-xs font-bold rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
              >
                <option value="auto">
                  Automático (Esteira se indoor, senão Pista 400m)
                </option>
                {LOCATION_TYPES_ORDER.map((loc) => (
                  <option key={loc} value={loc}>
                    Aplicar a todos: {LOCATION_LABELS[loc]}
                  </option>
                ))}
              </select>
            </div>

            {/* Tênis Padrão */}
            <div>
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <label
                  htmlFor="batch-default-shoe-taf"
                  className="text-xs font-bold text-[#8E9BB0] flex items-center gap-1"
                >
                  <Footprints className="w-3.5 h-3.5 text-[#B7F34A]" />
                  Tênis Padrão (Opcional)
                </label>
                {hasItems && onApplyShoeToAll && defaultShoeName.trim() !== "" && (
                  <button
                    type="button"
                    disabled={disabled}
                    data-testid="batch-apply-shoe-all-btn"
                    onClick={onApplyShoeToAll}
                    className="text-[10px] font-bold text-[#B7F34A] hover:underline disabled:opacity-50"
                  >
                    Sobrescrever todos
                  </button>
                )}
              </div>
              <input
                id="batch-default-shoe-taf"
                data-testid="batch-default-shoe-input"
                type="text"
                disabled={disabled}
                value={defaultShoeName}
                onChange={(e) => onDefaultShoeNameChange(e.target.value)}
                placeholder="Ex: Nike Vaporfly 3"
                className="w-full h-10 px-3 text-xs rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
              />
            </div>
          </div>

          {/* Checkbox único global: Também registrar no Diário */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#131A2E] border border-[#1E2942] cursor-pointer hover:border-[#B7F34A]/50 transition-colors">
            <input
              type="checkbox"
              data-testid="batch-also-save-diary-checkbox"
              disabled={disabled}
              checked={alsoSaveToDiary}
              onChange={(e) => onAlsoSaveToDiaryChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#1E2942] bg-[#0B1020] text-[#B7F34A] focus:ring-[#B7F34A]"
            />
            <span className="text-xs text-[#E2E8F0] leading-relaxed">
              <span className="font-bold text-white block">
                Também registrar todos no Diário de Treinos (Log_Treinos)
              </span>
              <span className="text-[11px] text-[#8E9BB0]">
                Gera espelho seguro em Log_Treinos para cada simulado salvo (sem duplicar registros já existentes quando em modo &ldquo;Pular duplicados&rdquo;).
              </span>
            </span>
          </label>
        </div>
      )}

      {/* Política Global para Duplicados */}
      <div className="pt-2 border-t border-[#1E2942] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label
          htmlFor="batch-duplicate-policy"
          className="text-xs font-bold text-[#8E9BB0] flex items-center gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[#B7F34A]" />
          {target === "training"
            ? "Se algum arquivo já foi importado no Diário:"
            : "Se algum arquivo já foi importado como Simulado TAF:"}
        </label>
        <select
          id="batch-duplicate-policy"
          data-testid="batch-duplicate-policy-select"
          disabled={disabled}
          value={duplicatePolicy}
          onChange={(e) =>
            onDuplicatePolicyChange(e.target.value as BatchDuplicatePolicy)
          }
          className="h-9 px-3 text-xs font-bold rounded-xl border border-[#1E2942] bg-[#131A2E] text-white focus:outline-none focus:border-[#B7F34A] disabled:opacity-60"
        >
          <option value="skip">Pular duplicados (padrão seguro)</option>
          <option value="update">Atualizar existentes (onDuplicate)</option>
        </select>
      </div>
    </div>
  );
}
