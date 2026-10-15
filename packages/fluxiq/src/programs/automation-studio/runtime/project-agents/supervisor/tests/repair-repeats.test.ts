// What a repair starts from, and the briefs that could only spend on nothing
// (bigbox and crossborder debug, t595). Bigbox `run-mv8c7unr-42a8456d` sent
// eight repairs after one whole test failed: each named a passing trial or
// the whole test, each builder wrote the same steps again and came back done,
// and nothing said the build had not moved. Crossborder `run-mv8c76i3-61b9ca89`
// sent a brief again, unchanged, after it came back blocked.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, project, subflow, taskSpecInput, type BuilderPlan } from "./supervisor-fixture.ts";
import { FIND, assembled, brief, call, dispatch, end, supervise, test, type Entry } from "./supervisor-script.ts";

const ONE_PART = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);
/** The latest whole test, named as a repair's failing receipt names it. */
const wholeTest = (evidence: readonly Entry[]): JsonObject => {
  const tested = [...evidence].reverse().find((entry) => entry.toolId === IDS.testCandidate)!.value as JsonObject;
  return { kind: "candidate_trial", receiptId: tested.trialRunId as string, digest: assembled(evidence).digest as string };
};
const repairOf = (receipt: (evidence: readonly Entry[]) => JsonObject, reason = "The whole test did not pass.") => call(IDS.dispatch, (evidence) => ({ reason, briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: receipt(evidence) })] }));

describe("a repair's failing receipt", () => {
  it("naming the latest whole test, carries what that test said onto the brief its builder is sent", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      repairOf(wholeTest),
      end("blocked")
    ], project({ trial: () => "no" }));
    const sent = run.dispatched[1]!.briefs[0]!;
    expect(sent).toMatchObject({ kind: "repair", failingReceipt: { kind: "candidate_trial", receiptId: "run-1" } });
    expect(sent.failingTrial).toEqual({ verdict: "no", said: { said: "no" } });
    // The record holds it too, so a supervisor started again reads the same brief.
    expect(run.view!.record.briefs[1]!.brief.failingTrial).toEqual({ verdict: "no", said: { said: "no" } });
  });

  it("is refused, by its path and with the whole test to copy, when it names a trial that passed, one no return listed, or a whole test that is not the latest", async () => {
    const tested = [call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test];
    const run = await supervise([
      ...tested,
      // The yes the done build ended on.
      repairOf(() => ({ kind: "subflow_trial", receiptId: "trial-brief-1", digest: "c".repeat(64) })),
      repairOf(() => ({ kind: "subflow_trial", receiptId: "trial-made-up", digest: "c".repeat(64) })),
      end("blocked")
    ], project({ trial: () => "no" }));
    const [, passed, unknown] = answersOf(run.shown, IDS.dispatch);
    const copy = { kind: "candidate_trial", receiptId: "run-1" };
    expect(passed).toMatchObject({ ok: false, code: "project.brief_refused", issues: [{ code: "project.failing_receipt_passed", path: "briefs.0.failingReceipt", why: GUIDANCE.issues.failingPassed, wholeTest: copy }] });
    expect(unknown).toMatchObject({ ok: false, issues: [{ code: "project.failing_receipt_unknown", path: "briefs.0.failingReceipt", why: GUIDANCE.issues.failingUnknown, wholeTest: copy }] });
    expect(run.dispatched).toHaveLength(1);

    const stale = await supervise([...tested, repairOf((evidence) => ({ ...wholeTest(evidence), receiptId: "run-9" })), end("blocked")], project({ trial: () => "no" }));
    expect(answersOf(stale.shown, IDS.dispatch)[1]).toMatchObject({ ok: false, issues: [{ code: "project.failing_receipt_not_latest_test", path: "briefs.0.failingReceipt", why: GUIDANCE.issues.failingNotLatestTest, wholeTest: copy }] });
  });
});

