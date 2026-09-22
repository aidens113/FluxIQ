import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftEntry, AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../entry.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

function step(position: number, actionId: string, input: Record<string, string>, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId, input, effect: "mutate", effectApplied: true, disposition: "kept", ...over };
}

describe("the draft entry a decision is shown", () => {
  // The failure this exists for: the evidence window keeps the newest result
  // of each tool, so five presses under one tool id left one visible and the
  // built Flow kept none of the dismissals the build had actually performed.
  it("lists every changing action, however many share one action id", () => {
    const steps = [
      step(1, "press", { target: "target.1" }),
      step(2, "press", { target: "target.4" }),
      step(3, "press", { target: "target.9" }),
      step(4, "enter", { target: "target.2", value: "earbuds" }),
      step(5, "press", { target: "target.7" })
    ];
    const entry = automationStudioFlowDraftEntry({ steps, maxBytes: 4_000 });
    expect(entry?.callId).toBe(AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID);
    const value = entry?.value as { steps: { step: number; actionId: string; input?: unknown; inResult: boolean }[] };
    expect(value.steps.map((listed) => listed.step)).toEqual([1, 2, 3, 4, 5]);
    expect(value.steps.every((listed) => listed.inResult)).toBe(true);
    expect(value.steps[2]?.input).toEqual({ target: "target.9" });
  });

  it("says which steps the result will not contain, rather than leaving them out", () => {
    const steps = [
      step(1, "press", { target: "target.1" }, { disposition: "exploratory" }),
      step(2, "press", { target: "target.4" }, { disposition: "dropped" }),
      step(3, "press", { target: "target.9" }, { effectApplied: false, resultCode: "web.action.rejected.target_unobserved" })
    ];
    const value = automationStudioFlowDraftEntry({ steps, maxBytes: 4_000 })?.value as { steps: { disposition: string; inResult: boolean; changed: string }[] };
    expect(value.steps.map((listed) => [listed.disposition, listed.inResult, listed.changed])).toEqual([
      ["exploratory", false, "yes"],
      ["dropped", false, "yes"],
      ["kept", false, "no"]
    ]);
  });

  it("drops arguments before it drops steps, oldest first, and counts what it could not list", () => {
    const steps = Array.from({ length: 12 }, (_, index) => step(index + 1, "press", { target: `target.${index}`, note: "x".repeat(40) }));
    const trimmed = automationStudioFlowDraftEntry({ steps, maxBytes: 900 })?.value as { steps: { step: number; input?: unknown }[]; unlisted?: number };
    expect(trimmed.steps.length).toBeGreaterThan(0);
    expect(trimmed.steps.at(-1)?.step).toBe(12);
    // Whatever had to go, the newest steps keep their arguments and no listed
    // step is missing from the middle of the run.
    expect(trimmed.steps.map((listed) => listed.step)).toEqual([...trimmed.steps].map((listed) => listed.step).sort((left, right) => left - right));
    const listedFrom = trimmed.steps[0]!.step;
    expect(trimmed.unlisted ?? 0).toBe(listedFrom - 1);
  });

  it("is nothing at all when the loop only looked", () => {
    expect(automationStudioFlowDraftEntry({ steps: [step(1, "inspect", {}, { effect: "observe" })], maxBytes: 4_000 })).toBeUndefined();
    expect(automationStudioFlowDraftEntry({ steps: [], maxBytes: 4_000 })).toBeUndefined();
  });

  it("leaves out an argument too large to carry rather than cutting it in half", () => {
    const value = automationStudioFlowDraftEntry({ steps: [step(1, "enter", { value: "y".repeat(900) })], maxBytes: 4_000 })?.value as { steps: { input?: unknown }[] };
    expect(value.steps[0]?.input).toBeUndefined();
  });
});
