import type { ActivityParsePreview } from "@/types";
import { generateClientRecordId } from "@/lib/sheetsSyncUi";
import { pickPreferredActivityTitleFromFileNames } from "./filenameTitle";

export const MAX_BATCH_ACTIVITY_FILES = 50;
export const MAX_BATCH_ACTIVITY_FILE_BYTES = 4 * 1024 * 1024; // 4 MB por arquivo

export type BatchImportMode = "single" | "batch";

export type BatchRejectedFileReason =
  | "INVALID_EXTENSION"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "BATCH_LIMIT_EXCEEDED";

export interface BatchRejectedFile {
  file: File;
  fileName: string;
  code: BatchRejectedFileReason;
  message: string;
}

export interface BatchActivityGroup {
  id: string;
  files: File[];
  kinds: Array<"fit" | "gpx">;
  baseNameNormalized: string;
  displayFileNames: string;
  defaultTitle: string;
  signatureKeys: string[];
  isMergedPair: boolean;
}

export interface BatchGroupingOptions {
  existingKeys?: ReadonlySet<string>;
  currentGroupCount?: number;
  maxGroups?: number;
}

export interface BatchGroupingResult {
  groups: BatchActivityGroup[];
  rejectedFiles: BatchRejectedFile[];
  ignoredDuplicateFilesCount: number;
  knownFileKeys: Set<string>;
}

/**
 * Identifica a extensão suportada de um arquivo pelo nome (`.fit` ou `.gpx`).
 */
export function getActivityFileExtension(fileName: string): "fit" | "gpx" | null {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".fit")) return "fit";
  if (lower.endsWith(".gpx")) return "gpx";
  return null;
}

/**
 * Gera chave de assinatura determinística no cliente para evitar enfileirar o mesmo arquivo duas vezes.
 */
export function getBatchFileSignature(file: File): string {
  const normalizedName = file.name.trim().toLowerCase();
  const modified = typeof file.lastModified === "number" ? file.lastModified : 0;
  return `${normalizedName}::${file.size}::${modified}`;
}

/**
 * Normaliza o nome-base de um arquivo sem extensão para pareamento automático `.fit + .gpx`.
 */
export function normalizeBatchBaseName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "";
  const fileOnly = trimmed.split(/[/\\]/).pop()?.trim() ?? "";
  return fileOnly.replace(/\.(fit|gpx)$/i, "").trim().toLowerCase();
}

/**
 * Determina se uma seleção de arquivos deve alternar automaticamente a UI para Modo Em Massa.
 */
export function shouldAutoSwitchToBatchImport(
  files: readonly File[],
  currentMode: BatchImportMode
): boolean {
  if (currentMode === "batch") return true;
  if (files.length >= 3) return true;

  let fitCount = 0;
  let gpxCount = 0;
  for (const file of files) {
    const ext = getActivityFileExtension(file.name);
    if (ext === "fit") fitCount++;
    else if (ext === "gpx") gpxCount++;
  }

  return fitCount >= 2 || gpxCount >= 2;
}

function buildStandaloneGroup(
  file: File,
  ext: "fit" | "gpx",
  signatureKey: string,
  baseNameNormalized: string
): BatchActivityGroup {
  const defaultTitle = pickPreferredActivityTitleFromFileNames([file.name]) ?? "";
  return {
    id: generateClientRecordId("grp"),
    files: [file],
    kinds: [ext],
    baseNameNormalized,
    displayFileNames: file.name,
    defaultTitle,
    signatureKeys: [signatureKey],
    isMergedPair: false,
  };
}

function sortFilesFitFirst(
  files: File[],
  kinds: Array<"fit" | "gpx">
): { files: File[]; kinds: Array<"fit" | "gpx"> } {
  if (files.length !== 2 || kinds[0] === "fit") {
    return { files, kinds };
  }
  return {
    files: [files[1], files[0]],
    kinds: [kinds[1], kinds[0]],
  };
}

/**
 * Valida, deduplica por assinatura local e agrupa arquivos `.FIT` e `.GPX` homônimos em itens de lote.
 * Arquivos inválidos, vazios ou acima de 4 MB são isolados em `rejectedFiles` sem abortar o restante.
 */