// A8 wave 7 `run-mv9dd0fk-8cd2e522` (t630): a subflow whose return listed no trial was sent a repair naming another
// subflow's trial, then one with no receipt, which came back as a code and a path alone; four decisions went on finding
// out that there was nothing to repair from.
describe("a repair of a subflow with nothing to repair from", () => {
  it("is refused saying no trial is listed and no whole test stands, and a repair with no receipt says in words what it needs", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      repairOf(() => ({ kind: "subflow_trial", receiptId: "trial-of-another-subflow", digest: "c".repeat(64) })),
      dispatch([brief("main", ["p1"], [], { kind: "repair" })], "Repair what came back blocked."),
      end("blocked")
    ], project({ builder: () => "blocked" }));
    const [blocked, unknown, noReceipt] = answersOf(run.shown, IDS.dispatch);
    expect(blocked).toMatchObject({ ok: true, returns: [{ outcome: "blocked", trials: [] }] });
    expect(unknown).toMatchObject({ ok: false, code: "project.brief_refused", issues: [{ code: "project.failing_receipt_unknown", path: "briefs.0.failingReceipt", why: GUIDANCE.issues.failingNone }] });
    expect((unknown!.issues as JsonObject[])[0]).not.toHaveProperty("wholeTest");
    expect(noReceipt).toMatchObject({ ok: false, code: "project.brief_refused", issues: [{ code: "project.brief_failing_receipt", path: "briefs.0.failingReceipt", why: GUIDANCE.briefIssues["project.brief_failing_receipt"] }] });
    expect(run.dispatched).toHaveLength(1);
  });

  it("still says to copy a listed trial where a return of the subflow listed one", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      repairOf(() => ({ kind: "subflow_trial", receiptId: "trial-made-up", digest: "c".repeat(64) })),
      end("blocked")
    ], project({ builder: () => "blocked", notDoneTrials: () => [{ kind: "subflow_trial", receiptId: "trial-listed", digest: "d".repeat(64) }] }));
    expect(answersOf(run.shown, IDS.dispatch)[1]).toMatchObject({ ok: false, issues: [{ code: "project.failing_receipt_unknown", why: GUIDANCE.issues.failingUnknown }] });
  });
});

describe("a repair that changed nothing", () => {
  it("comes back said to have changed nothing, and a further brief of that subflow is refused, pointing at the retest", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      repairOf(wholeTest),
      repairOf(wholeTest, "Try the repair again."),
      end("blocked")
    ], project({ trial: () => "unsure" }));
    const [, repaired, again] = answersOf(run.shown, IDS.dispatch);
    // The fixture's builder writes the same script for a subflow every time.
    expect(repaired).toMatchObject({ ok: true, returns: [{ briefId: "brief-2", kind: "repair", outcome: "done", changedNothing: { sameAs: { briefId: "brief-1", revision: 1 } } }], next: GUIDANCE.next.afterRepairUnchanged });
    expect(again).toMatchObject({
      ok: false,
      code: "project.repair_unchanged",
      instruction: GUIDANCE.refusals.repairUnchangedTest,
      unchanged: [{ path: "briefs.0", subflowKey: "main", repair: "brief-2", sameAs: { briefId: "brief-1", revision: 1 } }],
      latestTest: { revision: 1, verdict: "unsure", trialsSoFar: 1 }
    });
    expect(run.dispatched).toHaveLength(2);
  });

  it("says to amend or end when the latest test cannot be repeated, and lets a brief run again once a retest changed what stands", async () => {
    const closed = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      repairOf(wholeTest),
      repairOf(wholeTest),
      end("blocked")
    ], project({ trial: () => "no" }));
    expect(answersOf(closed.shown, IDS.dispatch)[2]).toMatchObject({ code: "project.repair_unchanged", instruction: GUIDANCE.refusals.repairUnchangedEnd, latestTest: { revision: 1, verdict: "no" } });

    const retested = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      repairOf(wholeTest),
      test,
      repairOf(wholeTest),
      end("blocked")
    ], project({ trial: () => "unsure" }));
    expect(retested.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"], ["repair"], ["repair"]]);
  });
});

describe("a brief sent again after it came back blocked", () => {
  const blockedFirst: BuilderPlan = (_brief, attempt) => (attempt === 1 ? "blocked" : "done");

  it("is not run while nothing it starts from has changed, and says what came back and what to do", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([brief("main", ["p1"])], "Try again."),
      end("blocked")
    ], project({ builder: blockedFirst }));
    expect(answersOf(run.shown, IDS.dispatch)[1]).toMatchObject({
      ok: false,
      code: "project.brief_repeated",
      instruction: GUIDANCE.refusals.briefRepeated,
      repeated: [{ path: "briefs.0", subflowKey: "main", lastBrief: { briefId: "brief-1", outcome: "blocked", reason: "The main control could not be found." } }]
    });
    expect(run.dispatched).toHaveLength(1);
  });

  it("runs once what its builder is given changed", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([brief("main", ["p1"], [], { recordingExcerpt: "The search box is under Browse." })], "It is under Browse."),
      end("blocked")
    ], project({ builder: blockedFirst }));
    expect(answersOf(run.shown, IDS.dispatch)[1]).toMatchObject({ ok: true, returns: [{ briefId: "brief-2", outcome: "done" }] });
  });
});
