import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../limits/index.ts";
import type { ReusableModelContextCandidate } from "./candidate.ts";
import type { ReusableModelContextPacket } from "./packet.ts";
import type { ReusableModelContextPackingResult } from "./packing-result.ts";

/**
 * Packs every eligible record's prompt projection, whole.
 *
 * Rejected and reverted records are left out, because a person or a later run
 * said they were wrong; records with the same content are carried once. There
 * is no count, byte or input-token share limit (2026-09-30, "the model sees
 * the whole page"), and no ranking: records are ordered by when they were
 * made, newest first -- the store's own order -- so of two records with the
 * same content the newer is kept. An outcome, a validation or a review is shown
 * on each item for the model to weigh; it no longer moves a record up the list.
 * `maxInputTokens` is accepted for callers that still pass it and no longer
 * bounds anything.
 */
export function packReusableModelContext(input: {
  candidates: readonly ReusableModelContextCandidate[];
  maxInputTokens?: number;
}): ReusableModelContextPackingResult {
  const eligible = input.candidates.filter((candidate) => candidate.outcome !== "rejected" && candidate.outcome !== "reverted" && candidate.reviewerState !== "rejected" && candidate.reviewerState !== "reverted");
  const excludedDispositionCount = input.candidates.length - eligible.length;
  const ordered = [...eligible].sort(compareReusableLlmContext);
  const unique: ReusableModelContextCandidate[] = [];
  const digests = new Set<string>();
  for (const candidate of ordered) {
    if (digests.has(candidate.contentDigest)) continue;
    digests.add(candidate.contentDigest);
    unique.push(candidate);
  }
  const packet: ReusableModelContextPacket = {
    schemaVersion: "automation-studio.reusable-llm-context-packet.v1",
    items: unique.map((candidate) => ({ advisory: true as const, recordId: candidate.recordId, contentDigest: candidate.contentDigest, outcome: candidate.outcome, reviewerState: candidate.reviewerState, validationState: candidate.validationState, sourceRunIds: candidate.sourceRunIds, sourceAdaptationIds: candidate.sourceAdaptationIds, promptProjection: candidate.promptProjection }))
  };
  const packedBytes = jsonBytes(packet);
  return {
    packet,
    selectedRecordIds: packet.items.map((item) => item.recordId),
    selectedDigests: packet.items.map((item) => item.contentDigest),
    selectedSourceRunIds: [...new Set(packet.items.flatMap((item) => item.sourceRunIds))].sort(),
    selectedSourceAdaptationIds: [...new Set(packet.items.flatMap((item) => item.sourceAdaptationIds))].sort(),
    consideredCount: input.candidates.length,
    deduplicatedCount: Math.max(0, eligible.length - unique.length),
    excludedDispositionCount,
    packedBytes,
    estimatedTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(packedBytes)
  };
}

function compareReusableLlmContext(left: ReusableModelContextCandidate, right: ReusableModelContextCandidate): number {
  return right.createdAt - left.createdAt || left.recordId.localeCompare(right.recordId);
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
