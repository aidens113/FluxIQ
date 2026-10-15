// A rescued pass outlives a later assembly (A8 wave 9 social
// `run-mv9ml775-9872e63e`, t637). The whole test passed only on the run's own
// recovery where the site asked it to slow down; the repair of it came back
// done and changed its subflow, its re-assembly became the latest candidate,
// no later whole test answered yes, and the model's honest ending ended the
// build with no Flow, because only the latest assembly's rescued pass was read.
// Here the same shape on the fixture's lending library: the build completes on
// the passing revision, its own Flow handed to the caller after the reset rule
// held (`../state.ts`, `../completion.ts`, `../supervisor-loop.ts`); a later
// outright pass replaces that fallback; a pass of either kind is a fallback, and
// a completion naming it completes on it; a guard end while the latest
// assembly's own outright pass stands completes on that pass (coordinator,
// t637); and the person's cancel still ends without a Flow.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { BUILD, planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, assembled, brief, call, complete, dispatch, end, reset, supervise, test, type Entry, type Step } from "./supervisor-script.ts";

const ONE_PART = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));

/** The step the run recovered at: the site asked it to slow down, and it closed the site's notice. */
const RECOVERED_STEP: JsonObject = {
  step: 2, definitionId: "web.output.dom-click", label: "press hold", control: "Hold", status: "succeeded", attempts: 2,
  absorbed: [{ failureCode: "web.action.rate_limited", happened: "The site asked the run to slow down on pass 2, and to try again in 4 s.", pass: 2, askedWaitMs: 4000, waitedMs: 4000, paceMs: 4000 }],
  interruptions: [{ kind: "rate_limit", wayOut: "t12", said: "The run closed the site's notice by its way out, t12." }]
};
const RESCUED: JsonObject = { judge: "The trial was judged to do what the instruction asks.", steps: [{ step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" }, RECOVERED_STEP] };

/** The repaired subflow's script: it opens the catalogue sorted, so its re-assembly is a new revision. */
const REPAIRED = ["flow: Find the titles", "step: open the catalogue", "  node: web.browser.navigate", "  url: https://library.test/catalogue?sort=newest"];
const repairedScript = (sent: { kind: string }) => (sent.kind === "repair" ? REPAIRED : undefined);
/** A third script, for a third build of the subflow. */
const AGAIN = ["flow: Find the titles", "step: open the catalogue", "  node: web.browser.navigate", "  url: https://library.test/catalogue?sort=newest&shelf=all"];
/** Revision 1's digest: the first whole test's. */
const firstDigest = (evidence: readonly Entry[]): string => (evidence.find((entry) => entry.toolId === IDS.testCandidate)!.value as JsonObject).digest as string;

const wholeTest = (evidence: readonly Entry[]): JsonObject => {
  const tested = [...evidence].reverse().find((entry) => entry.toolId === IDS.testCandidate)!.value as JsonObject;
  return { kind: "candidate_trial", receiptId: tested.trialRunId as string, digest: assembled(evidence).digest as string };
};
const repairOfTest = call(IDS.dispatch, (evidence) => ({ reason: "The run had to recover by itself at the hold step.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: wholeTest(evidence) })] }));

/** The social run's shape: a rescued yes on revision 1, its repair done, revision 2 assembled and tested. */
const UP_TO_REASSEMBLY: Step[] = [call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test, complete, repairOfTest, call(IDS.assemble), test];

/** A build whose first whole test is the rescued pass and every later one answers `later`; each whole trial leaves its act, which the start hook puts back before the next. */
const built = (later: "yes" | "unsure", extra: Parameters<typeof project>[0] = {}) => project({
  trial: (attempt) => (attempt === 1 ? "yes" : later),
  trialFeedback: (attempt) => (attempt === 1 ? RESCUED : { said: later }),
  trialActs: true,
  ledger: { hook: true },
  script: repairedScript,
  ...extra
});

const REASON = "The re-assembled Flow never passed, so the build ends here.";

describe("a rescued pass whose repair came back done and whose re-assembly never passed", () => {
  it("is completed on when the model ends honestly: the caller gets revision 1's Flow, after the reset rule held", async () => {
    const run = await supervise([...UP_TO_REASSEMBLY, end("partial", REASON), dispatch([reset()], "Put the target back before ending."), end("partial", REASON)], built("unsure"));

    // The repair came back done and changed the subflow: revision 2 was assembled and tested, and never answered yes.
    expect(run.trials.map((tried) => tried.revision)).toEqual([1, 2]);
    expect(run.feedback.map((entry) => entry.code)).toEqual(["candidate.trial_slow_down_unhandled", "project.completion_reset_first"]);
    // The reset rule held first: the act revision 2's trial left was undone before the build completed.
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"], ["repair"], ["reset"]]);
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);

    const first = run.trials[0]!;
    expect(run.outcome).toMatchObject({ status: "candidate", trial: { verdict: "yes", revision: 1 }, reliesOnRecovery: { revision: 1, why: "ended", endedWith: { outcome: "partial", reason: REASON }, setAside: { revision: 2 } } });
    // The Flow handed to the caller to promote is revision 1's own, not the later assembly.
    expect(run.outcome.candidate).toMatchObject({ revision: 1, digest: first.digest });
    const told = run.outcome.reliesOnRecovery!.told;
    expect(told).toContain("relies on the run's own recovery");
    expect(told).toContain("the Flow assembled from it (revision 2) never passed its whole test, so the build completes on revision 1, the last that passed. The supervisor then ended the build.");
    expect(told).not.toContain(REASON);
    expect(told).not.toContain("Still on the target");
    // A completion, not an ending.
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("is completed on when a guard stalls the loop, after Core's own reset brief", async () => {
    const misshapen: Step = () => ({ kind: "complete", result: { ended: "partial", reason: REASON, revision: 2 } });
    const run = await supervise([...UP_TO_REASSEMBLY, misshapen, misshapen, misshapen, misshapen, misshapen, misshapen], built("unsure", { purse: new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 }) }), { propagateDecisionErrors: true });
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"], ["repair"], ["reset"]]);
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 1 }, trial: { verdict: "yes", revision: 1 }, reliesOnRecovery: { revision: 1, why: "stalled", setAside: { revision: 2 } } });
    expect(run.outcome.reliesOnRecovery!.told).toContain("so the build completes on revision 1, the last that passed. The build then stopped making progress.");
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("names what no reset undid after the person's words when no reset could be sent", async () => {
    // No purse: Core cannot size its reset brief, so the act stays and is named.
    const misshapen: Step = () => ({ kind: "complete", result: { ended: "partial", reason: REASON, revision: 2 } });
    const run = await supervise([...UP_TO_REASSEMBLY, misshapen, misshapen, misshapen, misshapen, misshapen, misshapen], built("unsure"), { propagateDecisionErrors: true });
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"], ["repair"]]);
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 1 }, reliesOnRecovery: { why: "stalled" } });
    expect(run.outcome.reliesOnRecovery!.told).toMatch(/The build then stopped making progress\. Still on the target from this build: .+\.$/u);
  });

  it("is not completed on when the person cancels the build as the model ends it", async () => {
    const made = built("unsure");
    const person = new AbortController();
    made.ports.signal = person.signal;
    const cancel: Step = (evidence) => {
      person.abort();
      return end("partial", REASON)(evidence);
    };
    const run = await supervise([...UP_TO_REASSEMBLY, cancel], made, { propagateDecisionErrors: true });
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
    expect(run.outcome.candidate).toBeUndefined();
    expect(run.outcome.ending?.outcome).toBe("cancelled");
    expect((await made.record.read(BUILD))?.record.ending?.outcome).toBe("cancelled");
  });
});

describe("a later revision that passes its whole test outright", () => {
  it("replaces the fallback: an honest ending no longer completes on revision 1, and the build completes on revision 2", async () => {
    const run = await supervise([...UP_TO_REASSEMBLY, end("partial", REASON), complete], built("yes"));
    expect(run.trials.map((tried) => tried.revision)).toEqual([1, 2]);
    // The latest assembly's own outright pass is no fallback to end on: the ending is refused as too soon rather than completed on revision 1.
    expect(run.feedback.map((entry) => entry.code)).toEqual(["candidate.trial_slow_down_unhandled", "project.completion_ended_too_soon"]);
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 2 }, trial: { verdict: "yes", revision: 2 } });
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
    expect(run.outcome).not.toHaveProperty("completedOnPass");
  });

  it("is itself the fallback once a later assembly never passes: the build completes on it, said plainly (coordinator, t637)", async () => {
    // Revision 2 passes outright; a second build of the subflow is assembled as revision 3, which answers unsure.
    const made = built("yes", {
      trial: (attempt) => (attempt === 3 ? "unsure" : "yes"),
      trialFeedback: (attempt) => (attempt === 1 ? RESCUED : { said: attempt === 3 ? "unsure" : "yes" }),
      script: (sent, attempt) => (attempt === 3 ? AGAIN : repairedScript(sent))
    });
    const run = await supervise([
      ...UP_TO_REASSEMBLY, dispatch([brief("main", ["p1"])], "Build the subflow again to read the list as well."), call(IDS.assemble), test,
      end("partial", REASON), dispatch([reset()], "Put the target back before ending."), end("partial", REASON)
    ], made);
    expect(run.trials.map((tried) => tried.revision)).toEqual([1, 2, 3]);
    expect(run.feedback.map((entry) => entry.code)).toEqual(["candidate.trial_slow_down_unhandled", "project.completion_reset_first"]);
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    const second = run.trials[1]!;
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 2, digest: second.digest }, trial: { verdict: "yes", revision: 2 } });
    expect(run.outcome.completedOnPass).toMatchObject({ revision: 2, why: "ended", setAside: { revision: 3 }, endedWith: { outcome: "partial", reason: REASON } });
    expect(run.outcome.completedOnPass!.told).toBe("Revision 3 never passed its whole test, so the build completes on revision 2, the last that passed. The supervisor then ended the build.");
    // No recovery to rely on, so none is said.
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
    expect(run.view?.record.ending).toBeUndefined();
  });
});

