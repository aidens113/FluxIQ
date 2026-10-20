// What a call of reset briefs only says to do next (crossborder debug, t638).
// A8 wave 10 `run-mv9q50ui-1736d010` sent a reset because its ending was held
// for one (`project.completion_reset_first`), and the reset's answer told it to
// test the latest assembled Flow, which it never had. The answer now says to end
// again where nothing is assembled or the latest Flow cannot be tested again,
// and puts ending again first where it may be tested.
//
// A reset sent so the build can end says so after it (t683). Those words still
// asked the model to remember whether its ending had been held for the reset.
// The state now keeps why (`../state.ts`, `resetToEnd`): the answer to a call
// of resets only, done or not, says to end again now, or to complete again on
// the build's fallback with its complete object, never to test; a repeated
// reset is refused with the same way forward; and the build going on -- any
// other brief sent -- drops the reason, so a later reset is answered as before.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { planInput, project, subflow, taskSpecInput, type BuilderPlan } from "./supervisor-fixture.ts";
import { FIND, HOLD, NOTE, assembled, brief, call, complete, dispatch, end, reset, supervise, test, type Entry, type Step } from "./supervisor-script.ts";

const THREE_PART = planInput(
  [subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] }), subflow("note_shelf", ["p3"], { inputs: ["shelf"] })],
  taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]], ["p3", NOTE, []]])
);
const ONE_PART = planInput([subflow("main", ["p2"])], taskSpecInput([["p2", HOLD, ["create_new"]]]));

const nexts = (shown: readonly Entry[]) => shown.filter((entry) => entry.toolId === IDS.dispatch).map((entry) => (entry.value as JsonObject).next);

describe("the answer to a reset", () => {
  it("says to end again when nothing is assembled, never to test a Flow", async () => {
    const builder: BuilderPlan = (sent) => (sent.subflowKey === "note_shelf" ? "blocked" : "done");
    const briefs = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] }), brief("note_shelf", ["p3"], ["place_hold"])];
    const run = await supervise([
      call(IDS.writePlan, THREE_PART),
      dispatch(briefs),
      // Held once for a changed brief of the failed subflow, then for the reset (t743).
      end("blocked", "The shelf is not shown."),
      end("blocked", "The shelf is not shown."),
      dispatch([reset()], "Put the target back before ending."),
      end("blocked", "The shelf is not shown.")
    ], project({ builder }), { spareTurns: 3 });
    expect(run.feedback.map((entry) => entry.code)).toEqual(["project.completion_repair_first", "project.completion_reset_first"]);
    // The ending was held for this reset, so its answer says to end again now (`./reset-to-end.test.ts`, t683).
    expect(nexts(run.shown).at(-1)).toEqual(expect.stringContaining("end again now"));
    expect(nexts(run.shown).at(-1)).toEqual(expect.stringContaining("project.completion_reset_first"));
    expect(nexts(run.shown).at(-1)).not.toBe(GUIDANCE.next.afterResetNothingAssembled);
    expect(nexts(run.shown).at(-1)).not.toEqual(expect.stringContaining("core.test_candidate"));
    expect(GUIDANCE.next.afterResetNothingAssembled).not.toContain("core.test_candidate");
    expect(GUIDANCE.next.afterResetNothingAssembled).toContain("end again");
    expect(run.outcome.ending).toMatchObject({ outcome: "blocked", reason: "The shelf is not shown." });
  });

  it("says to end again, or complete on a yes, when the latest assembled Flow cannot be tested again", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p2"], [], { permittedActs: ["create_new"] })]),
      call(IDS.assemble),
      dispatch([reset()], "Put the target back before the whole test."),
      test,
      dispatch([reset()], "Put the target back before ending."),
      end("blocked")
    ], project({ trial: () => "no", trialActs: true }));
    expect(nexts(run.shown).slice(1)).toEqual([GUIDANCE.next.afterReset, GUIDANCE.next.afterResetNothingToTest]);
    expect(GUIDANCE.next.afterResetNothingToTest).not.toContain("core.test_candidate");
  });

  // t684: a reset sent for a held ending is answered by the state's reason (t683), so these words no longer ask which it was.
  it("says only to test while the latest assembled Flow may be tested, asking nothing of why the reset was sent", () => {
    const words = GUIDANCE.next.afterReset;
    expect(words).toContain("core.test_candidate");
    expect(words).not.toContain("project.completion_reset_first");
    expect(words).not.toContain("end again");
  });
});

