import {
  TafAttempt,
  TrainingSession,
  TafGoalConfig,
} from "@/types";

const STORAGE_KEYS = {
  GOAL: "pacelab_taf_goal_v1",
  ATTEMPTS: "pacelab_taf_attempts_v1",
  TRAININGS: "pacelab_trainings_v1",
};

export const DEFAULT_GOAL: TafGoalConfig = {
  targetDistanceMeters: 2300,
  targetDurationMinutes: 12,
  targetExamDate: null,
};

// ─── Helpers de LocalStorage ──────────────────────────────────────────────────
function getLocalItem<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : defaultValue;
  } catch (error) {
    console.warn(`Erro ao ler localStorage key: ${key}`, error);
    return defaultValue;
  }
}

function setLocalItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Erro ao gravar localStorage key: ${key}`, error);
  }
}

// ─── Serviço Unificado de Persistência Híbrida (Prisma + Fallback Local) ───────
export const tafService = {
  // ─── Metas ─────────────────────────────────────────────────────────────────
  async getGoal(): Promise<TafGoalConfig> {
    try {
      const res = await fetch("/api/taf/goals", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLocalItem(STORAGE_KEYS.GOAL, data);
        return data;
      }
    } catch {
      // Falha de rede ou offline: segue para o fallback local
    }
    return getLocalItem<TafGoalConfig>(STORAGE_KEYS.GOAL, DEFAULT_GOAL);
  },

  async saveGoal(goal: TafGoalConfig): Promise<TafGoalConfig> {
    // 1. Atualização otimista local
    setLocalItem(STORAGE_KEYS.GOAL, goal);

    try {
      const res = await fetch("/api/taf/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goal),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalItem(STORAGE_KEYS.GOAL, data);
        return data;
      }
    } catch {
      // Permanece salvo localmente
    }
    return goal;
  },

  // ─── Tentativas de TAF (12 min) ───────────────────────────────────────────
  async getAttempts(): Promise<TafAttempt[]> {
    try {
      const res = await fetch("/api/taf/attempts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLocalItem(STORAGE_KEYS.ATTEMPTS, data);
        return data;
      }
    } catch {
      // Offline fallback
    }
    return getLocalItem<TafAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
  },

  async saveAttempt(attempt: TafAttempt): Promise<TafAttempt> {
    const localList = getLocalItem<TafAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const existingIndex = localList.findIndex((a) => a.id === attempt.id);
    const updatedList =
      existingIndex >= 0
        ? localList.map((a) => (a.id === attempt.id ? attempt : a))
        : [attempt, ...localList];

    setLocalItem(STORAGE_KEYS.ATTEMPTS, updatedList);

    try {
      const isUpdate = existingIndex >= 0;
      const url = isUpdate
        ? `/api/taf/attempts/${encodeURIComponent(attempt.id)}`
        : "/api/taf/attempts";
      const method = isUpdate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
      });

      if (res.ok) {
        const saved = await res.json();
        const refreshedList = updatedList.map((a) =>
          a.id === attempt.id ? saved : a
        );
        setLocalItem(STORAGE_KEYS.ATTEMPTS, refreshedList);
        return saved;
      }
    } catch {
      // Mantém versão local
    }

    return attempt;
  },

  async deleteAttempt(id: string): Promise<boolean> {
    const localList = getLocalItem<TafAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const filtered = localList.filter((a) => a.id !== id);
    setLocalItem(STORAGE_KEYS.ATTEMPTS, filtered);

    try {
      const res = await fetch(`/api/taf/attempts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch {
      return true;
    }
  },

  // ─── Diário de Treinos ─────────────────────────────────────────────────────
  async getTrainings(): Promise<TrainingSession[]> {
    try {
      const res = await fetch("/api/taf/trainings", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLocalItem(STORAGE_KEYS.TRAININGS, data);
        return data;
      }
    } catch {
      // Offline fallback
    }
    return getLocalItem<TrainingSession[]>(STORAGE_KEYS.TRAININGS, []);
  },

  async saveTraining(training: TrainingSession): Promise<TrainingSession> {
    const localList = getLocalItem<TrainingSession[]>(STORAGE_KEYS.TRAININGS, []);
    const existingIndex = localList.findIndex((t) => t.id === training.id);
    const updatedList =
      existingIndex >= 0
        ? localList.map((t) => (t.id === training.id ? training : t))
        : [training, ...localList];

    setLocalItem(STORAGE_KEYS.TRAININGS, updatedList);

    try {
      const isUpdate = existingIndex >= 0;
      const url = isUpdate
        ? `/api/taf/trainings/${encodeURIComponent(training.id)}`
        : "/api/taf/trainings";
      const method = isUpdate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(training),
      });

      if (res.ok) {
        const saved = await res.json();
        const refreshedList = updatedList.map((t) =>
          t.id === training.id ? saved : t
        );
        setLocalItem(STORAGE_KEYS.TRAININGS, refreshedList);
        return saved;
      }
    } catch {
      // Mantém versão local
    }

    return training;
  },

  async deleteTraining(id: string): Promise<boolean> {
    const localList = getLocalItem<TrainingSession[]>(STORAGE_KEYS.TRAININGS, []);
    const filtered = localList.filter((t) => t.id !== id);
    setLocalItem(STORAGE_KEYS.TRAININGS, filtered);

    try {
      const res = await fetch(`/api/taf/trainings/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch {
      return true;
    }
  },

  // ─── Status do Banco SQL / Prisma ──────────────────────────────────────────
  async checkDatabaseHealth(): Promise<{
    connected: boolean;
    orm: string;
    database?: string;
    error?: string;
  }> {
    try {
      const res = await fetch("/api/taf/health", { cache: "no-store" });
      const data = await res.json();
      return {
        connected: res.ok && data.status === "connected",
        orm: "Prisma",
        database: data.database,
        error: data.error,
      };
    } catch (err) {
      return {
        connected: false,
        orm: "Prisma",
        error: err instanceof Error ? err.message : "Sem conexão de rede",
      };
    }
  },

  // ─── Sincronização / Migração do LocalStorage para o Prisma ─────────────────
  async migrateFromLocalStorage(): Promise<{
    success: boolean;
    migratedAttempts: number;
    migratedTrainings: number;
    goalUpdated: boolean;
    error?: string;
  }> {
    const goal = getLocalItem<TafGoalConfig>(STORAGE_KEYS.GOAL, DEFAULT_GOAL);
    const attempts = getLocalItem<TafAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const trainings = getLocalItem<TrainingSession[]>(STORAGE_KEYS.TRAININGS, []);

    try {
      const res = await fetch("/api/taf/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, attempts, trainings }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Falha na sincronização");
      }

      const result = await res.json();
      return result;
    } catch (err) {
      return {
        success: false,
        migratedAttempts: 0,
        migratedTrainings: 0,
        goalUpdated: false,
        error: err instanceof Error ? err.message : "Erro desconhecido",
      };
    }
  },

  // ─── Backup & Restauração (JSON / CSV) ────────────────────────────────────
  exportBackupJson(): string {
    const goal = getLocalItem<TafGoalConfig>(STORAGE_KEYS.GOAL, DEFAULT_GOAL);
    const attempts = getLocalItem<TafAttempt[]>(STORAGE_KEYS.ATTEMPTS, []);
    const trainings = getLocalItem<TrainingSession[]>(STORAGE_KEYS.TRAININGS, []);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      appName: "PaceLab",
      goal,
      attempts,
      trainings,
    };

    return JSON.stringify(backup, null, 2);
  },

  async importBackupJson(jsonString: string): Promise<{
    success: boolean;
    attemptsCount: number;
    trainingsCount: number;
    error?: string;
  }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Arquivo JSON inválido");
      }

      if (parsed.goal) {
        setLocalItem(STORAGE_KEYS.GOAL, parsed.goal);
      }
      if (Array.isArray(parsed.attempts)) {
        setLocalItem(STORAGE_KEYS.ATTEMPTS, parsed.attempts);
      }
      if (Array.isArray(parsed.trainings)) {
        setLocalItem(STORAGE_KEYS.TRAININGS, parsed.trainings);
      }

      // Tenta sincronizar com o banco Prisma se estiver online
      try {
        await this.migrateFromLocalStorage();
      } catch {
        // Ignora erro se estiver offline
      }

      return {
        success: true,
        attemptsCount: Array.isArray(parsed.attempts) ? parsed.attempts.length : 0,
        trainingsCount: Array.isArray(parsed.trainings) ? parsed.trainings.length : 0,
      };
    } catch (err) {
      return {
        success: false,
        attemptsCount: 0,
        trainingsCount: 0,
        error: err instanceof Error ? err.message : "Erro ao importar arquivo",
      };
    }
  },

  exportAttemptsCsv(attempts: TafAttempt[]): string {
    const headers = [
      "ID",
      "Data",
      "Duracao_Segundos",
      "Distancia_Metros",
      "Pace_Formatado",
      "Velocidade_Kmh",
      "Local",
      "Notas",
    ];

    const rows = attempts.map((a) => [
      a.id,
      a.testDate,
      a.actualDurationSeconds,
      a.distanceMeters,
      `"${a.paceFormatted}"`,
      a.speedKmh.toFixed(2),
      `"${a.locationType || ""}"`,
      `"${(a.notes || "").replace(/"/g, '""')}"`,
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  },

  exportTrainingsCsv(trainings: TrainingSession[]): string {
    const headers = [
      "ID",
      "Data",
      "Modalidade",
      "Distancia_Km",
      "Duracao_Segundos",
      "Pace_Formatado",
      "Velocidade_Kmh",
      "RPE_Esforco",
      "Peso_Kg",
      "Notas",
    ];

    const rows = trainings.map((t) => [
      t.id,
      t.sessionDate,
      t.activityType,
      t.distanceKm.toFixed(2),
      t.durationSeconds,
      `"${t.paceFormatted}"`,
      t.speedKmh.toFixed(2),
      t.perceivedEffort ?? "",
      t.bodyWeightKg ?? "",
      `"${(t.notes || "").replace(/"/g, '""')}"`,
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  },
};