describe("a completion naming the build's fallback (coordinator, t637)", () => {
  it("completes on the fallback, after the reset rule held, rather than being refused as not the latest", async () => {
    const namesFirst: Step = (evidence) => ({ kind: "complete", result: { revision: 1, digest: firstDigest(evidence) } });
    const run = await supervise([...UP_TO_REASSEMBLY, namesFirst, dispatch([reset()], "Put the target back before completing."), namesFirst], built("unsure"));
    expect(run.feedback.map((entry) => entry.code)).toEqual(["candidate.trial_slow_down_unhandled", "project.completion_reset_first"]);
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 1 }, trial: { verdict: "yes", revision: 1 }, reliesOnRecovery: { revision: 1, why: "completed", setAside: { revision: 2 } } });
    expect(run.outcome.reliesOnRecovery!.told).toContain("so the build completes on revision 1, the last that passed. The supervisor then completed on it.");
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("still refuses a completion naming any other revision that is not the latest", async () => {
    const stale: Step = () => ({ kind: "complete", result: { revision: 7, digest: "f".repeat(64) } });
    const run = await supervise([...UP_TO_REASSEMBLY, stale, end("partial", REASON), dispatch([reset()], "Put the target back before ending."), end("partial", REASON)], built("unsure"));
    expect(run.feedback[1]).toMatchObject({ code: "project.completion_not_latest", complete: { revision: 2 } });
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 1 } });
  });
});

