import {
  IntervalConfig,
  IntervalLimitInfo,
  IntervalSession,
  IntervalStage,
  Kilometers,
  KmPerHour,
  Seconds,
} from "@/types";
import { formatPace } from "@/lib/formatting/time";
import { calcDistanceFromTimeAndSpeed, calcPaceFromSpeed } from "@/lib/math/pace";

interface RawCandidateStage {
  type: "warmup" | "run" | "walk" | "cooldown";
  durationSeconds: Seconds;
  speedKmh: KmPerHour;
  distanceKm: Kilometers;
}

/**
 * Simula uma sessão completa de treino intervalado.
 * Suporta opcionalmente limites de distância (ex: 2.4 km) ou de tempo (ex: 12 min),
 * realizando corte proporcional da última etapa ou descartando recuperações excedentes.
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

  // Validações de limites
  if (config.limitType === "distance") {
    if (config.maxDistanceKm === undefined || config.maxDistanceKm <= 0) {
      throw new Error("O limite de distância deve ser um valor maior que zero.");
    }
  } else if (config.limitType === "time") {
    if (config.maxDurationSeconds === undefined || config.maxDurationSeconds <= 0) {
      throw new Error("O limite de tempo deve ser um valor maior que zero.");
    }
  }

  // 1. Constrói a lista sequencial de etapas candidatas
  const candidateStages: RawCandidateStage[] = [];

  // Aquecimento
  if (config.warmupDurationSeconds > 0 && config.warmupSpeedKmh > 0) {
    const dist = calcDistanceFromTimeAndSpeed(
      config.warmupDurationSeconds,
      config.warmupSpeedKmh
    );
    candidateStages.push({
      type: "warmup",
      durationSeconds: config.warmupDurationSeconds,
      speedKmh: config.warmupSpeedKmh,
      distanceKm: dist,
    });
  }

  // Séries (Corrida + Recuperação)
  for (let rep = 1; rep <= config.repetitions; rep++) {
    const runDist = calcDistanceFromTimeAndSpeed(
      config.runDurationSeconds,
      config.runSpeedKmh
    );
    candidateStages.push({
      type: "run",
      durationSeconds: config.runDurationSeconds,
      speedKmh: config.runSpeedKmh,
      distanceKm: runDist,
    });

    if (config.walkDurationSeconds > 0 && config.walkSpeedKmh > 0) {
      const walkDist = calcDistanceFromTimeAndSpeed(
        config.walkDurationSeconds,
        config.walkSpeedKmh
      );
      candidateStages.push({
        type: "walk",
        durationSeconds: config.walkDurationSeconds,
        speedKmh: config.walkSpeedKmh,
        distanceKm: walkDist,
      });
    }
  }

  // Desaquecimento
  if (config.cooldownDurationSeconds > 0 && config.cooldownSpeedKmh > 0) {
    const cdDist = calcDistanceFromTimeAndSpeed(
      config.cooldownDurationSeconds,
      config.cooldownSpeedKmh
    );
    candidateStages.push({
      type: "cooldown",
      durationSeconds: config.cooldownDurationSeconds,
      speedKmh: config.cooldownSpeedKmh,
      distanceKm: cdDist,
    });
  }

  // 2. Processa etapas respeitando eventuais limites de treino
  const stages: IntervalStage[] = [];
  let currentIndex = 1;
  let totalTimeSeconds: Seconds = 0;
  let totalDistanceKm: Kilometers = 0;

  const limitType = config.limitType || "none";
  let truncatedStageIndex: number | undefined = undefined;
  let stagesRemovedCount = 0;

  for (let i = 0; i < candidateStages.length; i++) {
    const candidate = candidateStages[i];

    // Verificação de Limite de Distância
    if (limitType === "distance" && config.maxDistanceKm && config.maxDistanceKm > 0) {
      const maxDist = config.maxDistanceKm;
      const remainingDist = maxDist - totalDistanceKm;

      if (remainingDist <= 0.0001) {
        // Meta de distância já atingida perfeitamente pela etapa anterior
        stagesRemovedCount = candidateStages.length - i;
        break;
      }

      if (candidate.distanceKm <= remainingDist + 0.0001) {
        // Etapa cabe inteira dentro do limite
        const paceSec = calcPaceFromSpeed(candidate.speedKmh);
        stages.push({
          index: currentIndex++,
          type: candidate.type,
          durationSeconds: candidate.durationSeconds,
          speedKmh: candidate.speedKmh,
          distanceKm: candidate.distanceKm,
          paceFormatted: formatPace(paceSec),
        });
        totalTimeSeconds += candidate.durationSeconds;
        totalDistanceKm += candidate.distanceKm;
      } else {
        // Etapa ultrapassa o limite: corta proporcionalmente no tempo exato restante
        const truncatedDuration = Math.max(
          1,
          Math.round((remainingDist / candidate.speedKmh) * 3600)
        );
        const paceSec = calcPaceFromSpeed(candidate.speedKmh);
        stages.push({
          index: currentIndex++,
          type: candidate.type,
          durationSeconds: truncatedDuration,
          speedKmh: candidate.speedKmh,
          distanceKm: Number(remainingDist.toFixed(3)),
          paceFormatted: formatPace(paceSec),
          isTruncated: true,
        });

        totalTimeSeconds += truncatedDuration;
        totalDistanceKm += Number(remainingDist.toFixed(3));
        truncatedStageIndex = currentIndex - 1;
        stagesRemovedCount = candidateStages.length - (i + 1);
        break;
      }
    }
    // Verificação de Limite de Tempo
    else if (limitType === "time" && config.maxDurationSeconds && config.maxDurationSeconds > 0) {
      const maxTime = config.maxDurationSeconds;
      const remainingTime = maxTime - totalTimeSeconds;

      if (remainingTime <= 0) {
        // Meta de tempo já atingida pela etapa anterior
        stagesRemovedCount = candidateStages.length - i;
        break;
      }

      if (candidate.durationSeconds <= remainingTime) {
        // Etapa cabe inteira
        const paceSec = calcPaceFromSpeed(candidate.speedKmh);
        stages.push({
          index: currentIndex++,
          type: candidate.type,
          durationSeconds: candidate.durationSeconds,
          speedKmh: candidate.speedKmh,
          distanceKm: candidate.distanceKm,
          paceFormatted: formatPace(paceSec),
        });
        totalTimeSeconds += candidate.durationSeconds;
        totalDistanceKm += candidate.distanceKm;
      } else {
        // Etapa cortada no tempo exato restante
        const truncatedDistance = Number(
          calcDistanceFromTimeAndSpeed(remainingTime, candidate.speedKmh).toFixed(3)
        );
        const paceSec = calcPaceFromSpeed(candidate.speedKmh);
        stages.push({
          index: currentIndex++,
          type: candidate.type,
          durationSeconds: remainingTime,
          speedKmh: candidate.speedKmh,
          distanceKm: truncatedDistance,
          paceFormatted: formatPace(paceSec),
          isTruncated: true,
        });

        totalTimeSeconds += remainingTime;
        totalDistanceKm += truncatedDistance;
        truncatedStageIndex = currentIndex - 1;
        stagesRemovedCount = candidateStages.length - (i + 1);
        break;
      }
    }
    // Sem limite
    else {
      const paceSec = calcPaceFromSpeed(candidate.speedKmh);
      stages.push({
        index: currentIndex++,
        type: candidate.type,
        durationSeconds: candidate.durationSeconds,
        speedKmh: candidate.speedKmh,
        distanceKm: candidate.distanceKm,
        paceFormatted: formatPace(paceSec),
      });
      totalTimeSeconds += candidate.durationSeconds;
      totalDistanceKm += candidate.distanceKm;
    }
  }

  // Estatísticas médias consolidadas da sessão
  const averageSpeedKmh: KmPerHour =
    totalTimeSeconds > 0 ? (totalDistanceKm * 3600) / totalTimeSeconds : 0;
  const averagePaceSeconds =
    totalDistanceKm > 0 ? totalTimeSeconds / totalDistanceKm : 0;

  let limitInfo: IntervalLimitInfo | undefined = undefined;
  if (limitType !== "none") {
    limitInfo = {
      type: limitType,
      targetValue:
        limitType === "distance" ? config.maxDistanceKm || 0 : config.maxDurationSeconds || 0,
      truncatedStageIndex,
      stagesRemovedCount: stagesRemovedCount > 0 ? stagesRemovedCount : undefined,
    };
  }

  return {
    totalTimeSeconds,
    totalDistanceKm: Number(totalDistanceKm.toFixed(3)),
    averageSpeedKmh: Number(averageSpeedKmh.toFixed(2)),
    averagePaceSeconds: Math.round(averagePaceSeconds),
    averagePaceFormatted: formatPace(averagePaceSeconds),
    stages,
    limitInfo,
  };
}
