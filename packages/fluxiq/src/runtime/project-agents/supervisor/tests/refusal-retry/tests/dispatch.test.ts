// What a supervisor's refusal tells it, done, and then the identical call again, through the real loop and its real repeat
// guard (`../../../../../llm/repeat-guard/outcomes.ts`). The guard keys a call on its input and the page. The supervisor's own
// tools report no page, and a builder moves the target without the loop seeing it, so after one look the page in the key
// stands still for the rest of the build. Every `project.dispatch` refusal is about the build, not the page, so a dispatch
// refused once stayed refused however the build changed (`../../../request-keys/`). A lending library, as the supervisor's other
// tests use; the page is reported by a look on `web.page.read`, as a domain with digests on its calls reports it.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../index.ts";
import { planInput, project, subflow, taskSpecInput, type BuilderPlan } from "../../supervisor-fixture.ts";
import { FIND, HOLD, assembled, brief, call, dispatch, end, reset, supervise, test, type Step } from "../../supervisor-script.ts";

const REPEAT_REFUSED = "llm_evidence_loop.repeat_refused";
const ANSWERED = "llm_evidence_loop.already_answered";

/** A look at the page, which never moves here: the guard then keys every later call on it. */
const look: Step = (() => {
  let looks = 0;
  return () => call("web.page.read", { look: ++looks })([]);
})();
const onThePage: AutomationStudioLlmEvidenceLoopInput["executeTool"] = async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, shown: "the catalogue" }, effectApplied: false, targetsUnchanged: true, stateDigests: { before: "page.one", after: "page.one" } });

const ONE_PART = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));
const TWO_PARTS = planInput([
  subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }),
  subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"], after: ["find_titles"] })
], taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]));
const FIND_BRIEF = brief("find_titles", ["p1"]);
const HOLD_BRIEF = brief("place_hold", ["p2"], ["find_titles"], { permittedActs: ["create_new"] });
/** A repair left for Core to fill in, so it reads the same after each test (`../../../../brief-defaults/`). */
const REPAIR: JsonObject = { kind: "repair", subflowKey: "main", entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.05, maxIterations: 20 };

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);
/** Whether the identical call was refused unrun or answered from memory, as the model is told. */
const refusedByTheLoop = (shown: ReadonlyArray<{ toolId: string; value: unknown }>) => shown.flatMap((entry) => {
  const code = (entry.value as JsonObject | null)?.code;
  return code === REPEAT_REFUSED || code === ANSWERED ? [code] : [];
});
const sentKinds = (run: { dispatched: ReadonlyArray<{ briefs: ReadonlyArray<{ kind: string; subflowKey: string }> }> }) => run.dispatched.map((request) => request.briefs.map((sent) => `${sent.kind} ${sent.subflowKey}`));

