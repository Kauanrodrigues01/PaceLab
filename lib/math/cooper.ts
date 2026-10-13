/**
 * @file cooper.ts
 * @description Motor matemático do Teste de Cooper (12 minutos) para estimativa de VO2 Máx
 * e classificação da capacidade cardiorrespiratória segundo diretrizes do Cooper Institute e ACSM.
 */

export interface CooperClassificationResult {
  distanceMeters: number;
  vo2Max: number;
  vo2MaxFormatted: string;
  classification:
    | "Muito Fraco"
    | "Fraco"
    | "Médio"
    | "Bom"
    | "Muito Bom"
    | "Excelente";
  colorClass: string;
  badgeBgClass: string;
  description: string;
  ageGroupLabel: string;
  genderLabel: string;
}

/**
 * Calcula o VO2 Máx estimado pela fórmula clássica de Cooper para 12 minutos:
 * VO2 Máx (ml/kg/min) = (distância em metros - 504.9) / 44.73
 *
 * @param distanceMeters Distância percorrida em 12 minutos (em metros)
 * @returns VO2 Máx estimado em ml/kg/min (ou 0 se distância <= 504.9m)
 */
export function calculateCooperVo2Max(distanceMeters: number): number {
  if (!distanceMeters || distanceMeters <= 504.9) {
    return 0;
  }
  const vo2 = (distanceMeters - 504.9) / 44.73;
  return Number(vo2.toFixed(1));
}

/**
 * Calcula a idade em anos completos a partir de uma string ISO (YYYY-MM-DD).
 * @param birthDate Data de nascimento no formato ISO
 * @returns Idade em anos completos, ou null se inválida
 */
export function calculateAge(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age >= 0 && age <= 120 ? age : null;
}

/**
 * Classifica a capacidade cardiorrespiratória segundo idade e sexo com base na tabela do Cooper Institute.
 *
 * @param distanceMeters Distância percorrida em 12 minutos (em metros)
 * @param age Idade do atleta em anos
 * @param gender Sexo biológico ('M' | 'F' | 'masculino' | 'feminino')
 */
