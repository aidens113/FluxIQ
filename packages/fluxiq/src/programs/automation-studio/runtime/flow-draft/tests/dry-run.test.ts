// The gate on proposing: the draft is run again before it may be the answer.
//
// Two halves, tested here and in the loop's own file. This one is the verdict
// -- which drafts can be replayed at all, what a replay's answers make of them,
// and what the model is told -- and the loop's is the behaviour: that a refusal
// asks the model again, that the replay costs no provider call, and that a
// step which does not replay keeps refusing however often the model insists.
// The gate's own bookkeeping across attempts is `../../llm/node-tools/tests/dry-run-gate.test.ts`.
import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
  automationStudioFlowDraftDryRunFeedback,
  automationStudioFlowDraftDryRunIssueCodes,
  automationStudioFlowDraftDryRunVerdict,
  automationStudioFlowDraftReplayable,
  automationStudioFlowDraftReplayFrom,
  automationStudioFlowDraftReplayOutcomeBlocks,
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
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [outcome(), outcome({ step: 2 })] });
    expect(verdict.ok).toBe(true);
    expect(verdict.providerCalls).toBe(0);
  });

  it("refuses a draft with a step that did not run, or that stopped producing", () => {
    for (const status of ["failed", "changed"] as const) {
      expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [outcome({ status })] }).ok).toBe(false);
    }
  });

  it("replays nothing and refuses when the target could not be put back", () => {
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "failed", outcomes: [] });
    expect(verdict.ok).toBe(false);
    expect(automationStudioFlowDraftDryRunIssueCodes(verdict)).toContain("core.replay.reset_failed");
  });

  it("keeps blocking an unreproducible step on every attempt", () => {
    // Runs 18, 21 and 33: the second report of the same step used to wave it
    // through. Nothing the model was told before changes a verdict now.
    const unreproducible = outcome({ status: "unreproducible", resultCode: "core.replay.unreproducible" });
    for (const attempt of [1, 2, 3]) {
      const verdict = automationStudioFlowDraftDryRunVerdict({ attempt, reset: "ok", outcomes: [outcome({ step: 2 }), unreproducible] });
      expect(verdict.ok, `attempt ${attempt}`).toBe(false);
      expect(automationStudioFlowDraftDryRunIssueCodes(verdict)).toEqual([AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE, "core.replay.unreproducible"]);
    }
    expect(automationStudioFlowDraftReplayOutcomeBlocks(unreproducible)).toBe(true);
    expect(automationStudioFlowDraftReplayOutcomeBlocks(outcome())).toBe(false);
  });

  it("lets an unreproducible step the Flow would not always run through, and only that one", () => {
    const outcomes = [
      { ...outcome({ status: "unreproducible" }), stepId: "d1" },
      { ...outcome({ step: 2 }), stepId: "d2" }
    ];
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes, conditional: new Set(["d1"]) }).ok).toBe(true);
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes, conditional: new Set(["d2"]) }).ok).toBe(false);
  });

  it("marks a step an earlier dry run already reported, and says finishing unchanged is refused again", () => {
    const unreproducible = outcome({ step: 26, status: "unreproducible", resultCode: "core.replay.unreproducible" });
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 2, reset: "ok", outcomes: [outcome({ step: 2 }), unreproducible] });
    const told = new Set([automationStudioFlowDraftReplayOutcomeKey(unreproducible), automationStudioFlowDraftReplayOutcomeKey(outcome({ step: 2 }))]);
    // Only a line that did not replay is marked: step 2 replayed this time.
    expect(automationStudioFlowDraftDryRunFeedback(verdict, told).steps).toEqual([
      { step: 2, actionId: "node.click", replayed: "replayed" },
      { step: 26, actionId: "node.click", replayed: "unreproducible", resultCode: "core.replay.unreproducible", again: true }
    ]);
    expect(automationStudioFlowDraftDryRunFeedback(verdict).steps).toEqual([
      { step: 2, actionId: "node.click", replayed: "replayed" },
      { step: 26, actionId: "node.click", replayed: "unreproducible", resultCode: "core.replay.unreproducible" }
    ]);
    const instruction = String(automationStudioFlowDraftDryRunFeedback(verdict).instruction);
    expect(instruction).toContain("finishing again with it unchanged is refused again");
    expect(instruction).not.toContain("it will be accepted");
  });

  it("tells the model the issue codes it was refused for, and what each step did", () => {
    const verdict = automationStudioFlowDraftDryRunVerdict({
      attempt: 2, reset: "ok",
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

  it("no longer excuses a repeated step the test ran once per row, unless a withheld effect is why it did not replay (t252)", () => {
    const passes = [{ pass: 1, status: "replayed" as const }, { pass: 2, status: "unreproducible" as const, resultCode: "core.replay.unreproducible" }];
    const ran = { ...outcome({ step: 2, status: "unreproducible", resultCode: "core.replay.unreproducible" }), stepId: "d2", passes };
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [ran], conditional: new Set(["d2"]) }).ok).toBe(false);
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [{ ...ran, withheldBy: 1 }], conditional: new Set(["d2"]) }).ok).toBe(true);
    // Run once on the explored row, as before t252: still excused.
    const { passes: _passes, ...once } = ran;
    expect(automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [once], conditional: new Set(["d2"]) }).ok).toBe(true);
  });

  it("shows a repeated step's passes and the first that did not replay, and says a repeat runs once per item (t252)", () => {
    const verdict = automationStudioFlowDraftDryRunVerdict({
      attempt: 1, reset: "ok",
      outcomes: [
        { ...outcome({ step: 2, status: "unreproducible", resultCode: "core.replay.unreproducible" }), passes: [{ pass: 1, status: "replayed" }, { pass: 2, status: "unreproducible", resultCode: "core.replay.unreproducible" }, { pass: 3, status: "replayed" }] },
        { ...outcome({ step: 3 }), passes: [] }
      ]
    });
    expect(automationStudioFlowDraftDryRunFeedback(verdict).steps).toEqual([
      { step: 2, actionId: "node.click", replayed: "unreproducible", resultCode: "core.replay.unreproducible", passes: 3, pass: 2 },
      { step: 3, actionId: "node.click", replayed: "replayed", passes: 0 }
    ]);
    const instruction = String(automationStudioFlowDraftDryRunFeedback(verdict).instruction);
    expect(instruction).toContain("once for each item");
    expect(instruction).toContain("loop_bound");
    expect(instruction).toContain("unresolved_binding");
  });
});

