import { prisma } from "@/lib/prisma";
import {
  apiError,
  apiPayloadTooLarge,
  apiSuccess,
  apiUnprocessable,
  withApiHandler,
} from "@/lib/api/response";
import {
  parseAndMergeActivity,
  pickPreferredActivityTitleFromFileNames,
  RawActivityFileInput,
  resolveActivityTypeSuggestions,
} from "@/lib/activityParser";
import { isFitParseError } from "@/lib/fit";
import { isGpxParseError } from "@/lib/gpx";
import { ActivityParsePreview } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ACTIVITY_FILE_BYTES = 4 * 1024 * 1024; // 4 MB por arquivo

interface UploadedLikeBlob {
  name?: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function isUploadedBlob(value: unknown): value is UploadedLikeBlob {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof (value as UploadedLikeBlob).arrayBuffer === "function" &&
    typeof (value as UploadedLikeBlob).size === "number"
  );
}

function hasInvalidExtension(fileName?: string): boolean {
  if (!fileName) return false;
  const trimmed = fileName.trim().toLowerCase();
  if (!trimmed || trimmed === "blob" || !trimmed.includes(".")) {
    return false;
  }
  return !trimmed.endsWith(".fit") && !trimmed.endsWith(".gpx");
}

export async function POST(request: Request) {
  return withApiHandler(async () => {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return apiError(
        "Nenhum arquivo .FIT ou .GPX foi enviado no corpo multipart/form-data.",
        400,
        { code: "MISSING_FILE" }
      );
    }

    const candidateKeys = ["files", "file", "fitFile", "gpxFile"];
    const seen = new Set<UploadedLikeBlob>();
    const uploadedFiles: UploadedLikeBlob[] = [];

    for (const key of candidateKeys) {
      const entries = formData.getAll(key);
      for (const entry of entries) {
        if (isUploadedBlob(entry) && !seen.has(entry)) {
          // Ignora slots vazios de <input type="file"> opcionais não preenchidos no navegador (name="" e size=0)
          const rawName = typeof entry.name === "string" ? entry.name.trim() : "";
          if (entry.size === 0 && rawName.length === 0) {
            continue;
          }
          seen.add(entry);
          uploadedFiles.push(entry);
        }
      }
    }

    if (uploadedFiles.length === 0) {
      return apiError(
        "Nenhum arquivo .FIT ou .GPX foi enviado.",
        400,
        { code: "MISSING_FILE" }
      );
    }

    if (uploadedFiles.length > 2) {
      return apiUnprocessable(
        "Envie no máximo 2 arquivos simultaneamente (1 .FIT e/ou 1 .GPX do mesmo treino).",
        { code: "TOO_MANY_FILES" }
      );
    }

    const rawInputs: RawActivityFileInput[] = [];

    for (const file of uploadedFiles) {
      const fileName = typeof file.name === "string" ? file.name : undefined;

      if (hasInvalidExtension(fileName)) {
        return apiUnprocessable(
          `Extensão de arquivo inválida${fileName ? ` ("${fileName}")` : ""}. Envie apenas arquivos .FIT ou .GPX.`,
          { code: "INVALID_EXTENSION", fileName }
        );
      }

      if (file.size > MAX_ACTIVITY_FILE_BYTES) {
        return apiPayloadTooLarge(
          `O arquivo${fileName ? ` "${fileName}"` : ""} excede o limite máximo permitido de 4 MB.`,
          {
            code: "FILE_TOO_LARGE",
            fileName,
            sizeBytes: file.size,
            maxBytes: MAX_ACTIVITY_FILE_BYTES,
          }
        );
      }

      if (file.size === 0) {
        return apiUnprocessable(
          `O arquivo${fileName ? ` "${fileName}"` : ""} está vazio.`,
          { code: "EMPTY_FILE", fileName }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > MAX_ACTIVITY_FILE_BYTES) {
        return apiPayloadTooLarge(
          `O arquivo${fileName ? ` "${fileName}"` : ""} excede o limite máximo permitido de 4 MB.`,
          {
            code: "FILE_TOO_LARGE",
            fileName,
            sizeBytes: buffer.length,
            maxBytes: MAX_ACTIVITY_FILE_BYTES,
          }
        );
      }

      rawInputs.push({
        fileName,
        buffer,
      });
    }

    let parsed;
    try {
      parsed = parseAndMergeActivity({ files: rawInputs });
    } catch (err: unknown) {
      if (isFitParseError(err)) {
        return apiUnprocessable(err.message, {
          code: err.code,
          ...(err.details ?? {}),
        });
      }
      if (isGpxParseError(err)) {
        return apiUnprocessable(err.message, {
          code: err.code,
          ...(err.details ?? {}),
        });
      }
      return apiUnprocessable(
        "Não foi possível processar o arquivo enviado. Verifique se é um arquivo .FIT ou .GPX válido.",
        { code: "PARSE_ERROR" }
      );
    }

    const [existingTraining, existingAttempt] = await Promise.all([
      prisma.trainingSession.findUnique({
        where: { externalId: parsed.externalId },
        select: { id: true },
      }),
      typeof prisma.tafAttempt?.findUnique === "function"
        ? prisma.tafAttempt.findUnique({
            where: { externalId: parsed.externalId },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    const metadataTitle = parsed.name ? parsed.name.trim() : null;
    const filenameTitle = pickPreferredActivityTitleFromFileNames(
      rawInputs.map((f) => f.fileName)
    );
    const titleSource: "metadata" | "filename" | null = metadataTitle
      ? "metadata"
      : filenameTitle
        ? "filename"
        : null;
    const suggestedNotes = (metadataTitle || filenameTitle || "").slice(0, 500);

    const { suggestedActivityType, allowedActivityTypes } =
      resolveActivityTypeSuggestions({
        sourceActivityKind: parsed.sourceActivityKind,
        name: parsed.name,
        suggestedNotes,
        fileNames: rawInputs.map((f) => f.fileName),
        speedKmh: parsed.speedKmh,
        distanceKm: parsed.distanceKm,
        durationSeconds: parsed.durationSeconds,
        avgCadence: parsed.avgCadence,
      });

    const previewData: ActivityParsePreview = {
      ...parsed,
      titleSource,
      tafWindow: parsed.tafWindow ?? null,
      alreadyExists: Boolean(existingTraining?.id),
      existingTrainingId: existingTraining?.id ?? null,
      alreadyExistsAttempt: Boolean(existingAttempt?.id),
      existingAttemptId: existingAttempt?.id ?? null,
      suggestedActivityType,
      suggestedNotes,
      allowedActivityTypes,
    };

    return apiSuccess(previewData, 200);
  });
}