export function classifyCooperVo2Max(
  distanceMeters: number,
  age?: number | null,
  gender?: string | null
): CooperClassificationResult {
  const vo2 = calculateCooperVo2Max(distanceMeters);
  const normalizedGender =
    gender?.toUpperCase().startsWith("F") ? "F" : "M";
  const userAge = typeof age === "number" && age > 0 ? age : 25;

  let classification: CooperClassificationResult["classification"] = "Médio";
  let ageGroupLabel = "20-29 anos";

  if (normalizedGender === "M") {
    if (userAge < 30) {
      ageGroupLabel = "20-29 anos";
      if (vo2 < 33.0) classification = "Muito Fraco";
      else if (vo2 < 36.5) classification = "Fraco";
      else if (vo2 < 42.5) classification = "Médio";
      else if (vo2 < 46.5) classification = "Bom";
      else if (vo2 < 52.5) classification = "Muito Bom";
      else classification = "Excelente";
    } else if (userAge < 40) {
      ageGroupLabel = "30-39 anos";
      if (vo2 < 31.5) classification = "Muito Fraco";
      else if (vo2 < 35.5) classification = "Fraco";
      else if (vo2 < 41.0) classification = "Médio";
      else if (vo2 < 45.0) classification = "Bom";
      else if (vo2 < 49.5) classification = "Muito Bom";
      else classification = "Excelente";
    } else if (userAge < 50) {
      ageGroupLabel = "40-49 anos";
      if (vo2 < 30.2) classification = "Muito Fraco";
      else if (vo2 < 33.6) classification = "Fraco";
      else if (vo2 < 39.0) classification = "Médio";
      else if (vo2 < 43.8) classification = "Bom";
      else if (vo2 < 48.1) classification = "Muito Bom";
      else classification = "Excelente";
    } else {
      ageGroupLabel = "50+ anos";
      if (vo2 < 26.1) classification = "Muito Fraco";
      else if (vo2 < 31.0) classification = "Fraco";
      else if (vo2 < 35.8) classification = "Médio";
      else if (vo2 < 41.0) classification = "Bom";
      else if (vo2 < 45.4) classification = "Muito Bom";
      else classification = "Excelente";
    }
  } else {
    // Feminino
    if (userAge < 30) {
      ageGroupLabel = "20-29 anos";
      if (vo2 < 23.6) classification = "Muito Fraco";
      else if (vo2 < 29.0) classification = "Fraco";
      else if (vo2 < 33.0) classification = "Médio";
      else if (vo2 < 37.0) classification = "Bom";
      else if (vo2 < 41.1) classification = "Muito Bom";
      else classification = "Excelente";
    } else if (userAge < 40) {
      ageGroupLabel = "30-39 anos";
      if (vo2 < 22.8) classification = "Muito Fraco";
      else if (vo2 < 27.0) classification = "Fraco";
      else if (vo2 < 31.5) classification = "Médio";
      else if (vo2 < 35.7) classification = "Bom";
      else if (vo2 < 40.1) classification = "Muito Bom";
      else classification = "Excelente";
    } else if (userAge < 50) {
      ageGroupLabel = "40-49 anos";
      if (vo2 < 21.0) classification = "Muito Fraco";
      else if (vo2 < 24.5) classification = "Fraco";
      else if (vo2 < 29.0) classification = "Médio";
      else if (vo2 < 32.9) classification = "Bom";
      else if (vo2 < 37.0) classification = "Muito Bom";
      else classification = "Excelente";
    } else {
      ageGroupLabel = "50+ anos";
      if (vo2 < 20.2) classification = "Muito Fraco";
      else if (vo2 < 22.8) classification = "Fraco";
      else if (vo2 < 27.0) classification = "Médio";
      else if (vo2 < 31.5) classification = "Bom";
      else if (vo2 < 35.8) classification = "Muito Bom";
      else classification = "Excelente";
    }
  }

  // Estilização e descrição contextual
  let colorClass = "text-blue-600 dark:text-blue-400";
  let badgeBgClass = "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300";
  let description = "Condicionamento físico satisfatório na média da população.";

  switch (classification) {
    case "Muito Fraco":
      colorClass = "text-rose-600 dark:text-rose-400";
      badgeBgClass = "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300";
      description = "Capacidade aeróbica baixa. Foco em treinos intervalados e volume semanal.";
      break;
    case "Fraco":
      colorClass = "text-orange-600 dark:text-orange-400";
      badgeBgClass = "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300";
      description = "Capacidade aeróbica abaixo do ideal para o TAF. Necessário consistência.";
      break;
    case "Médio":
      colorClass = "text-amber-600 dark:text-amber-400";
      badgeBgClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300";
      description = "Nível regular. Próximo do ponto de corte exigido pela maioria das bancas.";
      break;
    case "Bom":
      colorClass = "text-emerald-600 dark:text-emerald-400";
      badgeBgClass = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300";
      description = "Bom condicionamento físico. Aptidão compatível com aprovação no TAF.";
      break;
    case "Muito Bom":
      colorClass = "text-teal-600 dark:text-teal-400";
      badgeBgClass = "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300";
      description = "Excelente índice de consumo máximo de oxigênio. Zona de segurança garantida.";
      break;
    case "Excelente":
      colorClass = "text-indigo-600 dark:text-indigo-400";
      badgeBgClass = "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300";
      description = "Desempenho de atleta! Capacidade cardiorrespiratória acima do padrão dos editais.";
      break;
  }

  return {
    distanceMeters,
    vo2Max: vo2,
    vo2MaxFormatted: `${vo2.toFixed(1)} ml/kg/min`,
    classification,
    colorClass,
    badgeBgClass,
    description,
    ageGroupLabel,
    genderLabel: normalizedGender === "F" ? "Feminino" : "Masculino",
  };
}
