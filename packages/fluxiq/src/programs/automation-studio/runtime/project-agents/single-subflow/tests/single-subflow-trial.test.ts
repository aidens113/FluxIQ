// A single-subflow plan's builder tests the judged whole run (t679,
// `../single-subflow-trial.ts`), through the supervisor's loop on a scripted
// provider and the build of `./single-build.ts`: the proposal under test is
// assembled and tested with the supervisor's gate, judge and receipts; a yes
// is completed on with no assembly, reset or second test; a no stands as the
// whole test's; a refusal comes back in a builder's terms, never as a
// verdict; and the judge runs under the supervisor's attribution, paid by the
// brief's allowance with the build's judging reserve as its backstop (t685).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { currentAutomationStudioActivityAgent } from "../../../activity/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmCurrentBuildPurse, type AutomationStudioLlmBuildPurseCall } from "../../../llm/build-purse/index.ts";
import { automationStudioTrialJudgingShortfall } from "../../../service/candidate-trial/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { BUILD, planInput, subflow, taskSpecInput } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, HOLD, brief, call, dispatch, end, lastOf, supervise, type Step } from "../../supervisor/tests/supervisor-script.ts";
import { refusalOf, script, singleBuild } from "./single-build.ts";

const ONE_PART = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const TWO_PARTS = planInput([subflow("find_titles", ["p1"], { outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], after: ["find_titles"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const BUILD_ONE = brief("find_newest", ["p1"]);
/** The one brief asking more than Core can give, so it is given what the build can give (`../../supervisor/brief-sizing.ts`), as the live run's was. */
const BUILD_WHOLE = brief("find_newest", ["p1"], [], { allowanceUsd: 1 });
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

  // t685: paid as a candidate builder's trial is; the record still names the judge the supervisor's.
  it("runs the whole judge under the supervisor's attribution, in the brief's allowance carved from the build's purse", async () => {
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
    expect(frames).toHaveLength(1);
    expect(frames[0]!.role).toBe("supervisor");
    expect(frames[0]!.purse?.parent).toBe(purse);
    expect(frames[0]!.purse?.attribution).toEqual({ role: "builder", briefId: "brief-1" });
  });

  // t685, Lab run `run-mvblai1v-a31e7593`: the reserve's four judge calls paid two tests and the third was refused with the brief's allowance almost untouched.
  it("pays a single-path build's many tests from its allowance, never refusing one unaffordable while the allowance can pay", async () => {
    const verdicts = ["no", "no", "no", "no", "no", "yes"] as const;
    const judged = judgedBuild({ spentUsd: 0.001, verdicts });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_WHOLE]), completeOnDispatch], judged.built);
    // Given what the build can give less its finishing calls priced at its average call: $0.25 - $0.001 - the reserve's $0.02 - $0.01.
    expect(judged.carved[0]).toBeCloseTo(0.219, 9);
    expect(judged.unaffordable).toEqual([]);
    expect(judged.built.answers.map((answer) => ("trial" in answer ? answer.trial.verdict : answer.refused.code))).toEqual([...verdicts]);
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    // Six tests' twelve judge calls, all on the brief's allowance: more than the reserve's four, and more than t679's frame left beside the allowance ($0.03).
    expect(judged.payers).toEqual(verdicts.map(() => "brief-1"));
    expect(spentByBriefs(judged.purse)).toBeCloseTo(12 * JUDGE_USD, 9);
    // The reserve is still whole for the judged run and a repair round after the brief.
    expect(judged.purse.judgingFits()).toBe(true);
  });

  it("still judges a test from the reserve once the brief's allowance cannot pay, and leaves the brief no refusal", async () => {
    // $0.225 spent of $0.25 before the build: the brief is given only what is left beside the reserve, too little for a judge pair.
    const judged = judgedBuild({ spentUsd: 0.225, verdicts: ["yes"] });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_WHOLE]), completeOnDispatch], judged.built);
    expect(judged.unaffordable).toEqual([]);
    expect(judged.built.answers[0]).toMatchObject({ trial: { verdict: "yes" } });
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    // The reserve paid the judge: none of it is the brief's spend, and the brief's allowance met no refusal it could end on.
    expect(judged.payers).toEqual(["reserve"]);
    expect(spentByBriefs(judged.purse)).toBe(0);
    expect(judged.purse.spentUsd()).toBeCloseTo(0.225 + 2 * JUDGE_USD, 9);
    expect(judged.allowanceRefusals).toEqual([undefined]);
  });

  it("refuses a test unaffordable only when neither the allowance nor the reserve can pay its judges", async () => {
    // $0.225 spent of $0.25 before the build: the reserve pays two tests' judges, and then neither it nor the brief can pay a third.
    const judged = judgedBuild({ spentUsd: 0.225, verdicts: ["no", "no", "yes"] });
    await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_WHOLE]), end("partial", "The test could not be paid for.")], judged.built);
    expect(judged.payers).toEqual(["reserve", "reserve"]);
    expect(judged.unaffordable).toHaveLength(1);
    const refused = refusalOf(judged.built.answers[2]);
    expect(refused).toMatchObject({ code: "candidate.trial_unaffordable" });
    expect(refused!.instruction).toContain("neither this brief's money nor the money kept for judging");
    expect(judged.allowanceRefusals).toEqual([undefined, undefined, undefined]);
  });

  // G2 (social `run-mvfq957o-40103539`): a retest the build's working time could not cover was started and cut off.
  it("answers a test the build's working time cannot cover as a refusal in a builder's terms, and runs nothing", async () => {
    let now = 0;
    // Each whole test takes 400 s on the run's clock; the build's work stops 700 s after it starts.
    const built = singleBuild({
      testsPerScript: 2,
      trial: () => {
        now += 400_000;
        return "unsure";
      }
    });
    const clock = { setTimeout: () => ({}), clearTimeout: () => undefined, now: () => now };
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_ONE]), end("partial", "The time left could not cover another test.")], built, { timeLimit: { maxMs: 1_000_000, endingMs: 300_000 }, clock });
    expect(built.answers.map((answer) => ("trial" in answer ? answer.trial.verdict : answer.refused.code))).toEqual(["unsure", "project.trial_out_of_time"]);
    expect(run.trials).toHaveLength(1);
    const refused = refusalOf(built.answers[1])!;
    expect(refused.instruction).toMatch(/^About 5 minutes of this build's working time is left, and the last whole test of this same Flow took about 6\.5 minutes/u);
    expect(refused.instruction).toContain("end the brief partial");
    expect(refused.detail).toMatchObject({ refusal: { code: "project.trial_out_of_time", workLeftSeconds: 300, lastTestSeconds: 400, sameFlow: true } });
    expect(refused.retry).toBe(false);
  });

  // G2: the social run's builder went back to a Flow it had tested, as a new revision, and the ending said it was never tested.
  it("hands the build the latest finished test of the same Flow when the latest revision went back to it untested", async () => {
    let now = 0;
    const verdicts = ["unsure", "no"] as const;
    const changed = ["flow: find newest", "step: open the new titles", "  node: web.browser.navigate", "  url: https://library.test/new"];
    const built = singleBuild({
      scripts: () => [script("find_newest"), changed, script("find_newest")],
      trial: (attempt) => {
        now += 400_000;
        return verdicts[attempt - 1]!;
      }
    });
    const clock = { setTimeout: () => ({}), clearTimeout: () => undefined, now: () => now };
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([BUILD_ONE]), end("partial", "The time left could not cover another test.")], built, { timeLimit: { maxMs: 1_300_000, endingMs: 300_000 }, clock });
    expect(built.answers.map((answer) => ("trial" in answer ? answer.trial.verdict : answer.refused.code))).toEqual(["unsure", "no", "project.trial_out_of_time"]);
    // The latest revision is the first Flow again, never tested itself; its own verdict is none, and the first test of that Flow stands beside it.
    expect(run.outcome.candidate?.revision).toBe(3);
    expect(run.outcome.candidate?.digest).toBe(run.trials[0]!.digest);
    expect(run.outcome.trial).toBeUndefined();
    expect(run.outcome.sameFlowTrial).toMatchObject({ revision: 1, digest: run.trials[0]!.digest, verdict: "unsure" });
    expect(run.outcome.trialCut).toBeUndefined();
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

