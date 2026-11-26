import {
  TafAttempt,
  TrainingSession,
  PeriodMetrics,
  PeriodComparisonResult,
  WeeklyVolume,
  MonthlyVolume,
} from "@/types";
import { formatPace } from "@/lib/formatting/time";
import {
  getFortalezaMonthKey,
  getFortalezaWeekInfo,
} from "@/lib/formatting/date";

/**
 * Converte data de forma segura e imune a distorções de fuso horário (ex: UTC-3 de Fortaleza).
 * Strings como "YYYY-MM-DD" são interpretadas ao meio-dia de Fortaleza (15:00Z).
 */
export function parseSafeDate(dateInput: string | Date): Date | null {
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  if (!dateInput || typeof dateInput !== "string") return null;

  const trimmed = dateInput.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    const utcCheck = new Date(Date.UTC(year, month - 1, day, 15, 0, 0));
    if (
      utcCheck.getUTCFullYear() !== year ||
      utcCheck.getUTCMonth() !== month - 1 ||
      utcCheck.getUTCDate() !== day
    ) {
      return null;
    }
    return utcCheck;
  }

  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Ordena tentativas cronologicamente pela data do teste (mais antiga para mais recente).
 */
export function sortAttemptsChronological(attempts: TafAttempt[]): TafAttempt[] {
  return [...attempts].sort((a, b) => {
    const da = parseSafeDate(a.testDate)?.getTime() ?? 0;
    const db = parseSafeDate(b.testDate)?.getTime() ?? 0;
    return da - db;
  });
}

/**
 * Processa uma lista de tentativas de TAF calculando:
 * - isPersonalRecord: Se foi recorde pessoal na data em que ocorreu para aquela duração específica.
 * - deltaPreviousMeters: Evolução em metros em relação à tentativa anterior de mesma duração.
 * - deficitTargetMeters: Distância faltante para a meta estipulada (positivo = falta; negativo = superou).
 *
 * REGRA DE OURO: Apenas testes com a MESMA targetDurationSeconds (ex: 720s) disputam o mesmo recorde!
 */
export function processTafAttempts(
  attempts: TafAttempt[],
  targetDistanceMeters = 2300
): TafAttempt[] {
  if (!attempts || attempts.length === 0) return [];

  const sorted = sortAttemptsChronological(attempts);
  const runningBestsByDuration: Record<number, number> = {};
  const previousAttemptByDuration: Record<number, TafAttempt> = {};

  const processedChronological = sorted.map((att) => {
    const duration = att.targetDurationSeconds || 720;
    const currentDistance = att.distanceMeters;

    // 1. Delta em relação à tentativa anterior de mesma duração
    const previous = previousAttemptByDuration[duration];
    const deltaPreviousMeters =
      previous !== undefined ? currentDistance - previous.distanceMeters : null;

    // 2. É recorde pessoal no momento em que foi realizado?
    const currentBest = runningBestsByDuration[duration];
    const isPersonalRecord =
      currentBest === undefined || currentDistance > currentBest;

    if (isPersonalRecord) {
      runningBestsByDuration[duration] = currentDistance;
    }

    // Atualiza a última tentativa dessa duração
    previousAttemptByDuration[duration] = att;

    // 3. Déficit para a meta
    const deficitTargetMeters = targetDistanceMeters - currentDistance;

    return {
      ...att,
      isPersonalRecord,
      deltaPreviousMeters,
      deficitTargetMeters,
    };
  });

  // Retorna na ordem de exibição usual (mais recente primeiro)
  return processedChronological.sort((a, b) => {
    const da = parseSafeDate(a.testDate)?.getTime() ?? 0;
    const db = parseSafeDate(b.testDate)?.getTime() ?? 0;
    return db - da;
  });
}

/**
 * Retorna o Recorde Pessoal absoluto para uma duração específica (padrão 720s / 12 min).
 */
export function getPersonalRecord(
  attempts: TafAttempt[],
  targetDurationSeconds = 720
): TafAttempt | null {
  const eligible = attempts.filter(
    (a) => (a.targetDurationSeconds || 720) === targetDurationSeconds
  );

  if (eligible.length === 0) return null;

  return eligible.reduce((best, curr) =>
    curr.distanceMeters > best.distanceMeters ? curr : best
  );
}

