import { describe, expect, it } from "vitest";
import type { AutomationStudioReusableLlmContextRecord } from "../../storage/index.ts";
import { packAutomationStudioReusableLlmContext } from "../reusable-llm-context.ts";

describe("packAutomationStudioReusableLlmContext", () => {
  // No ranking (2026-09-30): newest first, whatever the outcome or review, and
  // of two records with the same content the newer is kept.
  it("orders by when each record was made, newest first, excludes rejected/reverted records, dedupes, and stably breaks ties", () => {
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
    expect(packed.selectedRecordIds).toEqual(["tie.a", "tie.b", "failed", "applied", "approved", "validated"]);
    expect(packed.deduplicatedCount).toBe(1);
    expect(packed.excludedDispositionCount).toBe(2);
    expect(packed.packet?.items).toHaveLength(6);
    expect(packed.packedBytes).toBe(Buffer.byteLength(JSON.stringify(packed.packet), "utf8"));
  });

  it("carries every eligible candidate, with no count limit", () => {
    const packed = packAutomationStudioReusableLlmContext({ candidates: Array.from({ length: 8 }, (_, index) => record(`record.${index}`, { contentDigest: digest(`record.${index}`) })), maxInputTokens: 8_000 });
    expect(packed.selectedRecordIds).toHaveLength(8);
  });

  it("carries a large projection whole, with no byte or input-token share limit", () => {
    const large = { facts: "x".repeat(50_000) };
    const packed = packAutomationStudioReusableLlmContext({ candidates: [record("large", { promptProjection: large }), record("small", { promptProjection: { fact: "safe" } })], maxInputTokens: 1 });
    expect(packed.selectedRecordIds).toEqual(["large", "small"]);
    expect(packed.packet?.items[0]?.promptProjection).toEqual(large);
    expect(packed.packedBytes).toBe(Buffer.byteLength(JSON.stringify(packed.packet), "utf8"));
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
