"use client";

import React, { useState, useRef } from "react";
import { TafGoalConfig, TafAttempt, TrainingSession } from "@/types";
import { tafService } from "@/lib/services/tafService";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import { formatTime } from "@/lib/formatting/time";
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
} from "lucide-react";

interface GoalAndBackupSettingsProps {
  goal: TafGoalConfig;
  attempts: TafAttempt[];
  trainings: TrainingSession[];
  onGoalSaved: (updatedGoal: TafGoalConfig) => void;
  onDataRefreshed: () => void;
  showToast: (message: string, type?: "success" | "error") => void;
}

export function GoalAndBackupSettings({
  goal,
  attempts,
  trainings,
  onGoalSaved,
  onDataRefreshed,
  showToast,
}: GoalAndBackupSettingsProps) {
  // Estado da Meta
  const [distanceMeters, setDistanceMeters] = useState(goal.targetDistanceMeters || 2300);
  const [durationMinutes, setDurationMinutes] = useState(goal.targetDurationMinutes || 12);
  const [examDate, setExamDate] = useState(goal.targetExamDate || "");
  const [isSavingGoal, setIsSavingGoal] = useState(false);

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

  // Contagem regressiva para a data da prova
  let daysUntilExam: number | null = null;
  if (examDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = examDate.split("-").map(Number);
    const exam = new Date(y, m - 1, d);
    const diff = exam.getTime() - today.getTime();
    daysUntilExam = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // Salvar Meta
  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (distanceMeters <= 0 || durationMinutes <= 0) {
      showToast("Informe valores válidos para distância e tempo limite.", "error");
      return;
    }

    setIsSavingGoal(true);
    try {
      const updated: TafGoalConfig = {
        targetDistanceMeters: distanceMeters,
        targetDurationMinutes: durationMinutes,
        targetExamDate: examDate.trim() || undefined,
      };

      const saved = await tafService.saveGoal(updated);
      onGoalSaved(saved);
      showToast("Meta da prova física atualizada com sucesso!");
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
      const dateStr = new Date().toISOString().slice(0, 10);
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
      const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
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
      const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
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
        showToast(
          `Backup restaurado com sucesso: ${res.attemptsCount} simulados e ${res.trainingsCount} treinos carregados!`
        );
        onDataRefreshed();
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
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-sm"
      >
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Meta da Prova Física (TAF)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
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
                className="w-full h-11 px-3 pr-10 text-sm font-black rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <span className="absolute right-3 top-3 text-xs text-slate-400 font-semibold pointer-events-none">
                m
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Padrão Guarda Municipal: 2.300 m
            </span>
          </div>

          {/* Duração Máxima (Minutos) */}
          <div>
            <label
              htmlFor="target-duration-minutes"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
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
                className="w-full h-11 px-3 pr-12 text-sm font-black rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <span className="absolute right-3 top-3 text-xs text-slate-400 font-semibold pointer-events-none">
                min
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Padrão oficial TAF: 12 minutos
            </span>
          </div>

          {/* Data Prevista da Prova */}
          <div>
            <label
              htmlFor="target-exam-date"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Data Prevista do Exame (Opcional)
            </label>
            <input
              id="target-exam-date"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full h-11 px-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            {daysUntilExam !== null && (
              <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-1 block">
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
        <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-slate-800/80 dark:to-slate-800/40 border border-blue-100 dark:border-slate-700 rounded-2xl p-4 mb-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-2 block">
            ⚡ Ritmo Obrigatório para Aprovação no TAF
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-xl border border-blue-100/50 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 block mb-0.5">Pace Máximo Permitido</span>
              <div className="text-lg font-black text-blue-600 dark:text-blue-400">
                ≤ {requiredPaceFormatted} <span className="text-xs font-normal">/km</span>
              </div>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-xl border border-blue-100/50 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 block mb-0.5">Velocidade Mínima Exigida</span>
              <div className="text-lg font-black text-slate-800 dark:text-slate-200">
                ≥ {requiredSpeedKmh.toFixed(2)} <span className="text-xs font-normal">km/h</span>
              </div>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/60 p-3 rounded-xl border border-blue-100/50 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 block mb-0.5">Tempo por Volta (Pista 400m)</span>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                ≤ {formatTime(lap400mSeconds)} <span className="text-xs font-normal">por volta</span>
              </div>
            </div>
          </div>
        </div>

        {/* Aviso Ético Obrigatório */}
        <div className="mb-5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-3.5 rounded-2xl flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed font-medium">
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
          className="w-full sm:w-auto px-6 h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSavingGoal ? "Salvando Meta..." : "Salvar Configuração da Meta"}
        </button>
      </form>

      {/* ─── Seção 2: Central de Banco de Dados (Prisma ORM & PostgreSQL) ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Central de Banco de Dados Relacional (Prisma ORM)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Persistência relacional direta com PostgreSQL gerenciado no Supabase via Prisma ORM.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCheckDb}
            disabled={isCheckingDb}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingDb ? "animate-spin" : ""}`} />
            Testar Conexão
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Status do Banco */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                dbStatus.connected
                  ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400"
              }`}
            >
              <Database className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                Status da Conexão
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                {dbStatus.connected
                  ? `Conectado ao PostgreSQL do Supabase via Prisma ORM${
                      dbStatus.latencyMs !== undefined ? ` (${dbStatus.latencyMs}ms de latência)` : ""
                    }.`
                  : "Desconectado. Verifique sua conexão com a internet ou o status do banco."}
              </p>
            </div>
          </div>

          {/* Nuvem e Segurança */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                Persistência Exclusiva na Nuvem
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Todos os seus simulados, parciais e treinos são gravados de forma segura diretamente nas tabelas PostgreSQL do Supabase.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Seção 3: Backup & Exportação de Dados ─── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-sm">
        <div className="pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Backup & Exportação Completa de Dados
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Exporte seus dados a qualquer momento em formatos abertos e universais (JSON e CSV).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {/* Exportar JSON */}
          <button
            type="button"
            onClick={handleExportJson}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/40 hover:bg-blue-50/50 dark:hover:bg-slate-800 transition-all text-left flex flex-col justify-between"
          >
            <div>
              <FileJson className="w-6 h-6 text-blue-500 mb-2" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                Backup Completo (JSON)
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Arquivo único com meta, simulados e treinos para restauração.
              </p>
            </div>
            <span className="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Baixar .json
            </span>
          </button>

          {/* Exportar CSV Simulados */}
          <button
            type="button"
            onClick={handleExportAttemptsCsv}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-800/40 hover:bg-emerald-50/50 dark:hover:bg-slate-800 transition-all text-left flex flex-col justify-between"
          >
            <div>
              <FileSpreadsheet className="w-6 h-6 text-emerald-500 mb-2" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                Simulados TAF (CSV)
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Planilha com datas, distâncias, parciais e recordes de 12 min.
              </p>
            </div>
            <span className="mt-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Baixar .csv
            </span>
          </button>

          {/* Exportar CSV Treinos */}
          <button
            type="button"
            onClick={handleExportTrainingsCsv}
            className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-amber-500 dark:hover:border-amber-500 bg-slate-50 dark:bg-slate-800/40 hover:bg-amber-50/50 dark:hover:bg-slate-800 transition-all text-left flex flex-col justify-between"
          >
            <div>
              <FileSpreadsheet className="w-6 h-6 text-amber-500 mb-2" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                Diário de Treinos (CSV)
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Planilha com modalidades, RPE, peso e parciais por quilômetro.
              </p>
            </div>
            <span className="mt-3 text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Baixar .csv
            </span>
          </button>
        </div>

        {/* Área de Importação / Restauração de Backup JSON */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 text-center">
          <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 mb-1">
            Restaurar Backup do PaceLab (Arquivo .json)
          </h4>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto mb-3">
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
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {isImporting ? "Restaurando Backup..." : "Selecionar Arquivo de Backup (.json)"}
          </button>
        </div>
      </div>
    </div>
  );
}
