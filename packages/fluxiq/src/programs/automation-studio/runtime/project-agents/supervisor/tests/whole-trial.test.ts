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
import { FIND, HOLD, assembled, brief, call, complete, dispatch, end, lastOf, reset, supervise, test, type Step } from "./supervisor-script.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioProjectSupervisorContext } from "../context.ts";
import { AutomationStudioProjectSupervisorState } from "../state.ts";
import { AutomationStudioProjectSupervisorWholeTrial } from "../whole-trial.ts";

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

  // F1 continuation (user, 2026-10-12): a reset that came back blocked no longer lets the whole test run on what it
  // left. Only an act named under cannotUndo is kept; one nobody named is still to undo, and the test is refused.
  it("refuses the test after a reset that undid nothing and named nothing under cannotUndo, and runs no trial on the leftovers", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble), test,
      dispatch([reset()], "Put the target back before the whole test."), test,
      end("blocked", "The act could not be undone.")
    ], project({ ledger: { undoes: false }, trial: () => "no" }));
    const [first, again] = tests(run.shown);
    expect(first).toMatchObject({ code: "project.trial_reset_required" });
    expect(again).toMatchObject({ ok: false, code: "project.trial_reset_required", actsInPlace: [{ act: "act-1", brief: "brief-2" }] });
    expect(run.trials).toHaveLength(0);
    expect(run.ledger!.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", inPlace: true })]);
  });

  it("runs the test with an act the site cannot undo, named under cannotUndo, kept and the judge told, and an ending names it", async () => {
    const cannotUndo: Step = call(IDS.testCandidate, (evidence) => ({ ...assembled(evidence), cannotUndo: ["act-1"] }));
    const run = await supervise([
      call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble), test,
      dispatch([reset()], "Put the target back before the whole test."), cannotUndo,
      end("blocked", "The whole test was judged no.")
    ], project({ ledger: { undoes: false }, trial: () => "no" }));
    const [first, ran] = tests(run.shown);
    expect(first).toMatchObject({ code: "project.trial_reset_required" });
    expect(ran).toMatchObject({ verdict: "no", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    expect(run.trials).toHaveLength(1);
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.ending?.reason).toContain("Still on the target from this build: trial step 1 \"press hold for place_hold\" (the build could not undo it; it may still be there).");
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

// t684 (t683 open question 2): an ending held for a reset kept its reason through a test refused for that reset, so the reset's
// answer said to end again, though the model had chosen to test.
describe("a whole test refused for a reset", () => {
  it("drops the reason an ending or a completion was held for, as a test that ran does", async () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const state = new AutomationStudioProjectSupervisorState();
    const trial = new AutomationStudioProjectSupervisorWholeTrial({ ports: { projectLedger: ledger }, state });
    const gate = { test: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "candidate.trial_reset_required", actsToUndo: [] } }) };
    const context = { ports: { projectLedger: ledger }, state, gate, controller: { latest: () => undefined }, signal: undefined } as unknown as AutomationStudioProjectSupervisorContext;
    for (const held of [{ by: "ending" as const }, { by: "completion" as const, complete: { revision: 2, digest: "d".repeat(64) } }]) {
      state.resetToEnd = held;
      const answered = await trial.test(context, { revision: 2, digest: "d".repeat(64) }, undefined);
      expect(answered.evidence).toMatchObject({ ok: false, code: "project.trial_reset_required" });
      expect(state.resetToEnd).toBeUndefined();
    }
  });
});

// A whole test the build's working time cannot cover is not started (G2,
// social debug `run-mvfq957o-40103539`): with about 2.5 minutes of the
// build's working time left, a revision whose last test had taken 337 s was
// tested again, the work deadline cut it off after 150 s, and the build ended
// a draft whose ending said it was "never tested from its start". The
// supervisor's whole test measures every test it runs, refuses one the time
// left cannot plausibly cover, and remembers each Flow's latest finished test
// and a test of it the time limit cut, for the ending to say. Generic data
// only: the gate is a stub, the clock the test's own.

const FIRST = "a".repeat(64);
const SECOND = "b".repeat(64);
const MINUTE = 60_000;

/**
 * A whole test over a stub gate on the test's clock: each test the gate runs takes the next of `durations` and answers
 * `verdict`; the build's work deadline is `workMs` after the clock's start.
 */
function harness(options: { workMs: number; durations: number[]; verdict?: string }) {
  let now = 0;
  const ran: JsonObject[] = [];
  const ledger = new AutomationStudioSiteResetProjectLedger();
  const state = new AutomationStudioProjectSupervisorState();
  const trial = new AutomationStudioProjectSupervisorWholeTrial({ ports: { projectLedger: ledger }, state, time: { now: () => now, workLeftMs: () => options.workMs - now } });
  const gate = {
    test: async (value: JsonObject) => {
      ran.push(value);
      now += options.durations.shift() ?? 0;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: false, verdict: options.verdict ?? "unsure", revision: value.revision, digest: value.digest, trialRunId: `run-${ran.length}` } };
    },
    standing: () => undefined,
    completion: () => ({ ok: false })
  };
  const ports = { projectLedger: ledger, build: { projectId: "p", flowId: "f", buildId: "b" }, record: { recordReceipt: async () => undefined } };
  const context = { ports, state, gate, controller: { latest: () => undefined }, signal: undefined } as unknown as AutomationStudioProjectSupervisorContext;
  return { trial, context, ran, gate, advance: (ms: number) => { now += ms; } };
}

