// A builder that submits with then, scripted end to end through its loop (t811):
// a clean submission's test answers in the submission's own answer and a yes
// completes the brief with no further provider decision; while a failed test's
// repair stands, a whole test is refused; and a submission that asks to run
// from a step, named as the script wrote it, runs from that step.
import { describe, expect, it } from "vitest";
import { runBuilder, submitCall, twoSteps, answerOf } from "./then-fixture.ts";

describe("a builder that submits with then (t811)", () => {
  it("gets its verdict in the submit answer, and a yes completes with no further provider decision", async () => {
    const run = await runBuilder([submitCall("submit", twoSteps(), { then: "test_whole" }), () => { throw new Error("the provider was asked after a yes"); }], { fromStep: true });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.decides()).toBe(1);
    expect(run.asked).toHaveLength(1);
    expect(run.answers.get("submit")!.tested).toMatchObject({ partial: true, verdict: "yes", revision: 1 });
    expect(run.decisions.at(-1)).toMatchObject({ kind: "complete", result: { subflowKey: "find_listing", revision: 1 } });
  });

  it("is refused a whole test while a repair stands, then runs from the step its script named", async () => {
    const steps = [
      submitCall("submit-1", twoSteps(), { then: "test_whole" }),
      submitCall("submit-2", twoSteps(".filter-open"), { then: "test_whole" }),
      submitCall("submit-3", twoSteps(".filter-any"), { then: { from: "second" } }),
      () => ({ kind: "complete", result: { ended: "partial", reason: "stopping after the run from a step" } })
    ];
    const run = await runBuilder(steps, { fromStep: true, trials: [{ verdict: "execution_failed" }] });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    const failed = answerOf(run.seen[1]!, "submit-1");
    expect(failed.tested).toMatchObject({ verdict: "execution_failed", revision: 1 });
    // The second whole test is refused: the failed test's repair is not checked yet.
    const refused = answerOf(run.seen[2]!, "submit-2");
    expect(refused).toMatchObject({ ok: true, revision: 2 });
    expect(refused.tested).toMatchObject({ ok: false, code: "subflow.trial_from_step_first" });
    expect(run.asked).toHaveLength(1);
    // The run from the step labelled "second", as the script wrote it.
    const fromStep = answerOf(run.seen[3]!, "submit-3");
    expect(fromStep.testedWith).toMatchObject({ revision: 3, from: "second" });
    expect(fromStep.tested, JSON.stringify(fromStep.tested)).toMatchObject({ ok: true, fromStep: true, passed: true });
    expect(run.ran).toHaveLength(1);
    expect(run.outcome.lastTrial).toMatchObject({ verdict: "execution_failed", revision: 1 });
  });

  it("tests whole while a repair stands where the submission says why a run from the step cannot check it", async () => {
    const steps = [
      submitCall("submit-1", twoSteps(), { then: "test_whole" }),
      submitCall("submit-2", twoSteps(".filter-open"), { then: "test_whole", fromStepImpossible: "the step needs state only the start makes" }),
      () => { throw new Error("the provider was asked after a yes"); }
    ];
    const run = await runBuilder(steps, { fromStep: true, trials: [{ verdict: "execution_failed" }, { verdict: "yes" }] });
    expect(run.outcome.loop.ok, JSON.stringify(run.outcome.loop)).toBe(true);
    expect(run.asked).toHaveLength(2);
    expect(run.answers.get("submit-2")!.tested).toMatchObject({ verdict: "yes", revision: 2 });
    expect(run.decides()).toBe(2);
  });
});