describe("project.brief_repeated", () => {
  /** A hold brief whose builder is blocked the first time. */
  const blockedOnce: BuilderPlan = (sent, attempt) => (sent.subflowKey === "place_hold" && attempt === 1 ? "blocked" : "done");

  it("told to change what runs before it, the identical call runs once that changed", async () => {
    const run = await supervise([
      look,
      call(IDS.writePlan, TWO_PARTS),
      dispatch([FIND_BRIEF]),
      dispatch([HOLD_BRIEF]),
      dispatch([HOLD_BRIEF]),
      // The subflow that runs before it, built again: a new proposal for it to start from.
      dispatch([FIND_BRIEF]),
      dispatch([HOLD_BRIEF]),
      end("blocked")
    ], project({ builder: blockedOnce }), { executeTool: onThePage });
    const answers = answersOf(run.shown, IDS.dispatch);
    expect(answers[2]).toMatchObject({ ok: false, code: "project.brief_repeated" });
    expect(GUIDANCE.refusals.briefRepeated).toContain("what runs before it");
    expect(refusedByTheLoop(run.shown)).toEqual([]);
    expect(sentKinds(run)).toEqual([["build find_titles"], ["build place_hold"], ["build find_titles"], ["build place_hold"]]);
  });

  it("told to change the plan, the identical call runs once it changed", async () => {
    const amended = planInput([subflow("main", ["p1"], { outputs: ["titles"] })], taskSpecInput([["p1", FIND, []]]));
    const run = await supervise([
      look,
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      dispatch([brief("main", ["p1"])]),
      call(IDS.amendPlan, { ...amended, reason: "The subflow hands on what it reads." }),
      dispatch([brief("main", ["p1"])]),
      end("blocked")
    ], project({ builder: (_sent, attempt) => (attempt === 1 ? "blocked" : "done") }), { executeTool: onThePage });
    expect(answersOf(run.shown, IDS.dispatch)[1]).toMatchObject({ ok: false, code: "project.brief_repeated" });
    expect(refusedByTheLoop(run.shown)).toEqual([]);
    expect(run.dispatched).toHaveLength(2);
  });

  it("with nothing changed, the identical call is still refused unrun, and that stays bounded", async () => {
    const same = dispatch([brief("main", ["p1"])]);
    const run = await supervise([look, call(IDS.writePlan, ONE_PART), same, same, look, same, end("blocked")], project({ builder: () => "blocked" }), { executeTool: onThePage });
    expect(answersOf(run.shown, IDS.dispatch)[1]).toMatchObject({ ok: false, code: "project.brief_repeated" });
    expect(refusedByTheLoop(run.shown)).toEqual([REPEAT_REFUSED]);
    expect(run.dispatched).toHaveLength(1);
  });

  it("sent again and again with nothing changed, stalls the round after three refused unrun, as any repeat does", async () => {
    const same = dispatch([brief("main", ["p1"])]);
    const built = project({ builder: () => "blocked" });
    // The script has decisions to spare: the third refused in a row ends it, as for a refused press (`../../../../../llm/evidence-loop/tests/repeat-guard.test.ts`).
    await expect(supervise([look, call(IDS.writePlan, ONE_PART), same, same, same, same, same, same, same, same], built, { executeTool: onThePage, propagateDecisionErrors: true })).rejects.toThrow("stalled");
    expect(built.dispatched).toHaveLength(1);
  });
});

describe("project.predecessor_not_done", () => {
  it("told to send what runs before it first, the identical call runs once that came back", async () => {
    const run = await supervise([
      look,
      call(IDS.writePlan, TWO_PARTS),
      dispatch([HOLD_BRIEF]),
      dispatch([FIND_BRIEF]),
      dispatch([HOLD_BRIEF]),
      end("blocked")
    ], project(), { executeTool: onThePage });
    expect(answersOf(run.shown, IDS.dispatch)[0]).toMatchObject({ ok: false, code: "project.predecessor_not_done", instruction: GUIDANCE.refusals.predecessorNotDone });
    expect(refusedByTheLoop(run.shown)).toEqual([]);
    expect(sentKinds(run)).toEqual([["build find_titles"], ["build place_hold"]]);
  });
});

describe("project.repair_unchanged", () => {
  it("told to test again, the identical repair runs once that test changed what stands", async () => {
    const same = call(IDS.dispatch, { reason: "The whole test did not pass.", briefs: [REPAIR] });
    const run = await supervise([
      look,
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      same,
      same,
      test,
      same,
      end("blocked")
    ], project({ trial: () => "unsure" }), { executeTool: onThePage });
    const answers = answersOf(run.shown, IDS.dispatch);
    expect(answers[2]).toMatchObject({ ok: false, code: "project.repair_unchanged", instruction: GUIDANCE.refusals.repairUnchangedTest });
    expect(refusedByTheLoop(run.shown)).toEqual([]);
    expect(run.trials).toHaveLength(2);
    expect(sentKinds(run)).toEqual([["build main"], ["repair main"], ["repair main"]]);
  });

  it("with nothing changed, the identical repair is refused unrun", async () => {
    const same = call(IDS.dispatch, { reason: "The whole test did not pass.", briefs: [REPAIR] });
    const run = await supervise([
      look,
      call(IDS.writePlan, ONE_PART),
      dispatch([brief("main", ["p1"])]),
      call(IDS.assemble),
      test,
      same,
      same,
      look,
      same,
      end("blocked")
    ], project({ trial: () => "unsure" }), { executeTool: onThePage });
    expect(answersOf(run.shown, IDS.dispatch)[2]).toMatchObject({ ok: false, code: "project.repair_unchanged" });
    expect(refusedByTheLoop(run.shown)).toEqual([REPEAT_REFUSED]);
    expect(run.dispatched).toHaveLength(2);
  });
});