const JUDGE_USD = 0.005;
const judgeCall: AutomationStudioLlmBuildPurseCall = { projectedCostUsd: JUDGE_USD, estimatedInputTokens: 1000, maxOutputTokens: 100, judge: true, price: () => JUDGE_USD };

/**
 * The provider's price, as the harness's calls bring it to `purse`: a decision
 * held at nothing and never sent. A purse notes the price before it decides, so
 * one with nothing left learns it too; its refusal of the decision is put back.
 */
function learnPrice(purse: AutomationStudioLlmBuildPurse): void {
  const before: Array<[AutomationStudioLlmBuildPurse, unknown]> = [];
  for (let owner: AutomationStudioLlmBuildPurse | undefined = purse; owner; owner = owner.parent) before.push([owner, owner.refusal]);
  const learned = purse.hold({ ...judgeCall, judge: false, projectedCostUsd: 0 });
  if (learned.ok) learned.hold.release();
  else for (const [owner, was] of before) owner.refusal = was as AutomationStudioLlmBuildPurse["refusal"];
}

/** What every brief's allowance spent. */
function spentByBriefs(purse: AutomationStudioLlmBuildPurse): number {
  return purse.attributedSpend().reduce((total, spend) => total + spend.spentUsd, 0);
}

/**
 * A single-subflow build on a $0.25 purse with `spentUsd` already settled, four
 * judge calls kept back and the build's finishing calls named, whose whole
 * trials act as the service's trial port does: the trial's two judge calls are
 * probed first (`service/candidate-trial/judging-fits.ts`) on the purse the
 * trial runs under and, held, each paid there at $0.005; refused, the trial is
 * `candidate.trial_unaffordable` and nothing is judged. `payers` says who paid
 * each trial's judges; `allowanceRefusals`, the refusal the brief's allowance
 * holds once each test is answered, as its builder would read it.
 */
