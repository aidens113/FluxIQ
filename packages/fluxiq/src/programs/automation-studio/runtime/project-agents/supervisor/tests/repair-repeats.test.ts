// What a repair starts from, and the briefs that could only spend on nothing
// (bigbox and crossborder debug, t595). Bigbox `run-mv8c7unr-42a8456d` sent
// eight repairs after one whole test failed: each named a passing trial or
// the whole test, each builder wrote the same steps again and came back done,
// and nothing said the build had not moved. Crossborder `run-mv8c76i3-61b9ca89`
// sent a brief again, unchanged, after it came back blocked.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { STOPPED_REASON, planInput, project, subflow, taskSpecInput, type BuilderPlan } from "./supervisor-fixture.ts";
import { FIND, HOLD, assembled, brief, call, dispatch, end, supervise, test, type Entry } from "./supervisor-script.ts";

/** A script any callable subflow with no interface may be built with. */
const OPEN = (sent: { subflowKey: string }) => ["flow: Open the catalogue", `part ${sent.subflowKey}: open the catalogue`, "  step: open the catalogue", "    node: web.browser.navigate", "    url: https://library.test/catalogue", "end"];
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

  // A8 wave 10 crossborder `run-mv9q50ui-1736d010` (t638): a repeat beside a changed repair refused the whole call, twice.
  it("is held back alone: the other briefs of the call are sent, numbered on, and the repeat is answered beside their returns", async () => {
    const TWO = planInput([subflow("find_titles", ["p1"]), subflow("place_hold", ["p2"])], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []]]));
    const run = await supervise([
      call(IDS.writePlan, TWO),
      dispatch([brief("find_titles", ["p1"]), brief("place_hold", ["p2"])]),
      dispatch([brief("find_titles", ["p1"]), brief("place_hold", ["p2"], [], { recordingExcerpt: "The hold control is under Request." })], "Try both again."),
      end("blocked")
    ], project({ builder: blockedFirst, script: OPEN }));
    expect(answersOf(run.shown, IDS.dispatch)[1]).toMatchObject({
      ok: true,
      returns: [{ briefId: "brief-3", subflowKey: "place_hold", outcome: "done" }],
      notSent: {
        code: "project.brief_repeated",
        instruction: GUIDANCE.refusals.briefRepeatedOthersSent,
        repeated: [{ path: "briefs.0", subflowKey: "find_titles", lastBrief: { briefId: "brief-1", outcome: "blocked" } }]
      }
    });
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.briefId))).toEqual([["brief-1", "brief-2"], ["brief-3"]]);
    expect(run.view!.record.briefs.map((entry) => entry.brief.briefId)).toEqual(["brief-1", "brief-2", "brief-3"]);
  });

  it("refuses the whole call when a brief left would run after the repeat", async () => {
    const AFTER = planInput([subflow("find_titles", ["p1"]), subflow("place_hold", ["p2"], { after: ["find_titles"] })], taskSpecInput([["p1", FIND, []], ["p2", HOLD, []]]));
    const run = await supervise([
      call(IDS.writePlan, AFTER),
      dispatch([brief("find_titles", ["p1"])]),
      dispatch([brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"])], "Try again, then hold."),
      end("blocked")
    ], project({ builder: blockedFirst }));
    expect(answersOf(run.shown, IDS.dispatch)[1]).toMatchObject({ ok: false, code: "project.brief_repeated", instruction: GUIDANCE.refusals.briefRepeated, repeated: [{ path: "briefs.0", subflowKey: "find_titles" }] });
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

// Live lane 1 fix 1 (`run-mvcx8na6-9554a3f1`): a builder looped between two pages until the no-progress guard
// stopped it, and the supervisor's second brief of that subflow, unchanged, was refused `project.brief_repeated`
// with most of the build's money unspent. The first such stop of a subflow under the plan in force now lets the
// same brief go, carrying the earlier attempt; a second such stop, and every other blocked return, is refused as before.
describe("a brief sent again after its builder was stopped for repeating itself", () => {
  it("is sent the first time, carrying the earlier attempt's reason and the lasting acts it left", async () => {
    let ledger: AutomationStudioSiteResetProjectLedger | undefined;
    const stoppedFirst: BuilderPlan = (_brief, attempt) => (attempt === 1 ? "stopped" : "done");
    const built = project({
      builder: stoppedFirst,
      // The stopped builder left one lasting act on the target, as its explored press would.
      onBrief: (sent) => {
        if (sent.briefId === "brief-1") ledger!.forBrief("brief-1").trialRan([{ step: 1, definitionId: "web.output.dom-click", label: "press the add control", consequences: ["create_new"] }], "trial-stopped");
      }
    });
    ledger = built.ledger;
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([brief("main", ["p1"])], "Its builder was stopped for repeating itself; send it once more."),
      end("blocked")
    ], built);
    const [stopped, again] = answersOf(run.shown, IDS.dispatch);
    expect(stopped).toMatchObject({ ok: true, returns: [{ briefId: "brief-1", outcome: "blocked", stoppedRepeating: true, reason: STOPPED_REASON }], next: GUIDANCE.next.afterReturnsNotDone });
    expect(again).toMatchObject({ ok: true, returns: [{ briefId: "brief-2", outcome: "done" }] });
    expect(again).not.toHaveProperty("notSent");
    const sent = run.dispatched[1]!.briefs[0]!;
    expect(sent.earlierAttempt).toEqual({ briefId: "brief-1", kind: "build", reason: STOPPED_REASON, lastingActs: [{ act: expect.any(String), did: expect.any(String) }] });
    expect(run.dispatched[0]!.briefs[0]).not.toHaveProperty("earlierAttempt");
    // The record holds it too, so a supervisor started again reads the same brief.
    expect(run.view!.record.briefs[1]!.brief.earlierAttempt).toEqual(sent.earlierAttempt);
  });

  it("is refused project.brief_repeated after a second such stop under the same plan", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([brief("main", ["p1"])], "Send it once more."),
      dispatch([brief("main", ["p1"])], "And again."),
      end("blocked")
    ], project({ builder: () => "stopped" }));
    const [, second, third] = answersOf(run.shown, IDS.dispatch);
    expect(second).toMatchObject({ ok: true, returns: [{ briefId: "brief-2", outcome: "blocked", stoppedRepeating: true }] });
    expect(run.dispatched[1]!.briefs[0]!.earlierAttempt).toMatchObject({ briefId: "brief-1" });
    expect(third).toMatchObject({ ok: false, code: "project.brief_repeated", instruction: GUIDANCE.refusals.briefRepeated, repeated: [{ path: "briefs.0", subflowKey: "main", lastBrief: { briefId: "brief-2", outcome: "blocked" } }] });
    expect(run.dispatched).toHaveLength(2);
  });

  it("is still refused when the blocked return was for another reason, and carries no earlier attempt when changed", async () => {
    const blockedFirst: BuilderPlan = (_brief, attempt) => (attempt === 1 ? "blocked" : "done");
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([brief("main", ["p1"])], "Try again."),
      dispatch([brief("main", ["p1"], [], { recordingExcerpt: "The search box is under Browse." })], "It is under Browse."),
      end("blocked")
    ], project({ builder: blockedFirst }));
    const [, repeated, changed] = answersOf(run.shown, IDS.dispatch);
    expect(repeated).toMatchObject({ ok: false, code: "project.brief_repeated" });
    expect(changed).toMatchObject({ ok: true, returns: [{ briefId: "brief-2", outcome: "done" }] });
    expect(run.dispatched[1]!.briefs[0]).not.toHaveProperty("earlierAttempt");
  });

  it("never takes an earlier attempt the supervisor wrote itself", async () => {
    const written = { briefId: "brief-9", kind: "build", reason: "Made up.", lastingActs: [] };
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"], [], { earlierAttempt: written })]),
      end("blocked")
    ], project());
    expect(run.dispatched[0]!.briefs[0]).not.toHaveProperty("earlierAttempt");
  });

  it("is named in the guidance: a stopped builder's brief may go once more, its builder shown the earlier attempt", () => {
    for (const words of [GUIDANCE.refusals.briefRepeated, GUIDANCE.refusals.briefRepeatedOthersSent, GUIDANCE.next.afterReturnsNotDone]) {
      expect(words).toContain("stoppedRepeating");
      expect(words).toContain("once more unchanged");
      expect(words).toContain("earlier attempt");
    }
  });
});

