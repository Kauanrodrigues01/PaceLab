"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { TafGoalConfig, TafAttempt, TrainingSession } from "@/types";
import type { SheetsSyncReport, SheetsSyncStatus } from "@/lib/googleSheets/types";
import { tafService } from "@/lib/services/tafService";
import {
  clearCrossPageSheetsCaches,
  formatSheetsSyncReportSummary,
  getSheetsSyncErrorMessage,
} from "@/lib/sheetsSyncUi";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import { formatTime } from "@/lib/formatting/time";
import {
  getDaysDifferenceFortaleza,
  getTodayFortalezaDateKey,
  toFortalezaCalendarDateKey,
  toFortalezaNoonIso,
} from "@/lib/formatting/date";
import {
  Target,
  Database,
  Download,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  FileJson,
  ShieldAlert,
  Save,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";

interface GoalAndBackupSettingsProps {
  goal: TafGoalConfig;
  attempts: TafAttempt[];
  trainings: TrainingSession[];
  onGoalSaved: (updatedGoal: TafGoalConfig) => void;
  onDataRefreshed: () => void;
  onSheetsSynced?: (report: SheetsSyncReport) => void | Promise<void>;
  showToast: (message: string, type?: "success" | "error") => void;
}

export function GoalAndBackupSettings({
  goal,
  attempts,
  trainings,
  onGoalSaved,
  onDataRefreshed,
  onSheetsSynced,
  showToast,
}: GoalAndBackupSettingsProps) {
  // Estado da Meta
  const [distanceMeters, setDistanceMeters] = useState(goal.targetDistanceMeters || 2300);
  const [durationMinutes, setDurationMinutes] = useState(goal.targetDurationMinutes || 12);
  const [examDate, setExamDate] = useState(
    () => toFortalezaCalendarDateKey(goal.targetExamDate) || ""
  );
  const [isSavingGoal, setIsSavingGoal] = useState(false);

  // Sincroniza campos locais quando a meta externa é atualizada (ex.: sync com Sheets ou restore)
  useEffect(() => {
    setDistanceMeters(goal.targetDistanceMeters || 2300);
    setDurationMinutes(goal.targetDurationMinutes || 12);
    setExamDate(toFortalezaCalendarDateKey(goal.targetExamDate) || "");
  }, [goal.targetDistanceMeters, goal.targetDurationMinutes, goal.targetExamDate]);

  // Status do Banco
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    orm: string;
    database?: string;
    latencyMs?: number;
  }>({ connected: false, orm: "Prisma" });
  const [isCheckingDb, setIsCheckingDb] = useState(false);

  // Importação de arquivo
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Sincronização Google Sheets
  const [sheetsStatus, setSheetsStatus] = useState<SheetsSyncStatus | null>(null);
  const [isLoadingSheetsStatus, setIsLoadingSheetsStatus] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [confirmFullBackfill, setConfirmFullBackfill] = useState(false);

  const recordsSyncFingerprint = `${attempts
    .map((a) => `${a.id}:${a.updatedAt ?? ""}:${a.syncedToSheetsAt ?? ""}`)
    .join("|")}::${trainings
    .map((t) => `${t.id}:${t.updatedAt ?? ""}:${t.syncedToSheetsAt ?? ""}`)
    .join("|")}`;

  const loadSheetsStatus = useCallback(async () => {
    setIsLoadingSheetsStatus(true);
    try {
      const status = await tafService.getSheetsSyncStatus();
      setSheetsStatus(status);
    } catch {
      setSheetsStatus(null);
    } finally {
      setIsLoadingSheetsStatus(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSheetsStatus(true);
    tafService
      .getSheetsSyncStatus()
      .then((status) => {
        if (!cancelled) {
          setSheetsStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSheetsStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSheetsStatus(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recordsSyncFingerprint]);

  const runSheetsSync = async (options: {
    direction: "bidirectional" | "push";
    forceFullResync: boolean;
  }) => {
    if (isSyncingSheets) return;
    setIsSyncingSheets(true);
    setConfirmFullBackfill(false);
    try {
      const report = await tafService.syncGoogleSheets(options);
      if (onSheetsSynced) {
        await onSheetsSynced(report);
      } else {
        onDataRefreshed();
      }
      await loadSheetsStatus();
      showToast(formatSheetsSyncReportSummary(report), "success");
    } catch (err) {
      showToast(
        getSheetsSyncErrorMessage(
          err,
          "Erro ao sincronizar dados com o Google Sheets."
        ),
        "error"
      );
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Cálculo dos Ritmos Necessários para a Meta Atual
  const distanceKm = distanceMeters / 1000;
  const durationSeconds = durationMinutes * 60;
  let requiredPaceFormatted = "--:--";
  let requiredSpeedKmh = 0;
  let lap400mSeconds = 0;

  if (distanceKm > 0 && durationSeconds > 0) {
    try {
      const paceRes = calcPaceFromDistanceAndTime(distanceKm, durationSeconds);
      requiredPaceFormatted = paceRes.paceFormatted;
      requiredSpeedKmh = paceRes.speedKmh;
      lap400mSeconds = Math.round((durationSeconds * 400) / distanceMeters);
    } catch {
      // Ignora erro momentâneo de digitação
    }
  }

  // Contagem regressiva para a data da prova em Fortaleza
  const daysUntilExam = examDate ? getDaysDifferenceFortaleza(examDate) : null;

  // Salvar Meta
  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (distanceMeters <= 0 || durationMinutes <= 0) {
      showToast("Informe valores válidos para distância e tempo limite.", "error");
      return;
    }

    setIsSavingGoal(true);
    try {
      const trimmedExamDate = examDate.trim();
      const updated: TafGoalConfig = {
        targetDistanceMeters: distanceMeters,
        targetDurationMinutes: durationMinutes,
        targetExamDate: trimmedExamDate ? toFortalezaNoonIso(trimmedExamDate) : undefined,
      };

      const saved = await tafService.saveGoal(updated);
      onGoalSaved(saved);
      showToast("Meta da prova física atualizada com sucesso!");
      await loadSheetsStatus();
    } catch {
      showToast("Erro ao salvar meta da prova", "error");
    } finally {
      setIsSavingGoal(false);
    }
  };

  // Testar Conexão com o Banco
  const handleCheckDb = async () => {
    setIsCheckingDb(true);
    try {
      const res = await tafService.checkDatabaseHealth();
      setDbStatus(res);
      if (res.connected) {
        showToast("Conexão ativa com PostgreSQL via Prisma ORM!");
      } else {
        showToast("Não foi possível conectar ao banco de dados Supabase.", "error");
      }
    } catch {
      showToast("Falha ao consultar status do banco de dados.", "error");
    } finally {
      setIsCheckingDb(false);
    }
  };

  // Exportar Backup JSON
  const handleExportJson = () => {
    try {
      const jsonStr = tafService.exportBackupJson(goal, attempts, trainings);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = getTodayFortalezaDateKey();
      a.href = url;
      a.download = `pacelab-backup-${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Backup JSON exportado com sucesso!");
    } catch {
      showToast("Erro ao gerar backup JSON", "error");
    }
  };

  // Exportar Simulados CSV
  const handleExportAttemptsCsv = () => {
    try {
      const csvStr = tafService.exportAttemptsCsv(attempts);
      const blob = new Blob(["\uFEFF" + csvStr], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = getTodayFortalezaDateKey();
      a.href = url;
      a.download = `pacelab-simulados-taf-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Planilha CSV de simulados exportada!");
    } catch {
      showToast("Erro ao exportar CSV de simulados", "error");
    }
  };

  // Exportar Treinos CSV
  const handleExportTrainingsCsv = () => {
    try {
      const csvStr = tafService.exportTrainingsCsv(trainings);
      const blob = new Blob(["\uFEFF" + csvStr], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = getTodayFortalezaDateKey();
      a.href = url;
      a.download = `pacelab-treinos-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Planilha CSV de treinos exportada!");
    } catch {
      showToast("Erro ao exportar CSV de treinos", "error");
    }
  };

  // Importar Backup JSON
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      let text = "";
      if (typeof file.text === "function") {
        text = await file.text();
      } else {
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string) || "");
          reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
          reader.readAsText(file);
        });
      }

      const res = await tafService.importBackupJson(text);
      if (res.success) {
        const skippedMsg =
          res.skippedCount && res.skippedCount > 0
            ? ` (${res.skippedCount} duplicado${res.skippedCount === 1 ? "" : "s"} ignorado${res.skippedCount === 1 ? "" : "s"})`
            : "";
        showToast(
          `Backup restaurado com sucesso: ${res.attemptsCount} simulados e ${res.trainingsCount} treinos carregados!${skippedMsg}`
        );
        clearCrossPageSheetsCaches({ includeGoal: false });
        onDataRefreshed();
        await loadSheetsStatus();
      } else {
        showToast(res.error || "Arquivo de backup inválido.", "error");
      }
    } catch {
      showToast("Erro ao processar arquivo de backup.", "error");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div data-testid="goal-and-backup-settings" className="space-y-6">
      {/* ─── Seção 1: Configuração da Meta Oficial da Prova ─── */}
      <form
        onSubmit={handleSaveGoal}
        className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-7 shadow-sm"
      >
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#1E2942]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-[#B7F34A]" />
              Meta da Prova Física (TAF)
            </h3>
            <p className="text-xs text-[#8E9BB0] mt-0.5">
              Defina os parâmetros do seu concurso para que o PaceLab recalcule os ritmos de aprovação.
            </p>
          </div>
        </div>

        {/* Inputs de Distância, Tempo e Data */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {/* Distância Alvo em Metros */}
          <div>
            <label
              htmlFor="target-distance-meters"
              className="block text-xs font-bold text-[#8E9BB0] mb-1.5"
            >
              Distância Exigida no Edital (Metros)
            </label>
            <div className="relative">
              <input
                id="target-distance-meters"
                type="number"
                inputMode="numeric"
                min="500"
                max="10000"
                step="50"
                value={distanceMeters}
                onChange={(e) => setDistanceMeters(Number(e.target.value))}
                required
                className="w-full h-11 px-3 pr-10 text-sm font-black rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:border-[#B7F34A]"
              />
              <span className="absolute right-3 top-3 text-xs text-[#8E9BB0] font-semibold pointer-events-none">
                m
              </span>
            </div>
            <span className="text-[11px] text-[#8E9BB0] mt-1 block">
              Padrão Guarda Municipal: 2.300 m
            </span>
          </div>

          {/* Duração Máxima (Minutos) */}
          <div>
            <label
              htmlFor="target-duration-minutes"
              className="block text-xs font-bold text-[#8E9BB0] mb-1.5"
            >
              Tempo Limite da Prova (Minutos)
            </label>
            <div className="relative">
              <input
                id="target-duration-minutes"
                type="number"
                inputMode="numeric"
                min="1"
                max="60"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                required
                className="w-full h-11 px-3 pr-12 text-sm font-black rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:border-[#B7F34A]"
              />
              <span className="absolute right-3 top-3 text-xs text-[#8E9BB0] font-semibold pointer-events-none">
                min
              </span>
            </div>
            <span className="text-[11px] text-[#8E9BB0] mt-1 block">
              Padrão oficial TAF: 12 minutos
            </span>
          </div>

          {/* Data Prevista da Prova */}
          <div>
            <label
              htmlFor="target-exam-date"
              className="block text-xs font-bold text-[#8E9BB0] mb-1.5"
            >
              Data Prevista do Exame (Opcional)
            </label>
            <input
              id="target-exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full h-11 px-3 text-sm rounded-xl border border-[#1E2942] bg-[#0B1020] text-white focus:border-[#B7F34A]"
            />
            {daysUntilExam !== null && (
              <span className="text-[11px] font-bold text-[#B7F34A] mt-1 block">
                {daysUntilExam > 0
                  ? `Faltam ${daysUntilExam} dias para o exame!`
                  : daysUntilExam === 0
                  ? "O exame é hoje! Boa prova!"
                  : "Data anterior à data de hoje."}
              </span>
            )}
          </div>
        </div>

        {/* Painel de Cálculo em Tempo Real do Ritmo de Aprovação */}
        <div className="bg-[#0B1020] border border-[#1E2942] rounded-2xl p-4 mb-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#B7F34A] mb-2 block">
            ⚡ Ritmo Obrigatório para Aprovação no TAF
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="bg-[#131A2E] p-3 rounded-xl border border-[#1E2942]">
              <span className="text-[11px] text-[#8E9BB0] block mb-0.5">Pace Máximo Permitido</span>
              <div className="text-lg font-black text-[#B7F34A]">
                ≤ {requiredPaceFormatted} <span className="text-xs font-normal text-[#8E9BB0]">/km</span>
              </div>
            </div>

            <div className="bg-[#131A2E] p-3 rounded-xl border border-[#1E2942]">
              <span className="text-[11px] text-[#8E9BB0] block mb-0.5">Velocidade Mínima Exigida</span>
              <div className="text-lg font-black text-white">
                ≥ {requiredSpeedKmh.toFixed(2)} <span className="text-xs font-normal text-[#8E9BB0]">km/h</span>
              </div>
            </div>

            <div className="bg-[#131A2E] p-3 rounded-xl border border-[#1E2942]">
              <span className="text-[11px] text-[#8E9BB0] block mb-0.5">Tempo por Volta (Pista 400m)</span>
              <div className="text-lg font-black text-[#B7F34A]">
                ≤ {formatTime(lap400mSeconds)} <span className="text-xs font-normal text-[#8E9BB0]">por volta</span>
              </div>
            </div>
          </div>
        </div>

        {/* Aviso Ético Obrigatório */}
        <div className="mb-5 bg-amber-950/40 border border-amber-900/60 p-3.5 rounded-2xl flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200 leading-relaxed font-medium">
            <strong>Termo de Referência & Parâmetro de Treinamento:</strong> O PaceLab
            fornece métricas matemáticas objetivas de auxílio à preparação física. A meta
            estipulada não garante aprovação automática em concursos e não substitui a consulta
            com médico cardiologista e a orientação presencial de profissional habilitado de
            Educação Física.
          </p>
        </div>

        {/* Botão de Salvar Meta */}
        <button
          type="submit"
          disabled={isSavingGoal}
          className="w-full sm:w-auto px-6 h-11 bg-[#B7F34A] hover:bg-[#a3e232] text-[#0B1020] font-black text-xs rounded-xl shadow-md shadow-[#B7F34A]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSavingGoal ? "Salvando Meta..." : "Salvar Configuração da Meta"}
        </button>
      </form>

      {/* ─── Seção 2: Central de Banco de Dados (Prisma ORM & PostgreSQL) ─── */}
      <div className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#1E2942]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[#B7F34A]" />
              Central de Banco de Dados Relacional (Prisma ORM)
            </h3>
            <p className="text-xs text-[#8E9BB0] mt-0.5">
              Persistência relacional direta com PostgreSQL gerenciado no Supabase via Prisma ORM.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCheckDb}
            disabled={isCheckingDb}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-[#1E2942] hover:bg-[#1E2942] bg-[#0B1020] text-white flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDb ? "animate-spin" : ""}`} />
            Testar Conexão
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Status do Banco */}
          <div className="p-4 rounded-2xl bg-[#0B1020]/60 border border-[#1E2942] flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                dbStatus.connected
                  ? "bg-[#B7F34A]/10 text-[#B7F34A]"
                  : "bg-rose-950 text-rose-400"
              }`}
            >
              <Database className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                Status da Conexão
              </span>
              <p className="text-xs text-[#8E9BB0] mt-0.5">
                {dbStatus.connected
                  ? `Conectado ao PostgreSQL do Supabase via Prisma ORM${
                      dbStatus.latencyMs !== undefined ? ` (${dbStatus.latencyMs}ms de latência)` : ""
                    }.`
                  : "Desconectado. Verifique sua conexão com a internet ou o status do banco."}
              </p>
            </div>
          </div>

          {/* Nuvem e Segurança */}
          <div className="p-4 rounded-2xl bg-[#0B1020]/60 border border-[#1E2942] flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1E2942] text-[#B7F34A] flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                Persistência Exclusiva na Nuvem
              </span>
              <p className="text-xs text-[#8E9BB0] mt-0.5">
                Todos os seus simulados, parciais e treinos são gravados de forma segura diretamente nas tabelas PostgreSQL do Supabase.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Seção 2.5: Sincronização Google Sheets (Treinos_Corrida) ─── */}
      <div
        data-testid="sheets-sync-settings-card"
        className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-7 shadow-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 mb-5 border-b border-[#1E2942]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Sincronização Google Sheets (Treinos_Corrida)
            </h3>
            <p className="text-xs text-[#8E9BB0] mt-0.5">
              Integração bidirecional com as abas Log_Treinos, Simulados_TAF, Perfil_e_Metas e Plano_Semanal.
            </p>
          </div>

          <span
            data-testid="sheets-config-status"
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border self-start sm:self-auto ${
              sheetsStatus?.configured
                ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/30"
                : "bg-amber-950/40 text-amber-300 border-amber-500/30"
            }`}
          >
            {sheetsStatus?.configured ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            )}
            {isLoadingSheetsStatus && sheetsStatus === null
              ? "Verificando..."
              : sheetsStatus?.configured
              ? "Configurada"
              : "Não configurada"}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#0B1020]/60 border border-[#1E2942] mb-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Clock className="w-4 h-4 text-[#B7F34A]" />
            <span>Status de Pendências de Envio</span>
          </div>
          {sheetsStatus ? (
            <p
              data-testid="sheets-pending-summary"
              className="text-xs text-[#8E9BB0]"
            >
              Pendências aguardando envio:{" "}
              <strong className="text-white">
                {sheetsStatus.totalPendingCount}
              </strong>{" "}
              ({sheetsStatus.pendingTrainingsCount} treino(s) no Diário,{" "}
              {sheetsStatus.pendingAttemptsCount} simulado(s) TAF).
            </p>
          ) : (
            <p
              data-testid="sheets-pending-summary"
              className="text-xs text-[#8E9BB0]"
            >
              Consulte ou inicie a sincronização manual com a planilha Google Sheets.
            </p>
          )}
          {sheetsStatus?.error && (
            <p className="text-[11px] text-amber-300">{sheetsStatus.error}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="settings-sync-sheets-btn"
            onClick={() =>
              runSheetsSync({
                direction: "bidirectional",
                forceFullResync: false,
              })
            }
            disabled={isSyncingSheets}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-[#0B1020] font-black text-xs rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncingSheets ? "animate-spin" : ""}`}
            />
            {isSyncingSheets
              ? "Sincronizando Planilha..."
              : "Sincronizar Agora (Bidirecional)"}
          </button>

          <button
            type="button"
            data-testid="settings-backfill-sheets-btn"
            onClick={() => setConfirmFullBackfill(true)}
            disabled={isSyncingSheets}
            className="px-4 py-2.5 bg-[#0B1020] hover:bg-[#1E2942] border border-[#1E2942] text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            Reenviar Histórico Completo (Full Backfill)
          </button>
        </div>

        {confirmFullBackfill && (
          <div
            data-testid="confirm-full-backfill-panel"
            className="mt-4 p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-3"
          >
            <p className="text-xs text-amber-100 leading-relaxed">
              <strong>Confirmar Full Backfill:</strong> esta ação reenviará todo o histórico de treinos, simulados TAF e perfil do banco para a planilha <code className="font-mono">Treinos_Corrida</code>, atualizando linhas existentes por ID sem apagar seus registros no banco.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="confirm-full-backfill-btn"
                onClick={() =>
                  runSheetsSync({
                    direction: "push",
                    forceFullResync: true,
                  })
                }
                disabled={isSyncingSheets}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-[#0B1020] font-black text-xs rounded-xl transition-colors disabled:opacity-50"
              >
                Confirmar Reenvio Completo
              </button>
              <button
                type="button"
                data-testid="cancel-full-backfill-btn"
                onClick={() => setConfirmFullBackfill(false)}
                disabled={isSyncingSheets}
                className="px-3.5 py-2 bg-[#0B1020] hover:bg-[#1E2942] border border-[#1E2942] text-[#8E9BB0] hover:text-white font-bold text-xs rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Seção 3: Backup & Exportação de Dados ─── */}
      <div className="bg-[#131A2E] border border-[#1E2942] rounded-3xl p-5 sm:p-7 shadow-sm">
        <div className="pb-4 mb-5 border-b border-[#1E2942]">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-[#B7F34A]" />
            Backup & Exportação Completa de Dados
          </h3>
          <p className="text-xs text-[#8E9BB0] mt-0.5">
            Exporte seus dados a qualquer momento em formatos abertos e universais (JSON e CSV).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {/* Exportar JSON */}
          <button
            type="button"
            onClick={handleExportJson}
            className="p-4 rounded-2xl border border-[#1E2942] hover:border-[#B7F34A] bg-[#0B1020] hover:bg-[#1E2942]/40 transition-all text-left flex flex-col justify-between"
          >
            <div>
              <FileJson className="w-6 h-6 text-[#B7F34A] mb-2" />
              <span className="text-xs font-bold text-white block">
                Backup Completo (JSON)
              </span>
              <p className="text-[11px] text-[#8E9BB0] mt-0.5">
                Arquivo único com meta, simulados e treinos para restauração.
              </p>
            </div>
            <span className="mt-3 text-xs font-bold text-[#B7F34A] flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Baixar .json
            </span>
          </button>

          {/* Exportar CSV Simulados */}
          <button
            type="button"
            onClick={handleExportAttemptsCsv}
            className="p-4 rounded-2xl border border-[#1E2942] hover:border-[#B7F34A] bg-[#0B1020] hover:bg-[#1E2942]/40 transition-all text-left flex flex-col justify-between"
          >
            <div>
              <FileSpreadsheet className="w-6 h-6 text-[#B7F34A] mb-2" />
              <span className="text-xs font-bold text-white block">
                Simulados TAF (CSV)
              </span>
              <p className="text-[11px] text-[#8E9BB0] mt-0.5">
                Planilha com datas, distâncias, parciais e recordes de 12 min.
              </p>
            </div>
            <span className="mt-3 text-xs font-bold text-[#B7F34A] flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Baixar .csv
            </span>
          </button>

          {/* Exportar CSV Treinos */}
          <button
            type="button"
            onClick={handleExportTrainingsCsv}
            className="p-4 rounded-2xl border border-[#1E2942] hover:border-[#B7F34A] bg-[#0B1020] hover:bg-[#1E2942]/40 transition-all text-left flex flex-col justify-between"
          >
            <div>
              <FileSpreadsheet className="w-6 h-6 text-amber-400 mb-2" />
              <span className="text-xs font-bold text-white block">
                Diário de Treinos (CSV)
              </span>
              <p className="text-[11px] text-[#8E9BB0] mt-0.5">
                Planilha com modalidades, RPE, peso e parciais por quilômetro.
              </p>
            </div>
            <span className="mt-3 text-xs font-bold text-amber-400 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Baixar .csv
            </span>
          </button>
        </div>

        {/* Área de Importação / Restauração de Backup JSON */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0B1020]/60 border border-dashed border-[#1E2942] text-center">
          <Upload className="w-7 h-7 text-[#8E9BB0] mx-auto mb-2" />
          <h4 className="font-bold text-xs text-white mb-1">
            Restaurar Backup do PaceLab (Arquivo .json)
          </h4>
          <p className="text-[11px] text-[#8E9BB0] max-w-md mx-auto mb-3">
            Selecione um arquivo de backup previamente exportado para recuperar todas as suas
            tentativas de simulado e diário de treinos.
          </p>

          <input
            ref={fileInputRef}
            data-testid="backup-file-input"
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="px-4 py-2 bg-[#1E2942] hover:bg-[#253252] border border-[#1E2942] text-white font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {isImporting ? "Restaurando Backup..." : "Selecionar Arquivo de Backup (.json)"}
          </button>
        </div>
      </div>
    </div>
  );
}
