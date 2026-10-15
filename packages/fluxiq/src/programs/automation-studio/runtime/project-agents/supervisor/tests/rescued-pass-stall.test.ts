// A pass the run rescued survives whatever guard ends the build (A8 social
// `run-mv96rz6h-02502365`, t622). The whole test passed only on the run's own
// recovery where the site asked it to slow down; the repair of it came back
// without the change; the supervisor then completed four times naming the
// test's revision and digest beside `ended` and `reason`, each refused on its
// shape until the repeat guard stalled the loop, and the build ended with no
// Flow. Here the same shape on the fixture's lending library: a stall now
// completes on the passing test (`../supervisor-loop.ts`), a result naming the
// passing test is a completion whatever else it carries (`../completion.ts`),
// and only the person's cancel still ends without one.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioLlmUnusableDecisionError } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { BUILD, planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, assembled, brief, call, complete, dispatch, end, supervise, test, type Entry, type Step } from "./supervisor-script.ts";

const ONE_PART = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));

/** The step the run recovered at: the site asked it to slow down, and it closed the site's notice. */
const RECOVERED_STEP: JsonObject = {
  step: 2, definitionId: "web.output.dom-click", label: "press hold", control: "Hold", status: "succeeded", attempts: 2,
  absorbed: [{ failureCode: "web.action.rate_limited", happened: "The site asked the run to slow down on pass 2, and to try again in 4 s.", pass: 2, askedWaitMs: 4000, waitedMs: 4000, paceMs: 4000 }],
  interruptions: [{ kind: "rate_limit", wayOut: "t12", said: "The run closed the site's notice by its way out, t12." }]
};
const RESCUED: JsonObject = { judge: "The trial was judged to do what the instruction asks.", steps: [{ step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" }, RECOVERED_STEP] };

const wholeTest = (evidence: readonly Entry[]): JsonObject => {
  const tested = [...evidence].reverse().find((entry) => entry.toolId === IDS.testCandidate)!.value as JsonObject;
  return { kind: "candidate_trial", receiptId: tested.trialRunId as string, digest: assembled(evidence).digest as string };
};
/** A repair of the rescued test; the fixture's builder writes the same script again, so it comes back without the change. */
const repairOfTest = call(IDS.dispatch, (evidence) => ({ reason: "The run had to recover by itself at the hold step.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: wholeTest(evidence) })] }));
/** The run up to the repair coming back short: the rescued test, its completion held back, the repair. */
const UP_TO_SHORT: Step[] = [call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test, complete, repairOfTest];
/** A completion as the supervisor sent it in the social run: the standing test's revision and digest, and an ending beside them. */
const mixed: Step = (evidence) => ({ kind: "complete", result: { ...assembled(evidence), ended: "partial", reason: "The Flow relies on the run's own recovery." } });
/** A completion with an ending and a revision but no digest: refused on its shape every time. */
const misshapen: Step = (evidence) => ({ kind: "complete", result: { ended: "partial", reason: "The Flow relies on the run's own recovery.", revision: assembled(evidence).revision as number } });

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

describe("a pass the run rescued, when its repair came back short", () => {
  it("is completed on when completions refused on their shape stall the loop: the person is told it relies on the run's recovery", async () => {
    const built = project({ trialFeedback: () => RESCUED });
    const run = await supervise([...UP_TO_SHORT, misshapen, misshapen, misshapen, misshapen, misshapen, misshapen], built, { propagateDecisionErrors: true });

    expect(answersOf(run.shown, IDS.dispatch)[1]).toMatchObject({ ok: true, wholeTestStands: { complete: { revision: 1 } } });
    const shapes = run.feedback.filter((entry) => entry.code === "project.completion_shape");
    expect(shapes.length).toBeGreaterThanOrEqual(3);
    // The refusal names the complete object and the key to drop; sent again, it is said in a completion's terms, never a draft's.
    expect(shapes[0]).toMatchObject({ instruction: GUIDANCE.completion.shape, complete: { revision: 1 }, extra: ["revision"] });
    expect(shapes[0]).not.toHaveProperty("sentAgainInstead");
    const again = shapes.at(-1)!;
    expect(String(again.sentAgain)).toContain(GUIDANCE.completion.sentAgain);
    expect(String(again.sentAgain)).not.toContain("run the step that is missing");

    expect(run.outcome).toMatchObject({ status: "candidate", trial: { verdict: "yes" }, reliesOnRecovery: { revision: 1, receiptId: "run-1", why: "stalled", steps: [{ step: 2, label: "press hold" }] } });
    expect(run.outcome.loop).toBeUndefined();
    const told = run.outcome.reliesOnRecovery!.told;
    expect(told).toContain("relies on the run's own recovery");
    expect(told).toContain("A repair to add that came back without it. The build stopped making progress before it could add that.");
    // A completion, not an ending: nothing recorded to end the build, and no reset sent.
    expect(run.view?.record.ending).toBeUndefined();
    expect(built.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"], ["repair"]]);
  });

  it("is completed on when the result names its revision and digest beside an ending, as the social run's supervisor sent it", async () => {
    const run = await supervise([...UP_TO_SHORT, mixed], project({ trialFeedback: () => RESCUED }));
    expect(run.feedback.some((entry) => entry.code === "project.completion_shape")).toBe(false);
    expect(run.outcome).toMatchObject({ status: "candidate", trial: { verdict: "yes" }, reliesOnRecovery: { why: "short" } });
    expect(run.outcome.loop).toMatchObject({ ok: true });
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("is completed on when the provider stops answering, said as that", async () => {
    const silent: Step = () => {
      throw new AutomationStudioLlmUnusableDecisionError(["llm.provider_timeout"]);
    };
    const run = await supervise([...UP_TO_SHORT, silent, silent, silent], project({ trialFeedback: () => RESCUED }), { propagateDecisionErrors: true });
    expect(run.outcome).toMatchObject({ status: "candidate", reliesOnRecovery: { why: "provider" } });
    expect(run.outcome.reliesOnRecovery!.told).toContain("The AI model provider stopped answering before the build could add that.");
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("is completed on when the model gives an honest ending, its own words kept beside what the person is told", async () => {
    const reason = "The repair could not add the pause, so the build ends here.";
    const run = await supervise([...UP_TO_SHORT, end("partial", reason)], project({ trialFeedback: () => RESCUED }));
    expect(run.feedback.filter((entry) => entry.code !== "candidate.trial_slow_down_unhandled")).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "candidate", trial: { verdict: "yes" }, reliesOnRecovery: { revision: 1, why: "ended", endedWith: { outcome: "partial", reason } } });
    expect(run.outcome.loop).toMatchObject({ ok: true });
    const told = run.outcome.reliesOnRecovery!.told;
    expect(told).toContain("relies on the run's own recovery");
    expect(told).toContain("A repair to add that came back without it. The supervisor ended the build before a repair to add that was made.");
    // Core's words to the person, never the model's.
    expect(told).not.toContain(reason);
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("is not completed on when the person cancels the build", async () => {
    const built = project({ trialFeedback: () => RESCUED });
    const person = new AbortController();
    built.ports.signal = person.signal;
    const cancel: Step = (evidence) => {
      person.abort();
      return mixed(evidence);
    };
    const run = await supervise([...UP_TO_SHORT, cancel], built, { propagateDecisionErrors: true });
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
    expect(run.outcome.ending?.outcome).toBe("cancelled");
    expect((await built.record.read(BUILD))?.record.ending?.outcome).toBe("cancelled");
  });
});

describe("a pass the run rescued, before any repair of it", () => {
  it("is completed on when the model ends honestly, rather than the ending being refused as too soon", async () => {
    const tested: Step[] = [call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test];
    const run = await supervise([...tested, end("blocked", "The pause cannot be written.")], project({ trialFeedback: () => RESCUED }));
    expect(run.feedback).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "candidate", reliesOnRecovery: { why: "ended", endedWith: { outcome: "blocked", reason: "The pause cannot be written." } } });
    expect(run.outcome.reliesOnRecovery!.told).not.toContain("came back without it");
    expect(run.dispatched).toHaveLength(1);
  });

  it("is not completed on when the person cancels the build as the model ends it", async () => {
    const tested: Step[] = [call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test];
    const made = project({ trialFeedback: () => RESCUED });
    const person = new AbortController();
    made.ports.signal = person.signal;
    const cancel: Step = (evidence) => {
      person.abort();
      return end("partial")(evidence);
    };
    const run = await supervise([...tested, cancel], made, { propagateDecisionErrors: true });
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
    expect(run.outcome.ending?.outcome).toBe("cancelled");
  });
});

describe("the supervisor's completion check", () => {
  const passed = (): ReturnType<typeof project> => project();
  const tested: Step[] = [call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test];

  it("judges a result naming the latest revision and digest as a completion on it, whatever words come beside it", async () => {
    const run = await supervise([...tested, (evidence) => ({ kind: "complete", result: { ...assembled(evidence), ended: "blocked", reason: "Done, I think.", summary: "It works." } })], passed());
    expect(run.feedback).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "candidate", trial: { verdict: "yes" } });
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
  });

  it("refuses an ending with keys beyond ended and reason on its shape, naming the complete object and each key to drop", async () => {
    const run = await supervise([...tested, () => ({ kind: "complete", result: { ended: "partial", reason: "Half done.", summary: "Half." } }), complete], passed());
    expect(run.feedback[0]).toEqual({ code: "project.completion_shape", instruction: GUIDANCE.completion.shape, complete: { revision: 1, digest: expect.any(String) }, extra: ["summary"] });
    expect(run.outcome).toMatchObject({ status: "candidate" });
  });

  it("refuses a misshapen ending before anything is assembled without a complete object", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART), () => ({ kind: "complete", result: { ended: "finished", reason: "Nothing to do." } }), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test, complete], passed());
    expect(run.feedback[0]).toEqual({ code: "project.completion_shape", instruction: GUIDANCE.completion.shape, extra: [] });
  });

  it("still refuses a revision and digest that are not the latest assembly's, ending or not", async () => {
    const stale: Step = () => ({ kind: "complete", result: { revision: 7, digest: "f".repeat(64), ended: "partial", reason: "Half done." } });
    const run = await supervise([...tested, stale, complete], passed());
    expect(run.feedback[0]).toMatchObject({ code: "project.completion_not_latest", complete: { revision: 1 } });
    expect(run.outcome).toMatchObject({ status: "candidate" });
  });
});
