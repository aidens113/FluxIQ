// Once a judged yes stands for the latest revision and the gate lets it
// complete, Core completes the brief itself, without calling the provider
// (t811, `../../../../subflow-submit-then/builder-auto-complete.ts`): after a
// plain test as after a folded one, with a line the chat shows as Core's. A yes
// Core could not confirm, held for its rows, or standing beside a repair
// completes nothing, and the model decides as before.
import { describe, expect, it } from "vitest";
import { automationStudioActivityDecisionReason } from "../../../../../activity/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, type AutomationStudioSubflowTrialKeptEveryRowRead, type AutomationStudioSubflowTrialResult } from "../../../index.ts";
import { answerOf, runBuilder, submitCall, twoSteps, type Entry } from "./then-fixture.ts";

const test = (evidence: readonly Entry[]) => {
  const submitted = answerOf(evidence, "submit");
  return { kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "test", input: { revision: submitted.revision!, digest: submitted.digest! } };
};
const ended = () => ({ kind: "complete", result: { ended: "partial", reason: "the yes was not taken" } });
const checkRepair = () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, callId: "repair-test", input: { fromStepImpossible: "The earlier failed run left no step that can be resumed." } });
const FLAGGED: AutomationStudioSubflowTrialKeptEveryRowRead = {
  nodeId: "s2", kept: 3,
  keptEveryRow: { narrowerRead: "s1", narrowerSeen: 7, narrowerKept: 3, actedBy: ["s1"], sameList: "items_edge_and_read_target", said: "Step s2 read the same list as step s1." }
};
/** A whole test that stopped at a step, as another brief of the same subflow could leave it in the repair memory they share. */
const STOPPED = { partial: true, scope: "subflow", verdict: "execution_failed", entryPrepared: true, feedback: { code: "candidate.execution_incomplete", steps: [{ step: 2, status: "failed", failureCode: "web.target.not_found" }] } } as unknown as AutomationStudioSubflowTrialResult;

