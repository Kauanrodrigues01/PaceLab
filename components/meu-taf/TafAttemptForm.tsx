"use client";

import React, { useState, useEffect } from "react";
import { TafAttempt, LapDetail, LocationType, LOCATION_LABELS } from "@/types";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import { formatPace, formatTime } from "@/lib/formatting/time";
import {
  Trophy,
  AlertCircle,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

interface TafAttemptFormProps {
  targetDistanceMeters?: number;
  minDistanceMeters?: number;
  targetDurationMinutes?: number;
  institutionName?: string | null;
  previousBestAttempt?: TafAttempt | null;
  lastAttemptSameDuration?: TafAttempt | null;
  editingAttempt?: TafAttempt | null;
  onSave: (attempt: TafAttempt) => Promise<void>;
  onCancelEdit?: () => void;
}

const DISTANCE_SHORTCUTS = [
  2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, 2900, 3000,
];

const LOCATION_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "pista_400m", label: LOCATION_LABELS.pista_400m },
  { value: "rua_plana", label: LOCATION_LABELS.rua_plana },
  { value: "parque_praca", label: LOCATION_LABELS.parque_praca },
  { value: "esteira", label: LOCATION_LABELS.esteira },
  { value: "outro", label: LOCATION_LABELS.outro },
];

export function TafAttemptForm({
  targetDistanceMeters = 2300,
  minDistanceMeters = 2400,
  targetDurationMinutes = 12,
  institutionName = "Edital Padrão",
  previousBestAttempt,
  lastAttemptSameDuration,
  editingAttempt,
  onSave,
  onCancelEdit,
}: TafAttemptFormProps) {
  // Form State
  const [testDate, setTestDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  });
  const [minutesInput, setMinutesInput] = useState<string>(String(targetDurationMinutes));
  const [secondsInput, setSecondsInput] = useState<string>("0");
  const [distanceMetersInput, setDistanceMetersInput] = useState<string>(String(targetDistanceMeters));
  const [locationType, setLocationType] = useState<LocationType>("pista_400m");
  const [notes, setNotes] = useState("");

  // Subform de Voltas / Parciais de 400m
  const [enableLaps, setEnableLaps] = useState(false);
  const [laps, setLaps] = useState<LapDetail[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preenche formulário caso entre em modo de edição
  useEffect(() => {
    if (editingAttempt) {
      const d = new Date(editingAttempt.testDate);
      const offset = d.getTimezoneOffset() * 60000;
      setTestDate(new Date(d.getTime() - offset).toISOString().slice(0, 16));

      const totalSec = editingAttempt.actualDurationSeconds;
      setMinutesInput(String(Math.floor(totalSec / 60)));
      setSecondsInput(String(totalSec % 60));
      setDistanceMetersInput(String(editingAttempt.distanceMeters));
      setLocationType(editingAttempt.locationType || "pista_400m");
      setNotes(editingAttempt.notes || "");

      if (editingAttempt.laps && editingAttempt.laps.length > 0) {
        setEnableLaps(true);
        setLaps(editingAttempt.laps);
      } else {
        setEnableLaps(false);
        setLaps([]);
      }
    } else {
      // Reset para padrão
      setMinutesInput("12");
      setSecondsInput("0");
      setDistanceMetersInput("2300");
      setLocationType("pista_400m");
      setNotes("");
      setEnableLaps(false);
      setLaps([]);
    }
  }, [editingAttempt]);

  // Conversão segura de inputs para cálculo em tempo real
  const parsedMinutes = (() => {
    const s = minutesInput.trim();
    if (!s) return 0;
    const n = parseInt(s, 10);
    return isNaN(n) || n < 0 ? 0 : Math.min(60, n);
  })();

  const parsedSeconds = (() => {
    const s = secondsInput.trim();
    if (!s) return 0;
    const n = parseInt(s, 10);
    return isNaN(n) || n < 0 ? 0 : Math.min(59, n);
  })();

  const parsedDistanceMeters = (() => {
    const s = distanceMetersInput.trim();
    if (!s) return 0;
    const n = parseInt(s, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  })();

  // Cálculos em tempo real
  const totalDurationSeconds = parsedMinutes * 60 + parsedSeconds;
  const distanceKm = parsedDistanceMeters / 1000;

  let livePaceFormatted = "--:--";
  let liveSpeedKmh = 0;
  let livePaceSeconds = 0;

  if (parsedDistanceMeters > 0 && totalDurationSeconds > 0) {
    try {
      const res = calcPaceFromDistanceAndTime(distanceKm, totalDurationSeconds);
      livePaceFormatted = res.paceFormatted;
      liveSpeedKmh = res.speedKmh;
      livePaceSeconds = res.paceSeconds;
    } catch {
      // Ignora erro momentâneo de digitação
    }
  }

  const deficitMeters = targetDistanceMeters - parsedDistanceMeters;
  const isApproved = parsedDistanceMeters >= targetDistanceMeters;

  // Delta em relação ao teste imediatamente anterior de mesma duração
  const liveDeltaPrevious =
    lastAttemptSameDuration && !editingAttempt
      ? parsedDistanceMeters - lastAttemptSameDuration.distanceMeters
      : null;

  // Será novo recorde pessoal?
  const willBeNewRecord =
    parsedDistanceMeters > 0 &&
    totalDurationSeconds === 720 &&
    (!previousBestAttempt || parsedDistanceMeters > previousBestAttempt.distanceMeters);

  // Gerenciamento de Parciais de 400m
  const autoGenerateLaps = () => {
    const fullLapsCount = Math.floor(parsedDistanceMeters / 400);
    const remainderMeters = parsedDistanceMeters % 400;
    const totalLapsCount = remainderMeters > 0 ? fullLapsCount + 1 : fullLapsCount;

    const estimatedTimePerLap =
      totalLapsCount > 0 ? Math.round(totalDurationSeconds / totalLapsCount) : 120;

    const newLaps: LapDetail[] = [];
    for (let i = 1; i <= fullLapsCount; i++) {
      newLaps.push({
        lapNumber: i,
        durationSeconds: estimatedTimePerLap,
        distanceMeters: 400,
        paceFormatted: formatPace((estimatedTimePerLap * 1000) / 400),
      });
    }

    if (remainderMeters > 0) {
      const lastLapTime = Math.max(1, totalDurationSeconds - estimatedTimePerLap * fullLapsCount);
      newLaps.push({
        lapNumber: fullLapsCount + 1,
        durationSeconds: lastLapTime,
        distanceMeters: remainderMeters,
        paceFormatted: formatPace((lastLapTime * 1000) / remainderMeters),
      });
    }

    setLaps(newLaps);
  };

  const handleLapDurationChange = (index: number, newSec: number) => {
    setLaps((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              durationSeconds: Math.max(0, newSec),
              paceFormatted: formatPace((Math.max(1, newSec) * 1000) / l.distanceMeters),
            }
          : l
      )
    );
  };

  // Validação da soma das voltas vs tempo total
  const sumLapSeconds = laps.reduce((acc, curr) => acc + curr.durationSeconds, 0);
  const lapSumDifference = sumLapSeconds - totalDurationSeconds;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const finalDistanceMeters = parseInt(distanceMetersInput.trim(), 10);
    if (isNaN(finalDistanceMeters) || finalDistanceMeters <= 0) {
      setErrorMessage("Informe uma distância válida maior que 0 metros.");
      return;
    }
    if (totalDurationSeconds <= 0) {
      setErrorMessage("Informe uma duração de teste válida.");
      return;
    }

    setIsSubmitting(true);

    try {
      const attemptToSave: TafAttempt = {
        id: editingAttempt ? editingAttempt.id : `taf_${Date.now()}`,
        testDate: new Date(testDate).toISOString(),
        targetDurationSeconds: totalDurationSeconds === 720 ? 720 : totalDurationSeconds,
        actualDurationSeconds: totalDurationSeconds,
        distanceMeters: finalDistanceMeters,
        speedKmh: Number(liveSpeedKmh.toFixed(2)),
        paceSeconds: Math.round(livePaceSeconds),
        paceFormatted: livePaceFormatted,
        locationType,
        notes: notes.trim() || null,
        laps: enableLaps && laps.length > 0 ? laps : [],
        createdAt: editingAttempt ? editingAttempt.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSave(attemptToSave);

      if (onCancelEdit) {
        onCancelEdit();
      } else {
        // Reset campos livres mantendo data atual
        setNotes("");
        setEnableLaps(false);
        setLaps([]);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Erro ao registrar tentativa de TAF"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="taf-attempt-form"
      className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-7 shadow-sm transition-all"
    >
      {/* Cabeçalho do formulário */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#1E2942]">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#B7F34A]" />
            {editingAttempt ? "Editar Teste do TAF" : "Registrar Novo Teste de 12 Min"}
          </h3>
          <p className="text-xs text-[#8E9BB0] mt-0.5">
            {institutionName ? `${institutionName} • ` : ""}
            <span className="font-semibold text-emerald-400">
              Mínimo: {minDistanceMeters}m
            </span>{" "}
            •{" "}
            <span className="font-semibold text-[#B7F34A]">
              Meta: {targetDistanceMeters}m
            </span>{" "}
            em {targetDurationMinutes} minutos.
          </p>
        </div>

        {editingAttempt && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-xs font-semibold text-[#8E9BB0] hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1E2942] bg-[#0B1020] hover:bg-[#1E2942] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancelar Edição
          </button>
        )}
      </div>

      {errorMessage && (
        <div
          data-testid="form-error-message"
          className="mb-4 p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-xs font-medium text-rose-200 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid de Inputs Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        {/* Data e Hora */}
        <div>
          <label className="block text-xs font-bold text-[#8E9BB0] mb-1.5">
            Data e Horário do Teste
          </label>
          <input
            type="datetime-local"
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            required
            className="w-full h-11 px-3 text-sm rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] focus:ring-1 focus:ring-[#B7F34A]"
          />
        </div>

        {/* Duração Real */}
        <div>
          <label className="block text-xs font-bold text-[#8E9BB0] mb-1.5">
            Duração Real (Minutos e Segundos)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                inputMode="numeric"
                value={minutesInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setMinutesInput(val);
                }}
                className="w-full h-11 px-3 pr-8 text-sm font-semibold rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] focus:ring-1 focus:ring-[#B7F34A]"
              />
              <span className="absolute right-2.5 top-3 text-xs text-[#8E9BB0] font-medium pointer-events-none">
                min
              </span>
            </div>
            <span className="text-[#8E9BB0] font-bold">:</span>
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
                className="w-full h-11 px-3 pr-8 text-sm font-semibold rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] focus:ring-1 focus:ring-[#B7F34A]"
              />
              <span className="absolute right-2.5 top-3 text-xs text-[#8E9BB0] font-medium pointer-events-none">
                seg
              </span>
            </div>
          </div>
        </div>

        {/* Local / Percurso */}
        <div>
          <label className="block text-xs font-bold text-[#8E9BB0] mb-1.5">
            Local do Simulado
          </label>
          <div className="relative">
            <select
              value={locationType}
              onChange={(e) => setLocationType(e.target.value as LocationType)}
              className="w-full h-11 px-3 pr-8 text-sm rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] focus:ring-1 focus:ring-[#B7F34A]"
            >
              {LOCATION_OPTIONS.map((loc) => (
                <option key={loc.value} value={loc.value}>
                  {loc.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Campo de Distância em Metros com Atalhos de 100 em 100m */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="taf-distance-meters" className="text-xs font-bold text-[#8E9BB0]">
            Distância Total Percorrida (Metros)
          </label>
          <span className="text-xs text-[#8E9BB0]">
            = {(parsedDistanceMeters / 1000).toFixed(2)} km
          </span>
        </div>

        <div className="relative mb-3">
          <input
            id="taf-distance-meters"
            type="text"
            inputMode="numeric"
            value={distanceMetersInput}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setDistanceMetersInput(val);
            }}
            required
            className="w-full h-12 px-4 text-lg font-black tracking-tight rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] focus:ring-1 focus:ring-[#B7F34A]"
          />
          <span className="absolute right-4 top-3 text-sm font-bold text-[#8E9BB0]">
            metros
          </span>
        </div>

        {/* Atalhos rápidos de 100 em 100m */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-[#8E9BB0] mr-1">
            Atalhos rápidos:
          </span>
          {DISTANCE_SHORTCUTS.map((shortcut) => {
            const isSelected = parsedDistanceMeters === shortcut;
            const isTarget = shortcut === targetDistanceMeters;
            const isMin = shortcut === minDistanceMeters;
            return (
              <button
                type="button"
                key={shortcut}
                onClick={() => setDistanceMetersInput(String(shortcut))}
                className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  isSelected
                    ? "bg-[#B7F34A] text-[#0B1020] font-bold shadow-sm shadow-[#B7F34A]/30 scale-105"
                    : isTarget
                    ? "bg-[#B7F34A]/10 text-[#B7F34A] border border-[#B7F34A]/40 hover:bg-[#B7F34A]/20"
                    : isMin
                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-950/60"
                    : "bg-[#0B1020] border border-[#1E2942] text-[#8E9BB0] hover:text-white hover:border-[#8E9BB0]"
                }`}
              >
                {shortcut.toLocaleString("pt-BR")} m
                {isMin && " 🟢"}
                {isTarget && " 🎯"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel de Feedback em Tempo Real (Antes de Salvar) */}
      <div className="bg-[#0B1020] border border-[#1E2942] rounded-2xl p-4 mb-5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#B7F34A] mb-2 block">
          ⚡ Prévia do Desempenho Calculado
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-[#131A2E] p-2.5 rounded-xl border border-[#1E2942]">
            <span className="text-[11px] text-[#8E9BB0]">Pace Médio</span>
            <div className="text-base font-black text-[#B7F34A]">
              {livePaceFormatted} <span className="text-xs font-normal text-[#8E9BB0]">/km</span>
            </div>
          </div>

          <div className="bg-[#131A2E] p-2.5 rounded-xl border border-[#1E2942]">
            <span className="text-[11px] text-[#8E9BB0]">Velocidade</span>
            <div className="text-base font-black text-white">
              {liveSpeedKmh.toFixed(2)} <span className="text-xs font-normal text-[#8E9BB0]">km/h</span>
            </div>
          </div>

          <div className="bg-[#131A2E] p-2.5 rounded-xl border border-[#1E2942]">
            <span className="text-[11px] text-[#8E9BB0]">Meta ({targetDistanceMeters}m)</span>
            <div
              className={`text-base font-black ${
                isApproved
                  ? "text-[#B7F34A]"
                  : "text-amber-400"
              }`}
            >
              {isApproved ? `+${Math.abs(deficitMeters)}m` : `-${deficitMeters}m`}
            </div>
          </div>

          <div className="bg-[#131A2E] p-2.5 rounded-xl border border-[#1E2942]">
            <span className="text-[11px] text-[#8E9BB0]">vs Teste Anterior</span>
            <div className="text-base font-black text-white">
              {liveDeltaPrevious !== null ? (
                liveDeltaPrevious > 0 ? (
                  <span className="text-[#B7F34A]">
                    +{liveDeltaPrevious}m
                  </span>
                ) : liveDeltaPrevious < 0 ? (
                  <span className="text-rose-400">
                    {liveDeltaPrevious}m
                  </span>
                ) : (
                  <span>= 0m</span>
                )
              ) : (
                <span className="text-xs font-normal text-[#8E9BB0]">--</span>
              )}
            </div>
          </div>
        </div>

        {/* Badge Informativo de Recorde Pessoal */}
        {willBeNewRecord && (
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-500/30">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              🏆 Este teste será o seu novo <strong>Recorde Pessoal</strong> de 12 minutos!
            </span>
          </div>
        )}
      </div>

      {/* Subform Opcional de Parciais de 400m */}
      <div className="mb-5 border border-[#1E2942] rounded-2xl p-4 bg-[#0B1020]/40">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enableLaps}
              onChange={(e) => {
                setEnableLaps(e.target.checked);
                if (e.target.checked && laps.length === 0) {
                  autoGenerateLaps();
                }
              }}
              className="w-4 h-4 text-[#B7F34A] rounded focus:ring-[#B7F34A] bg-[#0B1020] border-[#1E2942]"
            />
            <span className="text-xs font-bold text-white">
              Registrar parciais de voltas (pista de 400m)
            </span>
          </label>

          {enableLaps && (
            <button
              type="button"
              onClick={autoGenerateLaps}
              className="text-xs font-semibold text-[#B7F34A] hover:underline"
            >
              Distribuir tempo igualmente
            </button>
          )}
        </div>

        {enableLaps && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-[#8E9BB0]">
              Ajuste o tempo em segundos para cada volta de 400m:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {laps.map((lap, idx) => (
                <div
                  key={lap.lapNumber}
                  className="bg-[#131A2E] border border-[#1E2942] p-2.5 rounded-xl text-xs"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">
                      Volta {lap.lapNumber} ({lap.distanceMeters}m)
                    </span>
                    <span className="text-[10px] text-[#8E9BB0] font-mono">
                      {lap.paceFormatted}/km
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="600"
                      value={lap.durationSeconds}
                      onChange={(e) =>
                        handleLapDurationChange(idx, Number(e.target.value))
                      }
                      className="w-full h-8 px-2 text-xs font-bold rounded-lg border border-[#1E2942] bg-[#0B1020] text-white"
                    />
                    <span className="text-[10px] text-[#8E9BB0]">seg</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Aviso de discrepância entre soma das voltas e tempo total */}
            {Math.abs(lapSumDifference) > 2 && (
              <p className="text-[11px] text-amber-400 mt-2 font-medium">
                ⚠️ A soma das parciais ({formatTime(sumLapSeconds)}) difere do tempo total do
                teste ({formatTime(totalDurationSeconds)}) em {Math.abs(lapSumDifference)}s.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Notas do Teste */}
      <div className="mb-5">
        <label className="block text-xs font-bold text-[#8E9BB0] mb-1.5">
          Anotações / Observações (Opcional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: Pista da UNIFOR, tênis de corrida, vento moderado, sensação de esforço nos últimos 2 minutos."
          className="w-full p-3 text-xs rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:outline-none focus:border-[#B7F34A] focus:ring-1 focus:ring-[#B7F34A] resize-none"
        />
      </div>

      {/* Botão de Envio */}
      <button
        type="submit"
        disabled={isSubmitting}
        data-testid="submit-attempt-btn"
        className="w-full h-12 bg-[#B7F34A] hover:bg-[#a3e232] text-[#0B1020] font-black text-sm rounded-xl shadow-md shadow-[#B7F34A]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
        {isSubmitting
          ? "Salvando Teste..."
          : editingAttempt
          ? "Salvar Alterações do Teste"
          : "Registrar Teste no Histórico"}
      </button>
    </form>
  );
}