/** The third subflow comes back blocked; the second leaves a lasting act on the target. */
const blockedThird: BuilderPlan = (sent) => (sent.subflowKey === "note_shelf" ? "blocked" : "done");
const THREE_BRIEFS = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] }), brief("note_shelf", ["p3"], ["place_hold"])];
const REASON = "The shelf is not shown.";

const answersOf = (shown: readonly Entry[]) => shown.filter((entry) => entry.toolId === IDS.dispatch).map((entry) => entry.value as JsonObject);
/** What the words after a reset sent for an ending must say, and must not. */
const endsAgain = (words: unknown) => {
  expect(words).toEqual(expect.stringContaining("project.completion_reset_first"));
  expect(words).toEqual(expect.stringContaining("end again now"));
  expect(words).not.toEqual(expect.stringContaining("core.test_candidate"));
};

describe("the answer to a reset sent because an ending was held for it", () => {
  it("says to end again now, never to test, where an assembled Flow stands", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p2"], [], { permittedActs: ["create_new"] })]),
      call(IDS.assemble),
      // The start hook puts the site back before the whole test, whose own act then stays on the target.
      test,
      end("blocked", REASON),
      dispatch([reset()], "Put the target back: my ending was held."),
      end("blocked", REASON)
    ], project({ trial: () => "no", trialActs: true, ledger: { hook: true } }));
    expect(run.feedback.map((entry) => entry.code)).toEqual(["project.completion_reset_first"]);
    const answers = answersOf(run.shown);
    endsAgain(answers[1]!.next);
    expect(answers[1]).not.toHaveProperty("completeAgain");
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    expect(run.outcome.ending).toMatchObject({ outcome: "blocked", reason: REASON });
  });

  it("says to end again even when the reset came back not done, and refuses a repeat of it with the same way forward", async () => {
    const run = await supervise([
      call(IDS.writePlan, THREE_PART),
      dispatch(THREE_BRIEFS),
      end("blocked", REASON),
      end("blocked", REASON),
      dispatch([reset()], "Put the target back: my ending was held."),
      dispatch([reset()], "Try the undo again."),
      end("blocked", REASON)
    ], project({ builder: blockedThird, ledger: { undoes: false } }));
    const answers = answersOf(run.shown);
    expect(answers[1]).toMatchObject({ ok: true, returns: [{ kind: "reset", outcome: "blocked" }] });
    endsAgain(answers[1]!.next);
    expect(answers[2]).toMatchObject({ ok: false, code: "project.reset_repeated" });
    endsAgain(answers[2]!.instruction);
    expect(answers[2]!.instruction).not.toBe(GUIDANCE.refusals.resetRepeatedEnd);
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build", "build"], ["reset"]]);
    expect(run.outcome.ending?.outcome).toBe("blocked");
  });

  it("is answered as before when no ending was held for it", async () => {
    const run = await supervise([
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p2"], [], { permittedActs: ["create_new"] })]),
      call(IDS.assemble),
      dispatch([reset()], "Put the target back before the whole test."),
      test,
      end("blocked", REASON)
    ], project({ trial: () => "no" }));
    expect(answersOf(run.shown)[1]!.next).toBe(GUIDANCE.next.afterReset);
  });

  it("is answered as before once the build went on with another brief after the held ending", async () => {
    const run = await supervise([
      call(IDS.writePlan, THREE_PART),
      dispatch(THREE_BRIEFS),
      end("blocked", REASON),
      end("blocked", REASON),
      dispatch([brief("find_titles", ["p1"])], "Build the first subflow again before ending."),
      dispatch([reset()], "Put the target back."),
      end("blocked", REASON)
    ], project({ builder: blockedThird }));
    expect(run.feedback.map((entry) => entry.code)).toEqual(["project.completion_repair_first", "project.completion_reset_first"]);
    expect(answersOf(run.shown)[2]!.next).toBe(GUIDANCE.next.afterResetNothingAssembled);
  });
});

const TWO_PART = planInput(
  [subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] })],
  taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]])
);
const TWO_BRIEFS = [brief("find_titles", ["p1"]), brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] })];