/**
 * Calcula o pace ponderado pela distância para evitar distorções de médias aritméticas.
 * Tempo total / Distância total
 */
export function calculateWeightedAveragePace(
  items: { distanceKm: number; paceSeconds: number }[]
): {
  averagePaceSeconds: number;
  averagePaceFormatted: string;
  averageSpeedKmh: number;
} {
  const valid = items.filter((i) => i.distanceKm > 0 && i.paceSeconds > 0);
  if (valid.length === 0) {
    return {
      averagePaceSeconds: 0,
      averagePaceFormatted: "0:00",
      averageSpeedKmh: 0,
    };
  }

  let totalDistKm = 0;
  let totalTimeSeconds = 0;

  for (const item of valid) {
    totalDistKm += item.distanceKm;
    totalTimeSeconds += item.distanceKm * item.paceSeconds;
  }

  const averagePaceSeconds = totalTimeSeconds / totalDistKm;
  const averageSpeedKmh =
    totalTimeSeconds > 0 ? (totalDistKm * 3600) / totalTimeSeconds : 0;

  return {
    averagePaceSeconds,
    averagePaceFormatted: formatPace(averagePaceSeconds),
    averageSpeedKmh,
  };
}

/**
 * Agrupa treinos e testes de TAF por semana do calendário (Segunda a Domingo).
 */
export function getWeeklyVolume(
  trainings: TrainingSession[],
  attempts: TafAttempt[] = []
): WeeklyVolume[] {
  type WeekAccumulator = {
    weekStart: Date;
    weekEnd: Date;
    weekRangeLabel: string;
    distanceKm: number;
    sessionsCount: number;
  };

  const weekMap = new Map<string, WeekAccumulator>();

  const accumulateWeek = (dateInput: string, distanceKm: number) => {
    const weekInfo = getFortalezaWeekInfo(dateInput);
    if (!weekInfo) return;

    const current = weekMap.get(weekInfo.weekKey) || {
      weekStart: new Date(weekInfo.weekStartIso),
      weekEnd: new Date(weekInfo.weekEndIso),
      distanceKm: 0,
      sessionsCount: 0,
      weekRangeLabel: weekInfo.weekRangeLabel,
    };

    current.distanceKm += distanceKm;
    current.sessionsCount += 1;
    weekMap.set(weekInfo.weekKey, current);
  };

  // 1. Processa sessões de treino
  for (const t of trainings) {
    accumulateWeek(t.sessionDate, t.distanceKm || 0);
  }

  // 2. Processa testes de TAF (converte metros em km)
  for (const a of attempts) {
    accumulateWeek(a.testDate, (a.distanceMeters || 0) / 1000);
  }

  const sortedKeys = Array.from(weekMap.keys()).sort();

  return sortedKeys.map((key) => {
    const item = weekMap.get(key)!;
    return {
      weekLabel: item.weekRangeLabel,
      weekStart: item.weekStart.toISOString(),
      weekEnd: item.weekEnd.toISOString(),
      distanceKm: Number(item.distanceKm.toFixed(2)),
      sessionsCount: item.sessionsCount,
    };
  });
}

/**
 * Agrupa treinos e testes de TAF por mês do calendário.
 */
export function getMonthlyVolume(
  trainings: TrainingSession[],
  attempts: TafAttempt[] = []
): MonthlyVolume[] {
  const monthMap = new Map<
    string,
    { distanceKm: number; sessionsCount: number }
  >();

  const monthNames = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  for (const t of trainings) {
    const key = getFortalezaMonthKey(t.sessionDate);
    if (!key) continue;
    const curr = monthMap.get(key) || { distanceKm: 0, sessionsCount: 0 };
    curr.distanceKm += t.distanceKm || 0;
    curr.sessionsCount += 1;
    monthMap.set(key, curr);
  }

  for (const a of attempts) {
    const key = getFortalezaMonthKey(a.testDate);
    if (!key) continue;
    const curr = monthMap.get(key) || { distanceKm: 0, sessionsCount: 0 };
    curr.distanceKm += (a.distanceMeters || 0) / 1000;
    curr.sessionsCount += 1;
    monthMap.set(key, curr);
  }

  const sortedKeys = Array.from(monthMap.keys()).sort();

  return sortedKeys.map((key) => {
    const [year, monthStr] = key.split("-");
    const monthIndex = Number(monthStr) - 1;
    const item = monthMap.get(key)!;

    return {
      monthKey: key,
      monthLabel: `${monthNames[monthIndex]}/${year.slice(2)}`,
      distanceKm: Number(item.distanceKm.toFixed(2)),
      sessionsCount: item.sessionsCount,
    };
  });
}

