import { UserProfile, WeightRecord } from "@/types";

export const PROFILE_CACHE_KEY = "pacelab_cache_profile";
export const WEIGHTS_CACHE_KEY = "pacelab_cache_weights";
export const DISMISSED_PROMPT_KEY = "pacelab_weight_prompt_dismissed_until";

// ─── Helpers de Desempacotamento e Erros ──────────────────────────────────────

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

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
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
    // Falha silenciosa
  }
  return fallback;
}

// ─── Cache em SessionStorage ──────────────────────────────────────────────────

export const getCachedProfile = (): UserProfile | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setCachedProfile = (profile: UserProfile | null) => {
  if (typeof window === "undefined") return;
  try {
    if (profile) {
      sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } else {
      sessionStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Ignorado defensivamente
  }
};

export const getCachedWeights = (): WeightRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(WEIGHTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const setCachedWeights = (records: WeightRecord[]) => {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WEIGHTS_CACHE_KEY, JSON.stringify(records));
  } catch {
    // Ignorado defensivamente
  }
};

// ─── Utilidades Biométricas (IMC e Pesagem Semanal) ──────────────────────────

export interface BmiResult {
  bmi: number;
  category: "abaixo_do_peso" | "peso_normal" | "sobrepeso" | "obesidade";
  categoryLabel: string;
  colorClass: string;
}

/**
 * Calcula o IMC e retorna classificação segundo critérios da Organização Mundial da Saúde (OMS).
 */
export function calcBmi(weightKg?: number | null, heightCm?: number | null): BmiResult | null {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) {
    return null;
  }

  const heightMeters = heightCm / 100;
  const bmiRaw = weightKg / (heightMeters * heightMeters);
  const bmi = Number(bmiRaw.toFixed(1));

  if (bmi < 18.5) {
    return {
      bmi,
      category: "abaixo_do_peso",
      categoryLabel: "Abaixo do peso",
      colorClass: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    };
  }

  if (bmi < 25.0) {
    return {
      bmi,
      category: "peso_normal",
      categoryLabel: "Peso normal",
      colorClass: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    };
  }

  if (bmi < 30.0) {
    return {
      bmi,
      category: "sobrepeso",
      categoryLabel: "Sobrepeso",
      colorClass: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    };
  }

  return {
    bmi,
    category: "obesidade",
    categoryLabel: "Obesidade",
    colorClass: "text-rose-500 bg-rose-500/10 border-rose-500/30",
  };
}

/**
 * Verifica se a pesagem é devida (se hoje for segunda-feira OU se a última pesagem foi há >= 7 dias).
 * Se o usuário já registrou uma pesagem na data de hoje, não incomoda novamente.
 */
export function isWeeklyWeightDue(lastWeightDate?: string | Date | null): boolean {
  if (!lastWeightDate) return true; // Nunca se pesou

  const now = new Date();
  const lastDate = new Date(lastWeightDate);

  // Se já registrou pesagem hoje, não é devida nova pesagem
  const isSameDay =
    now.getFullYear() === lastDate.getFullYear() &&
    now.getMonth() === lastDate.getMonth() &&
    now.getDate() === lastDate.getDate();

  if (isSameDay) {
    return false;
  }

  const isMonday = now.getDay() === 1;
  const diffTime = now.getTime() - lastDate.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  return isMonday || diffDays >= 7;
}

/**
 * Verifica se o modal semanal foi dispensado/adiado nas últimas 24 horas.
 */
export function isWeightPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DISMISSED_PROMPT_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Date.now() < until;
  } catch {
    return false;
  }
}

/**
 * Adia a exibição do lembrete de pesagem por 24 horas.
 */
export function dismissWeightPrompt(hours = 24) {
  if (typeof window === "undefined") return;
  try {
    const until = Date.now() + hours * 60 * 60 * 1000;
    localStorage.setItem(DISMISSED_PROMPT_KEY, String(until));
  } catch {
    // Ignorado defensivamente
  }
}

// ─── Camada de Serviço de Perfil e Pesagens ───────────────────────────────────

export const profileService = {
  /**
   * Obtém os dados do perfil do atleta.
   */
  async getProfile(): Promise<UserProfile> {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const profile = unwrapApiResponse<UserProfile>(json);
        setCachedProfile(profile);
        return profile;
      }
    } catch {
      // Falha de rede: usa cache se disponível
    }

    const cached = getCachedProfile();
    if (cached) return cached;

    return {
      id: "profile_local",
      heightCm: null,
      currentWeightKg: null,
      name: null,
      birthDate: null,
      gender: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  /**
   * Salva ou atualiza os dados do perfil do atleta.
   */
  async saveProfile(data: Partial<UserProfile>): Promise<UserProfile> {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, "Erro ao salvar dados do perfil");
      throw new Error(message);
    }

    const json = await res.json();
    const updated = unwrapApiResponse<UserProfile>(json);
    setCachedProfile(updated);
    return updated;
  },

  /**
   * Lista o histórico de pesagens do atleta.
   */
  async getWeightHistory(): Promise<WeightRecord[]> {
    try {
      const res = await fetch("/api/profile/weight", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const weights = unwrapApiResponse<WeightRecord[]>(json);
        setCachedWeights(weights);
        return weights;
      }
    } catch {
      // Falha de rede: usa cache se disponível
    }

    return getCachedWeights();
  },

  /**
   * Registra uma nova pesagem corporal.
   */
  async addWeightRecord(
    record: Omit<WeightRecord, "id" | "createdAt"> & { id?: string }
  ): Promise<WeightRecord> {
    const res = await fetch("/api/profile/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, "Erro ao registrar pesagem");
      throw new Error(message);
    }

    const json = await res.json();
    const created = unwrapApiResponse<WeightRecord>(json);

    // Atualiza cache de pesagens e peso do perfil local
    const currentWeights = getCachedWeights();
    setCachedWeights([created, ...currentWeights.filter((w) => w.id !== created.id)]);

    const profile = getCachedProfile();
    if (profile) {
      setCachedProfile({
        ...profile,
        currentWeightKg: created.weightKg,
      });
    }

    return created;
  },

  /**
   * Exclui um registro de pesagem.
   */
  async deleteWeightRecord(id: string): Promise<void> {
    const res = await fetch(`/api/profile/weight/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, "Erro ao excluir pesagem");
      throw new Error(message);
    }

    const remaining = getCachedWeights().filter((w) => w.id !== id);
    setCachedWeights(remaining);

    const profile = getCachedProfile();
    if (profile) {
      setCachedProfile({
        ...profile,
        currentWeightKg: remaining.length > 0 ? remaining[0].weightKg : null,
      });
    }
  },
};
