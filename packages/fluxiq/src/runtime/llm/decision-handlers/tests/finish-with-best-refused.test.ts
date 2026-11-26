// A best result the check refuses does not end the repeat it was given on (t1011, run-mwug2xjw-41f62603:
// after finish_with_best was judged no, the incident was already closed, the steer still asked for a
// decision, the answer still said "being checked", and the model went back to a look made before the
// catch). Through the real evidence loop with a scripted model and check; the site is made up.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceLoopInput } from "../../index.ts";
import { automationStudioLlmLoopAttemptRecord, type AutomationStudioLlmLoopSignal } from "../../repeat-guard/index.ts";

const tools = [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
const stalledError = new Error("stalled");
type Shown = ReadonlyArray<{ toolId: string; callId: string; value: JsonObject }>;
const shownAt = (decide: ReturnType<typeof vi.fn>, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const noteAt = (decide: ReturnType<typeof vi.fn>, index: number, toolId: string): JsonObject | undefined => shownAt(decide, index).filter((entry) => entry.toolId === toolId).at(-1)?.value;
const press = (index: number) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "press", input: { target: "Close", reason: `try ${index}` } });
const best = { kind: "tool_call", callId: "decide.3", toolId: "core.loop_decision", input: { decision: "finish_with_best", result: { answer: "the best there is" } } };
const done = { kind: "complete", result: { answer: "the right one" } };
const covered = () => vi.fn(async () => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: "s1", after: "s1" }, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_covered", draft: { actionId: "web.click", effect: "mutate", proposes: true } }));
const JUDGED_NO = { ok: false as const, issueCodes: ["answer_first.judged_no"], feedback: { code: "answer_first.judged_no", instruction: "A row the request leaves out is kept.", defects: [{ kind: "kept_not_asked", row: "Spare key", requestWords: "only the front door keys" }] } };

/** Two reworded presses (the second is caught and steered), the best result, then the scripted rest. */
function run(rest: readonly unknown[], checkCompletion: ReturnType<typeof vi.fn>) {
  const steps = [press(1), press(2), best, ...rest];
  const decide = vi.fn();
  decide.mockImplementation(async () => steps[decide.mock.calls.length - 1] ?? done);
  const executeTool = covered();
  const signals: AutomationStudioLlmLoopSignal[] = [];
  const record = automationStudioLlmLoopAttemptRecord();
  const ran = runAutomationStudioLlmEvidenceLoop({
    tools, decide, executeTool: executeTool as unknown as AutomationStudioLlmEvidenceLoopInput["executeTool"], maxIterations: 60, maxToolCalls: 60, dryRun: false, propagateDecisionErrors: true,
    unusableDecisions: { stalled: () => stalledError },
    loopSignal: (signal: AutomationStudioLlmLoopSignal) => {
      signals.push(signal);
      return "end";
    },
    checkCompletion,
    attemptRecord: record
  } as AutomationStudioLlmEvidenceLoopInput);
  return { ran, decide, executeTool, record };
}

describe("finish_with_best, refused by the check", () => {
  it("keeps the repeat refused, and the answer says the result was not accepted and where the check's reasons are", async () => {
    const checkCompletion = vi.fn().mockResolvedValueOnce(JUDGED_NO).mockResolvedValue({ ok: true });
    const { ran, decide, executeTool, record } = run([press(4)], checkCompletion);
    await expect(ran).resolves.toMatchObject({ ok: true, result: { answer: "the right one" } });
    // The decision that follows the refusal sees the check's reasons, then the decision's answer in place of "being checked".
    const after = shownAt(decide, 3);
    const answers = after.filter((entry) => entry.toolId === "core.loop_decision");
    expect(answers).toHaveLength(1);
    expect(answers[0]!.value).toMatchObject({ ok: true, code: "core.loop_decision.carried_out", decision: "finish_with_best", accepted: false });
    expect(String(answers[0]!.value.instruction)).toContain("Your best result was not accepted: core.completion_check says why");
    expect(String(answers[0]!.value.instruction)).toContain("The repeat you were caught in stays refused");
    expect(String(answers[0]!.value.instruction)).not.toContain("is being checked");
    expect(noteAt(decide, 3, "core.completion_check")).toMatchObject({ code: "answer_first.judged_no", defects: [{ row: "Spare key" }] });
    // The steer that asked for the decision is answered, so it no longer asks.
    expect(noteAt(decide, 3, "core.loop_check")).toBeUndefined();
    // The repeat it gave up on is refused before it runs: a different step is what comes next.
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(noteAt(decide, 4, "core.repeat_check")).toMatchObject({ code: "llm_evidence_loop.repeat_refused" });
    expect(record.data().decisions).toEqual([{ decision: "finish_with_best", pattern: "near_repeat", repeats: 2 }]);
  });

  it("a yes ends the task with that result, as it always did", async () => {
    const checkCompletion = vi.fn(async () => ({ ok: true as const }));
    const { ran, executeTool } = run([], checkCompletion);
    await expect(ran).resolves.toMatchObject({ ok: true, result: { answer: "the best there is" } });
    expect(checkCompletion).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledTimes(2);
  });
});

describe("any decision carried out", () => {
  it("takes the steer that asked for it out of the window", async () => {
    const steps = [press(1), press(2), { kind: "tool_call", callId: "decide.3", toolId: "core.loop_decision", input: { decision: "change_approach", approach: "open the menu first" } }];
    const decide = vi.fn();
    decide.mockImplementation(async () => steps[decide.mock.calls.length - 1] ?? { kind: "complete", result: { done: true } });
    await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool: covered() as unknown as AutomationStudioLlmEvidenceLoopInput["executeTool"], maxIterations: 60, maxToolCalls: 60, dryRun: false, propagateDecisionErrors: true,
      unusableDecisions: { stalled: () => stalledError },
      loopSignal: () => "end",
      attemptRecord: automationStudioLlmLoopAttemptRecord()
    } as AutomationStudioLlmEvidenceLoopInput);
    expect(noteAt(decide, 2, "core.loop_check")).toBeDefined();
    expect(noteAt(decide, 3, "core.loop_check")).toBeUndefined();
    expect(noteAt(decide, 3, "core.loop_decision")).toMatchObject({ decision: "change_approach" });
  });
});
