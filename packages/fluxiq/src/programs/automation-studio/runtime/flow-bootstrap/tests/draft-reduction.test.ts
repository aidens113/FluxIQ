// Reading a build's draft through the exploration reducer: the wiring that did
// not exist, and the honesty about digests that decides which answer comes out.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraft, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "../../llm/index.ts";
import { reduceAutomationStudioFlowBootstrapDraft } from "../draft-reduction.ts";

const tools = [
  { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const }
];

type StepOver = Partial<AutomationStudioFlowDraftStep>;

function step(position: number, actionId: string, over: StepOver = {}): AutomationStudioFlowDraftStep {
  return {
    position, iteration: position, callId: `call.${position}`, actionId,
    input: { target: `target.${position}` }, effect: actionId === "press" ? "mutate" : "observe",
    effectApplied: actionId === "press", disposition: "kept", ...over
  };
}

function trace(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioLlmEvidenceLoopTrace[] {
  return steps.map((entry) => ({
    iteration: entry.iteration, decision: "tool_call", callId: entry.callId!, toolId: entry.actionId,
    ...(entry.effectApplied !== undefined ? { effectApplied: entry.effectApplied } : {}),
    ...(entry.resultCode ? { resultCode: entry.resultCode } : {})
  }));
}

describe("a build's draft, read through the exploration reducer", () => {
  // Without digests nothing can be said about which step produced which state,
  // so the answer is every step that changed something, in order -- longer than
  // the minimum and never wrong about what was done.
  it("falls back to the accrued order when the draft carries no state digests", () => {
    const steps = [step(1, "press"), step(2, "inspect"), step(3, "press")];
    const reduced = reduceAutomationStudioFlowBootstrapDraft({ draft: automationStudioFlowDraft(steps), trace: trace(steps), tools });
    expect(reduced.basis).toBe("accrual");
    expect(reduced.reduction).toBeUndefined();
    expect(reduced.steps.map((entry) => entry.position)).toEqual([1, 3]);
    expect(reduced.gaps.some((gap) => gap.reason === "no_state_digests")).toBe(true);
  });

  it("drops a step the state came back from, and keeps the ones the end state needed", () => {
    // a -> b (kept), b -> c and c -> b (a press and its undo), b -> d (kept).
    const steps = [
      step(1, "press", { stateBefore: "a", stateAfter: "b" }),
      step(2, "press", { stateBefore: "b", stateAfter: "c" }),
      step(3, "press", { stateBefore: "c", stateAfter: "b" }),
      step(4, "press", { stateBefore: "b", stateAfter: "d" })
    ];
    const reduced = reduceAutomationStudioFlowBootstrapDraft({ draft: automationStudioFlowDraft(steps), trace: trace(steps), tools });
    expect(reduced.basis).toBe("reduction");
    expect(reduced.steps.map((entry) => entry.position)).toEqual([1, 4]);
    expect(reduced.reduction?.dropped.map((entry) => entry.reason)).toEqual(["undone", "undone"]);
    expect(reduced.reduction?.stateChainIntact).toBe(true);
  });

  // The failure the whole design answers: several actions under one tool id,
  // every one of which the result must contain.
  it("keeps every step of a chain in which each one changed the state", () => {
    const steps = [
      step(1, "press", { stateBefore: "a", stateAfter: "b" }),
      step(2, "press", { stateBefore: "b", stateAfter: "c" }),
      step(3, "press", { stateBefore: "c", stateAfter: "d" })
    ];
    const reduced = reduceAutomationStudioFlowBootstrapDraft({ draft: automationStudioFlowDraft(steps), trace: trace(steps), tools });
    expect(reduced.basis).toBe("reduction");
    expect(reduced.steps.map((entry) => entry.input)).toEqual([{ target: "target.1" }, { target: "target.2" }, { target: "target.3" }]);
  });

  it("reads the domain's own result codes through the caller, never itself", () => {
    const steps = [
      step(1, "press", { stateBefore: "a", stateAfter: "b", resultCode: "web.action.rejected.target_unobserved" }),
      step(2, "press", { stateBefore: "b", stateAfter: "c" })
    ];
    const reduced = reduceAutomationStudioFlowBootstrapDraft({
      draft: automationStudioFlowDraft(steps), trace: trace(steps), tools,
      classifyOutcome: (code) => code.startsWith("web.action.rejected.") ? "refused" : undefined
    });
    expect(reduced.reduction?.dropped.find((entry) => entry.index === 0)?.reason).toBe("did_not_succeed");
    expect(reduced.reduction?.stateChainIntact).toBe(false);
  });

  it("says nothing was to be kept when the draft is empty", () => {
    const reduced = reduceAutomationStudioFlowBootstrapDraft({ draft: automationStudioFlowDraft([]), trace: [], tools });
    expect(reduced).toEqual({ steps: [], basis: "accrual", gaps: [] });
  });
});
