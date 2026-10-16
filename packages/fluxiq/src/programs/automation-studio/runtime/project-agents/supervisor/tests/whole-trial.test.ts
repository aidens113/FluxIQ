// The supervisor's whole test puts the target back as a candidate build's
// does (t586): the deployment's start hook first, then the build's own
// ledgers, a reset brief only for acts left after that; and a supervisor a
// guard stopped is followed by Core's own reset and an ending that names what
// is still on the target. Run on the build of `./supervisor-fixture.ts` with
// its real lasting-act ledger.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { BUILD, planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { singleBuild } from "../../single-subflow/tests/single-build.ts";
import { FIND, HOLD, brief, call, complete, dispatch, end, lastOf, reset, supervise, test, type Step } from "./supervisor-script.ts";

const TWO_PART = planInput([subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const BUILDS = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] })];
const tests = (seen: ReadonlyArray<{ toolId: string; value: unknown }>) => seen.filter((entry) => entry.toolId === IDS.testCandidate).map((entry) => entry.value as JsonObject);

describe("the supervisor's whole test", () => {
  it("runs the deployment's start hook first, which takes back the build's acts, and tests with no reset brief", async () => {
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble), test, complete], project({ ledger: { hook: true } }));
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(run.hooks).toEqual([0]);
    expect(run.trials).toHaveLength(1);
    expect(tests(run.shown)[0]).toMatchObject({ verdict: "yes", absorbedByStartReset: [{ act: "act-1", did: expect.stringContaining("press hold for place_hold") }] });
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"]]);
    expect(run.ledger!.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", owner: "brief-2", inPlace: false })]);
  });

  it("asks for a reset brief for the acts no hook took back, repeats that until one came back, then tests", async () => {
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble), test, dispatch([brief("find_titles", ["p1"])], "Read the titles again."), test, dispatch([reset()], "Put the target back before the whole test."), test, complete], project({ ledger: {} }));
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    const [first, again, after] = tests(run.shown);
    expect(first).toMatchObject({ ok: false, code: "project.trial_reset_required", actsInPlace: [{ act: "act-1", brief: "brief-2" }] });
    expect(String(first!.instruction)).toContain("project.dispatch");
    // A test sent again after other work but no reset is refused the same way, never admitted as the ledgers' no-progress case.
    expect(again).toMatchObject({ ok: false, code: "project.trial_reset_required", actsInPlace: [{ act: "act-1" }] });
    expect(after).toMatchObject({ verdict: "yes" });
    expect(after!.startedWith).toBeUndefined();
    expect(run.trials).toHaveLength(1);
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"], ["build"], ["reset"]]);
  });

  it("runs the test with an act the site cannot undo kept and the judge told, and an ending names it", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble), test,
      dispatch([reset()], "Put the target back before the whole test."), test,
      end("blocked", "The whole test was judged no.")
    ], project({ ledger: { undoes: false }, trial: () => "no" }));
    const [first, ran] = tests(run.shown);
    expect(first).toMatchObject({ code: "project.trial_reset_required" });
    expect(ran).toMatchObject({ verdict: "no", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    expect(run.trials).toHaveLength(1);
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.ending?.reason).toContain("Still on the target from this build: trial step 1 \"press hold for place_hold\" (the site offers no way to undo it).");
  });
});

// t679: on a plan of one subflow the builder's test was the judged whole run of that revision.
describe("the supervisor's whole test of a single-subflow plan", () => {
  const ONE_PART = planInput([subflow("find_newest", ["p1"])], taskSpecInput([["p1", FIND, []]]));
  const testDispatched: Step = (evidence) => ({ kind: "tool_call", toolId: IDS.testCandidate, callId: "test-again", input: lastOf(evidence, IDS.dispatch)!.complete as JsonObject });
  const completeOnTest: Step = (evidence) => ({ kind: "complete", result: lastOf(evidence, IDS.testCandidate)!.complete as JsonObject });

  it("answers a test of the revision its builder's test already judged yes with that yes, and runs no second trial", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("find_newest", ["p1"])]), testDispatched, completeOnTest], singleBuild());
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    expect(run.trials).toHaveLength(1);
    const again = tests(run.shown)[0]!;
    expect(again).toMatchObject({ ok: true, verdict: "yes", alreadyJudged: true, complete: run.trials[0], trialRunId: "run-1" });
    expect(String(again.instruction)).toContain("No second trial ran");
    // One receipt: the builder's test's.
    expect((await run.record.read(BUILD))!.record.receipts).toHaveLength(1);
  });
});

describe("a supervisor a guard stopped", () => {
  // Completions with nothing assembled, refused until the no-progress guard stalls the loop.
  const unassembled = () => ({ kind: "complete", result: { revision: 1, digest: "a".repeat(64) } });
  const stalls = [call(IDS.writePlan, TWO_PART), dispatch(BUILDS), unassembled, unassembled, unassembled];

  it("is followed by Core's own reset brief, and its ending names what that reset left in place", async () => {
    const built = project({ ledger: { undoes: false }, purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) });
    await expect(supervise(stalls, built, { maxStepsWithoutProgress: 2, propagateDecisionErrors: true })).rejects.toThrow("stalled");
    expect(built.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"], ["reset"]]);
    expect(built.dispatched[1]!.briefs[0]).toMatchObject({ subflowKey: "place_hold", permittedActs: [] });
    const view = await built.record.read(BUILD);
    expect(view?.record.ending?.outcome).toBe("partial");
    expect(view?.record.ending?.reason).toContain("The supervisor stopped before a whole trial passed");
    expect(view?.record.ending?.reason).toContain("Still on the target from this build: trial step 1 \"press hold for place_hold\".");
  });

  it("ends naming nothing left once Core's reset undid every act", async () => {
    const built = project({ ledger: {}, purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) });
    await expect(supervise(stalls, built, { maxStepsWithoutProgress: 2, propagateDecisionErrors: true })).rejects.toThrow("stalled");
    expect(built.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"], ["reset"]]);
    const view = await built.record.read(BUILD);
    expect(view?.record.ending?.reason).not.toContain("Still on the target");
    expect(built.ledger!.snapshot().acts.every((act) => !act.inPlace)).toBe(true);
  });
});