// Rerun round 4 (t743): the supervisor ended right after one brief came back
// blocked, with most of the build's money left. While the build can still pay
// for a brief, an ending is held once for each failed subflow until it has had
// one changed brief: a repair, or a brief under an amended plan. The same brief
// sent again does not count, and a return that says nothing more can be done
// (a closed terminal reason) holds nothing.
describe("an ending while a failed subflow has had no changed brief", () => {
  const money = () => new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 });
  /** A not-done return lists the trial its builder ran, so a repair can name it. */
  const listed = (sent: { briefId: string }) => [{ kind: "subflow_trial" as const, receiptId: `trial-${sent.briefId}`, digest: "c".repeat(64), verdict: "no" as const }];
  const repairNaming = (briefId: string) => dispatch([brief("main", ["p1"], [], { kind: "repair", failingReceipt: { kind: "subflow_trial", receiptId: `trial-${briefId}`, digest: "c".repeat(64) } })], "Repair what the trial said failed.");

  it("is refused once after one blocked return with money left, naming the subflow and its failing brief, then let through", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), end("blocked"), end("blocked")], project({ builder: () => "blocked", purse: money() }), { spareTurns: 3 });
    expect(run.feedback).toEqual([expect.objectContaining({ code: "project.completion_repair_first", instruction: GUIDANCE.completion.repairFirst, unrepaired: [{ subflowKey: "main", failingBrief: "brief-1" }] })]);
    expect(run.outcome).toMatchObject({ status: "ended", ending: { outcome: "blocked" } });
  });

  // t743: turns pay for a brief as money does. With too few decisions left to dispatch the repair, send a reset and end
  // again, a held ending would only run the turns out and end the build on a guard instead of the supervisor's words.
  it("is not held when the loop has too few decisions left to send the repair and end again", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), end("blocked"), end("blocked")], project({ builder: () => "blocked", purse: money() }), { spareTurns: 1 });
    expect(run.feedback).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "ended", ending: { outcome: "blocked" } });
  });

  it("is admitted once a repair of that subflow came back short too", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), repairNaming("brief-1"), end("blocked")], project({ builder: () => "blocked", notDoneTrials: listed, purse: money() }));
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"], ["repair"]]);
    expect(run.feedback).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "ended", ending: { outcome: "blocked" } });
  });

  it("is admitted when the failing return carries a closed terminal reason", async () => {
    const built = project({ builder: () => "blocked", purse: money() });
    const inner = built.ports.dispatch;
    built.ports.dispatch = async (request) => ({ returns: (await inner(request)).returns.map((returned) => ({ ...returned, terminalReason: "person_ended" as const })) });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), end("blocked")], built);
    expect(run.feedback).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "ended", ending: { outcome: "blocked" } });
  });

  it("is admitted when the build cannot pay for another brief", async () => {
    const purse = money();
    // Whatever the builders could still be given is spent once the brief started.
    const onBrief = () => {
      const drained = purse.hold({ projectedCostUsd: purse.allocatableUsd(), estimatedInputTokens: 10, maxOutputTokens: 10 });
      if (drained.ok) drained.hold.settle();
    };
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), end("blocked")], project({ builder: () => "blocked", purse, onBrief }));
    expect(run.feedback).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "ended", ending: { outcome: "blocked" } });
  });

  it("is refused after the same brief was only sent again, naming the latest return", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([brief("main", ["p1"])], "Try the same brief again."),
      end("partial"),
      end("partial")
    ], project({ builder: () => "partial", purse: money() }), { spareTurns: 3 });
    expect(run.dispatched).toHaveLength(2);
    expect(run.feedback.map((entry) => entry.code)).toEqual(["project.completion_repair_first"]);
    expect(run.feedback[0]!.unrepaired).toEqual([{ subflowKey: "main", failingBrief: "brief-2" }]);
  });

  // t743 (S2): while an act no call can settle is on the target, no trial can run anywhere in the build, so no changed
  // brief could be tested, and no reset undoes it. The act is a press on a control in no list any read showed.
  it("is admitted, by neither rule held, while an act no call can settle is on the target, and its reason names it as left", async () => {
    const seeded = (ledger: AutomationStudioSiteResetProjectLedger) => {
      if (ledger.snapshot().acts.length) return;
      ledger.forBrief("brief.earlier").explored({ callId: "mark", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: "Mark", kind: "button", subject: "s:mark" }, verb: "press" } });
      expect(ledger.unsatisfiable().map((act) => act.act)).toEqual(["act-1"]);
    };
    const built = project({ builder: () => "blocked", purse: money(), onBrief: () => seeded(built.ledger) });
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), end("blocked", "The list could not be read.")], built);
    expect(run.feedback).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "ended", ending: { outcome: "blocked", reason: "The list could not be read. Still on the target from this build: press \"Mark\" button (it can no longer be checked or put back; it may still be there)." } });
    // The dispatch's answer counts it apart from the acts a reset could undo.
    expect(answersOf(run.shown, IDS.dispatch)[0]).toMatchObject({ lastingActsInPlace: 0, lastingActsUnsettleable: 1 });
  });
});
