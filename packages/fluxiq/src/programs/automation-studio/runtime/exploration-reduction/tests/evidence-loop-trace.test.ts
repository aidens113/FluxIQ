import { describe, expect, it } from "vitest";
import { reduceAutomationStudioExploration } from "../backward-slice.ts";
import { automationStudioExplorationStepsFromTrace } from "../evidence-loop-trace.ts";
import type { AutomationStudioLlmEvidenceLoopTrace, AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";

// The adapter reads the trace Phase 2.3 actually produces. These fixtures are
// the shapes `runAutomationStudioRuntimeExploration` writes: a `tool_call`
// entry with a call id for an action that ran, a `tool_call` entry without one
// for a request the loop answered from what it already held, `effectApplied`
// only on a mutating tool, and `complete` / `unusable` entries that are
// provider turns rather than actions.

const TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "web.read", description: "look", inputSchema: {}, effect: "observe" },
  { toolId: "web.click", description: "act", inputSchema: {}, effect: "mutate" },
  { toolId: "web.wait", description: "settle", inputSchema: {}, effect: "mutate" }
];

const DIGESTS: Record<number, { before: string; after: string; input?: Record<string, string> }> = {
  1: { before: "list", after: "list" },
  2: { before: "list", after: "wrong", input: { target: "wrong" } },
  3: { before: "wrong", after: "list", input: { target: "back" } },
  4: { before: "list", after: "right", input: { target: "right" } },
  5: { before: "right", after: "right.loaded" }
};

function stepsFrom(trace: AutomationStudioLlmEvidenceLoopTrace[]) {
  return automationStudioExplorationStepsFromTrace({
    trace,
    tools: TOOLS,
    stateSource: ({ iteration }) => DIGESTS[iteration]
  });
}

describe("automationStudioExplorationStepsFromTrace", () => {
  it("turns an exploration trace into steps and reduces them to the actions that worked", () => {
    const { steps, gaps } = stepsFrom([
      { iteration: 1, decision: "tool_call", callId: "c1", toolId: "web.read", evidenceBytes: 40 },
      { iteration: 2, decision: "tool_call", callId: "c2", toolId: "web.click", evidenceBytes: 20, effectApplied: true },
      { iteration: 3, decision: "tool_call", callId: "c3", toolId: "web.click", evidenceBytes: 20, effectApplied: true },
      { iteration: 4, decision: "tool_call", callId: "c4", toolId: "web.click", evidenceBytes: 20, effectApplied: true },
      { iteration: 5, decision: "tool_call", callId: "c5", toolId: "web.wait", evidenceBytes: 5, effectApplied: true },
      { iteration: 6, decision: "complete", evidenceBytes: 0 }
    ]);

    expect(gaps).toEqual([{ iteration: 6, reason: "not_an_action" }]);
    expect(steps).toHaveLength(5);

    const reduction = reduceAutomationStudioExploration({ steps });
    expect(reduction.actions).toEqual([
      { index: 3, actionId: "web.click", input: { target: "right" } },
      { index: 4, actionId: "web.wait" }
    ]);
    expect(reduction.stateChainIntact).toBe(true);
  });

  // The loop declining to repeat itself is a guard working, not an action
  // failing, and the three codes it writes say so. A step recorded as `failed`
  // here would put a defect where there was none.
  it.each([
    "llm_evidence_loop.already_answered",
    "llm_evidence_loop.already_observed",
    "llm_evidence_loop.rejected.repeat_without_progress"
  ])("records a request the loop answered itself (%s) as never run", (resultCode) => {
    const { steps } = stepsFrom([{ iteration: 1, decision: "tool_call", toolId: "web.read", resultCode }]);

    expect(steps[0]?.outcome).toBe("not_run");
  });

  it("records a mutation the domain reported as not applied as a step that failed", () => {
    const { steps } = stepsFrom([
      { iteration: 2, decision: "tool_call", callId: "c2", toolId: "web.click", evidenceBytes: 10, effectApplied: false }
    ]);

    expect(steps[0]?.outcome).toBe("failed");
  });

  // Core cannot read a domain's own refusal codes and must not learn to, so
  // the domain classifies its own and Core takes the answer.
  it("lets the domain classify its own result codes", () => {
    const { steps } = automationStudioExplorationStepsFromTrace({
      trace: [{ iteration: 2, decision: "tool_call", callId: "c2", toolId: "web.click", evidenceBytes: 10, effectApplied: true, resultCode: "web.action.rejected.target_unsafe" }],
      tools: TOOLS,
      stateSource: ({ iteration }) => DIGESTS[iteration],
      classifyOutcome: (code) => (code.includes("rejected") ? "refused" : undefined)
    });

    expect(steps[0]?.outcome).toBe("refused");
  });

  // The two gaps that matter, and the reason this adapter exists as its own
  // module: the 2.3 trace names the action and not what the world looked like
  // around it, so a caller that cannot answer gets a named gap rather than a
  // reduction computed over a state nobody observed.
  it("reports the step it could get no state digests for instead of guessing them", () => {
    const { steps, gaps } = automationStudioExplorationStepsFromTrace({
      trace: [
        { iteration: 1, decision: "tool_call", callId: "c1", toolId: "web.click", evidenceBytes: 10, effectApplied: true },
        { iteration: 2, decision: "tool_call", callId: "c2", toolId: "web.click", evidenceBytes: 10, effectApplied: true }
      ],
      tools: TOOLS,
      stateSource: ({ iteration }) => (iteration === 1 ? { before: "a", after: "b" } : undefined)
    });

    expect(steps).toHaveLength(1);
    expect(gaps).toEqual([{ iteration: 2, actionId: "web.click", reason: "no_state_digests" }]);
  });

  it("reports an action that is not in the tool table, because its effect is unknown", () => {
    const { steps, gaps } = stepsFrom([{ iteration: 1, decision: "tool_call", callId: "c1", toolId: "web.unknown", evidenceBytes: 1 }]);

    expect(steps).toEqual([]);
    expect(gaps).toEqual([{ iteration: 1, actionId: "web.unknown", reason: "unknown_action" }]);
  });

  it("reports a provider turn that took no action", () => {
    const { gaps } = stepsFrom([
      { iteration: 1, decision: "unusable", resultCode: "llm.decision.malformed" },
      { iteration: 2, decision: "complete" }
    ]);

    expect(gaps).toEqual([
      { iteration: 1, reason: "not_an_action" },
      { iteration: 2, reason: "not_an_action" }
    ]);
  });
});