function judgedBuild(options: { spentUsd: number; verdicts: ReadonlyArray<"yes" | "no" | "not_judged"> }) {
  // One script per test, each a new revision that goes elsewhere, so a no is answered by the next and no revision is tested twice.
  const scripts = options.verdicts.map((_verdict, index) => [...script("find_newest").slice(0, 3), `  url: https://library.test/catalogue/${index + 1}`]);
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25 });
  const earlier = purse.hold({ projectedCostUsd: undefined, estimatedInputTokens: 1, maxOutputTokens: 1 });
  if (!earlier.ok) throw new Error("expected the earlier spend to be held");
  earlier.hold.settle({ estimatedCostUsd: options.spentUsd });
  // The provider's price, as the harness's first call brings it; never sent.
  learnPrice(purse);
  const unaffordable: JsonObject[] = [];
  const payers: string[] = [];
  const allowanceRefusals: unknown[] = [];
  /** What each brief dispatched was given. */
  const carved: number[] = [];
  let shortfall: JsonObject | undefined;
  const built = singleBuild({
    purse, reserve: { calls: 4, unpriced: { inputTokens: 1000, outputTokens: 100 } },
    scripts: () => scripts,
    trial: (attempt) => {
      const current = automationStudioLlmCurrentBuildPurse()!;
      // The brief's allowance knows the price from its builder's own decisions.
      learnPrice(current);
      shortfall = automationStudioTrialJudgingShortfall({ code: "candidate.trial_unaffordable" });
      if (shortfall) {
        unaffordable.push(shortfall);
        return "not_judged";
      }
      const before = current.spentUsd();
      for (let index = 0; index < 2; index += 1) {
        const held = current.hold(judgeCall);
        if (!held.ok) throw new Error(`a probed judge call was refused: ${JSON.stringify(held.refusal)}`);
        held.hold.settle({ estimatedCostUsd: JUDGE_USD });
      }
      payers.push(current.spentUsd() > before ? current.attribution?.briefId ?? "build" : "reserve");
      return options.verdicts[attempt - 1] ?? "no";
    },
    trialFeedback: () => (shortfall ? { ...shortfall } : { said: "judged" })
  });
  built.ports.finishing = { supervisorCalls: 4, resetCalls: 6 };
  const dispatch = built.ports.dispatch;
  built.ports.dispatch = async (request) => {
    const whole = request.wholeTrial;
    carved.push(...request.briefs.map((sent) => sent.allowanceUsd));
    if (!whole) return await dispatch(request);
    return await dispatch({
      ...request,
      wholeTrial: async (asked) => {
        const answer = await whole(asked);
        allowanceRefusals.push(automationStudioLlmCurrentBuildPurse()?.refusal);
        return answer;
      }
    });
  };
  return { built, purse, unaffordable, payers, allowanceRefusals, carved };
}
