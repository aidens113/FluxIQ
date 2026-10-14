// A whole test the run rescued (social debug, t603). Social
// `run-mv8mebid-84ada5bd` passed its whole test only because the runtime
// recovered by itself when the site asked the run to slow down -- it waited,
// tried the step again and closed the site's notice -- and the Flow had no step
// that does that. The trial gate held the yes back, the supervisor sent a repair
// naming that test, and it was refused four times as naming a trial that
// passed, so the build ended without a Flow. Here the same shape on the
// fixture's lending library: the run recovers at its hold step.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE, AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { BUILD, planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { FIND, assembled, brief, call, complete, dispatch, supervise, test, type Entry } from "./supervisor-script.ts";

const ONE_PART = planInput([subflow("main", ["p1"])], taskSpecInput([["p1", FIND, []]]));

/** The step the run recovered at, as the runtime records it: the refusal it absorbed and the notice it closed. */
const RECOVERED_STEP: JsonObject = {
  step: 2,
  definitionId: "web.output.dom-click",
  label: "press hold",
  control: "Hold",
  status: "succeeded",
  attempts: 2,
  absorbed: [{ failureCode: "web.action.rate_limited", happened: "The site asked the run to slow down on pass 2, and to try again in 4 s.", pass: 2, askedWaitMs: 4000, waitedMs: 4000, paceMs: 4000, said: "The run waited 4 s and tried the step again: it went through." }],
  interruptions: [{ kind: "rate_limit", wayOut: "t12", said: "The page put the site's notice asking the run to slow down in the way, and the run closed it by pressing its way out, t12." }]
};
/** A whole test that passed only on that recovery. */
const RESCUED: JsonObject = { judge: "The trial was judged to do what the instruction asks.", steps: [{ step: 1, definitionId: "web.output.browser-navigate", status: "succeeded" }, RECOVERED_STEP] };
/** A whole test that passed on its own: a consent banner the run closed asks for no slowing down. */
const PLAIN: JsonObject = { judge: "The trial was judged to do what the instruction asks.", steps: [{ step: 1, definitionId: "web.output.browser-navigate", status: "succeeded", interruptions: [{ kind: "consent", wayOut: "t3", said: "The run closed a consent notice." }] }] };
/** What the trial gate says the Flow needs at that step. */
const NEEDS = { paceAtLeastMs: 4000, wayOut: "t12", waitAtLeastMs: 4000 };

const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);
const wholeTest = (evidence: readonly Entry[]): JsonObject => {
  const tested = [...evidence].reverse().find((entry) => entry.toolId === IDS.testCandidate)!.value as JsonObject;
  return { kind: "candidate_trial", receiptId: tested.trialRunId as string, digest: assembled(evidence).digest as string };
};
const repairOfTest = call(IDS.dispatch, (evidence) => ({ reason: "The run had to recover by itself at the hold step.", briefs: [brief("main", ["p1"], [], { kind: "repair", failingReceipt: wholeTest(evidence) })] }));
const tested = [call(IDS.writePlan, ONE_PART), dispatch([brief("main", ["p1"])]), call(IDS.assemble), test];

