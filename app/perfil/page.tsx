"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { UserProfile, WeightRecord } from "@/types";
import {
  profileService,
  calcBmi,
  BmiResult,
} from "@/lib/services/profileService";
import {
  Scale,
  User,
  Activity,
  Calendar,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Minus,
  Edit2,
  X,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function PerfilPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [weights, setWeights] = useState<WeightRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estado para Edição do Perfil
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editHeight, setEditHeight] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editGender, setEditGender] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Estado para Nova Pesagem Avulsa
  const [isAddingWeight, setIsAddingWeight] = useState(false);
  const [newWeightInput, setNewWeightInput] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newWeightNotes, setNewWeightNotes] = useState("");
  const [isSavingWeight, setIsSavingWeight] = useState(false);

  // Carregar Perfil e Histórico
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [userProfile, weightHistory] = await Promise.all([
        profileService.getProfile(),
        profileService.getWeightHistory(),
      ]);

      setProfile(userProfile);
      setWeights(weightHistory);

      // Preenche form de edição
      setEditName(userProfile.name || "");
      setEditHeight(userProfile.heightCm ? String(userProfile.heightCm) : "");
      setEditWeight(
        userProfile.currentWeightKg ? String(userProfile.currentWeightKg) : ""
      );
      setEditBirthDate(
        userProfile.birthDate ? userProfile.birthDate.split("T")[0] : ""
      );
      setEditGender(userProfile.gender || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar dados do perfil";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cálculo do IMC
  const bmiData: BmiResult | null = useMemo(() => {
    if (!profile) return null;
    return calcBmi(profile.currentWeightKg, profile.heightCm);
  }, [profile]);

  // Idade calculada
  const athleteAge = useMemo(() => {
    if (!profile?.birthDate) return null;
    try {
      const birth = new Date(profile.birthDate);
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age--;
      }
      return age >= 0 ? age : null;
    } catch {
      return null;
    }
  }, [profile?.birthDate]);

  // Dados para o Gráfico de Peso
  const chartData = useMemo(() => {
    if (!weights || weights.length === 0) return [];
    // Ordena cronologicamente para exibição no gráfico
    return [...weights]
      .sort(
        (a, b) =>
          new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
      )
      .map((w) => {
        const d = new Date(w.recordedAt);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        return {
          dateFormatted: `${day}/${month}`,
          weightKg: w.weightKg,
          source: w.source,
          notes: w.notes,
        };
      });
  }, [weights]);

  // Estatística de flutuação de peso
  const weightTrend = useMemo(() => {
    if (weights.length < 2) return null;
    const sorted = [...weights].sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    );
    const initial = sorted[0].weightKg;
    const current = sorted[sorted.length - 1].weightKg;
    const delta = Number((current - initial).toFixed(1));
    return {
      initial,
      current,
      delta,
    };
  }, [weights]);

  // Salvar Edição do Perfil
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const updated = await profileService.saveProfile({
        name: editName.trim() || null,
        heightCm: editHeight ? parseFloat(editHeight.replace(",", ".")) : null,
        currentWeightKg: editWeight
          ? parseFloat(editWeight.replace(",", "."))
          : null,
        birthDate: editBirthDate ? new Date(editBirthDate).toISOString() : null,
        gender: (editGender as "masculino" | "feminino" | "outro") || null,
      });

      setProfile(updated);
      setIsEditingProfile(false);
      setSuccessMessage("Perfil atualizado com sucesso!");
      setTimeout(() => setSuccessMessage(null), 3500);

      // Recarrega pesagens caso um novo peso tenha sido registrado
      const weightHistory = await profileService.getWeightHistory();
      setWeights(weightHistory);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar perfil";
      setErrorMessage(msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Adicionar Nova Pesagem
  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(newWeightInput.replace(",", "."));
    if (isNaN(parsed) || parsed < 30 || parsed > 250) {
      setErrorMessage("Por favor, informe um peso corporal válido entre 30 e 250 kg.");
      return;
    }

    setIsSavingWeight(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await profileService.addWeightRecord({
        weightKg: Number(parsed.toFixed(1)),
        recordedAt: new Date(newWeightDate).toISOString(),
        notes: newWeightNotes.trim() || null,
        source: "manual",
      });

      setNewWeightInput("");
      setNewWeightNotes("");
      setIsAddingWeight(false);
      setSuccessMessage("Pesagem registrada com sucesso!");
      setTimeout(() => setSuccessMessage(null), 3500);

      // Atualiza lista e perfil local
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao registrar pesagem";
      setErrorMessage(msg);
    } finally {
      setIsSavingWeight(false);
    }
  };

  // Excluir Pesagem
  const handleDeleteWeight = async (id: string) => {
    if (!confirm("Deseja realmente excluir este registro de pesagem?")) return;

    try {
      await profileService.deleteWeightRecord(id);
      setWeights((prev) => prev.filter((w) => w.id !== id));
      // Atualiza peso atual no perfil
      const updatedProfile = await profileService.getProfile();
      setProfile(updatedProfile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir pesagem";
      setErrorMessage(msg);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 pb-24">
      {/* ─── Header da Página ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          {isLoading ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40 mb-2">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              Sincronizando Biometria...
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40 mb-2">
              <User className="w-3.5 h-3.5" />
              Perfil & Biometria do Atleta
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            {profile?.name ? `Atleta ${profile.name}` : "Perfil do Atleta"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Configure seu peso e altura para calcular o gasto calórico exato com o
            Compêndio de 2024 e monitore sua evolução física semana a semana.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsAddingWeight((prev) => !prev)}
            className="rounded-xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            Nova Pesagem
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsEditingProfile((prev) => !prev)}
            className="rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1.5"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Editar Dados
          </Button>
        </div>
      </div>

      {/* ─── Mensagens de Feedback ─────────────────────────────────────────── */}
      {errorMessage && (
        <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-sm font-medium animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-rose-400 hover:text-rose-600 dark:hover:text-rose-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-sm font-medium animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-auto text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Formulário de Edição do Perfil (Expansível) ──────────────────── */}
      {isEditingProfile && (
        <Card className="p-6 rounded-3xl border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Editar Dados Biométricos do Atleta
            </h2>
            <button
              onClick={() => setIsEditingProfile(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Atleta
                </label>
                <input
                  type="text"
                  placeholder="Ex: Seu Nome"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Altura (cm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="50"
                  max="260"
                  placeholder="Ex: 175"
                  value={editHeight}
                  onChange={(e) => setEditHeight(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Peso Corporal Atual (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="250"
                  placeholder="Ex: 72.5"
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Data de Nascimento
                </label>
                <input
                  type="date"
                  value={editBirthDate}
                  onChange={(e) => setEditBirthDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Gênero
                </label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Não informado</option>
                  <option value="masculino">Masculino</option>
                  <option value="feminino">Feminino</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditingProfile(false)}
                className="rounded-xl text-xs py-2"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSavingProfile}
                className="rounded-xl text-xs py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {isSavingProfile ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ─── Formulário de Nova Pesagem (Expansível) ──────────────────────── */}
      {isAddingWeight && (
        <Card className="p-6 rounded-3xl border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Registrar Nova Pesagem Corporal
            </h2>
            <button
              onClick={() => setIsAddingWeight(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleAddWeight} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Peso (kg) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="250"
                  required
                  placeholder="Ex: 72.3"
                  value={newWeightInput}
                  onChange={(e) => setNewWeightInput(e.target.value)}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Data da Pesagem
                </label>
                <input
                  type="date"
                  value={newWeightDate}
                  onChange={(e) => setNewWeightDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Anotações (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Em jejum pela manhã"
                  value={newWeightNotes}
                  onChange={(e) => setNewWeightNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddingWeight(false)}
                className="rounded-xl text-xs py-2"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSavingWeight || !newWeightInput}
                className="rounded-xl text-xs py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {isSavingWeight ? "Registrando..." : "Registrar Pesagem"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ─── Grid de Cards Principais ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Peso Vigente */}
        <Card className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Peso Atual
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100">
                {profile?.currentWeightKg ? profile.currentWeightKg : "--"}
              </span>
              <span className="text-sm font-semibold text-slate-400">kg</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Última pesagem:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {weights.length > 0
                ? new Date(weights[0].recordedAt).toLocaleDateString("pt-BR")
                : "Nenhum registro"}
            </span>
          </div>
        </Card>

        {/* Card 2: Altura & Idade */}
        <Card className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Altura & Biometria
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100">
                {profile?.heightCm ? profile.heightCm : "--"}
              </span>
              <span className="text-sm font-semibold text-slate-400">cm</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Idade / Gênero:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {athleteAge !== null ? `${athleteAge} anos` : "--"} •{" "}
              {profile?.gender ? profile.gender : "--"}
            </span>
          </div>
        </Card>

        {/* Card 3: IMC & OMS */}
        <Card className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                IMC (Índice de Massa Corporal)
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100">
                {bmiData ? bmiData.bmi : "--"}
              </span>
              {bmiData && (
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full border ${bmiData.colorClass}`}
                >
                  {bmiData.categoryLabel}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex justify-between mb-1 text-[10px] text-slate-400">
              <span>Abaixo &lt;18.5</span>
              <span>Normal 18.5-24.9</span>
              <span>Sobrepeso &ge;25</span>
            </div>
            {/* Barra visual de IMC */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden">
              <div className="w-1/4 bg-blue-400" title="Abaixo do peso (<18.5)" />
              <div className="w-2/4 bg-emerald-500" title="Normal (18.5 - 24.9)" />
              <div className="w-1/4 bg-amber-500" title="Sobrepeso (>=25.0)" />
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Seção Gráfico de Evolução do Peso ─────────────────────────────── */}
      <Card className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Scale className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Evolução Temporal do Peso Corporal
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Acompanhe suas pesagens e o impacto nos treinos e gasto calórico.
            </p>
          </div>

          {weightTrend && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs font-semibold">
              {weightTrend.delta < 0 ? (
                <>
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {weightTrend.delta} kg
                  </span>
                </>
              ) : weightTrend.delta > 0 ? (
                <>
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">
                    +{weightTrend.delta} kg
                  </span>
                </>
              ) : (
                <>
                  <Minus className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-500">Sem alteração</span>
                </>
              )}
              <span className="text-slate-400">• Desde a 1ª pesagem</span>
            </div>
          )}
        </div>

        {chartData.length >= 2 ? (
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis
                  dataKey="dateFormatted"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  domain={["dataMin - 1", "dataMax + 1"]}
                  unit="kg"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    borderRadius: "1rem",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [`${value} kg`, "Peso"]}
                />
                <Area
                  type="monotone"
                  dataKey="weightKg"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#weightGradient)"
                  dot={{ r: 4, fill: "#2563eb", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500">
            <Scale className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">
              Registre pelo menos 2 pesagens para visualizar a curva de evolução do peso.
            </p>
          </div>
        )}
      </Card>

      {/* ─── Tabela Histórica de Pesagens ─────────────────────────────────── */}
      <Card className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Histórico de Pesagens ({weights.length})
          </h2>
        </div>

        {weights.length === 0 ? (
          <div className="py-8 text-center text-slate-400 dark:text-slate-500">
            <p className="text-sm">Nenhuma pesagem registrada até o momento.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/80 text-xs text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Peso (kg)</th>
                  <th className="py-3 px-3">Origem</th>
                  <th className="py-3 px-3">Anotações</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {weights.map((w) => {
                  const sourceLabels: Record<string, { label: string; color: string }> = {
                    weekly_prompt: {
                      label: "Semanal",
                      color: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
                    },
                    manual: {
                      label: "Manual",
                      color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                    },
                    profile_update: {
                      label: "Perfil",
                      color: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
                    },
                  };

                  const badge =
                    w.source && sourceLabels[w.source]
                      ? sourceLabels[w.source]
                      : { label: w.source || "Manual", color: "bg-slate-100 text-slate-700" };

                  return (
                    <tr
                      key={w.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-3 text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {new Date(w.recordedAt).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                        {w.weightKg} kg
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 text-xs">
                        {w.notes || "—"}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleDeleteWeight(w.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                          title="Excluir pesagem"
                          aria-label="Excluir pesagem"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
