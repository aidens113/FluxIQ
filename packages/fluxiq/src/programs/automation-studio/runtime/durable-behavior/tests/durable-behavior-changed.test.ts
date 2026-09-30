import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioRunChangedDurableBehavior } from "../durable-behavior-changed.ts";

// `durable-behavior-changed.ts`: the one reading of "this run changed the Flow".

const detail = (adaptationIds: string[] | undefined, runtimePatchAttempts?: unknown) => ({
  ...(adaptationIds ? { adaptationIds } : {}),
  ...(runtimePatchAttempts !== undefined ? { metadata: { runtimePatchAttempts } as JsonObject } : {})
});

describe("whether a run changed its Flow's durable behavior", () => {
  it("is true when one of the run's adaptations was applied automatically", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one", "a.two"], [
      { adaptationId: "a.one", approvalDecision: { autoApply: false } },
      { adaptationId: "a.two", approvalDecision: { autoApply: true } }
    ]))).toBe(true);
  });

  it("is false for an adaptation that waits for review", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.one", approvalDecision: { autoApply: false } }]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.one" }]))).toBe(false);
  });

  it("is false for an auto-applied patch the run did not record as its adaptation", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.other", approvalDecision: { autoApply: true } }]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail([], [{ adaptationId: "a.one", approvalDecision: { autoApply: true } }]))).toBe(false);
  });

  it("is false when the run recorded no adaptations or no patch attempts, or they are malformed", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(undefined))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], "not a list"))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [null, 3, ["a.one"], { adaptationId: "a.one", approvalDecision: "yes" }]))).toBe(false);
  });
});
