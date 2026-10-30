// What Core fills in of a dispatched brief that left it out: its kind, its parts and a repair's failing receipt;
// and that an unchanged repair is answered before any receipt is looked at.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../supervisor/index.ts";
import { planInput, project, subflow, taskSpecInput, type BuilderPlan } from "../../supervisor/tests/supervisor-fixture.ts";
import { FIND, assembled, brief, call, dispatch, end, supervise, test, type Entry } from "../../supervisor/tests/supervisor-script.ts";

const ONE_PART = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>) => shown.filter((entry) => entry.toolId === IDS.dispatch).map((entry) => entry.value as JsonObject);
/** A brief as the supervisor may now send it: only the subflow, the entry and the figures. */
const bare = (extra: JsonObject = {}): JsonObject => {
  const { kind: _kind, parts: _parts, ...rest } = brief("main", []);
  return { ...rest, ...extra };
};
const wholeTest = (evidence: readonly Entry[]): JsonObject => {
  const tested = [...evidence].reverse().find((entry) => entry.toolId === IDS.testCandidate)!.value as JsonObject;
  return { kind: "candidate_trial", receiptId: tested.trialRunId as string, digest: assembled(evidence).digest as string };
};
const blockedFirst: BuilderPlan = (_brief, attempt) => (attempt === 1 ? "blocked" : "done");

describe("a brief that leaves out its kind and parts", () => {
  it("is a build of the parts the plan gives its subflow when nothing came back before, and a repair when its latest return was not done", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([bare()]),
      call(IDS.assemble),
      test,
      dispatch([bare()], "Build again."),
      end("blocked")
    ], project({ trial: () => "no" }));
    expect(run.dispatched[0]!.briefs[0]).toMatchObject({ kind: "build", parts: ["p1"] });
    // Its latest return was done, so it is a build again.
    expect(run.dispatched[1]?.briefs[0]).toMatchObject({ kind: "build", parts: ["p1"] });
  });

  it("is a repair after its latest return came back blocked, with the whole test as its receipt when no trial was listed", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([bare()]),
      dispatch([bare()], "Again."),
      end("blocked")
    ], project({ builder: () => "blocked", notDoneTrials: () => [{ kind: "subflow_trial", receiptId: "trial-listed", digest: "d".repeat(64), verdict: "no" }] }));
    expect(run.dispatched).toHaveLength(2);
    expect(run.dispatched[1]!.briefs[0]).toMatchObject({ kind: "repair", parts: ["p1"], failingReceipt: { kind: "subflow_trial", receiptId: "trial-listed", digest: "d".repeat(64) } });
  });

  it("does not override what was sent: a sent kind and sent parts are read as before", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([bare({ kind: "build", parts: ["nope"] })], "Wrong part."),
      end("blocked")
    ], project());
    expect(answersOf(run.shown)[1]).toMatchObject({ ok: false, issues: [{ code: "project.brief_part_not_carried", path: "briefs.0.parts.0" }] });
    expect(run.dispatched).toHaveLength(1);
  });
});

describe("a repair that leaves out its failing receipt", () => {
  it("names the latest whole test that did not pass, and a sent receipt is checked as before", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      call(IDS.dispatch, () => ({ reason: "Repair.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: { kind: "subflow_trial", receiptId: "trial-made-up", digest: "c".repeat(64) } })] })),
      call(IDS.dispatch, () => ({ reason: "Repair.", briefs: [brief("main", ["p1"], [], { kind: "repair" })] })),
      end("blocked")
    ], project({ trial: () => "no" }));
    expect(answersOf(run.shown)[1]).toMatchObject({ ok: false, issues: [{ code: "project.failing_receipt_unknown", path: "briefs.0.failingReceipt" }] });
    expect(run.dispatched[1]!.briefs[0]).toMatchObject({ kind: "repair", failingReceipt: { kind: "candidate_trial", receiptId: "run-1" }, failingTrial: { verdict: "no" } });
  });

  it("with nothing to repair from, is refused as before, saying a failing receipt is needed", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([bare()], "Repair."),
      end("blocked")
    ], project({ builder: () => "blocked" }));
    expect(answersOf(run.shown)[1]).toMatchObject({ ok: false, code: "project.brief_refused", issues: [{ code: "project.brief_failing_receipt", path: "briefs.0.failingReceipt", why: GUIDANCE.briefIssues["project.brief_failing_receipt"] }] });
    expect(run.dispatched).toHaveLength(1);
  });
});

describe("a repair that would only repeat an unchanged one", () => {
  it("is answered project.repair_unchanged before its receipt is refused", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      call(IDS.dispatch, (evidence) => ({ reason: "Repair.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: wholeTest(evidence) })] })),
      // A receipt no trial of this subflow listed and no whole test is: refused on its own, were it looked at first.
      call(IDS.dispatch, () => ({ reason: "Again.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: { kind: "subflow_trial", receiptId: "trial-made-up", digest: "c".repeat(64) } })] })),
      end("blocked")
    ], project({ trial: () => "unsure" }));
    const [, repaired, again] = answersOf(run.shown);
    expect(repaired).toMatchObject({ ok: true, returns: [{ changedNothing: { sameAs: { briefId: "brief-1" } } }] });
    expect(again).toMatchObject({ ok: false, code: "project.repair_unchanged", instruction: GUIDANCE.refusals.repairUnchangedTest });
    expect(run.dispatched).toHaveLength(2);
  });

  it("is answered so too when it leaves out its kind, parts and receipt", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      call(IDS.dispatch, (evidence) => ({ reason: "Repair.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: wholeTest(evidence) })] })),
      call(IDS.dispatch, () => ({ reason: "Again.", briefs: [bare()] })),
      end("blocked")
    ], project({ trial: () => "unsure" }));
    expect(answersOf(run.shown)[2]).toMatchObject({ ok: false, code: "project.repair_unchanged" });
  });
});
