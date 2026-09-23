// The gate on proposing: the draft is run again before it may be the answer.
//
// Two halves, tested here and in the loop's own file. This one is the verdict
// -- which drafts can be replayed at all, what a replay's answers make of them,
// and what the model is told -- and the loop's is the behaviour: that a refusal
// asks the model again, that the replay costs no provider call, and that a
// question about a step the reset could not undo is asked once.
import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunIssueCodes,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayable,
  automationStudioFlowDraftReplayFrom,
  automationStudioFlowDraftReplayOutcomeKey,
  automationStudioFlowDraftReplaySignature,
  type AutomationStudioFlowDraftStep
} from "../index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";

/** An override may say `undefined` for a key, which is how "absent" is tested. */
type StepOverrides = { [Key in keyof AutomationStudioFlowDraftStep]?: AutomationStudioFlowDraftStep[Key] | undefined };

const step = (position: number, over: StepOverrides = {}): AutomationStudioFlowDraftStep => {
  const built: Record<string, unknown> = {
    position,
    iteration: position,
    actionId: "node.click",
    input: { node: "node.click", parameters: {} },
    ranWith: { node: "node.click", parameters: { target: `#c${position}` }, consequences: [] },
    effect: "mutate",
    effectApplied: true,
    disposition: "kept",
    proposes: true,
    replay: { from: { location: "https://store.test/start" }, produced: { records: 16 } }
  };
  // Applied by hand rather than spread, because an override of `undefined` is
  // the key being *absent* -- which is the case half these tests are about --
  // and an exact optional property type will not carry it as a value.
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) delete built[key];
    else built[key] = value;
  }
  return built as unknown as AutomationStudioFlowDraftStep;
};

describe("whether a draft can be replayed at all", () => {
  it("replays a draft whose proposed steps all say what they would be run with", () => {
    expect(automationStudioFlowDraftReplayable([step(1), step(2)])).toBe(true);
    expect(automationStudioFlowDraftReplayFrom([step(1), step(2)])).toEqual({ location: "https://store.test/start" });
  });

  it("does not gate a caller that says nothing about replaying", () => {
    // The whole point: a host whose actions cannot be taken twice is not held
    // to a check it could never pass.
    expect(automationStudioFlowDraftReplayable([step(1, { replay: undefined }), step(2)])).toBe(false);
    expect(automationStudioFlowDraftReplayable([step(1, { ranWith: undefined })])).toBe(false);
    expect(automationStudioFlowDraftReplayable([])).toBe(false);
  });

  it("reads the start from the first proposed step, not the first step", () => {
    const looked = step(1, { proposes: false, effect: "observe", replay: { from: { location: "https://elsewhere.test" } } });
    expect(automationStudioFlowDraftReplayFrom([looked, step(2)])).toEqual({ location: "https://store.test/start" });
  });

  it("changes its signature when the Flow changes and not when the bookkeeping does", () => {
    const before = automationStudioFlowDraftReplaySignature([step(1), step(2)]);
    expect(automationStudioFlowDraftReplaySignature([step(1, { iteration: 9, callId: "other" }), step(2)])).toBe(before);
    expect(automationStudioFlowDraftReplaySignature([step(1), step(2, { disposition: "dropped" })])).not.toBe(before);
    expect(automationStudioFlowDraftReplaySignature([step(2), step(1)])).not.toBe(before);
  });
});