describe("a refusal for a step the test never reached the page of", () => {
  // Run muqk4u32 (t174 F41): the arrival kept, a refused press, then the ×, the
  // search and the listing taken and never added, then the item-page steps
  // kept. Dry runs 1 and 2 listed step 1 replayed and 6-13 unreproducible, and
  // nothing named 3-5: the model spent decisions 0038-0055 finding them.
  const draft = (): AutomationStudioFlowDraftStep[] => [
    step(1, { stateBefore: "blank", stateAfter: "home+popup" }),
    step(2, { stateBefore: "home+popup", stateAfter: "home+popup", effectApplied: false, disposition: "taken" }),
    step(3, { stateBefore: "home+popup", stateAfter: "home", disposition: "taken" }),
    step(4, { stateBefore: "home", stateAfter: "results", disposition: "taken" }),
    step(5, { stateBefore: "results", stateAfter: "item+consent", disposition: "taken" }),
    step(6, { stateBefore: "item+consent", stateAfter: "item" }),
    step(7, { stateBefore: "item", stateAfter: "item-grey" })
  ];
  type Status = "replayed" | "failed" | "unreproducible";
  const outcomes = (statuses: [Status, Status, Status]) => statuses.map((status, index) => ({ step: [1, 6, 7][index]!, actionId: "node.click", status }));

  it("names the steps that changed the page on the way to it and are not in the Flow", () => {
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: outcomes(["replayed", "unreproducible", "unreproducible"]) });
    const feedback = automationStudioFlowDraftDryRunFeedback(verdict, new Set(), draft());
    expect(feedback.notInFlow).toBe("Steps 3, 4 and 5 changed the page on the way to step 6 when you ran them, and are not in the Flow, so the test never reached the page step 6 acted on: add them (amend_draft add).");
  });

  it("names one such step in the singular, and leaves out a detour", () => {
    const steps = draft();
    // The search is already in the Flow; the listing was opened, left, and opened again.
    steps[3]!.disposition = "kept";
    steps.splice(5, 0,
      step(6, { stateBefore: "item+consent", stateAfter: "results", disposition: "taken" }),
      step(7, { stateBefore: "results", stateAfter: "item+consent", disposition: "taken" }));
    steps.forEach((each, index) => { each.position = index + 1; each.iteration = index + 1; });
    const verdict = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: [
      { step: 4, actionId: "node.click", status: "replayed" }, { step: 8, actionId: "node.click", status: "unreproducible" }
    ] });
    expect(automationStudioFlowDraftDryRunFeedback(verdict, new Set(), steps).notInFlow).toBe("Step 7 changed the page on the way to step 8 when you ran it, and is not in the Flow, so the test never reached the page step 8 acted on: add it (amend_draft add).");
  });

  it("says nothing more when every step on the way is in the Flow, when the step failed rather than went unreached, or without the draft", () => {
    const kept = draft().map((each) => (each.position === 2 ? each : { ...each, disposition: "kept" as const }));
    const unreached = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: outcomes(["replayed", "unreproducible", "unreproducible"]) });
    expect(automationStudioFlowDraftDryRunFeedback(unreached, new Set(), kept)).not.toHaveProperty("notInFlow");
    const failed = automationStudioFlowDraftDryRunVerdict({ attempt: 1, reset: "ok", outcomes: outcomes(["replayed", "failed", "replayed"]) });
    expect(automationStudioFlowDraftDryRunFeedback(failed, new Set(), draft())).not.toHaveProperty("notInFlow");
    expect(automationStudioFlowDraftDryRunFeedback(unreached)).not.toHaveProperty("notInFlow");
  });
});

