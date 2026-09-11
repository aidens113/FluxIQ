import type { JsonValue } from "../../../core/index.ts";
import type { AutomationStudioReusableLlmContextRecord } from "../storage/index.ts";
import { automationStudioLlmTokenBudgetBytes, estimateAutomationStudioLlmTokensFromUtf8Bytes } from "./llm/token-estimation.ts";

export const AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_CANDIDATES = 5;
export const AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_PACK_MAX_BYTES = 8_192;
export const AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_INPUT_SHARE = 0.1;

export type AutomationStudioReusableLlmContextPacket = {
  schemaVersion: "automation-studio.reusable-llm-context-packet.v1";
  items: Array<{
    advisory: true;
    recordId: string;
    contentDigest: string;
    outcome: AutomationStudioReusableLlmContextRecord["outcome"];
    reviewerState: AutomationStudioReusableLlmContextRecord["reviewerState"];
    validationState: AutomationStudioReusableLlmContextRecord["validationState"];
    sourceRunIds: string[];
    sourceAdaptationIds: string[];
    promptProjection: JsonValue;
  }>;
};

export type AutomationStudioReusableLlmContextPackingResult = {
  packet: AutomationStudioReusableLlmContextPacket | null;
  selectedRecordIds: string[];
  selectedDigests: string[];
  selectedSourceRunIds: string[];
  selectedSourceAdaptationIds: string[];
  consideredCount: number;
  deduplicatedCount: number;
  excludedDispositionCount: number;
  packedBytes: number;
  estimatedTokens: number;
  maxPackedBytes: number;
};

/** Deterministically ranks already scope-compatible records and packs only bounded prompt projections. */
export function packAutomationStudioReusableLlmContext(input: {
  candidates: readonly AutomationStudioReusableLlmContextRecord[];
  maxInputTokens: number;
}): AutomationStudioReusableLlmContextPackingResult {
  if (!Number.isSafeInteger(input.maxInputTokens) || input.maxInputTokens < 0) throw new Error("Reusable LLM context input-token budget is invalid.");
  const tokenShare = Math.floor(input.maxInputTokens * AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_INPUT_SHARE);
  const maxPackedBytes = Math.min(AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_PACK_MAX_BYTES, automationStudioLlmTokenBudgetBytes(tokenShare));
  const emptyPacket: AutomationStudioReusableLlmContextPacket = { schemaVersion: "automation-studio.reusable-llm-context-packet.v1", items: [] };
  if (jsonBytes(emptyPacket) > maxPackedBytes) return { packet: null, selectedRecordIds: [], selectedDigests: [], selectedSourceRunIds: [], selectedSourceAdaptationIds: [], consideredCount: input.candidates.length, deduplicatedCount: 0, excludedDispositionCount: 0, packedBytes: 0, estimatedTokens: 0, maxPackedBytes };
  const eligible = input.candidates.filter((candidate) => candidate.outcome !== "rejected" && candidate.outcome !== "reverted" && candidate.reviewerState !== "rejected" && candidate.reviewerState !== "reverted");
  const excludedDispositionCount = input.candidates.length - eligible.length;
  const ranked = [...eligible].sort(compareReusableLlmContext);
  const unique: AutomationStudioReusableLlmContextRecord[] = [];
  const digests = new Set<string>();
  for (const candidate of ranked) {
    if (digests.has(candidate.contentDigest)) continue;
    digests.add(candidate.contentDigest);
    unique.push(candidate);
  }
  const packet: AutomationStudioReusableLlmContextPacket = emptyPacket;
  for (const candidate of unique) {
    if (packet.items.length >= AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_CANDIDATES) break;
    const item = { advisory: true as const, recordId: candidate.recordId, contentDigest: candidate.contentDigest, outcome: candidate.outcome, reviewerState: candidate.reviewerState, validationState: candidate.validationState, sourceRunIds: candidate.sourceRunIds, sourceAdaptationIds: candidate.sourceAdaptationIds, promptProjection: candidate.promptProjection };
    const proposed = { ...packet, items: [...packet.items, item] };
    if (jsonBytes(proposed) > maxPackedBytes) continue;
    packet.items.push(item);
  }
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
    estimatedTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(packedBytes),
    maxPackedBytes
  };
}

function compareReusableLlmContext(left: AutomationStudioReusableLlmContextRecord, right: AutomationStudioReusableLlmContextRecord): number {
  return score(right) - score(left) || right.createdAt - left.createdAt || left.recordId.localeCompare(right.recordId);
}

function score(record: AutomationStudioReusableLlmContextRecord): number {
  if (record.validationState === "applied" && record.outcome === "succeeded") return 600;
  if (record.validationState === "validated" && record.outcome === "succeeded") return 500;
  if (record.outcome === "succeeded" && record.reviewerState === "approved") return 400;
  if (record.outcome === "succeeded") return 300;
  if (record.reviewerState === "approved") return 200;
  if (record.outcome === "unknown") return 100;
  return 0;
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