/**
 * Gera os dados de evolução histórica do Recorde Pessoal (Step-Line para o Gráfico E).
 * Mostra cada tentativa e qual era o recorde histórico acumulado até aquele momento.
 */
export function getRecordEvolutionProgression(
  attempts: TafAttempt[],
  targetDurationSeconds = 720
): {
  date: string;
  attemptDistance: number;
  recordDistance: number;
  isNewRecord: boolean;
}[] {
  const filtered = attempts.filter(
    (a) => (a.targetDurationSeconds || 720) === targetDurationSeconds
  );
  if (filtered.length === 0) return [];

  const sorted = sortAttemptsChronological(filtered);
  let currentMax = 0;

  return sorted.map((att) => {
    const isNew = att.distanceMeters > currentMax;
    if (isNew) {
      currentMax = att.distanceMeters;
    }

    return {
      date: att.testDate,
      attemptDistance: att.distanceMeters,
      recordDistance: currentMax,
      isNewRecord: isNew,
    };
  });
}

/**
 * Calcula métricas consolidadas para um período específico de datas.
 */
export function calculatePeriodMetrics({
  startDate,
  endDate,
  trainings,
  attempts,
  targetDurationSeconds = 720,
}: {
  startDate: string;
  endDate: string;
  trainings: TrainingSession[];
  attempts: TafAttempt[];
  targetDurationSeconds?: number;
}): PeriodMetrics {
  const start = startDate.includes("T")
    ? (parseSafeDate(startDate)?.getTime() ?? 0)
    : /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())
      ? new Date(`${startDate.trim()}T00:00:00.000-03:00`).getTime()
      : (parseSafeDate(startDate)?.getTime() ?? 0);

  const end = endDate.includes("T")
    ? (parseSafeDate(endDate)?.getTime() ?? 0)
    : /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
      ? new Date(`${endDate.trim()}T23:59:59.999-03:00`).getTime()
      : (parseSafeDate(endDate)?.getTime() ?? 0);

  // Filtra treinos
  const periodTrainings = trainings.filter((t) => {
    const d = parseSafeDate(t.sessionDate);
    if (!d) return false;
    const time = d.getTime();
    return time >= start && time <= end;
  });

  // Filtra tentativas
  const periodAttempts = attempts.filter((a) => {
    const d = parseSafeDate(a.testDate);
    if (!d) return false;
    const time = d.getTime();
    return time >= start && time <= end;
  });

  let totalDistanceKm = 0;
  let totalDurationSeconds = 0;
  let rpeSum = 0;
  let rpeCount = 0;

  for (const t of periodTrainings) {
    totalDistanceKm += t.distanceKm || 0;
    totalDurationSeconds += t.durationSeconds || 0;
    if (t.perceivedEffort !== null && t.perceivedEffort !== undefined) {
      rpeSum += t.perceivedEffort;
      rpeCount += 1;
    }
  }

  for (const a of periodAttempts) {
    totalDistanceKm += (a.distanceMeters || 0) / 1000;
    totalDurationSeconds += a.actualDurationSeconds || 0;
  }

  const totalSessions = periodTrainings.length + periodAttempts.length;

  const averagePaceSeconds =
    totalDistanceKm > 0 ? totalDurationSeconds / totalDistanceKm : 0;
  const averageSpeedKmh =
    totalDurationSeconds > 0 ? (totalDistanceKm * 3600) / totalDurationSeconds : 0;

  // Melhor TAF de mesma duração no período
  const periodTafsSameDuration = periodAttempts.filter(
    (a) => (a.targetDurationSeconds || 720) === targetDurationSeconds
  );

  const bestTafDistanceMeters =
    periodTafsSameDuration.length > 0
      ? Math.max(...periodTafsSameDuration.map((a) => a.distanceMeters))
      : null;

  const averageRpe = rpeCount > 0 ? Number((rpeSum / rpeCount).toFixed(1)) : null;

  return {
    startDate,
    endDate,
    totalSessions,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    totalDurationSeconds,
    averagePaceSeconds,
    averagePaceFormatted:
      averagePaceSeconds > 0 ? formatPace(averagePaceSeconds) : "0:00",
    averageSpeedKmh: Number(averageSpeedKmh.toFixed(2)),
    tafTestsCount: periodAttempts.length,
    bestTafDistanceMeters,
    averageRpe,
    hasLowSampleWarning: totalSessions < 3,
  };
}