describe("the loop's gate on proposing", () => {
  const tool = { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };

  /** One build: press once, finish, and finish again if the first is refused. */
  const build = async (replies: string[]) => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "node.click", parameters: {}, consequences: [] }, add: true })
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

  // A loop that authors no Flow (the recovery ladder's exploration) finishes
  // with whatever it ran: its caller said nothing about running a step again.
  it("does not replay a caller that says nothing about replaying, where the loop authors no Flow", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "press", input: { target: "#a" }, add: true })
      .mockResolvedValue({ kind: "complete", result: { summary: "done" } });
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { page: "after" }, effectApplied: true }));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const }],
      decide, executeTool, maxIterations: 6, maxToolCalls: 6, minToolCalls: 1
    });
    expect(result.ok).toBe(true);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  // t244 (user, 2026-10-02): a Flow is finished only once it has run whole
  // from its start and been judged. In a build, a caller that says nothing
  // about running a step again used to be "not a caller this gate applies to",
  // and its Flow was proposed untested; its completion is now refused for
  // exactly that, and nothing is run again.
  it("refuses, and runs nothing again, a build's Flow whose caller cannot run its steps again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "press", input: { target: "#a" }, add: true })
      .mockResolvedValue({ kind: "complete", result: { summary: "done" } });
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { page: "after" }, effectApplied: true }));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const }],
      decide, executeTool, maxIterations: 3, maxToolCalls: 6, minToolCalls: 1, unusableDecisions: { stalled: () => new Error("stalled") }, fullRunRequired: true
    });
    expect(result.ok).toBe(false);
    expect(executeTool).toHaveBeenCalledTimes(1);
    const shown = decide.mock.calls[2]?.[0].evidence.find((entry: { toolId: string }) => entry.toolId === "core.dry_run");
    expect(shown?.value).toMatchObject({ code: "llm_evidence_loop.full_run_required", steps: [{ step: 1, actionId: "press", replayed: "cannot_run_again" }] });
  });
});