describe("a whole test that passed only on the run's own recovery", () => {
  it("admits a repair naming it, whose brief carries each step the run recovered at from its step record", async () => {
    const run = await supervise([...tested, repairOfTest, complete], project({ trialFeedback: () => RESCUED }));
    const repair = answersOf(run.shown, IDS.dispatch)[1]!;
    expect(repair).toMatchObject({ ok: true, returns: [{ kind: "repair", outcome: "done" }] });
    const sent = run.dispatched[1]!.briefs[0]!;
    const interruption = { step: 2, label: "press hold", definitionId: "web.output.dom-click", control: "Hold", absorbed: RECOVERED_STEP.absorbed, interruptions: RECOVERED_STEP.interruptions, needs: NEEDS };
    expect(sent.failingTrial).toEqual({ verdict: "yes", interruptions: [interruption], said: { judge: RESCUED.judge } });
    // The record holds it as sent, so a supervisor started again reads the same brief.
    expect(run.view!.record.briefs[1]!.brief.failingTrial).toEqual(sent.failingTrial);
  });

  it("is still no failing trial when its run recovered from nothing the Flow must answer: the repair is refused", async () => {
    const run = await supervise([...tested, repairOfTest, complete], project({ trialFeedback: () => PLAIN }));
    const refused = answersOf(run.shown, IDS.dispatch)[1]!;
    expect(refused).toMatchObject({ ok: false, code: "project.brief_refused", issues: [{ code: "project.failing_receipt_passed", path: "briefs.0.failingReceipt", why: GUIDANCE.issues.failingPassed }] });
    expect((refused.issues as JsonObject[])[0]).not.toHaveProperty("wholeTest");
    expect(run.dispatched).toHaveLength(1);
    expect(run.outcome).toMatchObject({ status: "candidate" });
    expect(run.outcome).not.toHaveProperty("reliesOnRecovery");
  });

  it("is held back from completion until its repair is tried, and completes on that test once the repair comes back without the change, telling the person", async () => {
    const events: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => events.push(event));
    let run: Awaited<ReturnType<typeof supervise>>;
    try {
      // The fixture's builder writes the same script for a subflow every time, so the repair changes nothing.
      run = await runWithAutomationStudioActivity({ kind: "build", id: "build-rescued", projectId: BUILD.projectId }, () => supervise([...tested, complete, repairOfTest, complete], project({ trialFeedback: () => RESCUED })));
    } finally {
      unsubscribe();
    }
    expect(run.feedback[0]).toMatchObject({ code: "candidate.trial_slow_down_unhandled", instruction: GUIDANCE.completion.recoveryRepairFirst, slowDown: [{ step: 2, label: "press hold", ...NEEDS }], wholeTest: { kind: "candidate_trial", receiptId: "run-1" } });
    const repair = answersOf(run.shown, IDS.dispatch)[1]!;
    expect(repair).toMatchObject({ ok: true, returns: [{ changedNothing: { sameAs: { briefId: "brief-1" } } }], wholeTestStands: { complete: { revision: 1 } }, next: GUIDANCE.next.afterRecoveryRepairShort });
    expect(run.outcome).toMatchObject({ status: "candidate", trial: { verdict: "yes" }, reliesOnRecovery: { revision: 1, receiptId: "run-1", why: "short", steps: [{ step: 2, label: "press hold" }] } });
    const told = run.outcome.reliesOnRecovery!.told;
    expect(told).toContain("relies on the run's own recovery");
    expect(told).toContain("step 2 (\"press hold\")");
    expect(told).toContain("came back without it");
    const note = events.find((event) => event.detail?.title === "The Flow relies on the run's own recovery");
    expect(note?.detail).toMatchObject({ kind: "note", status: "succeeded", text: told });
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("completes on that test when the build's turns run out before its repair, saying why", async () => {
    const run = await supervise(tested, project({ trialFeedback: () => RESCUED }));
    expect(run.outcome).toMatchObject({ status: "candidate", trial: { verdict: "yes" }, reliesOnRecovery: { why: "turns" } });
    expect(run.outcome.reliesOnRecovery!.told).toContain("ran out of turns");
    expect(run.view?.record.ending).toBeUndefined();
  });

  it("completes on that test when the purse cannot pay for its repair", async () => {
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.5 });
    const built = project({
      purse,
      reserve: { calls: 2, unpriced: { inputTokens: 1000, outputTokens: 0 } },
      trialFeedback: () => RESCUED,
      // Whatever the builders could still be given is spent elsewhere once the whole test ran.
      onTrial: () => {
        const drained = purse.hold({ projectedCostUsd: purse.allocatableUsd(), estimatedInputTokens: 10, maxOutputTokens: 10 });
        if (drained.ok) drained.hold.settle();
      }
    });
    const run = await supervise([...tested, repairOfTest, complete], built);
    const refused = answersOf(run.shown, IDS.dispatch)[1]!;
    expect(refused).toMatchObject({ ok: false, code: "project.allowance_unavailable", wholeTestStands: { complete: { revision: 1 }, instruction: GUIDANCE.issues.recoveryRepairUnaffordable } });
    expect(run.dispatched).toHaveLength(1);
    expect(run.outcome).toMatchObject({ status: "candidate", reliesOnRecovery: { why: "money" } });
  });

  it("is never confused with a whole test that did not pass: a no keeps its failing trial as before", async () => {
    const run = await supervise([...tested, repairOfTest, complete], project({ trial: () => "no", trialFeedback: () => ({ ...RESCUED, reasons: "No hold was placed." }) }));
    const sent = run.dispatched[1]!.briefs[0]!;
    expect(sent.failingTrial).toMatchObject({ verdict: "no", said: { reasons: "No hold was placed." } });
    expect(sent.failingTrial).not.toHaveProperty("interruptions");
  });
});
