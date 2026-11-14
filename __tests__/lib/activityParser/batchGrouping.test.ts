import { describe, it, expect } from "vitest";
import type { ActivityParsePreview } from "@/types";
import {
  getActivityFileExtension,
  getBatchFileSignature,
  groupActivityFilesForBatch,
  markDuplicateExternalIdsInBatch,
  MAX_BATCH_ACTIVITY_FILE_BYTES,
  MAX_BATCH_ACTIVITY_FILES,
  normalizeBatchBaseName,
  shouldAutoSwitchToBatchImport,
  splitMergedBatchGroup,
} from "@/lib/activityParser/batchGrouping";

function makeFakeFile(
  name: string,
  size = 1024,
  lastModified = 1700000000000
): File {
  const safeContent = size > 0 ? new Uint8Array(Math.min(size, 64)) : new Uint8Array(0);
  const file = new File([safeContent], name, {
    type: "application/octet-stream",
    lastModified,
  });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function makePreviewStub(
  externalId: string,
  overrides: Partial<ActivityParsePreview> = {}
): ActivityParsePreview {
  return {
    source: "fit_upload",
    filesUsed: ["fit"],
    name: "Treino Teste",
    titleSource: "filename",
    rawType: "running",
    sourceActivityKind: "run",
    isIndoor: false,
    startedAt: "2026-10-29T10:00:00.000Z",
    distanceKm: 5,
    durationSeconds: 1500,
    elapsedSeconds: 1520,
    speedKmh: 12,
    paceSeconds: 300,
    paceFormatted: "5:00",
    avgHeartRate: 155,
    maxHeartRate: 175,
    avgCadence: 178,
    elevationGainM: 40,
    activeCalories: 350,
    avgTemperatureC: 24,
    splits: [],
    laps: [],
    externalId,
    pointCount: 500,
    warnings: [],
    alreadyExists: false,
    existingTrainingId: null,
    alreadyExistsAttempt: false,
    existingAttemptId: null,
    tafWindow: null,
    suggestedActivityType: "corrida_continua",
    suggestedNotes: "Treino Teste",
    allowedActivityTypes: ["corrida_continua"],
    ...overrides,
  };
}

describe("lib/activityParser/batchGrouping — Agrupamento, deduplicação e validação em lote", () => {
  it("shouldAutoSwitchToBatchImport alterna corretamente conforme quantidade e modo atual", () => {
    const fFit1 = makeFakeFile("a.fit");
    const fFit2 = makeFakeFile("b.fit");
    const fGpx1 = makeFakeFile("a.gpx");
    const fGpx2 = makeFakeFile("b.gpx");
    const fPdf = makeFakeFile("outro.pdf");

    expect(shouldAutoSwitchToBatchImport([fFit1], "single")).toBe(false);
    expect(shouldAutoSwitchToBatchImport([fGpx1], "single")).toBe(false);
    expect(shouldAutoSwitchToBatchImport([fFit1, fGpx1], "single")).toBe(false);

    expect(shouldAutoSwitchToBatchImport([fFit1, fFit2], "single")).toBe(true);
    expect(shouldAutoSwitchToBatchImport([fGpx1, fGpx2], "single")).toBe(true);
    expect(shouldAutoSwitchToBatchImport([fFit1, fGpx1, fPdf], "single")).toBe(true);
    expect(shouldAutoSwitchToBatchImport([fFit1], "batch")).toBe(true);
  });

  it("extrai extensão e normaliza nomes base removendo caminhos Windows/Unix", () => {
    expect(getActivityFileExtension("Longao.FIT")).toBe("fit");
    expect(getActivityFileExtension("caminhada.gpx")).toBe("gpx");
    expect(getActivityFileExtension("foto.png")).toBeNull();

    expect(normalizeBatchBaseName("Longao_Sabado.FIT")).toBe("longao_sabado");
    expect(normalizeBatchBaseName("C:\\Users\\kauan\\Tiro_400m.gpx")).toBe("tiro_400m");
    expect(normalizeBatchBaseName("/tmp/uploads/  Voltando.fit ")).toBe("voltando");
    expect(normalizeBatchBaseName("")).toBe("");
  });

  it("pareia arquivos .FIT e .GPX homônimos (case-insensitive) preservando arquivos isolados e ordem", () => {
    const gpxFirst = makeFakeFile("Longao_Domingo.GPX", 900);
    const fitSolo = makeFakeFile("Tiro_Quarta.fit", 1200);
    const fitPair = makeFakeFile("longao_domingo.fit", 2400);
    const gpxSolo = makeFakeFile("Rodagem_Leve.gpx", 800);

    const result = groupActivityFilesForBatch([gpxFirst, fitSolo, fitPair, gpxSolo]);

    expect(result.rejectedFiles).toHaveLength(0);
    expect(result.ignoredDuplicateFilesCount).toBe(0);
    expect(result.groups).toHaveLength(3);

    // Grupo 0 foi criado por gpxFirst e recebeu fitPair ordenando .fit primeiro
    expect(result.groups[0].isMergedPair).toBe(true);
    expect(result.groups[0].kinds).toEqual(["fit", "gpx"]);
    expect(result.groups[0].files.map((f) => f.name)).toEqual([
      "longao_domingo.fit",
      "Longao_Domingo.GPX",
    ]);
    expect(result.groups[0].displayFileNames).toBe(
      "longao_domingo.fit + Longao_Domingo.GPX"
    );
    expect(result.groups[0].defaultTitle).toBe("Longao Domingo");

    expect(result.groups[1].isMergedPair).toBe(false);
    expect(result.groups[1].files.map((f) => f.name)).toEqual(["Tiro_Quarta.fit"]);

    expect(result.groups[2].isMergedPair).toBe(false);
    expect(result.groups[2].files.map((f) => f.name)).toEqual(["Rodagem_Leve.gpx"]);
  });

  it("mantém arquivos homônimos extras da mesma extensão como itens separados em vez de descartar", () => {
    const fit1 = makeFakeFile("Corrida.fit", 1000, 100);
    const gpx1 = makeFakeFile("Corrida.gpx", 900, 100);
    const fit2 = makeFakeFile("Corrida.fit", 1500, 200);

    const res = groupActivityFilesForBatch([fit1, gpx1, fit2]);

    expect(res.groups).toHaveLength(2);
    expect(res.groups[0].isMergedPair).toBe(true);
    expect(res.groups[1].isMergedPair).toBe(false);
    expect(res.groups[1].files[0].size).toBe(1500);
  });

  it("isola arquivos inválidos, vazios e maiores que 4 MB sem abortar o restante do lote", () => {
    const invalid = makeFakeFile("documento.pdf", 500);
    const empty = makeFakeFile("vazio.fit", 0);
    const tooLarge = makeFakeFile("gigante.gpx", MAX_BATCH_ACTIVITY_FILE_BYTES + 1);
    const validFit = makeFakeFile("Treino_valido.fit", 2048);
    const validGpx = makeFakeFile("Caminhada_parque.gpx", 1024);

    const result = groupActivityFilesForBatch([
      invalid,
      empty,
      tooLarge,
      validFit,
      validGpx,
    ]);

    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((g) => g.files[0].name)).toEqual([
      "Treino_valido.fit",
      "Caminhada_parque.gpx",
    ]);

    expect(result.rejectedFiles.map((r) => r.code)).toEqual([
      "INVALID_EXTENSION",
      "EMPTY_FILE",
      "FILE_TOO_LARGE",
    ]);
  });

  it("deduplica arquivos repetidos na mesma seleção ou contra existingKeys sem mutar o Set original", () => {
    const f1 = makeFakeFile("A.fit", 1024, 111);
    const f1Duplicate = makeFakeFile("a.fit", 1024, 111);
    const f2 = makeFakeFile("B.gpx", 2048, 222);

    const existing = new Set<string>([getBatchFileSignature(f2)]);
    const result = groupActivityFilesForBatch([f1, f1Duplicate, f2], existing);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].files[0].name).toBe("A.fit");
    expect(result.ignoredDuplicateFilesCount).toBe(2);
    expect(existing.size).toBe(1);
    expect(result.knownFileKeys.size).toBe(2);
  });

  it("respeita limite máximo de itens no lote (MAX_BATCH_ACTIVITY_FILES = 50)", () => {
    const files = Array.from({ length: 53 }, (_, idx) =>
      makeFakeFile(`treino_${idx}.fit`, 1000 + idx)
    );

    const result = groupActivityFilesForBatch(files);

    expect(result.groups).toHaveLength(MAX_BATCH_ACTIVITY_FILES);
    expect(result.rejectedFiles).toHaveLength(3);
    expect(result.rejectedFiles.every((r) => r.code === "BATCH_LIMIT_EXCEEDED")).toBe(
      true
    );
  });

  it("permite adicionar arquivo pareado em lote de 49 itens e rejeita somente o excesso quando atinge teto", () => {
    const existingSet = new Set<string>();
    const fit49 = makeFakeFile("longao_50.fit", 1200);
    const gpx50 = makeFakeFile("longao_50.gpx", 800);
    const extra = makeFakeFile("outro_51.fit", 900);

    const res = groupActivityFilesForBatch([fit49, gpx50, extra], {
      existingKeys: existingSet,
      currentGroupCount: 49,
      maxGroups: 50,
    });

    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].isMergedPair).toBe(true);
    expect(res.rejectedFiles).toHaveLength(1);
    expect(res.rejectedFiles[0].code).toBe("BATCH_LIMIT_EXCEEDED");
  });

  it("splitMergedBatchGroup separa um par .FIT + .GPX em 2 itens mantendo a ordem da fila", () => {
    const res = groupActivityFilesForBatch([
      makeFakeFile("Alpha.fit", 1000),
      makeFakeFile("Par.fit", 1200),
      makeFakeFile("Par.gpx", 800),
      makeFakeFile("Omega.gpx", 600),
    ]);

    expect(res.groups).toHaveLength(3);
    const mergedId = res.groups[1].id;

    const afterSplit = splitMergedBatchGroup(res.groups, mergedId);

    expect(afterSplit).toHaveLength(4);
    expect(afterSplit.map((g) => g.displayFileNames)).toEqual([
      "Alpha.fit",
      "Par.fit",
      "Par.gpx",
      "Omega.gpx",
    ]);
    expect(afterSplit[1].isMergedPair).toBe(false);
    expect(afterSplit[2].isMergedPair).toBe(false);
    expect(afterSplit[1].id).not.toBe(afterSplit[2].id);

    // Quando .GPX chega antes do .FIT e ambos são pareados, signatureKeys e split preservam a ordem [.fit, .gpx]
    const gpxFirst = makeFakeFile("Reverse.gpx", 500, 100);
    const fitSecond = makeFakeFile("Reverse.fit", 1500, 200);
    const reversePaired = groupActivityFilesForBatch([gpxFirst, fitSecond]);
    expect(reversePaired.groups[0].signatureKeys).toEqual([
      getBatchFileSignature(fitSecond),
      getBatchFileSignature(gpxFirst),
    ]);
    const reverseSplit = splitMergedBatchGroup(
      reversePaired.groups,
      reversePaired.groups[0].id
    );
    expect(reverseSplit[0].signatureKeys).toEqual([
      getBatchFileSignature(fitSecond),
    ]);
    expect(reverseSplit[1].signatureKeys).toEqual([
      getBatchFileSignature(gpxFirst),
    ]);

    // Grupo inexistente ou não-pareado permanece inalterado
    expect(splitMergedBatchGroup(afterSplit, "nao_existe")).toHaveLength(4);
    expect(splitMergedBatchGroup(afterSplit, afterSplit[0].id)).toHaveLength(4);
  });

  it("markDuplicateExternalIdsInBatch marca duplicados subsequentes e limpa se o primeiro for removido", () => {
    const items = [
      { id: "1", preview: makePreviewStub("fit_dup") },
      { id: "2", preview: null },
      { id: "3", preview: makePreviewStub("fit_other") },
      { id: "4", preview: makePreviewStub("fit_dup") },
    ];

    const marked = markDuplicateExternalIdsInBatch(items);

    expect(marked[0].isDuplicateInBatch).toBe(false);
    expect(marked[0].duplicateOfItemId).toBeNull();
    expect(marked[1].isDuplicateInBatch).toBe(false);
    expect(marked[2].isDuplicateInBatch).toBe(false);
    expect(marked[3].isDuplicateInBatch).toBe(true);
    expect(marked[3].duplicateOfItemId).toBe("1");

    // Removendo o item "1", o item "4" passa a ser o dono principal
    const afterRemove = markDuplicateExternalIdsInBatch(marked.slice(1));
    expect(afterRemove[2].id).toBe("4");
    expect(afterRemove[2].isDuplicateInBatch).toBe(false);
    expect(afterRemove[2].duplicateOfItemId).toBeNull();
  });
});