/**
 * Compara dois períodos cronológicos (Período A vs Período B) e gera deltas e sumário estatístico.
 */
export function comparePeriods(
  periodAConfig: { startDate: string; endDate: string },
  periodBConfig: { startDate: string; endDate: string },
  allTrainings: TrainingSession[],
  allAttempts: TafAttempt[],
  targetDurationSeconds = 720
): PeriodComparisonResult {
  const periodA = calculatePeriodMetrics({
    ...periodAConfig,
    trainings: allTrainings,
    attempts: allAttempts,
    targetDurationSeconds,
  });

  const periodB = calculatePeriodMetrics({
    ...periodBConfig,
    trainings: allTrainings,
    attempts: allAttempts,
    targetDurationSeconds,
  });

  const deltaDistanceKm = Number(
    (periodB.totalDistanceKm - periodA.totalDistanceKm).toFixed(2)
  );

  const deltaDistancePercent =
    periodA.totalDistanceKm > 0
      ? Number(
          (
            ((periodB.totalDistanceKm - periodA.totalDistanceKm) /
              periodA.totalDistanceKm) *
            100
          ).toFixed(1)
        )
      : 0;

  // Delta de pace: negativo significa que Período B foi mais rápido (melhor)
  const deltaPaceSeconds = periodB.averagePaceSeconds - periodA.averagePaceSeconds;

  const deltaTafDistanceMeters =
    periodB.bestTafDistanceMeters !== null &&
    periodA.bestTafDistanceMeters !== null
      ? periodB.bestTafDistanceMeters - periodA.bestTafDistanceMeters
      : null;

  // Geração de sumário textual explicativo
  const summaryParts: string[] = [];

  if (deltaDistanceKm > 0) {
    summaryParts.push(
      `O volume aumentou em ${deltaDistanceKm} km (+${deltaDistancePercent}%).`
    );
  } else if (deltaDistanceKm < 0) {
    summaryParts.push(
      `O volume reduziu em ${Math.abs(deltaDistanceKm)} km (${deltaDistancePercent}%).`
    );
  } else {
    summaryParts.push("O volume total de quilometragem foi idêntico.");
  }

  if (deltaPaceSeconds < -1) {
    summaryParts.push(
      `O ritmo médio evoluiu, ficando ${Math.round(
        Math.abs(deltaPaceSeconds)
      )}s/km mais veloz.`
    );
  } else if (deltaPaceSeconds > 1) {
    summaryParts.push(
      `O ritmo médio desacelerou em ${Math.round(deltaPaceSeconds)}s/km.`
    );
  } else {
    summaryParts.push("O ritmo médio permaneceu estável.");
  }

  if (deltaTafDistanceMeters !== null) {
    if (deltaTafDistanceMeters > 0) {
      summaryParts.push(
        `No simulado de 12 min, o melhor teste melhorou em +${deltaTafDistanceMeters} metros!`
      );
    } else if (deltaTafDistanceMeters < 0) {
      summaryParts.push(
        `O melhor teste de 12 min registrou ${Math.abs(
          deltaTafDistanceMeters
        )} metros a menos.`
      );
    } else {
      summaryParts.push("A melhor marca nos testes de 12 min se manteve igual.");
    }
  }

  if (periodA.hasLowSampleWarning || periodB.hasLowSampleWarning) {
    summaryParts.push(
      "⚠️ Atenção: amostragem reduzida (menos de 3 treinos em um dos períodos)."
    );
  }

  return {
    periodA,
    periodB,
    deltaDistanceKm,
    deltaDistancePercent,
    deltaPaceSeconds,
    deltaTafDistanceMeters,
    summaryText: summaryParts.join(" "),
  };
}