describe("the fallback's own revision tested again", () => {
  it("is dropped when that test no longer passes, so the ending is recorded with no Flow", async () => {
    const run = await supervise([call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test, test, end("partial", REASON), dispatch([reset()], "Put the target back before ending."), end("partial", REASON)], built("unsure"));
    expect(run.trials.map((tried) => tried.revision)).toEqual([1, 1]);
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
    expect(run.outcome.ending?.outcome).toBe("partial");
  });
});

describe("a guard end while the latest assembly's own whole test passed outright (coordinator, t637)", () => {
  /** Revision 1 assembled and passed outright; its trial leaves an act on the target. */
  const PASSED: Step[] = [call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test];
  /** A completion refused on its shape every time, until the repeat guard stalls the loop. */
  const misshapen: Step = () => ({ kind: "complete", result: { ended: "partial", reason: REASON, revision: 1 } });
  const purse = () => new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 });

  it("completes on that revision when a stall ends the loop, after Core's reset", async () => {
    const run = await supervise([...PASSED, misshapen, misshapen, misshapen, misshapen, misshapen, misshapen], project({ trialActs: true, purse: purse() }), { propagateDecisionErrors: true });
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build"], ["reset"]]);
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 1 }, trial: { verdict: "yes", revision: 1 }, completedOnPass: { revision: 1, why: "stalled" } });
    expect(run.outcome.completedOnPass).not.toHaveProperty("setAside");
    expect(run.outcome.completedOnPass!.told).toBe("The supervisor stopped before completing, so the build completes on revision 1, which passed its whole test. The build then stopped making progress.");
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("completes on that revision when the time limit ends the loop, after Core's reset inside the bound", async () => {
    const made = project({ trialActs: true, purse: purse() });
    const real = made.ports.dispatch;
    let sent = 0;
    // The second dispatch is still working at the work deadline and comes back stopped, as the dispatcher's do.
    made.ports.dispatch = async (request) => {
      if (sent++ !== 1) return await real(request);
      made.dispatched.push({ briefs: request.briefs.map((brief) => structuredClone(brief)), signal: request.signal });
      await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve(), { once: true }));
      return { returns: request.briefs.map((brief) => ({ briefId: brief.briefId, outcome: "partial" as const, reason: "The build was stopped before this brief finished.", trials: [], spentUsd: 0, calls: 1 })) };
    };
    const startedAt = Date.now();
    const run = await supervise([...PASSED, dispatch([brief("main", ["p1"])], "Build the subflow again."), call(IDS.assemble)], made, { timeLimit: { maxMs: 1_200, endingMs: 600 } });
    expect(Date.now() - startedAt).toBeLessThan(1_200);
    expect(run.outcome.timedOut).toBe(true);
    expect(run.dispatched.map((request) => request.briefs.map((brief) => brief.kind))).toEqual([["build"], ["build"], ["reset"]]);
    expect(run.ledger.snapshot().acts.filter((act) => act.inPlace)).toEqual([]);
    expect(run.outcome).toMatchObject({ status: "candidate", candidate: { revision: 1 }, trial: { verdict: "yes", revision: 1 }, completedOnPass: { revision: 1, why: "time" } });
    expect(run.outcome.completedOnPass!.told).toBe("The supervisor stopped before completing, so the build completes on revision 1, which passed its whole test. The build then reached its time limit.");
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("still completes on nothing when the person cancels", async () => {
    const made = project({ trialActs: true });
    const person = new AbortController();
    made.ports.signal = person.signal;
    const cancel: Step = (evidence) => {
      person.abort();
      return misshapen(evidence);
    };
    const run = await supervise([...PASSED, cancel], made, { propagateDecisionErrors: true });
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.candidate).toBeUndefined();
    expect(run.outcome).not.toHaveProperty("completedOnPass");
    expect(run.outcome.ending?.outcome).toBe("cancelled");
  });
});
