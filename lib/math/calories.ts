import {
  ActivityType,
  CalorieResult,
  IntervalCalorieResult,
  IntervalCalorieSegment,
  IntervalSession,
  Seconds,
  Kilometers,
  KmPerHour,
} from "@/types";

// ─── Tabela Oficial do Compêndio de Atividades Físicas de 2024 ────────────────
// Referência: Herrmann SD, Willis EA, Ainsworth BE, et al.
// 2024 Adult Compendium of Physical Activities.
// Int J Behav Nutr Phys Act, 2024.

export interface CompendiumNode {
  code: string;
  speedKmh: number;
  met: number;
  description: string;
}

export const COMPENDIUM_WALKING_NODES: CompendiumNode[] = [
  { code: "17151", speedKmh: 3.2, met: 2.0, description: "Caminhada lenta em terreno plano (< 3.2 km/h)" },
  { code: "17170", speedKmh: 4.0, met: 2.8, description: "Caminhada em ritmo recreativo (4.0 km/h)" },
  { code: "17190", speedKmh: 4.8, met: 3.5, description: "Caminhada moderada (4.8 km/h)" },
  { code: "17200", speedKmh: 5.6, met: 4.3, description: "Caminhada rápida / ritmo firme (5.6 km/h)" },
  { code: "17220", speedKmh: 6.4, met: 5.0, description: "Caminhada muito rápida / vigorosa (6.4 km/h)" },
  { code: "17230", speedKmh: 7.5, met: 6.8, description: "Marcha esportiva / caminhada atlética (7.5 km/h)" },
];

export const COMPENDIUM_RUNNING_NODES: CompendiumNode[] = [
  { code: "12020", speedKmh: 6.0, met: 6.0, description: "Jogging geral / trote muito leve (< 7.0 km/h)" },
  { code: "12025", speedKmh: 7.0, met: 7.0, description: "Trote leve contínuo (7.0 km/h)" },
  { code: "12030", speedKmh: 8.0, met: 8.3, description: "Corrida a 8.0 km/h (pace 7:30 /km)" },
  { code: "12040", speedKmh: 8.4, met: 9.0, description: "Corrida a 8.4 km/h (pace 7:09 /km)" },
  { code: "12050", speedKmh: 9.7, met: 9.8, description: "Corrida a 9.7 km/h (pace 6:11 /km)" },
  { code: "12060", speedKmh: 10.8, met: 10.5, description: "Corrida a 10.8 km/h (pace 5:33 /km)" },
  { code: "12070", speedKmh: 11.3, met: 11.0, description: "Corrida a 11.3 km/h (pace 5:19 /km)" },
  { code: "12080", speedKmh: 12.1, met: 11.5, description: "Corrida a 12.1 km/h (pace 4:58 /km)" },
  { code: "12090", speedKmh: 12.9, met: 11.8, description: "Corrida a 12.9 km/h (pace 4:39 /km)" },
  { code: "12100", speedKmh: 13.8, met: 12.3, description: "Corrida a 13.8 km/h (pace 4:21 /km)" },
  { code: "12110", speedKmh: 14.5, met: 12.8, description: "Corrida a 14.5 km/h (pace 4:08 /km)" },
  { code: "12120", speedKmh: 16.1, met: 14.5, description: "Corrida a 16.1 km/h (pace 3:44 /km)" },
  { code: "12130", speedKmh: 17.7, met: 16.0, description: "Corrida a 17.7 km/h (pace 3:23 /km)" },
  { code: "12140", speedKmh: 19.3, met: 19.0, description: "Corrida a ≥ 19.3 km/h (pace ≤ 3:07 /km)" },
];

export const COMPENDIUM_REST_NODE: CompendiumNode = {
  code: "09040",
  speedKmh: 0,
  met: 1.3,
  description: "Repouso em pé / descanso estático entre tiros",
};

/**
 * Realiza interpolação linear contínua entre dois nós conhecidos da tabela de MET
 */
function interpolateMet(nodes: CompendiumNode[], speed: number): { met: number; code: string; description: string } {
  if (nodes.length === 0) {
    return { met: 1.0, code: "00000", description: "Atividade não identificada" };
  }

  // Se velocidade for menor ou igual ao primeiro nó
  if (speed <= nodes[0].speedKmh) {
    return {
      met: nodes[0].met,
      code: nodes[0].code,
      description: nodes[0].description,
    };
  }

  // Se velocidade for maior ou igual ao último nó
  const lastNode = nodes[nodes.length - 1];
  if (speed >= lastNode.speedKmh) {
    return {
      met: lastNode.met,
      code: lastNode.code,
      description: lastNode.description,
    };
  }

  // Busca os dois nós adjacentes para interpolação linear
  for (let i = 0; i < nodes.length - 1; i++) {
    const current = nodes[i];
    const next = nodes[i + 1];

    if (speed >= current.speedKmh && speed <= next.speedKmh) {
      const ratio = (speed - current.speedKmh) / (next.speedKmh - current.speedKmh);
      const interpolated = current.met + ratio * (next.met - current.met);
      const roundedMet = Number(interpolated.toFixed(2));

      return {
        met: roundedMet,
        code: ratio >= 0.5 ? next.code : current.code,
        description: `${current.description} / ${next.description} (${speed.toFixed(1)} km/h)`,
      };
    }
  }

  return { met: lastNode.met, code: lastNode.code, description: lastNode.description };
}

/**
 * Obtém o valor de MET, código de referência e descrição para uma dada velocidade e modalidade.
 */