// t684 (t683 open questions 1 and 2).
describe("an ending after a whole test that ran after the last reset", () => {
  it("is held for a reset, since the test left its own act on the target, then let through once that reset came back", async () => {
    const run = await supervise([
      call(IDS.writePlan, TWO_PART), dispatch(TWO_BRIEFS), call(IDS.assemble), test,
      dispatch([reset()], "Put the target back before the whole test."), test,
      end("blocked", REASON),
      dispatch([reset()], "Put the target back: my ending was held."),
      end("blocked", REASON)
    ], project({ trial: () => "no", trialActs: true, ledger: {} }));
    // The first test was refused for the builder's act; the ending after the second test, which left the supervisor's, was held.
    expect(run.feedback.map((entry) => entry.code)).toEqual(["project.completion_reset_first"]);
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"], ["reset"], ["reset"]]);
    endsAgain(answersOf(run.shown).at(-1)!.next);
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    expect(run.outcome.ending).toMatchObject({ outcome: "blocked", reason: REASON });
  });
});

/** The step the run recovered at: the site asked it to slow down, and it closed the site's notice (as `./rescued-pass-fallback.test.ts`). */
const RECOVERED_STEP: JsonObject = {
  step: 2, definitionId: "web.output.dom-click", label: "press hold", control: "Hold", status: "succeeded", attempts: 2,
  absorbed: [{ failureCode: "web.action.rate_limited", happened: "The site asked the run to slow down on pass 2, and to try again in 4 s.", pass: 2, askedWaitMs: 4000, waitedMs: 4000, paceMs: 4000 }],
  interruptions: [{ kind: "rate_limit", wayOut: "t12", said: "The run closed the site's notice by its way out, t12." }]
};
const RESCUED: JsonObject = { judge: "The trial was judged to do what the instruction asks.", steps: [{ step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" }, RECOVERED_STEP] };
const REPAIRED = ["flow: Find the titles", "step: open the catalogue", "  node: web.browser.navigate", "  url: https://library.test/catalogue?sort=newest"];
const FIND_ONLY = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const wholeTest = (evidence: readonly Entry[]): JsonObject => {
  const tested = [...evidence].reverse().find((entry) => entry.toolId === IDS.testCandidate)!.value as JsonObject;
  return { kind: "candidate_trial", receiptId: tested.trialRunId as string, digest: assembled(evidence).digest as string };
};
const firstDigest = (evidence: readonly Entry[]): string => (evidence.find((entry) => entry.toolId === IDS.testCandidate)!.value as JsonObject).digest as string;

describe("the answer to a reset sent because a completion on the build's fallback was held for it", () => {
  it("says to complete again with the fallback's complete object, never to test", async () => {
    const namesFirst: Step = (evidence) => ({ kind: "complete", result: { revision: 1, digest: firstDigest(evidence) } });
    const repair = call(IDS.dispatch, (evidence) => ({ reason: "The run had to recover by itself at the hold step.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: wholeTest(evidence) })] }));
    const run = await supervise([
      call(IDS.writePlan, FIND_ONLY), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test, complete, repair, call(IDS.assemble), test,
      namesFirst, dispatch([reset()], "Put the target back: my completion was held."), namesFirst
    ], project({
      trial: (attempt) => (attempt === 1 ? "yes" : "unsure"),
      trialFeedback: (attempt) => (attempt === 1 ? RESCUED : { said: "unsure" }),
      trialActs: true,
      ledger: { hook: true },
      script: (sent) => (sent.kind === "repair" ? REPAIRED : undefined)
    }));
    expect(run.feedback.map((entry) => entry.code)).toEqual(["candidate.trial_slow_down_unhandled", "project.completion_reset_first"]);
    const after = answersOf(run.shown).at(-1)!;
    const first = run.trials[0]!;
    expect(after).toMatchObject({ ok: true, completeAgain: { revision: 1, digest: first.digest } });
    expect(after.next).toEqual(expect.stringContaining("complete again now"));
    expect(after.next).toEqual(expect.stringContaining("completeAgain"));
    expect(after.next).not.toEqual(expect.stringContaining("core.test_candidate"));
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 1 }, reliesOnRecovery: { why: "completed" } });
  });
});
