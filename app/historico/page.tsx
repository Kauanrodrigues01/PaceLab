"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  Plus,
  Calendar,
  Timer,
  Gauge,
  Trash2,
  Edit2,
  Save,
  X,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  AlertCircle,
  Footprints,
  Sparkles,
  BookOpen,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { historyStorage } from "@/lib/storage/localStorage";
import {
  formatDecimal,
  formatTime,
  parseTime,
} from "@/lib/formatting/time";
import { calcPaceFromDistanceAndTime } from "@/lib/math/pace";
import { getMetForSpeedAndActivity, calcCalories } from "@/lib/math/calories";
import { tafService } from "@/lib/services/tafService";
import { validateDistance, validateTimeString } from "@/lib/validation/inputs";
import { HistoryEntry, TrainingSession } from "@/types";

type HistoryCategory = "all" | "runs" | "taf" | "goals";

export default function HistoricoPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Formulário de Adição
  const [showAddForm, setShowAddForm] = useState(false);
  const [dateInput, setDateInput] = useState(() => new Date().toISOString().split("T")[0]);
  const [distanceInput, setDistanceInput] = useState("");
  const [timeInput, setTimeInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Edição
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editDistance, setEditDistance] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Filtros e Conversão
  const [activeFilter, setActiveFilter] = useState<HistoryCategory>("all");
  const [convertedIds, setConvertedIds] = useState<Set<string>>(new Set());

  // Auto-cálculo em tempo real para novo registro
  const [previewPace, setPreviewPace] = useState<string | null>(null);
  const [previewSpeed, setPreviewSpeed] = useState<string | null>(null);

  // Classificação de categoria da entrada
  const getEntryCategory = (entry: HistoryEntry): "taf" | "goals" | "runs" => {
    const notes = (entry.notes || "").toLowerCase();
    if (notes.includes("taf")) return "taf";
    if (notes.includes("meta")) return "goals";
    return "runs";
  };

  const categoryCounts = {
    all: entries.length,
    runs: entries.filter((e) => getEntryCategory(e) === "runs").length,
    taf: entries.filter((e) => getEntryCategory(e) === "taf").length,
    goals: entries.filter((e) => getEntryCategory(e) === "goals").length,
  };

  const filteredEntries = entries.filter((e) => {
    if (activeFilter === "all") return true;
    return getEntryCategory(e) === activeFilter;
  });

  // Converter entrada em treino do diário em 1 clique
  const handleConvertToTraining = async (entry: HistoryEntry) => {
    try {
      const metData = getMetForSpeedAndActivity("corrida_continua", entry.speedKmh);
      const cals = calcCalories({
        weightKg: 70,
        durationSeconds: entry.timeSeconds,
        met: metData.met,
      });

      const trainingSession: TrainingSession = {
        id: "converted-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        sessionDate: entry.date,
        activityType: "corrida_continua",
        distanceKm: entry.distanceKm,
        durationSeconds: entry.timeSeconds,
        speedKmh: entry.speedKmh,
        paceSeconds: entry.paceSeconds,
        paceFormatted: entry.paceFormatted,
        notes: entry.notes ? `${entry.notes} (Convertido do Histórico)` : "Convertido do Histórico de Cálculos",
        totalCalories: cals.totalCalories,
        activeCalories: cals.activeCalories,
        metValue: metData.met,
        calorieMethod: "compendium_2024",
        calorieSource: "automatic",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await tafService.saveTraining(trainingSession);
      setConvertedIds((prev) => new Set(prev).add(entry.id));
    } catch (err) {
      console.error("Erro ao converter para diário de treinos:", err);
    }
  };

  // Carregar dados
  const loadEntries = () => {
    const list = historyStorage.getAll();
    // Ordenar por data decrescente
    const sorted = [...list].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    setEntries(sorted);
    setIsLoaded(true);
  };

  useEffect(() => {
    loadEntries();
  }, []);

  // Efeito para auto-calcular pace e velocidade enquanto o usuário digita
  useEffect(() => {
    const distNum = Number(distanceInput.replace(",", "."));
    if (distNum > 0 && timeInput.trim().length > 0) {
      const timeVal = validateTimeString(timeInput);
      if (timeVal.valid) {
        try {
          const totalSec = parseTime(timeInput);
          if (totalSec > 0) {
            const res = calcPaceFromDistanceAndTime(distNum, totalSec);
            setPreviewPace(res.paceFormatted);
            setPreviewSpeed(formatDecimal(res.speedKmh, 2));
            return;
          }
        } catch {
          // ignora enquanto digita
        }
      }
    }
    setPreviewPace(null);
    setPreviewSpeed(null);
  }, [distanceInput, timeInput]);

  // Adicionar novo registro
  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!dateInput) errors.date = "Informe a data do treino.";

    const distNum = Number(distanceInput.replace(",", "."));
    const distVal = validateDistance(distNum);
    if (!distVal.valid) errors.distance = distVal.message;

    const timeVal = validateTimeString(timeInput);
    if (!timeVal.valid) errors.time = timeVal.message;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      const totalSec = parseTime(timeInput);
      const res = calcPaceFromDistanceAndTime(distNum, totalSec);

      historyStorage.save({
        id: "manual-" + Date.now(),
        date: dateInput,
        distanceKm: distNum,
        timeSeconds: totalSec,
        paceSeconds: res.paceSeconds,
        paceFormatted: res.paceFormatted,
        speedKmh: res.speedKmh,
        notes: notesInput.trim() || "Registro manual",
        createdAt: new Date().toISOString(),
      });

      // Reset
      setDistanceInput("");
      setTimeInput("");
      setNotesInput("");
      setFormErrors({});
      setShowAddForm(false);
      loadEntries();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar treino";
      setFormErrors({ form: msg });
    }
  };

  // Iniciar edição
  const handleStartEdit = (entry: HistoryEntry) => {
    setEditingId(entry.id);
    setEditDate(entry.date);
    setEditDistance(entry.distanceKm.toString());
    setEditTime(formatTime(entry.timeSeconds));
    setEditNotes(entry.notes || "");
    setEditErrors({});
  };

  // Salvar edição
  const handleSaveEdit = (id: string) => {
    const errors: Record<string, string> = {};
    const distNum = Number(editDistance.replace(",", "."));
    const distVal = validateDistance(distNum);
    if (!distVal.valid) errors.distance = distVal.message;

    const timeVal = validateTimeString(editTime);
    if (!timeVal.valid) errors.time = timeVal.message;

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    try {
      const totalSec = parseTime(editTime);
      const res = calcPaceFromDistanceAndTime(distNum, totalSec);

      historyStorage.update(id, {
        date: editDate,
        distanceKm: distNum,
        timeSeconds: totalSec,
        paceSeconds: res.paceSeconds,
        paceFormatted: res.paceFormatted,
        speedKmh: res.speedKmh,
        notes: editNotes.trim(),
      });

      setEditingId(null);
      loadEntries();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar";
      setEditErrors({ form: msg });
    }
  };

  // Excluir registro
  const handleDelete = (id: string) => {
    if (window.confirm("Deseja realmente remover esta atividade do histórico?")) {
      historyStorage.delete(id);
      loadEntries();
    }
  };

  // Limpar todo o histórico
  const handleClearAll = () => {
    if (
      window.confirm(
        "Atenção: Tem certeza de que deseja apagar TODO o histórico? Esta ação não pode ser desfeita."
      )
    ) {
      historyStorage.clear();
      loadEntries();
    }
  };

  // Exportar CSV
  const handleExportCsv = () => {
    const csvContent = historyStorage.exportToCsv();
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pacelab-historico-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportar JSON
  const handleExportJson = () => {
    const jsonContent = historyStorage.exportToJson();
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `pacelab-historico-${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Inserir atividade de demonstração
  const handleAddSample = () => {
    historyStorage.save({
      id: "sample-1",
      date: new Date().toISOString().split("T")[0],
      distanceKm: 5,
      timeSeconds: 25 * 60,
      paceSeconds: 300,
      paceFormatted: "5:00",
      speedKmh: 12,
      notes: "Treino de 5 km em ritmo constante",
      createdAt: new Date().toISOString(),
    });
    historyStorage.save({
      id: "sample-2",
      date: new Date(Date.now() - 86400000 * 2).toISOString().split("T")[0],
      distanceKm: 10,
      timeSeconds: 54 * 60,
      paceSeconds: 324,
      paceFormatted: "5:24",
      speedKmh: 11.11,
      notes: "Rodagem longa de fim de semana",
      createdAt: new Date().toISOString(),
    });
    loadEntries();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold mb-2">
            <History className="w-3.5 h-3.5" />
            Diário de Atividades do Atleta
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Histórico de Treinos & Cálculos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Acompanhe a evolução dos seus treinos registrados, visualize seus ritmos e exporte seus dados para planilhas.
          </p>
        </div>

        {/* Botão para Adicionar */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            icon={showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          >
            {showAddForm ? "Fechar Formulário" : "Registrar Treino"}
          </Button>
        </div>
      </div>

      {/* Card Informativo sobre LocalStorage */}
      <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-blue-900 dark:text-blue-200 text-xs sm:text-sm flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-blue-950 dark:text-blue-100">
            Armazenamento 100% Local no Navegador
          </p>
          <p className="text-blue-800/80 dark:text-blue-300/80 leading-relaxed text-xs">
            Seus registros são salvos com privacidade diretamente na memória deste navegador (localStorage). Você pode exportar seu histórico em CSV ou JSON a qualquer momento.
          </p>
        </div>
      </div>

      {/* Formulário de Adição */}
      {showAddForm && (
        <Card
          title="Novo Registro de Corrida"
          description="Informe os dados da sessão. O pace e a velocidade são calculados automaticamente."
        >
          <form onSubmit={handleAddEntry} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Data do Treino"
                id="input-entry-date"
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                error={formErrors.date}
              />
              <Input
                label="Distância"
                id="input-entry-distance"
                value={distanceInput}
                onChange={(e) => setDistanceInput(e.target.value)}
                rightAddon="km"
                placeholder="Ex: 5 ou 10"
                error={formErrors.distance}
                inputMode="decimal"
              />
              <Input
                label="Tempo Total"
                id="input-entry-time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                rightAddon="tempo"
                placeholder="Ex: 25:00 ou 50:00"
                hint="Use MM:SS ou HH:MM:SS"
                error={formErrors.time}
              />
            </div>

            {/* Pré-visualização do ritmo calculado em tempo real */}
            {previewPace && previewSpeed && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-600 dark:text-slate-400 font-sans flex items-center gap-1.5 font-semibold">
                  <Footprints className="w-3.5 h-3.5 text-blue-500" />
                  Ritmo Calculado Automaticamente:
                </span>
                <span className="text-slate-900 dark:text-slate-100 font-bold">
                  Pace {previewPace} min/km • Velocidade {previewSpeed} km/h
                </span>
              </div>
            )}

            <Input
              label="Notas e Observações (Opcional)"
              id="input-entry-notes"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Ex: Treino no parque com subidas, ritmo controlado."
            />

            {formErrors.form && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formErrors.form}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" icon={<Plus className="w-4 h-4" />}>
                Salvar no Histórico
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setFormErrors({});
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Barra de Ações: Exportações & Limpar */}
      {entries.length > 0 && (
        <div className="space-y-3">
          {/* Chips de Filtro por Categoria */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === "all"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>Todas</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                {categoryCounts.all}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("runs")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === "runs"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>Corridas</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                {categoryCounts.runs}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("taf")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === "taf"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>TAF</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                {categoryCounts.taf}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("goals")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeFilter === "goals"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <span>Metas</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                {categoryCounts.goals}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span>Total de Registros:</span>
              <Badge variant="primary">{entries.length}</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
              >
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportJson}
                icon={<FileCode className="w-3.5 h-3.5 text-blue-600" />}
              >
                Exportar JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                icon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
              >
                Limpar Tudo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de Registros */}
      {isLoaded && entries.length === 0 ? (
        <Card>
          <div className="text-center py-12 px-4">
            <History className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Nenhuma atividade salva ainda
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Ao usar a Calculadora Principal, Médias, TAF, Metas ou Intervalados, você pode clicar em &ldquo;Salvar no Histórico&rdquo; ou cadastrar treinos manualmente.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-5">
              <Button onClick={() => setShowAddForm(true)} icon={<Plus className="w-4 h-4" />}>
                Adicionar Primeiro Treino
              </Button>
              <Button variant="outline" onClick={handleAddSample} icon={<Sparkles className="w-4 h-4" />}>
                Carregar Dados de Exemplo
              </Button>
            </div>
          </div>
        </Card>
      ) : filteredEntries.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
          Nenhuma atividade encontrada nesta categoria selecionada.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-shadow"
            >
              {editingId === entry.id ? (
                // MODO EDIÇÃO
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Data"
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                    <Input
                      label="Distância (km)"
                      value={editDistance}
                      onChange={(e) => setEditDistance(e.target.value)}
                      error={editErrors.distance}
                    />
                    <Input
                      label="Tempo (MM:SS)"
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      error={editErrors.time}
                    />
                  </div>
                  <Input
                    label="Notas"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />

                  {editErrors.form && (
                    <div className="text-xs text-rose-600">{editErrors.form}</div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleSaveEdit(entry.id)}
                      icon={<Save className="w-3.5 h-3.5" />}
                    >
                      Salvar Alterações
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                // MODO VISUALIZAÇÃO
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {entry.date}
                      </span>
                      <Badge variant="primary">
                        {formatDecimal(entry.distanceKm, 2)} km
                      </Badge>
                      <Badge variant="default">
                        {formatTime(entry.timeSeconds)}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-mono pt-1">
                      <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <Timer className="w-3.5 h-3.5 text-blue-500" />
                        <span>Pace:</span>
                        <strong className="text-slate-900 dark:text-slate-100">
                          {entry.paceFormatted} min/km
                        </strong>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <Gauge className="w-3.5 h-3.5 text-blue-500" />
                        <span>Velocidade:</span>
                        <strong className="text-slate-900 dark:text-slate-100">
                          {formatDecimal(entry.speedKmh, 2)} km/h
                        </strong>
                      </div>
                    </div>

                    {entry.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic pt-1">
                        &ldquo;{entry.notes}&rdquo;
                      </p>
                    )}
                  </div>

                  {/* Ações de Linha */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
                    {convertedIds.has(entry.id) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg">
                        <Check className="w-3.5 h-3.5" />
                        Convertido para Treino!
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => handleConvertToTraining(entry)}
                        icon={<BookOpen className="w-3.5 h-3.5 text-blue-500" />}
                      >
                        Converter em Treino do Diário
                      </Button>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(entry)}
                        aria-label={`Editar treino de ${entry.date}`}
                        className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        aria-label={`Excluir treino de ${entry.date}`}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
