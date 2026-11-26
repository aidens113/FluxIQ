// Three decisions in a row refused for one reason end the round, so the build
// tests what exists instead of spending its purse (week report W2, 2026-10-06;
// `../refusal-run.ts`). The repeat guard stops only identical refusals: lane B
// (`run-muwaq9w3-baaa4e19`, 0027-0036) sent `keep` on a different step each time,
// and `run-murzln6g-11debe1d` spent 14 of 30 decisions on refused amendments.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioLlmEvidenceRefusedCallRun } from "../refusal-run.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../types.ts";
import type { AutomationStudioLlmLoopSignal } from "../../repeat-guard/index.ts";

const press = { toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const stalledError = new Error("stalled");
const complete = { kind: "complete", result: { done: true } };

/** Every press moves the page on and works, except a press on "Gone", which the page refuses. */
function site() {
  let page = 0;
  return vi.fn(async ({ value }: { value: JsonObject }) => {
    const before = `s${page}`;
    if (String(value.target).startsWith("Gone")) {
      return { kind: "llm_evidence_tool_execution", stateDigests: { before, after: before }, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", draft: { actionId: "web.click", effect: "mutate", proposes: true } };
    }
    page += 1;
    return { kind: "llm_evidence_tool_execution", stateDigests: { before, after: `s${page}` }, evidence: { ok: true }, effectApplied: true, resultCode: "web.action.succeeded", draft: { actionId: "web.click", effect: "mutate", proposes: true } };
  });
}

const built = ["A", "B", "C"].map((target) => ({ kind: "tool_call", callId: `press.${target}`, toolId: "press", input: { target }, add: true }));
const loop = (decide: ReturnType<typeof vi.fn>, stalled = true) => runAutomationStudioLlmEvidenceLoop({
  tools: [press], decide, executeTool: site(), maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: stalled,
  ...(stalled ? { unusableDecisions: { maxConsecutive: 8, stalled: () => stalledError } } : {})
});

function decisions(...then: JsonObject[]) {
  const decide = vi.fn();
  for (const decision of [...built, ...then]) decide.mockResolvedValueOnce(decision);
  return decide.mockResolvedValue(complete);
}
// An unrepeat of a step with no repeat is refused `already_so`, whichever step it names. (A keep of a step the framework
// put in is applied, t1037: it makes the step the model's, so it is no longer the refusal these runs need.)
const unrepeat = (step: number) => ({ kind: "amend_draft", amendments: [{ step, change: "unrepeat" }] });

describe("decisions refused for one reason, three in a row", () => {
  it("counts legacy temporary words and unsafe failure claims, while exempting only a typed temporary unacted call", () => {
    type Call = Parameters<typeof automationStudioLlmEvidenceRefusedCallRun>[2];
    const temporary: Call = {
      refused: true, effectApplied: false, effect: "mutate", resultCode: "client.busy_timeout", resultReason: "retry_allowed",
      failure: { category: "action_failed", code: "client.capacity", retryable: true, effect: "unacted", transient: true }
    };
    const variants: Array<[string, Partial<Call>, boolean]> = [
      ["typed temporary", {}, false],
      ["legacy words", { failure: undefined }, true],
      ["not temporary", { failure: { category: "timeout", code: "client.capacity", retryable: true, effect: "unacted" } }, true],
      ["ambiguous", { failure: { ...temporary.failure!, effect: "ambiguous" } }, true],
      ["not retryable", { failure: { ...temporary.failure!, retryable: false } }, true],
      ["policy", { failure: { ...temporary.failure!, category: "blocked_by_capability_or_policy" } }, true],
      ["person needed", { personNeeded: true }, true],
      ["certain no effect alone", { failure: { category: "action_failed", code: "client.capacity", retryable: true, effect: "unacted", certainNoEffect: true } }, true]
    ];
    for (const [label, change, counts] of variants) {
      const refused = vi.fn(() => 1);
      const context = {
        input: {}, trace: [], accounting: {}, draftSteps: [], evidence: [], refusalRun: { refused }, accountEvidence: () => undefined
      } as unknown as AutomationStudioLlmEvidenceDecisionHandlerContext;
      expect(automationStudioLlmEvidenceRefusedCallRun(context, 1, { ...temporary, ...change }), label).toBeUndefined();
      expect(refused, label).toHaveBeenCalledTimes(counts ? 1 : 0);
    }
  });

  it("unrepeats of three different steps with no repeat: warned at the second, the round stalls at the third", async () => {
    const decide = decisions(unrepeat(1), unrepeat(2), unrepeat(3));

    await expect(loop(decide)).rejects.toBe(stalledError);

    expect(decide).toHaveBeenCalledTimes(6);
    const warned = shownAt(decide, 5).find((entry) => entry.toolId === "core.refusal_run")?.value;
    expect(warned).toMatchObject({ ok: false, code: "llm_evidence_loop.refused_in_a_row", inARow: 2, maxInARow: 3 });
    expect(String(warned?.instruction)).toContain("One more decision refused for it ends this exploration");
  });

  it("ends the round where no stall is configured", async () => {
    const result = await loop(decisions(unrepeat(1), unrepeat(2), unrepeat(3)), false);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("repeat_without_progress");
  });

  it("presses the page refused three times in a row for one reason, on three different controls", async () => {
    const gone = (index: number) => ({ kind: "tool_call", callId: `gone.${index}`, toolId: "press", input: { target: `Gone ${index}` } });
    const decide = decisions(gone(1), gone(2), gone(3));

    await expect(loop(decide)).rejects.toBe(stalledError);
    expect(decide).toHaveBeenCalledTimes(6);
  });

  it("does not stop when a decision between them landed, or the reasons differ", async () => {
    const decide = decisions(unrepeat(1), unrepeat(2), { kind: "tool_call", callId: "press.D", toolId: "press", input: { target: "D" }, add: true }, unrepeat(3), { kind: "amend_draft", amendments: [{ step: 9, change: "keep" }] });

    await expect(loop(decide)).resolves.toMatchObject({ ok: true });
  });
});

// t1014 (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"):
// where the caller takes loop detection's signal (the answer-first rounds) no count of refusals ends the round. The run
// is a finding on loop detection's ladder, steered and decided, and only the ladder's last rung ends the round.
describe("decisions refused for one reason, where the caller takes loop detection's signal (t1014)", () => {
  const onTheLadder = (decide: ReturnType<typeof vi.fn>, signals: AutomationStudioLlmLoopSignal[]) => runAutomationStudioLlmEvidenceLoop({
    tools: [press], decide, executeTool: site(), maxIterations: 30, maxToolCalls: 30, dryRun: false, propagateDecisionErrors: true,
    unusableDecisions: { maxConsecutive: 8, stalled: () => stalledError },
    loopSignal: (signal: AutomationStudioLlmLoopSignal) => {
      signals.push(signal);
      return "end";
    }
  } as Parameters<typeof runAutomationStudioLlmEvidenceLoop>[0]);
  const steersOf = (decide: ReturnType<typeof vi.fn>) => decide.mock.calls.flatMap((_, index) => shownAt(decide, index).filter((entry) => entry.toolId === "core.loop_check").map((entry) => entry.value));

  it("three in a row are caught as a repeat, not a round end: the model is asked to decide, and the round goes on to its result", async () => {
    const signals: AutomationStudioLlmLoopSignal[] = [];
    const decide = decisions(unrepeat(1), unrepeat(2), unrepeat(3));

    await expect(onTheLadder(decide, signals)).resolves.toMatchObject({ ok: true });
    expect(signals).toEqual([]);
    // The warning at the second names no figure that ends the round.
    const warned = shownAt(decide, 5).find((entry) => entry.toolId === "core.refusal_run")?.value;
    expect(warned).toMatchObject({ code: "llm_evidence_loop.refused_in_a_row", inARow: 2 });
    expect(warned?.maxInARow).toBeUndefined();
    expect(String(warned?.instruction)).toContain("is caught as a repeat, and you decide how to go on");
    // The third is steered as loop detection's own finding, with the model's loop decision.
    const steer = shownAt(decide, 6).find((entry) => entry.toolId === "core.loop_check")?.value;
    expect(steer).toMatchObject({ code: "llm_evidence_loop.loop_steered", pattern: "no_progress", repeats: 3, toolIds: ["core.refusal_run"] });
    expect(steer?.decide).toMatchObject({ tool: "core.loop_decision" });
    expect(String(steer?.instruction)).toContain("refused, or changed nothing, for the same reason");
  });

  it("refused on and on for one reason, climbs the ladder: only its last rung ends the round, with what it repeated", async () => {
    const signals: AutomationStudioLlmLoopSignal[] = [];
    const decide = vi.fn();
    for (const decision of built) decide.mockResolvedValueOnce(decision);
    decide.mockImplementation(async () => unrepeat(1 + (decide.mock.calls.length % 3)));

    await expect(onTheLadder(decide, signals)).rejects.toBe(stalledError);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "change_approach" });
    // Past the third: the count no longer ended it.
    expect(decide.mock.calls.length).toBeGreaterThan(6);
    expect(steersOf(decide).some((note) => JSON.stringify(note.toolIds) === JSON.stringify(["core.refusal_run"]))).toBe(true);
  });
});
