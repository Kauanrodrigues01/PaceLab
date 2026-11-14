import { createHash } from "node:crypto";
import { GPX_HASH_VERSION } from "./types";

export { GPX_HASH_VERSION };

export interface ComputeGpxExternalIdInput {
  firstTimestampIso: string;
  lastTimestampIso: string;
  rawPointCount: number;
}

/**
 * Gera o identificador único determinístico de um arquivo .GPX (`"gpx_" + sha256`)
 * baseado exclusivamente nos dados brutos do arquivo (`${firstTimestampISO}|${lastTimestampISO}|${rawPointCount}` — D4).
 */
export function computeGpxExternalId({
  firstTimestampIso,
  lastTimestampIso,
  rawPointCount,
}: ComputeGpxExternalIdInput): string {
  const firstCanonical = new Date(firstTimestampIso).toISOString();
  const lastCanonical = new Date(lastTimestampIso).toISOString();
  const payload = `${firstCanonical}|${lastCanonical}|${rawPointCount}`;
  const digest = createHash("sha256").update(payload, "utf8").digest("hex");
  return `gpx_${digest}`;
}
