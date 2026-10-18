"use client";

import React, { useState, useEffect } from "react";
import { TrainingSession, ActivityType, SplitDetail } from "@/types";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import { formatPace } from "@/lib/formatting/time";
import { estimateTrainingCalories } from "@/lib/math/calories";
import { profileService } from "@/lib/services/profileService";
import {
  Flame,
  Zap,
  Footprints,
  Activity,
  Plus,
  AlertCircle,
  X,
  Scale,
} from "lucide-react";

interface TrainingFormProps {
  editingTraining?: TrainingSession | null;
  onSave: (training: TrainingSession) => Promise<void>;
  onCancelEdit?: () => void;
}

const ACTIVITIES: { type: ActivityType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "corrida_continua", label: "Corrida Contínua", icon: Flame },
  { type: "corrida_intervalada", label: "Intervalado / Tiros", icon: Zap },
  { type: "caminhada", label: "Caminhada", icon: Footprints },
];

const DISTANCE_SHORTCUTS_KM = [2.3, 3.0, 5.0, 8.0, 10.0, 15.0, 21.1];

const RPE_LEVELS = [
  { value: 1, label: "Muito Leve", desc: "Esforço quase nulo, respiração normal", color: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  { value: 2, label: "Fácil", desc: "Ritmo de aquecimento, conversa fácil", color: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  { value: 3, label: "Confortável", desc: "Aeróbio contínuo sem fadiga", color: "bg-teal-500 hover:bg-teal-600 text-white" },
  { value: 4, label: "Leve Moderado", desc: "Ritmo constante, esforço controlado", color: "bg-teal-500 hover:bg-teal-600 text-white" },
  { value: 5, label: "Moderado", desc: "Ritmo de treino padrão, conversa pausada", color: "bg-amber-500 hover:bg-amber-600 text-white" },
  { value: 6, label: "Moderado Alto", desc: "Ritmo de prova sustentável", color: "bg-amber-500 hover:bg-amber-600 text-white" },
  { value: 7, label: "Difícil", desc: "Limiar de lactato, exige concentração", color: "bg-orange-500 hover:bg-orange-600 text-white" },
  { value: 8, label: "Muito Difícil", desc: "Tiros e intervalados de alta intensidade", color: "bg-orange-500 hover:bg-orange-600 text-white" },
  { value: 9, label: "Exaustivo", desc: "Últimos metros do TAF, queimação muscular", color: "bg-red-500 hover:bg-red-600 text-white" },
  { value: 10, label: "Máximo Absoluto", desc: "Exaustão total, impossível continuar", color: "bg-red-600 hover:bg-red-700 text-white" },
];

export function TrainingForm({ editingTraining, onSave, onCancelEdit }: TrainingFormProps) {
  // Estados do formulário
  const [sessionDate, setSessionDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  });
  const [activityType, setActivityType] = useState<ActivityType>("corrida_continua");
  const [distanceInput, setDistanceInput] = useState<string>("5.0");
  const [hoursInput, setHoursInput] = useState<string>("0");
  const [minutesInput, setMinutesInput] = useState<string>("27");
  const [secondsInput, setSecondsInput] = useState<string>("30");

  // RPE (1 a 10) e Peso (kg)
  const [perceivedEffort, setPerceivedEffort] = useState<number | null>(6);
  const [bodyWeightKg, setBodyWeightKg] = useState<string>("");

  // Observações e Parciais
  const [notes, setNotes] = useState("");
  const [enableSplits, setEnableSplits] = useState(false);
  const [splits, setSplits] = useState<SplitDetail[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Carrega dados se estiver editando
  useEffect(() => {
    if (editingTraining) {
      const d = new Date(editingTraining.sessionDate);
      const offset = d.getTimezoneOffset() * 60000;
      setSessionDate(new Date(d.getTime() - offset).toISOString().slice(0, 16));

      setActivityType(editingTraining.activityType);
      setDistanceInput(String(editingTraining.distanceKm));

      const totalSec = editingTraining.durationSeconds;
      setHoursInput(String(Math.floor(totalSec / 3600)));
      setMinutesInput(String(Math.floor((totalSec % 3600) / 60)));
      setSecondsInput(String(totalSec % 60));

      setPerceivedEffort(
        editingTraining.perceivedEffort !== undefined && editingTraining.perceivedEffort !== null
          ? editingTraining.perceivedEffort
          : null
      );

      setBodyWeightKg(
        editingTraining.bodyWeightKg !== undefined && editingTraining.bodyWeightKg !== null
          ? String(editingTraining.bodyWeightKg)
          : ""
      );

      setNotes(editingTraining.notes || "");

      if (editingTraining.splits && editingTraining.splits.length > 0) {
        setEnableSplits(true);
        setSplits(editingTraining.splits);
      } else {
        setEnableSplits(false);
        setSplits([]);
      }
    } else {
      // Padrão novo treino: pré-carrega peso vigente do perfil se houver
      setActivityType("corrida_continua");
      setDistanceInput("5.0");
      setHoursInput("0");
      setMinutesInput("27");
      setSecondsInput("30");
      setPerceivedEffort(6);
      setNotes("");
      setEnableSplits(false);
      setSplits([]);
      profileService
        .getProfile()
        .then((prof) => {
          if (prof?.currentWeightKg) {
            setBodyWeightKg(String(prof.currentWeightKg));
          } else {
            setBodyWeightKg("");
          }
        })
        .catch(() => {
          setBodyWeightKg("");
        });
    }
  }, [editingTraining]);

  // Conversão segura de inputs para cálculo em tempo real
  const parsedDistanceKm = (() => {
    const s = distanceInput.trim().replace(",", ".");
    if (!s) return 0;
    const n = parseFloat(s);
    return isNaN(n) || n < 0 ? 0 : n;
  })();

  const parsedHours = (() => {
    const s = hoursInput.trim();
    if (!s) return 0;
    const n = parseInt(s, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  })();

  const parsedMinutes = (() => {
    const s = minutesInput.trim();
    if (!s) return 0;
    const n = parseInt(s, 10);
    return isNaN(n) || n < 0 ? 0 : Math.min(59, n);
  })();

  const parsedSeconds = (() => {
    const s = secondsInput.trim();
    if (!s) return 0;
    const n = parseInt(s, 10);
    return isNaN(n) || n < 0 ? 0 : Math.min(59, n);
  })();

  const totalDurationSeconds = parsedHours * 3600 + parsedMinutes * 60 + parsedSeconds;
  let livePaceFormatted = "--:--";
  let liveSpeedKmh = 0;
  let livePaceSeconds = 0;

  if (parsedDistanceKm > 0 && totalDurationSeconds > 0) {
    try {
      const res = calcPaceFromDistanceAndTime(parsedDistanceKm, totalDurationSeconds);
      livePaceFormatted = res.paceFormatted;
      liveSpeedKmh = res.speedKmh;
      livePaceSeconds = res.paceSeconds;
    } catch {
      // Ignora erro momentâneo de digitação
    }
  }

  // Estimativa em tempo real de calorias (Compêndio 2024)
  const calorieEstimate = React.useMemo(() => {
    const sanitized = bodyWeightKg.trim().replace(",", ".");
    const weight = parseFloat(sanitized);
    if (isNaN(weight) || weight <= 0 || parsedDistanceKm <= 0 || totalDurationSeconds <= 0) {
      return null;
    }
    try {
      return estimateTrainingCalories({
        activityType,
        speedKmh: liveSpeedKmh,
        distanceKm: parsedDistanceKm,
        durationSeconds: totalDurationSeconds,
        weightKg: weight,
      });
    } catch {
      return null;
    }
  }, [activityType, liveSpeedKmh, parsedDistanceKm, totalDurationSeconds, bodyWeightKg]);

  // Gera parciais por quilômetro igualmente
  const autoGenerateSplits = () => {
    const fullKmCount = Math.floor(parsedDistanceKm);
    if (fullKmCount <= 0) return;

    const avgSecondsPerKm = Math.round(totalDurationSeconds / parsedDistanceKm);
    const newSplits: SplitDetail[] = [];

    for (let i = 1; i <= fullKmCount; i++) {
      newSplits.push({
        kilometer: i,
        durationSeconds: avgSecondsPerKm,
        paceFormatted: formatPace(avgSecondsPerKm),
      });
    }

    setSplits(newSplits);
  };

  const handleSplitDurationChange = (index: number, newSec: number) => {
    setSplits((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              durationSeconds: Math.max(1, newSec),
              paceFormatted: formatPace(Math.max(1, newSec)),
            }
          : s
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const sanitizedDist = distanceInput.trim().replace(",", ".");
    const finalDistanceKm = parseFloat(sanitizedDist);

    if (isNaN(finalDistanceKm) || finalDistanceKm <= 0) {
      setErrorMessage("Informe uma distância válida maior que 0 km.");
      return;
    }
    if (totalDurationSeconds <= 0) {
      setErrorMessage("Informe um tempo de treino válido.");
      return;
    }

    // Trata peso corporal: se vazio -> null; se preenchido -> número
    let parsedWeight: number | null = null;
    if (bodyWeightKg.trim() !== "") {
      const numWeight = parseFloat(bodyWeightKg.replace(",", "."));
      if (isNaN(numWeight) || numWeight < 20 || numWeight > 300) {
        setErrorMessage("Informe um peso corporal válido entre 20 kg e 300 kg (ou deixe o campo em branco).");
        return;
      }
      parsedWeight = Number(numWeight.toFixed(1));
    }

    setIsSubmitting(true);

    try {
      const sessionToSave: TrainingSession = {
        id: editingTraining ? editingTraining.id : `trn_${Date.now()}`,
        sessionDate: new Date(sessionDate).toISOString(),
        activityType,
        distanceKm: Number(finalDistanceKm.toFixed(3)),
        durationSeconds: totalDurationSeconds,
        speedKmh: Number(liveSpeedKmh.toFixed(2)),
        paceSeconds: Math.round(livePaceSeconds),
        paceFormatted: livePaceFormatted,
        perceivedEffort: perceivedEffort,
        bodyWeightKg: parsedWeight,
        notes: notes.trim() || null,
        splits: enableSplits && splits.length > 0 ? splits : [],
        activeCalories: calorieEstimate ? calorieEstimate.activeCalories : null,
        totalCalories: calorieEstimate ? calorieEstimate.totalCalories : null,
        metValue: calorieEstimate ? calorieEstimate.metValue : null,
        calorieMethod: calorieEstimate ? calorieEstimate.method : null,
        calorieSource: calorieEstimate ? "auto_calculated" : null,
        calorieMetadata: calorieEstimate
          ? {
              compendiumCode: calorieEstimate.compendiumCode,
              activityDescription: calorieEstimate.compendiumDescription,
              version: calorieEstimate.version,
            }
          : null,
        createdAt: editingTraining ? editingTraining.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSave(sessionToSave);

      if (onCancelEdit) {
        onCancelEdit();
      } else {
        // Reset campos mantendo valores convenientes
        setNotes("");
        setEnableSplits(false);
        setSplits([]);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Erro ao registrar treino no diário."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="training-form"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-7 shadow-sm transition-all"
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#1E2942]">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-[#B7F34A]" />
            {editingTraining ? "Editar Sessão de Treino" : "Registrar Novo Treino"}
          </h3>
          <p className="text-xs text-[#8E9BB0] mt-0.5">
            Cadastre suas corridas, tiros, caminhadas e acompanhe a sua evolução diária.
          </p>
        </div>

        {editingTraining && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-xs font-semibold text-[#8E9BB0] hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1E2942] hover:bg-[#1E2942] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancelar Edição
          </button>
        )}
      </div>

      {errorMessage && (
        <div
          data-testid="form-error-message"
          className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-medium text-rose-400 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Seletor Visual de Tipo de Atividade */}
      <div className="mb-5">
        <label className="block text-xs font-bold text-[#8E9BB0] mb-2">
          Tipo de Atividade
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {ACTIVITIES.map((act) => {
            const Icon = act.icon;
            const isSelected = activityType === act.type;
            return (
              <button
                type="button"
                key={act.type}
                onClick={() => setActivityType(act.type)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-[#B7F34A] text-[#0B1020] border-[#B7F34A] shadow-md shadow-[#B7F34A]/20 scale-[1.02] font-black"
                    : "bg-[#0B1020] border-[#1E2942] text-[#8E9BB0] hover:text-white hover:border-[#8E9BB0]/40"
                }`}
              >
                <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? "text-[#0B1020]" : "text-[#B7F34A]"}`} />
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid de Data e Duração */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        {/* Data e Hora */}
        <div>
          <label className="block text-xs font-bold text-[#8E9BB0] mb-1.5">
            Data e Horário
          </label>
          <input
            type="datetime-local"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            required
            className="w-full h-11 px-3 text-sm rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] [color-scheme:dark]"
          />
        </div>

        {/* Duração (Horas, Minutos e Segundos) */}
        <div className="sm:col-span-1 lg:col-span-2">
          <label className="block text-xs font-bold text-[#8E9BB0] mb-1.5">
            Tempo Total de Treino
          </label>
          <div className="flex items-center gap-2">
            {/* Horas */}
            <div className="flex-1 relative">
              <input
                type="text"
                inputMode="numeric"
                value={hoursInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setHoursInput(val);
                }}
                className="w-full h-11 px-3 pr-7 text-sm font-semibold rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
              />
              <span className="absolute right-2 top-3 text-xs text-[#8E9BB0] font-medium pointer-events-none">
                h
              </span>
            </div>
            <span className="text-[#8E9BB0] font-bold">:</span>
            {/* Minutos */}
            <div className="flex-1 relative">
              <input
                type="text"
                inputMode="numeric"
                value={minutesInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val === "" || parseInt(val, 10) <= 59) {
                    setMinutesInput(val);
                  }
                }}
                className="w-full h-11 px-3 pr-8 text-sm font-semibold rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
              />
              <span className="absolute right-2 top-3 text-xs text-[#8E9BB0] font-medium pointer-events-none">
                min
              </span>
            </div>
            <span className="text-[#8E9BB0] font-bold">:</span>
            {/* Segundos */}
            <div className="flex-1 relative">
              <input
                type="text"
                inputMode="numeric"
                value={secondsInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val === "" || parseInt(val, 10) <= 59) {
                    setSecondsInput(val);
                  }
                }}
                className="w-full h-11 px-3 pr-8 text-sm font-semibold rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
              />
              <span className="absolute right-2 top-3 text-xs text-[#8E9BB0] font-medium pointer-events-none">
                seg
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Distância em km com atalhos rápidos */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="training-distance-km" className="text-xs font-bold text-[#8E9BB0]">
            Distância Percorrida (Quilômetros)
          </label>
          <span className="text-xs text-[#8E9BB0] font-medium">
            = {Math.round(parsedDistanceKm * 1000)} metros
          </span>
        </div>

        <div className="relative mb-3">
          <input
            id="training-distance-km"
            type="text"
            inputMode="decimal"
            value={distanceInput}
            onChange={(e) => {
              const val = e.target.value;
              if (/^(\d*[.,]?\d*)$/.test(val)) {
                setDistanceInput(val);
              }
            }}
            required
            className="w-full h-12 px-4 text-lg font-black tracking-tight rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
          />
          <span className="absolute right-4 top-3 text-sm font-bold text-[#8E9BB0]">
            km
          </span>
        </div>

        {/* Atalhos rápidos de km */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-[#8E9BB0] mr-1">
            Distâncias comuns:
          </span>
          {DISTANCE_SHORTCUTS_KM.map((shortcut) => {
            const isSelected = Math.abs(parsedDistanceKm - shortcut) < 0.01;
            return (
              <button
                type="button"
                key={shortcut}
                onClick={() => setDistanceInput(String(shortcut))}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  isSelected
                    ? "bg-[#B7F34A] text-[#0B1020] font-black shadow-sm shadow-[#B7F34A]/20 scale-105"
                    : "bg-[#0B1020] border border-[#1E2942] text-[#8E9BB0] hover:text-white hover:border-[#8E9BB0]/40"
                }`}
              >
                {shortcut} km
                {shortcut === 2.3 && " (TAF)"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Escala de Esforço Subjetivo RPE (1 a 10) */}
      <div className="mb-5 border border-[#1E2942] rounded-2xl p-4 bg-[#0B1020]/60">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-white flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#B7F34A]" />
            Escala de Esforço RPE (1 = Muito Leve a 10 = Exaustão Total)
          </label>
          {perceivedEffort !== null && (
            <button
              type="button"
              onClick={() => setPerceivedEffort(null)}
              className="text-[11px] text-[#8E9BB0] hover:text-white underline"
            >
              Desmarcar RPE
            </button>
          )}
        </div>

        <p className="text-[11px] text-[#8E9BB0] mb-3">
          Selecione a percepção de intensidade da sessão para monitorar a carga de fadiga:
        </p>

        {/* Botões de 1 a 10 */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 mb-2">
          {RPE_LEVELS.map((level) => {
            const isSelected = perceivedEffort === level.value;
            return (
              <button
                type="button"
                key={level.value}
                onClick={() => setPerceivedEffort(level.value)}
                title={`${level.label}: ${level.desc}`}
                className={`h-11 rounded-xl font-black text-sm flex flex-col items-center justify-center transition-all ${
                  isSelected
                    ? `${level.color} ring-2 ring-[#B7F34A] ring-offset-2 ring-offset-[#0B1020] scale-105 shadow-md`
                    : "bg-[#131A2E] border border-[#1E2942] text-[#8E9BB0] hover:text-white hover:bg-[#1E2942]"
                }`}
              >
                <span>{level.value}</span>
              </button>
            );
          })}
        </div>

        {/* Legenda do RPE Selecionado */}
        {perceivedEffort !== null && (
          <div className="text-xs font-semibold text-[#8E9BB0] mt-2 flex items-center gap-1.5 bg-[#131A2E] p-2.5 rounded-xl border border-[#1E2942]">
            <span className="font-bold text-[#B7F34A]">
              RPE {perceivedEffort}:
            </span>
            <span className="text-white">
              {RPE_LEVELS.find((l) => l.value === perceivedEffort)?.label} —{" "}
              {RPE_LEVELS.find((l) => l.value === perceivedEffort)?.desc}
            </span>
          </div>
        )}
      </div>

      {/* Peso Corporal e Prévia de Ritmo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {/* Peso Corporal Opcional */}
        <div>
          <label className="block text-xs font-bold text-[#8E9BB0] mb-1.5 flex items-center gap-1">
            <Scale className="w-3.5 h-3.5 text-[#8E9BB0]" />
            Peso Corporal no Dia (kg) — Opcional
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 74.5 (deixe em branco se não pesou)"
              value={bodyWeightKg}
              onChange={(e) => setBodyWeightKg(e.target.value)}
              className="w-full h-11 px-3 pr-10 text-sm rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
            />
            <span className="absolute right-3 top-3 text-xs text-[#8E9BB0] font-semibold pointer-events-none">
              kg
            </span>
          </div>
          <span className="text-[11px] text-[#8E9BB0] mt-1 block">
            Diferencia peso não informado de zero.
          </span>
        </div>

        {/* Painel Resumo em Tempo Real */}
        <div className="bg-[#0B1020] border border-[#1E2942] rounded-2xl p-3 flex items-center justify-around text-center">
          <div>
            <span className="text-[11px] text-[#8E9BB0] block">Pace Médio</span>
            <span className="text-base font-black text-[#B7F34A]">
              {livePaceFormatted} <span className="text-xs font-normal">/km</span>
            </span>
          </div>
          <div className="h-8 w-px bg-[#1E2942]" />
          <div>
            <span className="text-[11px] text-[#8E9BB0] block">Velocidade</span>
            <span className="text-base font-black text-white">
              {liveSpeedKmh.toFixed(2)} <span className="text-xs font-normal">km/h</span>
            </span>
          </div>
        </div>
      </div>

      {/* Estimativa de Calorias em Tempo Real (Compêndio 2024) */}
      {calorieEstimate ? (
        <div
          data-testid="live-calories-card"
          className="mb-5 bg-[#0B1020] border border-[#B7F34A]/30 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 transition-all"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#B7F34A] flex items-center justify-center text-[#0B1020] shadow-sm shrink-0">
              <Flame className="w-5 h-5 fill-[#0B1020]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  Gasto Calórico Estimado
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#B7F34A]/10 text-[#B7F34A] border border-[#B7F34A]/20">
                  MET {calorieEstimate.metValue.toFixed(1)}
                </span>
              </div>
              <p className="text-[11px] text-[#8E9BB0]">
                {calorieEstimate.compendiumDescription} • Compêndio 2024
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-[#8E9BB0] font-bold block">
                Ativas (Exercício)
              </span>
              <span
                data-testid="live-active-calories"
                className="text-lg font-black text-[#B7F34A]"
              >
                {calorieEstimate.activeCalories}{" "}
                <span className="text-xs font-normal">kcal</span>
              </span>
            </div>
            <div className="h-7 w-px bg-[#1E2942]" />
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-[#8E9BB0] font-bold block">
                Totais
              </span>
              <span
                data-testid="live-total-calories"
                className="text-sm font-bold text-white"
              >
                {calorieEstimate.totalCalories}{" "}
                <span className="text-xs font-normal">kcal</span>
              </span>
            </div>
          </div>
        </div>
      ) : (
        parsedDistanceKm > 0 &&
        totalDurationSeconds > 0 && (
          <div
            data-testid="calories-weight-hint"
            className="mb-5 bg-[#0B1020] border border-dashed border-[#1E2942] rounded-2xl p-3 flex items-center justify-between text-xs text-[#8E9BB0]"
          >
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#8E9BB0] shrink-0" />
              <span>
                Preencha seu peso corporal no campo acima para calcular o gasto calórico com base científica (MET).
              </span>
            </div>
          </div>
        )
      )}

      {/* Subform Opcional de Parciais de Km */}
      <div className="mb-5 border border-[#1E2942] rounded-2xl p-4 bg-[#0B1020]/60">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enableSplits}
              onChange={(e) => {
                setEnableSplits(e.target.checked);
                if (e.target.checked && splits.length === 0) {
                  autoGenerateSplits();
                }
              }}
              className="w-4 h-4 accent-[#B7F34A] rounded"
            />
            <span className="text-xs font-bold text-white">
              Registrar parciais por quilômetro (splits de km)
            </span>
          </label>

          {enableSplits && (
            <button
              type="button"
              onClick={autoGenerateSplits}
              className="text-xs font-semibold text-[#B7F34A] hover:underline"
            >
              Distribuir igualmente
            </button>
          )}
        </div>

        {enableSplits && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-[#8E9BB0]">
              Tempo em segundos para cada km fechado:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {splits.map((s, idx) => (
                <div
                  key={s.kilometer}
                  className="bg-[#131A2E] border border-[#1E2942] p-2.5 rounded-xl text-xs"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">
                      Km {s.kilometer}
                    </span>
                    <span className="text-[10px] text-[#8E9BB0] font-mono">
                      {s.paceFormatted}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="1200"
                      value={s.durationSeconds}
                      onChange={(e) =>
                        handleSplitDurationChange(idx, Number(e.target.value))
                      }
                      className="w-full h-8 px-2 text-xs font-bold rounded-lg border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A]"
                    />
                    <span className="text-[10px] text-[#8E9BB0]">seg</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Observações Livres */}
      <div className="mb-5">
        <label className="block text-xs font-bold text-[#8E9BB0] mb-1.5">
          Observações do Treino (Opcional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: Treino progressivo na Beira-Mar, hidratação no km 4, tênis de amortecimento, pernas leves."
          className="w-full p-3 text-xs rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] resize-none"
        />
      </div>

      {/* Botão de Envio */}
      <button
        type="submit"
        disabled={isSubmitting}
        data-testid="submit-training-btn"
        className="w-full h-12 bg-[#B7F34A] hover:bg-[#a6e03f] text-[#0B1020] font-black text-sm rounded-xl shadow-lg shadow-[#B7F34A]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
        {isSubmitting
          ? "Salvando Treino..."
          : editingTraining
          ? "Salvar Alterações do Treino"
          : "Registrar Treino no Diário"}
      </button>
    </form>
  );
}