export function getMetForSpeedAndActivity(
  activityType: ActivityType | "repouso",
  speedKmh: number
): { met: number; code: string; description: string } {
  if (activityType === "repouso" || speedKmh <= 0.5) {
    return {
      met: COMPENDIUM_REST_NODE.met,
      code: COMPENDIUM_REST_NODE.code,
      description: COMPENDIUM_REST_NODE.description,
    };
  }

  if (activityType === "caminhada") {
    return interpolateMet(COMPENDIUM_WALKING_NODES, speedKmh);
  }

  // Corrida contínua ou intervalada
  return interpolateMet(COMPENDIUM_RUNNING_NODES, speedKmh);
}

export interface CalcCaloriesParams {
  weightKg: number;
  durationSeconds: Seconds;
  met: number;
}

/**
 * Calcula calorias totais e calorias ativas segundo o Compêndio de Atividades Físicas de 2024.
 *
 * Fórmulas:
 * Calorias Totais = (MET * 3.5 * pesoKg * duracaoMin) / 200
 * Calorias Ativas = ((MET - 1) * 3.5 * pesoKg * duracaoMin) / 200
 */
export function calcCalories({ weightKg, durationSeconds, met }: CalcCaloriesParams): {
  totalCalories: number;
  activeCalories: number;
} {
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || met <= 0) {
    return { totalCalories: 0, activeCalories: 0 };
  }

  const durationMinutes = durationSeconds / 60;

  // Total (bruto)
  const total = (met * 3.5 * weightKg * durationMinutes) / 200;

  // Ativo (adicional ao repouso basal, MET - 1)
  const activeMet = Math.max(0, met - 1);
  const active = (activeMet * 3.5 * weightKg * durationMinutes) / 200;

  return {
    totalCalories: Number(total.toFixed(1)),
    activeCalories: Number(active.toFixed(1)),
  };
}

export interface EstimateTrainingCaloriesParams {
  activityType: ActivityType;
  speedKmh: KmPerHour;
  durationSeconds: Seconds;
  distanceKm?: Kilometers;
  weightKg: number;
}

/**
 * Estima o gasto calórico completo de uma sessão de corrida ou caminhada contínua.
 */
export function estimateTrainingCalories({
  activityType,
  speedKmh,
  durationSeconds,
  weightKg,
}: EstimateTrainingCaloriesParams): CalorieResult {
  const effectiveSpeed = speedKmh > 0 ? speedKmh : 0;
  const { met, code, description } = getMetForSpeedAndActivity(activityType, effectiveSpeed);
  const { totalCalories, activeCalories } = calcCalories({ weightKg, durationSeconds, met });

  return {
    totalCalories,
    activeCalories,
    metValue: met,
    compendiumCode: code,
    compendiumDescription: description,
    method: "compendium_2024_met",
    version: "2024.1",
    weightUsedKg: weightKg,
    durationMinutes: Number((durationSeconds / 60).toFixed(1)),
  };
}

/**
 * Estima o gasto calórico segmentado para treinos intervalados (tiros, recuperações e desaquecimento).
 */
export function calcIntervalCalories(session: IntervalSession, weightKg: number): IntervalCalorieResult {
  if (!session || !session.stages || session.stages.length === 0 || weightKg <= 0) {
    return {
      totalCalories: 0,
      activeCalories: 0,
      metValue: 1.0,
      compendiumCode: "00000",
      compendiumDescription: "Sessão sem etapas válidas",
      method: "compendium_2024_met",
      version: "2024.1",
      weightUsedKg: weightKg,
      durationMinutes: 0,
      segments: [],
      isSegmented: true,
    };
  }

  let totalCaloriesAcc = 0;
  let activeCaloriesAcc = 0;
  let weightedMetAcc = 0;
  let totalValidSeconds = 0;

  const segments: IntervalCalorieSegment[] = session.stages.map((stage) => {
    let actType: ActivityType | "repouso" = "corrida_continua";

    if (stage.type === "walk") {
      actType = stage.speedKmh > 0 ? "caminhada" : "repouso";
    } else if (stage.type === "warmup" || stage.type === "cooldown") {
      actType = stage.speedKmh >= 7.5 ? "corrida_continua" : "caminhada";
    } else {
      actType = "corrida_continua"; // Tiro ("run")
    }

    const { met, code } = getMetForSpeedAndActivity(actType, stage.speedKmh);
    const { totalCalories, activeCalories } = calcCalories({
      weightKg,
      durationSeconds: stage.durationSeconds,
      met,
    });

    totalCaloriesAcc += totalCalories;
    activeCaloriesAcc += activeCalories;
    weightedMetAcc += met * stage.durationSeconds;
    totalValidSeconds += stage.durationSeconds;

    return {
      stageIndex: stage.index,
      stageType: stage.type,
      durationSeconds: stage.durationSeconds,
      speedKmh: stage.speedKmh,
      metValue: met,
      compendiumCode: code,
      activeCalories,
      totalCalories,
    };
  });

  const avgMet = totalValidSeconds > 0 ? Number((weightedMetAcc / totalValidSeconds).toFixed(2)) : 1.0;

  return {
    totalCalories: Number(totalCaloriesAcc.toFixed(1)),
    activeCalories: Number(activeCaloriesAcc.toFixed(1)),
    metValue: avgMet,
    compendiumCode: "12000-MULTISEG",
    compendiumDescription: `Sessão intervalada (${session.stages.length} etapas ponderadas)`,
    method: "compendium_2024_met",
    version: "2024.1",
    weightUsedKg: weightKg,
    durationMinutes: Number((session.totalTimeSeconds / 60).toFixed(1)),
    segments,
    isSegmented: true,
  };
}
