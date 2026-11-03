import { describe, expect, it, vi } from "vitest";
import { createElementMatcher } from "../../target-matching/index.ts";
import { matchOutputTarget, outputTargetMinimumConfidence, prepareOutputAction, type OutputTargetPreparer, type RegisteredOutputAction } from "../index.ts";

const output = { id: "device.set", title: "Set device" };
const action: RegisteredOutputAction = { actionType: "device.set", outputId: "device.set", parameters: { target: { kind: "custom", opaque: "domain-owned" }, empty: [] }, metadata: { original: true } };

describe("preparing an output action", () => {
  it("passes parameters through unread without a preparer, however target-shaped they look", () => {
    const prepared = prepareOutputAction(action, "device", { ...output, metadata: { elementTarget: true } }, undefined);
    expect(prepared).toEqual({ ok: true, action });
    expect(prepared.ok && prepared.action.parameters).toBe(action.parameters);
  });

  it("refuses an output that requires a preparer when none was registered", () => {
    const prepared = prepareOutputAction(action, "device", { ...output, metadata: { outputTargetPreparationRequired: true } }, undefined);
    expect(prepared).toEqual({
      ok: false,
      error: "Output device.set requires a registered domain target preparer.",
      failure: { category: "graph_validation_or_unknown_node", code: "output.target_preparer_missing", retryable: false, stage: "target_resolution" }
    });
  });

  it("hands the preparer the action, the domain and the output, and takes only parameters and diagnostics back", () => {
    const preparer = vi.fn<OutputTargetPreparer>(() => ({ ok: true, parameters: { read: true }, diagnostics: { status: "matched" }, resolution: { status: "unresolved_no_candidates", candidateCount: 0 } }));
    const prepared = prepareOutputAction(action, "device", output, preparer);
    expect(preparer).toHaveBeenCalledWith({ action, domainId: "device", output });
    expect(prepared).toEqual({
      ok: true,
      action: { actionType: "device.set", outputId: "device.set", parameters: { read: true }, metadata: { original: true, elementTargetResolution: { status: "matched" } } },
      diagnostics: { status: "matched" },
      resolution: { status: "unresolved_no_candidates", candidateCount: 0 }
    });
  });

  it("keeps the action's parameters when a preparer answers without any, and carries its refusal as it came", () => {
    expect(prepareOutputAction(action, "device", output, () => ({ ok: true }))).toEqual({ ok: true, action });
    const refusal = { ok: false as const, error: "Refused.", failure: { category: "target_not_found" as const, code: "domain.refused", retryable: true } };
    expect(prepareOutputAction(action, "device", output, () => refusal)).toBe(refusal);
  });
});

describe("matching an output target generically", () => {
  const matcher = createElementMatcher({ weights: { visibleText: 1, testId: 1 } });

  it("names the floor only where one applied", () => {
    expect(matchOutputTarget({ visibleText: "Save" }, undefined, 0.5, matcher)).toMatchObject({ ok: true, resolution: { status: "unresolved_no_candidates", candidateCount: 0 } });
    const noMatcher = matchOutputTarget({ visibleText: "Save" }, [{ candidateId: "save", visibleText: "Save" }], 0.5, undefined);
    expect(noMatcher).toMatchObject({ ok: true, resolution: { status: "unresolved_no_matcher", candidateCount: 1 } });
    expect(noMatcher.resolution).not.toHaveProperty("minimumConfidence");
  });

  it("selects the confident candidate and refuses a weak one", () => {
    const candidates = [{ candidateId: "cancel", visibleText: "Cancel", testId: "cancel" }, { candidateId: "save", visibleText: "Save", testId: "save" }];
    expect(matchOutputTarget({ visibleText: "Save", testId: "save" }, candidates, 0.5, matcher)).toMatchObject({ ok: true, selectedCandidate: { candidateId: "save" }, resolution: { status: "matched", candidateId: "save" } });
    expect(matchOutputTarget({ visibleText: "Save", testId: "save" }, [{ candidateId: "save-text", visibleText: "Save" }], 0.99, matcher)).toMatchObject({ ok: false, failure: { code: "element_target.below_confidence", retryable: true }, resolution: { status: "below_confidence", minimumConfidence: 0.99 } });
  });

  it("takes a configured floor, clamped, and otherwise the output's safety level", () => {
    expect(outputTargetMinimumConfidence(2, "safe")).toBe(1);
    expect(outputTargetMinimumConfidence("0.2", "destructive")).toBe(0.9);
    expect(outputTargetMinimumConfidence(undefined, undefined)).toBe(0.5);
  });
});