describe("a whole test against the build's working time", () => {
  it("is refused when the time left cannot cover the same Flow's measured test, saying how much is left and to end honestly", async () => {
    const run = harness({ workMs: 25 * MINUTE, durations: [337_000] });
    await run.trial.test(run.context, { revision: 5, digest: FIRST }, undefined);
    // The build works on until about two and a half minutes are left, then asks the same Flow again.
    run.advance(25 * MINUTE - 337_000 - 150_000);
    const refused = await run.trial.test(run.context, { revision: 7, digest: FIRST }, undefined);

    expect(run.ran).toHaveLength(1);
    expect(refused.evidence).toMatchObject({ ok: false, code: "project.trial_out_of_time", workLeftSeconds: 150, lastTestSeconds: 337, sameFlow: true });
    const instruction = String((refused.evidence as JsonObject).instruction);
    expect(instruction).toMatch(/^About 2\.5 minutes of this build's working time is left, and the last whole test of this same Flow took about 5\.5 minutes/u);
    expect(instruction).toContain("End honestly now with ended");
    expect(refused.resultCode).toBe("project.trial_out_of_time");
  });

  it("estimates a Flow never tested from the build's latest finished test", async () => {
    const run = harness({ workMs: 10 * MINUTE, durations: [240_000] });
    await run.trial.test(run.context, { revision: 1, digest: FIRST }, undefined);
    run.advance(3 * MINUTE);
    const refused = await run.trial.test(run.context, { revision: 2, digest: SECOND }, undefined);

    expect(run.ran).toHaveLength(1);
    expect(refused.evidence).toMatchObject({ code: "project.trial_out_of_time", workLeftSeconds: 180, lastTestSeconds: 240, sameFlow: false });
    expect(String((refused.evidence as JsonObject).instruction)).toContain("the latest whole test of this build took about 4 minutes");
  });

  it("starts a test the time left covers with its margin, and the first test of a build with nothing measured", async () => {
    const run = harness({ workMs: 25 * MINUTE, durations: [300_000, 300_000] });
    expect((await run.trial.test(run.context, { revision: 1, digest: FIRST }, undefined)).evidence).toMatchObject({ verdict: "unsure" });
    // Ten minutes left against a five-minute test: started.
    run.advance(25 * MINUTE - 300_000 - 10 * MINUTE);
    expect((await run.trial.test(run.context, { revision: 1, digest: FIRST }, undefined)).evidence).toMatchObject({ verdict: "unsure" });
    expect(run.ran).toHaveLength(2);
  });

  it("keeps a margin: a test that would only just fit is not started", async () => {
    const run = harness({ workMs: 20 * MINUTE, durations: [200_000] });
    await run.trial.test(run.context, { revision: 1, digest: FIRST }, undefined);
    // 205 s left against a measured 200 s: inside the margin.
    run.advance(20 * MINUTE - 200_000 - 205_000);
    expect((await run.trial.test(run.context, { revision: 1, digest: FIRST }, undefined)).evidence).toMatchObject({ code: "project.trial_out_of_time" });
  });

  it("runs as before with no clock to measure on", async () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const state = new AutomationStudioProjectSupervisorState();
    const trial = new AutomationStudioProjectSupervisorWholeTrial({ ports: { projectLedger: ledger }, state });
    const run = harness({ workMs: 0, durations: [] });
    const answered = await trial.test({ ...run.context, state } as AutomationStudioProjectSupervisorContext, { revision: 1, digest: FIRST }, undefined);
    expect(answered.evidence).toMatchObject({ verdict: "unsure" });
  });
});

describe("what a whole test remembers of each Flow for the build's ending", () => {
  it("names the latest finished test of the same Flow, and a later test of it the time limit cut", async () => {
    const run = harness({ workMs: 60 * MINUTE, durations: [120_000] });
    await run.trial.test(run.context, { revision: 5, digest: FIRST }, undefined);
    expect(run.trial.lastOfFlow(FIRST)).toEqual({ revision: 5, cutAfter: false });
    expect(run.trial.lastOfFlow(SECOND)).toBeUndefined();

    // The same Flow, submitted again as a later revision, is tested and the work deadline cuts that test off.
    const stopped = new AbortController();
    run.gate.test = async () => {
      stopped.abort(new DOMException("The project build reached its time limit.", "TimeoutError"));
      throw stopped.signal.reason;
    };
    await expect(run.trial.test(run.context, { revision: 7, digest: FIRST }, stopped.signal)).rejects.toThrow("time limit");
    expect(run.trial.lastOfFlow(FIRST)).toEqual({ revision: 5, cutAfter: true });
  });

  it("says a cut test of a Flow never finished as a cut with no finished test", async () => {
    const run = harness({ workMs: 60 * MINUTE, durations: [] });
    const stopped = new AbortController();
    run.gate.test = async () => {
      stopped.abort(new DOMException("The project build reached its time limit.", "TimeoutError"));
      throw stopped.signal.reason;
    };
    await expect(run.trial.test(run.context, { revision: 1, digest: SECOND }, stopped.signal)).rejects.toThrow("time limit");
    expect(run.trial.lastOfFlow(SECOND)).toEqual({ revision: undefined, cutAfter: true });
  });
});
