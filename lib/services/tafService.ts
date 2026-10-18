import {
  TafAttempt,
  TrainingSession,
  TafGoalConfig,
} from "@/types";

export const DEFAULT_GOAL: TafGoalConfig = {
  institutionName: "Edital Padrão",
  minDistanceMeters: 2400,
  targetDistanceMeters: 2300,
  targetDurationMinutes: 12,
  targetExamDate: null,
  pullupType: "dinamica",
  pullupMinReps: 3,
  pullupTargetReps: 5,
  pullupMinSeconds: null,
  pullupTargetSeconds: null,
  pullupDurationSeconds: null,
  pushupMinReps: 20,
  pushupTargetReps: 30,
  pushupDurationSeconds: null,
  absMinReps: 30,
  absTargetReps: 40,
  absDurationSeconds: null,
};

export interface TafPaginationOptions {
  limit?: number;
  cursor?: string;
}

export interface TrainingPaginationOptions extends TafPaginationOptions {
  activityType?: string;
}

function unwrapApiResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function extractErrorMessage(
  res: Response,
  fallbackMessage: string
): Promise<string> {
  try {
    const errData = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: Array<{ field?: string; message?: string }>;
    };

    if (Array.isArray(errData.details) && errData.details.length > 0) {
      const messages = errData.details
        .map((d) => d.message)
        .filter((msg): msg is string => Boolean(msg));
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }

    if (errData.error) {
      return errData.error;
    }
  } catch {
    // Falha silenciosa no parsing, mantém fallback
  }

  return fallbackMessage;
}

// ─── Serviço de Persistência Direta no Supabase (PostgreSQL via Prisma API) ───
export const tafService = {
  // ─── Metas da Prova ────────────────────────────────────────────────────────
  async getGoal(): Promise<TafGoalConfig> {
    try {
      const res = await fetch("/api/taf/goals", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        return unwrapApiResponse<TafGoalConfig>(json);
      }
    } catch {
      // Retorna meta padrão se offline ou falha de rede
    }
    return DEFAULT_GOAL;
  },

  async saveGoal(goal: TafGoalConfig): Promise<TafGoalConfig> {
    const res = await fetch("/api/taf/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goal),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao salvar meta no banco de dados"
      );
      throw new Error(message);
    }

    const json = await res.json();
    return unwrapApiResponse<TafGoalConfig>(json);
  },

  // ─── Tentativas de TAF (12 min) ───────────────────────────────────────────
  async getAttempts(options?: TafPaginationOptions): Promise<TafAttempt[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    const qs = params.toString() ? `?${params.toString()}` : "";

    const res = await fetch(`/api/taf/attempts${qs}`, { cache: "no-store" });
    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao carregar simulados do banco de dados"
      );
      throw new Error(message);
    }
    const json = await res.json();
    return unwrapApiResponse<TafAttempt[]>(json);
  },

  async saveAttempt(attempt: TafAttempt, isUpdate = false): Promise<TafAttempt> {
    const url = isUpdate
      ? `/api/taf/attempts/${encodeURIComponent(attempt.id)}`
      : "/api/taf/attempts";
    const method = isUpdate ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attempt),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao salvar simulado no banco de dados"
      );
      throw new Error(message);
    }

    const json = await res.json();
    return unwrapApiResponse<TafAttempt>(json);
  },

  async deleteAttempt(id: string): Promise<boolean> {
    const res = await fetch(`/api/taf/attempts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao excluir simulado no banco de dados"
      );
      throw new Error(message);
    }

    return true;
  },

  // ─── Diário de Treinos ─────────────────────────────────────────────────────
  async getTrainings(options?: TrainingPaginationOptions): Promise<TrainingSession[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.activityType) params.set("activityType", options.activityType);
    const qs = params.toString() ? `?${params.toString()}` : "";

    const res = await fetch(`/api/taf/trainings${qs}`, { cache: "no-store" });
    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao carregar diário de treinos do banco de dados"
      );
      throw new Error(message);
    }
    const json = await res.json();
    return unwrapApiResponse<TrainingSession[]>(json);
  },

  async saveTraining(training: TrainingSession, isUpdate = false): Promise<TrainingSession> {
    const url = isUpdate
      ? `/api/taf/trainings/${encodeURIComponent(training.id)}`
      : "/api/taf/trainings";
    const method = isUpdate ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(training),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao salvar treino no banco de dados"
      );
      throw new Error(message);
    }

    const json = await res.json();
    return unwrapApiResponse<TrainingSession>(json);
  },

  async deleteTraining(id: string): Promise<boolean> {
    const res = await fetch(`/api/taf/trainings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const message = await extractErrorMessage(
        res,
        "Erro ao excluir treino no banco de dados"
      );
      throw new Error(message);
    }

    return true;
  },

  // ─── Status do Banco SQL / Prisma ──────────────────────────────────────────
  async checkDatabaseHealth(): Promise<{
    connected: boolean;
    orm: string;
    database?: string;
    latencyMs?: number;
    error?: string;
  }> {
    try {
      const res = await fetch("/api/taf/health", { cache: "no-store" });
      const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const data = (raw && typeof raw === "object" && "data" in raw && raw.data
        ? raw.data
        : raw) as Record<string, unknown>;
      return {
        connected: res.ok && data?.status === "connected",
        orm: "Prisma",
        database: data?.database as string | undefined,
        latencyMs: data?.latencyMs as number | undefined,
        error: (data?.error as string | undefined) || (raw?.error as string | undefined),
      };
    } catch (err) {
      return {
        connected: false,
        orm: "Prisma",
        error: err instanceof Error ? err.message : "Sem conexão de rede com o banco",
      };
    }
  },

  // ─── Backup & Exportação (JSON / CSV) ──────────────────────────────────────
  exportBackupJson(
    goal: TafGoalConfig = DEFAULT_GOAL,
    attempts: TafAttempt[] = [],
    trainings: TrainingSession[] = []
  ): string {
    const backup = {
      version: 2,
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

      let attemptsCount = 0;
      let trainingsCount = 0;

      if (parsed.goal) {
        await this.saveGoal(parsed.goal).catch(() => null);
      }

      if (Array.isArray(parsed.attempts)) {
        for (const att of parsed.attempts) {
          if (att.distanceMeters && att.actualDurationSeconds) {
            await this.saveAttempt(att, false).catch(() => null);
            attemptsCount++;
          }
        }
      }

      if (Array.isArray(parsed.trainings)) {
        for (const tr of parsed.trainings) {
          if (tr.distanceKm && tr.durationSeconds) {
            await this.saveTraining(tr, false).catch(() => null);
            trainingsCount++;
          }
        }
      }

      return {
        success: true,
        attemptsCount,
        trainingsCount,
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
