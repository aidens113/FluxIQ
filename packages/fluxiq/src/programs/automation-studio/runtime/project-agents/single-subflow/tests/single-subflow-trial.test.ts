// A single-subflow plan's builder tests the judged whole run (t679,
// `../single-subflow-trial.ts`), through the supervisor's loop on a scripted
// provider and the build of `./single-build.ts`: the proposal under test is
// assembled and tested with the supervisor's gate, judge and receipts; a yes
// is completed on with no assembly, reset or second test; a no stands as the
// whole test's; a refusal comes back in a builder's terms, never as a
// verdict; and the judge runs in the supervisor's purse frame.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { currentAutomationStudioActivityAgent } from "../../../activity/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmCurrentBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { BUILD, planInput, subflow, taskSpecInput } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, HOLD, brief, call, dispatch, end, lastOf, supervise, type Step } from "../../supervisor/tests/supervisor-script.ts";
import { refusalOf, script, singleBuild } from "./single-build.ts";

const ONE_PART = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const TWO_PARTS = planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const BUILD_ONE = brief("find_newest", ["p1"]);
/** Completes with the complete object the latest dispatch answer carries. */
const completeOnDispatch: Step = (evidence) => ({ kind: "complete", result: lastOf(evidence, IDS.dispatch)!.complete as JsonObject });
const answersOf = (seen: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => seen.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

describe("a single-subflow plan's builder test", () => {
  it("assembles exactly the proposal under test, records the whole trial's receipt, and is completed on with no assembly or second test", async () => {
    const built = singleBuild();
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_ONE]), completeOnDispatch], built);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(built.wholeTrialOffered).toEqual([true]);
    // One whole trial, of the revision the builder's proposal assembled to.
    expect(run.trials).toHaveLength(1);
    const trial = built.answers[0]!;
    if (!("trial" in trial)) throw new Error(`expected a trial, got ${JSON.stringify(trial)}`);
    expect(trial.trial).toMatchObject({ partial: true, scope: "subflow", verdict: "yes", entryPrepared: true, revision: 1, trialRunId: "run-1", identity: { briefId: "brief-1", subflowKey: "find_newest" } });
    expect(trial.trial.acts).toBeUndefined();
    expect(trial.trial.feedback).toMatchObject({ wholeTest: { revision: run.trials[0]!.revision, digest: run.trials[0]!.digest, verdict: "yes", trialRunId: "run-1" }, complete: run.trials[0] });
    // The assembled Flow is that proposal's subflow, behind nothing it did not write.
    expect(run.outcome.candidate?.buildPlan.plan.subflows.map((entry) => entry.key)).toEqual(["find_newest"]);
    expect(run.outcome.candidate).toMatchObject(run.trials[0]!);
    // The dispatch answer says to complete, with the complete object; the record holds the whole trial's receipt.
    const answered = answersOf(run.seen, IDS.dispatch)[0]!;
    expect(answered).toMatchObject({ ok: true, complete: run.trials[0], next: GUIDANCE.next.afterSingleWholeYes, returns: [{ outcome: "done", trials: [{ kind: "subflow_trial", receiptId: "run-1" }] }] });
    const view = await run.record.read(BUILD);
    expect(view?.record.receipts).toEqual([expect.objectContaining({ receipt: { kind: "candidate_trial", receiptId: "run-1", digest: run.trials[0]!.digest } })]);
    expect(run.outcome.trial).toMatchObject({ verdict: "yes", revision: run.trials[0]!.revision });
  });

  it("keeps a no as the whole test's: the gate stands no, the brief comes back short, and an ending is accepted", async () => {
    const built = singleBuild({ trial: () => "no" });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_ONE]), end("partial", "The whole test was judged no.")], built);
    expect(run.trials).toHaveLength(1);
    expect(built.answers[0]).toMatchObject({ trial: { verdict: "no" } });
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.trial).toMatchObject({ verdict: "no" });
    const answered = answersOf(run.seen, IDS.dispatch)[0]!;
    expect(answered.next).toBe(GUIDANCE.next.afterReturnsNotDone);
    expect(answered.complete).toBeUndefined();
  });

  it("answers acts still on the site as a refusal in a builder's terms, and runs once they are undone", async () => {
    let acted = 0;
    const built = singleBuild({
      // The builder's first test meets an act of its brief still in place; it undoes it before testing the same revision again.
      testsPerScript: 2,
      beforeTest: async (sent, ledger) => {
        acted += 1;
        if (acted === 1) ledger.forBrief(sent.briefId).trialRan([{ step: 1, definitionId: "web.output.dom-click", label: "press renew", consequences: ["create_new"] }], "explored-1");
        else {
          // Its undo, then its own gate's reset finding it gone, as a builder's test does before it asks the port.
          for (const act of ledger.snapshot().acts.filter((entry) => entry.inPlace)) ledger.forBrief(act.owner).explored({ callId: `undo-${act.act}`, toolId: "core.run_node", undoes: act.act, landed: true, on: "own", declared: { permitted: true, effect: "mutate", consequences: [], control: { name: "Undo renew", kind: "button" }, verb: "click" } });
          await ledger.forBrief(sent.briefId).beforeTrial({ compare: async () => ({ moved: false }) });
        }
      }
    });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_ONE]), completeOnDispatch], built);
    const first = refusalOf(built.answers[0]);
    expect(first).toMatchObject({ code: "candidate.trial_reset_required", retry: true, detail: { actsToUndo: [{ act: "act-1" }] } });
    expect(first!.instruction).toContain("Undo each with the site's own controls");
    expect(first!.instruction).toContain("goes under cannotUndo when you test again");
    expect(first!.instruction).not.toContain("project.dispatch");
    // No trial ran for the refusal, and the next test ran once the act was undone.
    expect(run.trials).toHaveLength(1);
    expect(built.answers[1]).toMatchObject({ trial: { verdict: "yes" } });
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
  });

  // The whole test's repeated refusal holds only while acts are still to undo (`../../supervisor/whole-trial.ts`).
  it("runs once the builder names an act it could not undo under cannotUndo in its own test, with no reset brief", async () => {
    let acted = 0;
    const built = singleBuild({
      testsPerScript: 2,
      beforeTest: async (sent, ledger) => {
        acted += 1;
        if (acted === 1) ledger.forBrief(sent.briefId).trialRan([{ step: 1, definitionId: "web.output.dom-click", label: "press renew", consequences: ["create_new"] }], "explored-1");
        // Its own gate's reset, told the act the site offers no control to undo, as a builder's test passes cannotUndo.
        else await ledger.forBrief(sent.briefId).beforeTrial({ compare: async () => ({ moved: false }) }, ["act-1"]);
      }
    });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_ONE]), completeOnDispatch], built);
    expect(refusalOf(built.answers[0])).toMatchObject({ code: "candidate.trial_reset_required" });
    expect(built.answers[1]).toMatchObject({ trial: { verdict: "yes" } });
    expect(run.trials).toHaveLength(1);
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"]]);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
  });

  it("offers no whole test for a plan of several subflows", async () => {
    const built = singleBuild();
    const run = await supervise([call(IDS.writePlan, TWO_PARTS), dispatch([brief("find_titles", ["p1"])]), end("blocked")], built);
    expect(built.wholeTrialOffered).toEqual([false]);
    expect(run.trials).toHaveLength(0);
  });

  it("runs the whole judge in the supervisor's purse frame and attribution, never the builder's allowance", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 });
    const frames: Array<{ purse: AutomationStudioLlmBuildPurse | undefined; role: string | undefined }> = [];
    const built = singleBuild({
      purse, reserve: { calls: 2, unpriced: { inputTokens: 1000, outputTokens: 0 } },
      onTrial: () => {
        frames.push({ purse: automationStudioLlmCurrentBuildPurse(), role: currentAutomationStudioActivityAgent()?.role });
      }
    });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_ONE]), completeOnDispatch], built);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(frames).toEqual([{ purse, role: "supervisor" }]);
  });

  // The composed submission's unchanged rule (`flow-bootstrap/candidate/unchanged-submission.ts`) never refuses a retest.
  it("tests the same proposal again on the revision it already made, and a changed proposal on a new one", async () => {
    const changed = ["flow: find newest", "step: open the new titles", "  node: web.browser.navigate", "  url: https://library.test/new"];
    const verdicts = ["not_judged", "no", "yes"] as const;
    const built = singleBuild({ scripts: () => [script("find_newest"), changed], testsPerScript: 2, trial: (attempt) => verdicts[attempt - 1]! });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_ONE]), completeOnDispatch], built);
    expect(built.answers.map((answer) => ("trial" in answer ? answer.trial.verdict : answer.refused.code))).toEqual(["not_judged", "no", "yes"]);
    // The first proposal's two tests ran its one revision; the changed proposal made the next.
    expect(run.trials.map((trial) => trial.revision)).toEqual([1, 1, 2]);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(run.outcome.candidate?.revision).toBe(2);
  });
});
