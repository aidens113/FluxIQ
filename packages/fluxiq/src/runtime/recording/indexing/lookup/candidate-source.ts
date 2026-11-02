import { readRecordingIndexItem } from "../dictionary/index.ts";
import type { RecordingIndex } from "@fluxiq/contracts/recording";

export function resolveCandidateActionEntryId(index: RecordingIndex | null, sourceEntryId: string, candidate: { sourceObservationIds?: string[] }): string {
  if (!index) return sourceEntryId;
  const entryIds = new Set([sourceEntryId, ...(candidate.sourceObservationIds ?? [])].filter(Boolean));
  for (const entryId of entryIds) {
    const entry = readRecordingIndexItem(index.entries, entryId);
    if (entry?.actionId || entry?.type === "action") return entryId;
  }
  return sourceEntryId;
}
