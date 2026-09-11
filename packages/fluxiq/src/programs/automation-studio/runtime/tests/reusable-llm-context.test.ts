import { describe, expect, it } from "vitest";
import type { AutomationStudioReusableLlmContextRecord } from "../../storage/index.ts";
import {
  AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_INPUT_SHARE,
  AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_CANDIDATES,
  AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_PACK_MAX_BYTES,
  packAutomationStudioReusableLlmContext
} from "../reusable-llm-context.ts";

describe("packAutomationStudioReusableLlmContext", () => {
  it("favors reviewed success, excludes rejected/reverted records, dedupes, and stably breaks ties", () => {
    const candidates = [
      record("failed", { outcome: "failed", createdAt: 20 }),
      record("tie.b", { createdAt: 30 }),
      record("tie.a", { createdAt: 30 }),
      record("approved", { outcome: "succeeded", reviewerState: "approved", createdAt: 1 }),
      record("validated", { outcome: "succeeded", validationState: "validated", createdAt: 1 }),
      record("applied", { outcome: "succeeded", validationState: "applied", createdAt: 1 }),
      record("duplicate", { outcome: "unknown", contentDigest: digest("tie.a") }),
      record("rejected", { outcome: "rejected" }),
      record("reverted", { reviewerState: "reverted" })
    ];
    const packed = packAutomationStudioReusableLlmContext({ candidates, maxInputTokens: 8_000 });
    expect(packed.selectedRecordIds).toEqual(["applied", "validated", "approved", "tie.a", "tie.b"]);
    expect(packed.deduplicatedCount).toBe(1);
    expect(packed.excludedDispositionCount).toBe(2);
    expect(packed.packet?.items).toHaveLength(5);
    expect(packed.packedBytes).toBe(Buffer.byteLength(JSON.stringify(packed.packet), "utf8"));
  });

  it("selects at most five candidates", () => {
    const packed = packAutomationStudioReusableLlmContext({ candidates: Array.from({ length: 8 }, (_, index) => record(`record.${index}`, { contentDigest: digest(`record.${index}`) })), maxInputTokens: 8_000 });
    expect(packed.selectedRecordIds).toHaveLength(AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_MAX_CANDIDATES);
  });

  it("caps the whole serialized packet to both the fixed ceiling and ten percent of input tokens", () => {
    const packed = packAutomationStudioReusableLlmContext({ candidates: [record("large", { promptProjection: { facts: "x".repeat(600) } }), record("small", { promptProjection: { fact: "safe" } })], maxInputTokens: 2_000 });
    expect(packed.maxPackedBytes).toBe(600);
    expect(packed.selectedRecordIds).toEqual(["small"]);
    expect(packed.packedBytes).toBeLessThanOrEqual(packed.maxPackedBytes);
    expect(AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_INPUT_SHARE).toBe(0.1);
    expect(AUTOMATION_STUDIO_REUSABLE_LLM_CONTEXT_PACK_MAX_BYTES).toBe(8_192);
  });

  it("returns no packet when even the envelope cannot fit", () => {
    const packed = packAutomationStudioReusableLlmContext({ candidates: [record("one")], maxInputTokens: 1 });
    expect(packed).toMatchObject({ packet: null, selectedRecordIds: [], packedBytes: 0, maxPackedBytes: 0 });
  });
});

function record(recordId: string, overrides: Partial<AutomationStudioReusableLlmContextRecord> = {}): AutomationStudioReusableLlmContextRecord {
  return {
    contractVersion: "automation-studio.reusable-llm-context.v1", recordId, projectId: "project.one", flowId: "flow.one", domainId: "domain.one",
    evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1", compatibilityTags: [],
    promptProjection: { fact: recordId }, outcome: "unknown", reviewerState: "unreviewed", validationState: "unknown", sourceRunIds: [], sourceAdaptationIds: [],
    byteCount: 1, contentDigest: digest(recordId), createdAt: 10, lastUsedAt: 10, expiresAt: 100, ...overrides
  };
}

function digest(value: string): string { return value.padEnd(64, "0").slice(0, 64); }