export function groupActivityFilesForBatch(
  files: readonly File[],
  existingKeysOrOptions?: ReadonlySet<string> | BatchGroupingOptions
): BatchGroupingResult {
  const options: BatchGroupingOptions =
    existingKeysOrOptions &&
    typeof (existingKeysOrOptions as ReadonlySet<string>).has === "function"
      ? { existingKeys: existingKeysOrOptions as ReadonlySet<string> }
      : ((existingKeysOrOptions as BatchGroupingOptions | undefined) ?? {});

  const knownFileKeys = new Set<string>(options.existingKeys ?? []);
  const currentGroupCount = Math.max(0, options.currentGroupCount ?? 0);
  const maxGroups = Math.max(1, options.maxGroups ?? MAX_BATCH_ACTIVITY_FILES);

  const groups: BatchActivityGroup[] = [];
  const rejectedFiles: BatchRejectedFile[] = [];
  let ignoredDuplicateFilesCount = 0;

  for (const file of files) {
    const sig = getBatchFileSignature(file);
    if (knownFileKeys.has(sig)) {
      ignoredDuplicateFilesCount++;
      continue;
    }

    const ext = getActivityFileExtension(file.name);
    if (!ext) {
      rejectedFiles.push({
        file,
        fileName: file.name,
        code: "INVALID_EXTENSION",
        message: `Formato não suportado para "${file.name}". Envie apenas arquivos .FIT ou .GPX.`,
      });
      continue;
    }

    if (file.size === 0) {
      rejectedFiles.push({
        file,
        fileName: file.name,
        code: "EMPTY_FILE",
        message: `O arquivo "${file.name}" está vazio e não foi adicionado ao lote.`,
      });
      continue;
    }

    if (file.size > MAX_BATCH_ACTIVITY_FILE_BYTES) {
      rejectedFiles.push({
        file,
        fileName: file.name,
        code: "FILE_TOO_LARGE",
        message: `O arquivo "${file.name}" excede o limite de 4 MB por arquivo e foi ignorado.`,
      });
      continue;
    }

    const baseNameNormalized = normalizeBatchBaseName(file.name);
    const matchingGroup =
      baseNameNormalized.length > 0
        ? groups.find(
            (g) =>
              g.baseNameNormalized === baseNameNormalized && !g.kinds.includes(ext)
          )
        : undefined;

    if (matchingGroup) {
      knownFileKeys.add(sig);
      const ordered = sortFilesFitFirst(
        [...matchingGroup.files, file],
        [...matchingGroup.kinds, ext]
      );
      matchingGroup.files = ordered.files;
      matchingGroup.kinds = ordered.kinds;
      matchingGroup.signatureKeys = ordered.files.map((f) =>
        getBatchFileSignature(f)
      );
      matchingGroup.displayFileNames = ordered.files.map((f) => f.name).join(" + ");
      matchingGroup.defaultTitle =
        pickPreferredActivityTitleFromFileNames(ordered.files.map((f) => f.name)) ??
        "";
      matchingGroup.isMergedPair = true;
      continue;
    }

    if (currentGroupCount + groups.length >= maxGroups) {
      rejectedFiles.push({
        file,
        fileName: file.name,
        code: "BATCH_LIMIT_EXCEEDED",
        message: `Limite máximo de ${maxGroups} atividades no lote atingido; "${file.name}" não foi adicionado.`,
      });
      continue;
    }

    knownFileKeys.add(sig);
    groups.push(buildStandaloneGroup(file, ext, sig, baseNameNormalized));
  }

  return {
    groups,
    rejectedFiles,
    ignoredDuplicateFilesCount,
    knownFileKeys,
  };
}

/**
 * Desfaz o pareamento automático de um grupo `.FIT + .GPX` específico em 2 grupos independentes no lote.
 */
export function splitMergedBatchGroup(
  groups: readonly BatchActivityGroup[],
  groupId: string
): BatchActivityGroup[] {
  const next: BatchActivityGroup[] = [];

  for (const group of groups) {
    if (group.id !== groupId || group.files.length !== 2) {
      next.push(group);
      continue;
    }

    const ordered = sortFilesFitFirst([...group.files], [...group.kinds]);
    ordered.files.forEach((file, idx) => {
      const ext = ordered.kinds[idx];
      const sig = getBatchFileSignature(file);
      next.push(
        buildStandaloneGroup(
          file,
          ext,
          sig,
          normalizeBatchBaseName(file.name)
        )
      );
    });
  }

  return next;
}

/**
 * Detecta duplicidades de `externalId` dentro da própria fila (após parse),
 * preservando a primeira ocorrência elegível e marcando as repetições seguintes como repetidas no lote.
 */
export function markDuplicateExternalIdsInBatch<
  T extends {
    id: string;
    preview?: ActivityParsePreview | null;
    isDuplicateInBatch?: boolean;
    duplicateOfItemId?: string | null;
  },
>(
  items: readonly T[]
): Array<T & { isDuplicateInBatch: boolean; duplicateOfItemId: string | null }> {
  const firstOwnerByExternalId = new Map<string, string>();

  return items.map((item) => {
    const extId = item.preview?.externalId?.trim() ?? "";
    if (!extId) {
      return {
        ...item,
        isDuplicateInBatch: false,
        duplicateOfItemId: null,
      };
    }

    const existingOwnerId = firstOwnerByExternalId.get(extId);
    if (existingOwnerId) {
      return {
        ...item,
        isDuplicateInBatch: true,
        duplicateOfItemId: existingOwnerId,
      };
    }

    firstOwnerByExternalId.set(extId, item.id);
    return {
      ...item,
      isDuplicateInBatch: false,
      duplicateOfItemId: null,
    };
  });
}
