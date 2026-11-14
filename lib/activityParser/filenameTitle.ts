import { sanitizeActivityText } from "../gpx/xml";

/**
 * Extrai e normaliza o título sugerido de um treino a partir do nome do arquivo `.FIT` ou `.GPX`.
 * Ex.: `"Caminhada_leve.fit"` -> `"Caminhada leve"`.
 * Ignora nomes puramente numéricos (IDs brutos de exportação, como `"1234567890.fit"`).
 */
export function extractActivityTitleFromFilename(
  fileName: string | null | undefined
): string | null {
  if (typeof fileName !== "string") {
    return null;
  }

  const trimmed = fileName.trim();
  if (!trimmed) {
    return null;
  }

  // Sanitiza antes para remover blocos HTML/scripts (incluindo "</script>") antes de isolar o nome base
  const preSanitized = sanitizeActivityText(trimmed, trimmed.length);
  if (!preSanitized) {
    return null;
  }

  // Remove eventual caminho Windows/Unix e mantém apenas o nome base
  const baseName = preSanitized.split(/[/\\]/).pop()?.trim() ?? "";
  if (!baseName) {
    return null;
  }

  // Remove apenas a extensão final .fit ou .gpx (case-insensitive)
  const withoutExtension = baseName.replace(/\.(fit|gpx)$/i, "");
  if (!withoutExtension) {
    return null;
  }

  // Substitui underscores por espaço e colapsa espaços consecutivos
  const normalizedSpaces = withoutExtension.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const sanitized = sanitizeActivityText(normalizedSpaces, 300);
  if (!sanitized) {
    return null;
  }

  // Proteção contra IDs numéricos puros (ex.: 1234567890.fit)
  // Ignora nomes compostos apenas por dígitos e espaços (ex.: "1234567890.fit" ou "123_456.fit")
  if (/^[\d\s]+$/.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Seleciona o primeiro título válido extraído de uma lista de nomes de arquivos enviados,
 * priorizando arquivos `.gpx` antes de `.fit` quando ambos estiverem presentes.
 */
export function pickPreferredActivityTitleFromFileNames(
  fileNames: readonly (string | null | undefined)[]
): string | null {
  const ordered = [
    ...fileNames.filter(
      (name): name is string =>
        typeof name === "string" && name.trim().toLowerCase().endsWith(".gpx")
    ),
    ...fileNames.filter(
      (name): name is string =>
        typeof name === "string" && !name.trim().toLowerCase().endsWith(".gpx")
    ),
  ];

  for (const name of ordered) {
    const candidate = extractActivityTitleFromFilename(name);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}
