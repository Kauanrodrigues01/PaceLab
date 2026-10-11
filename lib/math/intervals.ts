import {
  IntervalConfig,
  IntervalSession,
  IntervalStage,
  Kilometers,
  KmPerHour,
  Seconds,
} from "@/types";
import { formatPace } from "@/lib/formatting/time";
import { calcDistanceFromTimeAndSpeed, calcPaceFromSpeed } from "@/lib/math/pace";

/**
 * Simula uma sessão completa de treino intervalado.
 * Retorna o resumo total e o detalhamento de cada etapa (aquecimento, tiros de corrida/caminhada, desaquecimento).
 */
export function calcIntervalSession(config: IntervalConfig): IntervalSession {
  if (config.repetitions <= 0 || !Number.isInteger(config.repetitions)) {
    throw new Error("A quantidade de repetições deve ser um número inteiro maior que zero.");
  }
  if (config.runDurationSeconds <= 0 || config.runSpeedKmh <= 0) {
    throw new Error("Duração e velocidade da corrida devem ser maiores que zero.");
  }
  if (config.walkDurationSeconds < 0 || config.walkSpeedKmh < 0) {
    throw new Error("Duração e velocidade da caminhada não podem ser negativas.");
  }

  const stages: IntervalStage[] = [];
  let currentIndex = 1;
  let totalTimeSeconds: Seconds = 0;
  let totalDistanceKm: Kilometers = 0;

  // 1. Aquecimento (se duração > 0)
  if (config.warmupDurationSeconds > 0 && config.warmupSpeedKmh > 0) {
    const dist = calcDistanceFromTimeAndSpeed(
      config.warmupDurationSeconds,
      config.warmupSpeedKmh
    );
    const paceSec = calcPaceFromSpeed(config.warmupSpeedKmh);

    stages.push({
      index: currentIndex++,
      type: "warmup",
      durationSeconds: config.warmupDurationSeconds,
      speedKmh: config.warmupSpeedKmh,
      distanceKm: dist,
      paceFormatted: formatPace(paceSec),
    });

    totalTimeSeconds += config.warmupDurationSeconds;
    totalDistanceKm += dist;
  }

  // 2. Repetições (Corrida + Caminhada)
  for (let rep = 1; rep <= config.repetitions; rep++) {
    // Tiro de corrida
    const runDist = calcDistanceFromTimeAndSpeed(
      config.runDurationSeconds,
      config.runSpeedKmh
    );
    const runPaceSec = calcPaceFromSpeed(config.runSpeedKmh);

    stages.push({
      index: currentIndex++,
      type: "run",
      durationSeconds: config.runDurationSeconds,
      speedKmh: config.runSpeedKmh,
      distanceKm: runDist,
      paceFormatted: formatPace(runPaceSec),
    });

    totalTimeSeconds += config.runDurationSeconds;
    totalDistanceKm += runDist;

    // Recuperação / Caminhada (se configurada)
    if (config.walkDurationSeconds > 0 && config.walkSpeedKmh > 0) {
      const walkDist = calcDistanceFromTimeAndSpeed(
        config.walkDurationSeconds,
        config.walkSpeedKmh
      );
      const walkPaceSec = calcPaceFromSpeed(config.walkSpeedKmh);

      stages.push({
        index: currentIndex++,
        type: "walk",
        durationSeconds: config.walkDurationSeconds,
        speedKmh: config.walkSpeedKmh,
        distanceKm: walkDist,
        paceFormatted: formatPace(walkPaceSec),
      });

      totalTimeSeconds += config.walkDurationSeconds;
      totalDistanceKm += walkDist;
    }
  }

  // 3. Desaquecimento (se duração > 0)
  if (config.cooldownDurationSeconds > 0 && config.cooldownSpeedKmh > 0) {
    const cdDist = calcDistanceFromTimeAndSpeed(
      config.cooldownDurationSeconds,
      config.cooldownSpeedKmh
    );
    const cdPaceSec = calcPaceFromSpeed(config.cooldownSpeedKmh);

    stages.push({
      index: currentIndex++,
      type: "cooldown",
      durationSeconds: config.cooldownDurationSeconds,
      speedKmh: config.cooldownSpeedKmh,
      distanceKm: cdDist,
      paceFormatted: formatPace(cdPaceSec),
    });

    totalTimeSeconds += config.cooldownDurationSeconds;
    totalDistanceKm += cdDist;
  }

  // Estatísticas médias da sessão
  const averageSpeedKmh: KmPerHour = (totalDistanceKm * 3600) / totalTimeSeconds;
  const averagePaceSeconds = totalTimeSeconds / totalDistanceKm;

  return {
    totalTimeSeconds,
    totalDistanceKm,
    averageSpeedKmh,
    averagePaceSeconds,
    averagePaceFormatted: formatPace(averagePaceSeconds),
    stages,
  };
}