describe("project.reset_repeated", () => {
  const BUILDS = [FIND_BRIEF, HOLD_BRIEF];
  const sameReset = dispatch([reset()], "Undo the hold before the test.");

  it("told to test, the identical reset runs after that test, as the refusal's header says", async () => {
    const run = await supervise([
      look,
      call(IDS.writePlan, TWO_PARTS),
      dispatch(BUILDS),
      call(IDS.assemble),
      sameReset,
      sameReset,
      call(IDS.testCandidate, (evidence) => ({ ...assembled(evidence), cannotUndo: ["act-1"] })),
      sameReset,
      end("blocked")
    ], project({ ledger: { undoes: false }, trialActs: true }), { executeTool: onThePage });
    const answers = answersOf(run.shown, IDS.dispatch);
    expect(answers[2]).toMatchObject({ ok: false, code: "project.reset_repeated", instruction: GUIDANCE.refusals.resetRepeatedTest });
    expect(refusedByTheLoop(run.shown)).toEqual([]);
    expect(sentKinds(run)).toEqual([["build find_titles", "build place_hold"], ["reset main"], ["reset main"]]);
  });

  it("with nothing changed, the identical reset is refused unrun", async () => {
    const run = await supervise([
      look,
      call(IDS.writePlan, TWO_PARTS),
      dispatch(BUILDS),
      call(IDS.assemble),
      sameReset,
      sameReset,
      look,
      sameReset,
      end("blocked")
    ], project({ ledger: { undoes: false } }), { executeTool: onThePage });
    expect(answersOf(run.shown, IDS.dispatch)[2]).toMatchObject({ ok: false, code: "project.reset_repeated" });
    expect(refusedByTheLoop(run.shown)).toEqual([REPEAT_REFUSED]);
    expect(run.dispatched).toHaveLength(2);
  });
});

describe("project.dispatch_failed", () => {
  /** A dispatcher that throws, as a failed record write does once every brief has ended (`../../../../dispatch/dispatcher.ts`). */
  const failing = () => {
    const built = project();
    const thrown = vi.fn(async () => {
      throw new Error("The build record could not be written.");
    });
    return { ...built, ports: { ...built.ports, dispatch: thrown }, thrown };
  };

  it("does not tell the model to try again, because the same call is refused and nothing it can do changes that", async () => {
    const built = failing();
    const same = dispatch([brief("main", ["p1"])]);
    const run = await supervise([look, call(IDS.writePlan, ONE_PART), same, same, look, same, end("blocked")], built, { executeTool: onThePage });
    const [failed] = answersOf(run.shown, IDS.dispatch);
    expect(failed).toMatchObject({ ok: false, code: "project.dispatch_failed", instruction: GUIDANCE.refusals.dispatchFailed });
    expect(GUIDANCE.refusals.dispatchFailed).not.toMatch(/try again/iu);
    expect(GUIDANCE.refusals.dispatchFailed).toMatch(/end honestly/iu);
    // What the instruction says of the call is what the loop does with it: it never runs again.
    expect(built.thrown).toHaveBeenCalledTimes(1);
    expect(refusedByTheLoop(run.shown)).toEqual([REPEAT_REFUSED, REPEAT_REFUSED]);
  });
});

describe("project.trial_starts_in_end_state", () => {
  it("told to reset and test again, the identical test runs once the reset ran; with no call between it does not", async () => {
    const built = project({ trialActs: false });
    const clash = vi.fn(() => [{ act: "act-1", did: "press \"Hold\" button" }]);
    const ledger = built.ledger.forBrief("brief-2");
    const real = ledger.endStateClash.bind(ledger);
    vi.spyOn(ledger, "endStateClash").mockImplementation((...args) => (clash.mock.calls.length < 1 ? clash() : real(...args)));
    const run = await supervise([
      look,
      call(IDS.writePlan, TWO_PARTS),
      dispatch([FIND_BRIEF, HOLD_BRIEF]),
      call(IDS.assemble),
      test,
      test,
      dispatch([reset()], "Undo the act the test named."),
      test,
      end("blocked")
    ], built, { executeTool: onThePage });
    const tests = answersOf(run.shown, IDS.testCandidate);
    expect(tests[0]).toMatchObject({ ok: false, code: "project.trial_starts_in_end_state", actsToUndo: [{ act: "act-1", brief: "brief-2" }] });
    expect(refusedByTheLoop(run.shown)).toEqual([REPEAT_REFUSED]);
    expect(built.trials).toHaveLength(1);
    expect(tests.at(-1)).toMatchObject({ verdict: "yes" });
  });
});