describe("what a replay's answers make of a draft", () => {
  const outcome = (over: Partial<{ step: number; actionId: string; status: "replayed" | "failed" | "changed" | "unreproducible"; resultCode: string }> = {}) =>
    ({ step: 1, actionId: "node.click", status: "replayed" as const, ...over });

  it("lets a draft whose every step replayed be proposed", () => {
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [outcome(), outcome({ step: 2 })], asked: new Set() });
    expect(verdict.ok).toBe(true);
    expect(verdict.providerCalls).toBe(0);
  });

  it("refuses a draft with a step that did not run, or that stopped producing", () => {
    for (const status of ["failed", "changed"] as const) {
      expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [outcome({ status })], asked: new Set() }).ok).toBe(false);
    }
  });

  it("replays nothing and refuses when the target could not be put back", () => {
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "failed", outcomes: [], asked: new Set() });
    expect(verdict.ok).toBe(false);
    expect(automationStudioFlowDraftDryRunIssueCodes(verdict)).toContain("core.replay.reset_failed");
  });

  it("asks about a step the reset could not undo once, and takes the answer", () => {
    const unreproducible = outcome({ status: "unreproducible", resultCode: "core.replay.unreproducible" });
    const first = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [unreproducible], asked: new Set() });
    expect(first.ok).toBe(false);
    const asked = new Set([automationStudioFlowDraftReplayOutcomeKey(unreproducible)]);
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 2, reset: "ok", outcomes: [unreproducible], asked }).ok).toBe(true);
  });

  it("tells the model the issue codes it was refused for, and what each step did", () => {
    const verdict = automationStudioFlowDraftDryRunVerdict({
      attempt: 2, reset: "ok", asked: new Set(),
      outcomes: [outcome(), outcome({ step: 2, status: "changed", resultCode: "core.replay.changed" })]
    });
    expect(automationStudioFlowDraftDryRunIssueCodes(verdict)).toEqual([AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE, "core.replay.changed"]);
    const feedback = automationStudioFlowDraftDryRunFeedback(verdict);
    expect(feedback.steps).toEqual([
      { step: 1, actionId: "node.click", replayed: "replayed" },
      { step: 2, actionId: "node.click", replayed: "changed", resultCode: "core.replay.changed" }
    ]);
    expect(String(feedback.instruction)).toContain("amend_draft rerun");
  });
});

describe("the loop's gate on proposing", () => {
  const tool = { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };

  /** One build: press once, finish, and finish again if the first is refused. */
  const build = async (replies: string[]) => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "node.click", parameters: {}, consequences: [] } })
      .mockResolvedValue({ kind: "complete", result: { summary: "done" } });
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
      if (value.replay === "reset") return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
      if (value.replay === "step") {
        const code = replies.shift() ?? "core.replay.replayed";
        return { kind: "llm_evidence_tool_execution" as const, evidence: { page: "after" }, effectApplied: code === "core.replay.replayed", resultCode: code };
      }
      return {
        kind: "llm_evidence_tool_execution" as const,
        evidence: { page: "start" },
        effectApplied: true,
        draft: {
          actionId: "node.click",
          input: value,
          ranWith: { node: "node.click", parameters: { target: "#c1" }, consequences: [] },
          effect: "mutate" as const,
          proposes: true,
          replay: { from: { location: "https://store.test/start" }, produced: { records: 16 } }
        }
      };
    });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [tool], decide, executeTool, maxIterations: 6, maxToolCalls: 6, minToolCalls: 1,
      unusableDecisions: { maxConsecutive: 4, stalled: () => new Error("stalled") }
    });
    return { result, decide, executeTool };
  };

  it("replays the draft before it accepts a result, and spends no decision on it", async () => {
    const { result, decide, executeTool } = await build(["core.replay.replayed"]);
    expect(result.ok).toBe(true);
    // Two decisions: the press and the completion. The replay's reset and its
    // one step went through executeTool, so nothing was asked of a provider.
    expect(decide).toHaveBeenCalledTimes(2);
    expect(executeTool.mock.calls.map(([call]) => call.value.replay)).toEqual([undefined, "reset", "step"]);
  });

  it("refuses the result and asks again when a step did not replay", async () => {
    const { result, decide } = await build(["core.replay.failed", "core.replay.replayed"]);
    expect(result.ok).toBe(true);
    // Three: the press, the refused completion, and the one that replayed clean.
    expect(decide).toHaveBeenCalledTimes(3);
    expect(result.trace.map((entry) => entry.resultCode)).toContain(AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE);
  });

  it("writes each step's answer onto the step, so the draft carries it", async () => {
    const { result } = await build(["core.replay.replayed"]);
    expect(result.steps.map((entry) => entry.replayed?.status)).toEqual(["replayed"]);
  });

  it("does not replay a caller that says nothing about replaying", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "press", input: { target: "#a" } })
      .mockResolvedValue({ kind: "complete", result: { summary: "done" } });
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { page: "after" }, effectApplied: true }));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const }],
      decide, executeTool, maxIterations: 6, maxToolCalls: 6, minToolCalls: 1
    });
    expect(result.ok).toBe(true);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });
});