describe("a builder whose latest revision passed its test (t811)", () => {
  it("completes after a plain test's yes with no further provider decision, as a decision Core made", async () => {
    const run = await runBuilder([submitCall("submit", twoSteps()), test, () => { throw new Error("the provider was asked after a yes"); }], { trials: [{ verdict: "yes" }] });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.decides()).toBe(2);
    const last = run.decisions.at(-1) as { kind: string; result: unknown };
    expect(last).toEqual({ kind: "complete", result: { subflowKey: "find_listing", revision: 1, digest: run.outcome.proposal!.digest } });
    expect(automationStudioActivityDecisionReason.isCoreWritten(last)).toBe(true);
    expect(automationStudioActivityDecisionReason.of(last)).toBe("Core finished this part of the task because the latest version passed its test, so nothing was left to decide.");
    expect(run.outcome.trial).toMatchObject({ verdict: "yes" });
    expect(run.outcome.ended).toBeUndefined();
  });

  it("does not complete on a yes Core could not confirm: the model decides", async () => {
    const unconfirmed = { verdict: "not_judged" as const, feedback: { code: "candidate.trial_not_judged", why: "Held.", yesUnconfirmed: true } };
    const run = await runBuilder([submitCall("submit", twoSteps()), test, ended], { trials: [unconfirmed] });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.decides()).toBe(3);
    expect(automationStudioActivityDecisionReason.isCoreWritten(run.decisions.at(-1))).toBe(false);
    expect(run.outcome.ended).toMatchObject({ outcome: "partial" });
  });

  it("does not complete on a yes held for the rows it kept: the model decides", async () => {
    const run = await runBuilder([submitCall("submit", twoSteps()), test, ended], { trials: [{ verdict: "yes", keptEveryRow: [FLAGGED] }], checkRows: async () => ({ converse: "unconfirmed" }) });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(answerOf(run.seen[2]!, "test")).toMatchObject({ verdict: "unsure" });
    expect(run.decides()).toBe(3);
    expect(run.outcome.ended).toMatchObject({ outcome: "partial" });
  });

  it("does not complete while a repair stands beside the yes: the model decides", async () => {
    // The yes clears this builder's own repair; one the shared memory then holds, as another brief of the subflow could leave it, holds Core back.
    const receipt = (evidence: readonly Entry[]) => {
      const submitted = answerOf(evidence, "submit");
      return { kind: "complete", result: { subflowKey: "find_listing", revision: submitted.revision!, digest: submitted.digest! } };
    };
    const run = await runBuilder([submitCall("submit", twoSteps(), { then: "test_whole" }), receipt, checkRepair], {
      fromStep: true,
      afterCall: (callId, repair) => {
        if (callId === "submit") repair.afterWholeTest(STOPPED, { revision: 1, digest: "f".repeat(64), subflows: [] });
      }
    });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.answers.get("submit")!.tested).toMatchObject({ verdict: "yes", revision: 1 });
    expect(run.seen[2]!.some(entry => (entry.value as { code?: string }).code === "subflow.trial_from_step_first")).toBe(true);
    expect(run.pendingRepair.standing).toBe(false);
    expect(run.decides()).toBe(3);
    expect(automationStudioActivityDecisionReason.isCoreWritten(run.decisions[1])).toBe(false);
    expect(automationStudioActivityDecisionReason.isCoreWritten(run.decisions.at(-1))).toBe(true);
  });

  it("tells the model the exact receipt when it sends anything else after a yes Core held back for a repair", async () => {
    // Since t811 a plain yes completes before the model is asked; only a yes held back like this still reaches the t581/t601
    // refusals; a receipt beside an ending must still wait for the repair check before Core completes.
    const receipt = (evidence: readonly Entry[]) => {
      const submitted = answerOf(evidence, "submit");
      return { kind: "complete", result: { subflowKey: "find_listing", revision: submitted.revision!, digest: submitted.digest!, ended: "partial", reason: "It is a partial trial." } };
    };
    const run = await runBuilder([
      submitCall("submit", twoSteps(), { then: "test_whole" }),
      () => ({ kind: "complete", result: { outcome: "done" } }),
      () => ({ kind: "complete", result: { ended: "blocked", reason: "The subflow before this one never prepared its entry." } }),
      receipt,
      checkRepair
    ], {
      fromStep: true,
      afterCall: (callId, repair) => {
        if (callId === "submit") repair.afterWholeTest(STOPPED, { revision: 1, digest: "f".repeat(64), subflows: [] });
      }
    });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    // Each refusal is shown to the decision after it: the malformed completion's to the third, the ending's to the fourth.
    const refusal = (decision: number, code: string) => run.seen[decision]!.find((entry) => (entry.value as { code?: unknown }).code === code)?.value as { instruction?: string } | undefined;
    expect(refusal(2, "subflow.ending_shape")?.instruction).toMatch(/^Revision 1 of this subflow passed its trial, so the brief is done: complete with exactly \{"subflowKey": "find_listing", "revision": 1, "digest": "[0-9a-f]+"\} and nothing else\.$/u);
    expect(refusal(3, "subflow.ending_after_yes")?.instruction).toMatch(/^Revision 1 of this subflow passed its trial, so the brief is done: complete with exactly \{"subflowKey": "find_listing", "revision": 1, "digest": "[0-9a-f]+"\}\.$/u);
    expect(run.outcome.ended).toBeUndefined();
    expect(refusal(4, "subflow.trial_from_step_first")).toBeDefined();
    expect(run.decides()).toBe(5);
  });

  it("completes on the loop's last decision, which offers only finishing", async () => {
    // Two turns: the folded submission, then Core's completion as the final decision of the builder's budget.
    const run = await runBuilder([submitCall("submit", twoSteps(), { then: "test_whole" })], { iterations: 2 });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.decides()).toBe(1);
    expect(run.decisions.at(-1)).toMatchObject({ kind: "complete", result: { revision: 1 } });
  });
});
