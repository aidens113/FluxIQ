// The measurement of a draft entry, taken from entries the draft actually
// produced.
//
// Every case here builds its entry with `automationStudioFlowDraftEntry` rather
// than by hand, because that is the only thing holding the measurement to the
// entry: a rename there would quietly turn every count below into a zero.

import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceLoopDraftShown } from "../draft-shown.ts";

function step(position: number, input: Record<string, string>): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId: "press", input, effect: "mutate", effectApplied: true, disposition: "kept" };
}

const steps = (count: number, note = "") => Array.from({ length: count }, (_, index) =>
  step(index + 1, { target: `target.${index}`, ...(note ? { note } : {}) }));

function shown(draft: readonly AutomationStudioFlowDraftStep[]) {
  const entry = automationStudioFlowDraftEntry({ steps: draft })!;
  return { entry, measured: automationStudioLlmEvidenceLoopDraftShown({ value: entry.value }) };
}

describe("what the model was shown of its draft", () => {
  it("is the whole entry: its own size, every step, the full telling, nothing left out", () => {
    const { entry, measured } = shown(steps(3));
    expect(measured.bytes).toBe(Buffer.byteLength(JSON.stringify(entry.value), "utf8"));
    expect(measured.budget).toBe(measured.bytes);
    expect(measured.steps).toBe(3);
    expect(measured.instructionBytes).toBeGreaterThan(1_000);
    for (const legacy of ["unlisted", "withoutInput", "inputTooLarge", "overBudget", "budgetBelowFloor"]) expect(measured).not.toHaveProperty(legacy);
  });

  it("lists every step of a long draft with large arguments", () => {
    const { measured } = shown(steps(120, "x".repeat(1_000)));
    expect(measured.steps).toBe(120);
    expect(measured.bytes).toBeGreaterThan(120_000);
    expect(measured).not.toHaveProperty("withoutInput");
    expect(measured).not.toHaveProperty("unlisted");
  });

  it("measures an entry whatever disposition each step is shown with", () => {
    const shownAs = [
      { disposition: "kept", effectApplied: true },
      { disposition: "dropped", effectApplied: true },
      { disposition: "exploratory", effectApplied: true },
      { disposition: "kept", effectApplied: false },
      { disposition: "dropped", effectApplied: false },
      { disposition: "kept", effectApplied: undefined }
    ] as const;
    const draft = steps(12, "x".repeat(40)).map((line, index): AutomationStudioFlowDraftStep => {
      const { effectApplied, disposition } = shownAs[index % shownAs.length]!;
      const { effectApplied: _applied, ...rest } = line;
      void _applied;
      return { ...rest, disposition, ...(effectApplied === undefined ? {} : { effectApplied }) };
    });
    expect(shown(draft).measured.steps).toBe(12);
  });

  it.each([
    ["a packed format", { format: "step_rows_v1", fields: [], steps: [] }],
    ["row lines", { steps: [[1, "press", {}, null, "yes", "kept", true]] }]
  ])("fails closed on %s, which the draft no longer produces", (_label, packed) => {
    expect(() => automationStudioLlmEvidenceLoopDraftShown({ value: { code: "llm_evidence_loop.draft", instruction: "draft", ...packed } }))
      .toThrow("Cannot measure a draft entry that is not the whole object-form draft");
  });
});
