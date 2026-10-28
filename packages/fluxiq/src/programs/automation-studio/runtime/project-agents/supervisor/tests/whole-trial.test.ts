// The supervisor's whole test (t586, t775): the deployment's start hook first,
// which takes back the build's acts; otherwise the test runs on the site as it
// stands, its judge told what of the build is there, and -- given Core's own
// look -- judged by what it changed from the state read just before it. Every
// ending names what is still on the target. Run on the build of
// `./supervisor-fixture.ts` with its real lasting-act ledger.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../index.ts";
import { BUILD, HOLDS_AT, planInput, project, subflow, taskSpecInput } from "./supervisor-fixture.ts";
import { singleBuild } from "../../single-subflow/tests/single-build.ts";
import { FIND, HOLD, brief, call, complete, dispatch, end, lastOf, supervise, test, type Step } from "./supervisor-script.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioProjectSupervisorContext } from "../context.ts";
import { AutomationStudioProjectSupervisorState } from "../state.ts";
import { AutomationStudioProjectSupervisorWholeTrial } from "../whole-trial.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialPort, type AutomationStudioCandidateTrialRequest, type AutomationStudioFlowCandidate } from "../../../flow-bootstrap/candidate/index.ts";

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


  // t775 (user, 2026-10-27: reset as rarely as possible): with no hook the whole test runs on the site as it stands. The
  // act a builder's trial left is said to the judge under startedWith, no reset brief is sent first, and the ending
  // still names what this build left on the target.
  it("runs the test with the build's act still on the site, its judge told under startedWith, and an ending names it", async () => {
    const run = await supervise([call(IDS.writePlan, TWO_PART), dispatch(BUILDS), call(IDS.assemble), test, end("blocked", "The whole test was judged no.")], project({ trial: () => "no" }));
    const [ran] = tests(run.shown);
    expect(ran).toMatchObject({ verdict: "no", startedWith: { acts: [{ act: "act-1" }] } });
    expect(run.trials).toHaveLength(1);
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"]]);
    expect(run.ledger.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", owner: "brief-2", inPlace: true })]);
    expect(run.outcome.status).toBe("ended");
    expect(run.outcome.ending?.reason).toBe("The whole test was judged no. Still on the target from this build: trial step 1 \"press hold for place_hold\".");
  });
});

// t775 D5 (user, 2026-10-27): a trial is judged against the state recorded just before it and the change asked for; a
// line at 9 that is 10 after "add 1" passed, with no reset. The supervisor's judged whole run is that example. Given
// Core's own look (`ports.look`, `service/project-build/phase-start.ts`), it reads the witness of the plan's lasting
// step just before the run -- the builder's add left the hold's row at 9 -- and again after it, and its judge is sent
// the change, the part's proof from its typed effect, and what of the build was on the site from earlier.
describe("the supervisor's judged whole run, read by its change (t775 D5)", () => {
  const spec = taskSpecInput([["p1", FIND, []], ["p2", HOLD, ["create_new"]]]);
  const ADDS = { kind: "change", direction: "adds", count: 1, what: "copy on hold" };
  (spec.parts as JsonObject[])[1]!.effect = ADDS;
  const READ_PLAN = planInput([subflow("find_titles", ["p1"], { inputs: ["author"], outputs: ["titles"] }), subflow("place_hold", ["p2"], { inputs: ["titles"], outputs: ["shelf"] })], spec);

  it("reads the hold at 9 just before and 10 after, with no reset brief, and its judge is sent the change with the part shown", async () => {
    const run = await supervise([call(IDS.writePlan, READ_PLAN), dispatch(BUILDS), call(IDS.assemble), test, complete], project({ readings: { copies: 9 } }));
    expect(run.outcome.status, JSON.stringify(run.outcome.loop)).toBe("candidate");
    // No reset: the builder's add stayed on the site, and the trial ran with it, said under startedWith.
    expect(run.dispatched.map((request) => request.briefs.map((sent) => sent.kind))).toEqual([["build", "build"]]);
    expect(tests(run.shown)[0]).toMatchObject({ verdict: "yes", startedWith: { acts: [{ act: "act-1" }] } });
    expect(run.ledger.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", inPlace: true })]);
    // Core looked at the hold's list just before the run (no read of it since the add) and after it, worded against the before state.
    expect(run.looks).toEqual([{ location: HOLDS_AT }, { location: HOLDS_AT, start: { copies: 9 } }]);
    expect(run.judged).toEqual([{
      witnesses: [{
        id: "w1", kind: "list", where: HOLDS_AT, steps: [], parts: ["p2"],
        before: { source: "core_look", rows: 1 }, after: { source: "core_look", rows: 1 },
        change: { added: 0, removed: 0, changed: 1, unchanged: 0, lines: { gone: ["The hold: 9 copies"], added: ["The hold: 10 copies"] } }
      }],
      acts: [],
      leftFromEarlier: [{ did: "trial step 1 \"press hold for place_hold\"" }],
      // p1 declares no effect, so it has no proof to show: its judge decides it from the run alone.
      proofs: [{ part: "p2", effect: ADDS, proof: "shown", steps: [] }]
    }]);
  });

  it("takes no readings without Core's look: the whole run is judged with no siteChange, as before", async () => {
    const run = await supervise([call(IDS.writePlan, READ_PLAN), dispatch(BUILDS), call(IDS.assemble), test, complete], project());
    expect(run.outcome.status).toBe("candidate");
    expect(run.judged).toEqual([]);
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

// D48 (t769, P6): a project build's whole port is offline-first, so the supervisor's whole test of a revision not tried
// yet may be answered by a failure the recording of the build's last live test shows, kept in place of a site trial.
// Nothing ran on the site: no start hook, no reset, nothing in the ledger. The supervisor takes it as a no -- a receipt
// naming the offline run, a failed whole test, the Flow tested -- but it took no site time, so it is never the measure
// of how long a test takes (G2). Completion still needs a live yes. Generic data; the port is a stub.
describe("a whole test answered from the recording", () => {
  const candidate = (revision: number) => ({ revision, digest: String(revision).repeat(64), baseDependencyDigest: "b", status: "draft", summary: "s", buildPlan: { plan: { subflows: [] } }, changedPaths: [] }) as unknown as AutomationStudioFlowCandidate;

  it("is a no without a site trial: no hook, reset or ledger entry; a receipt for the offline run, the failure noted, completion refused", async () => {
    const counted = { live: 0, hooks: 0, resets: 0, offline: 0 };
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const state = new AutomationStudioProjectSupervisorState();
    const whole = new AutomationStudioProjectSupervisorWholeTrial({ ports: { projectLedger: ledger }, state });
    const port = Object.assign(async (request: AutomationStudioCandidateTrialRequest) => {
      counted.live += 1;
      return { revision: request.revision, digest: request.digest, verdict: "no" as const, feedback: { code: "candidate.trial_no" }, trialRunId: `live-${counted.live}` };
    }, {
      prepareStart: async () => {
        counted.hooks += 1;
        return "reset" as const;
      },
      offlineFirst: async (request: AutomationStudioCandidateTrialRequest) => {
        counted.offline += 1;
        if (request.revision === 1) return { kind: "live" as const, note: { outcome: "not_tried" as const, why: "no_live_source" } };
        return { kind: "kept" as const, result: { revision: request.revision, digest: request.digest, verdict: "no" as const, feedback: { code: "candidate.trial_no", summary: "The stored rows are not the ones asked for." }, trialRunId: "offline-run" }, checked: { matched: 2, recorded: 2 } };
      }
    }) as unknown as AutomationStudioCandidateTrialPort;
    let latest: AutomationStudioFlowCandidate | undefined;
    const reset = { ...whole.reset, beforeTrial: async (...args: Parameters<typeof whole.reset.beforeTrial>) => {
      counted.resets += 1;
      return await whole.reset.beforeTrial(...args);
    } };
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "candidate", port }, reset });
    const receipts: JsonObject[] = [];
    const ports = { projectLedger: ledger, build: BUILD, record: { recordReceipt: async (_build: unknown, entry: { receipt: JsonObject }) => { receipts.push(entry.receipt); } } };
    const context = { ports, state, gate, controller: { latest: () => latest }, signal: undefined } as unknown as AutomationStudioProjectSupervisorContext;
    const test = async (revision: number) => {
      latest = candidate(revision);
      return (await whole.test(context, { revision, digest: latest.digest }, undefined)).evidence as JsonObject;
    };

    expect(await test(1)).toMatchObject({ verdict: "no", trialRunId: "live-1" });
    expect(counted).toEqual({ live: 1, hooks: 1, resets: 1, offline: 1 });
    state.wholeTrialFailed = false;
    const ledgerBefore = ledger.snapshot();

    const kept = await test(2);

    expect(kept).toMatchObject({ ok: false, verdict: "no", revision: 2, trialRunId: "offline-run", checkedAgainst: "recorded_run" });
    expect(counted).toEqual({ live: 1, hooks: 1, resets: 1, offline: 2 });
    expect(ledger.snapshot()).toEqual(ledgerBefore);
    expect(state.wholeTrialFailed).toBe(true);
    expect(receipts).toEqual([{ kind: "candidate_trial", receiptId: "live-1", digest: candidate(1).digest }, { kind: "candidate_trial", receiptId: "offline-run", digest: candidate(2).digest }]);
    expect(whole.lastOfFlow(candidate(2).digest)).toEqual({ revision: 2, cutAfter: false });
    expect(gate.standing(candidate(2))).toMatchObject({ verdict: "no", trialRunId: "offline-run" });
    expect(gate.completion({ revision: 2, digest: candidate(2).digest }).ok).toBe(false);
  });

  it("is never the measure of a test's time: a later Flow is still estimated from the last test that ran on the site", async () => {
    const run = harness({ workMs: 10 * MINUTE, durations: [240_000] });
    await run.trial.test(run.context, { revision: 1, digest: FIRST }, undefined);
    // The next revision is answered from the recording in a second.
    const live = run.gate.test;
    run.gate.test = async (value: JsonObject) => {
      run.advance(1_000);
      return { kind: "llm_evidence_tool_execution", evidence: { ok: false, verdict: "no", revision: value.revision, digest: value.digest, trialRunId: "offline-run", checkedAgainst: "recorded_run" } };
    };
    expect((await run.trial.test(run.context, { revision: 2, digest: SECOND }, undefined)).evidence).toMatchObject({ checkedAgainst: "recorded_run" });
    expect(run.trial.lastOfFlow(SECOND)).toEqual({ revision: 2, cutAfter: false });
    run.gate.test = live;
    run.advance(3 * MINUTE);

    // Three minutes left against the four the last site test took: a third Flow is not started, and neither is the second.
    for (const [revision, digest] of [[3, "c".repeat(64)], [3, SECOND]] as const) {
      const refused = await run.trial.test(run.context, { revision, digest }, undefined);
      expect(refused.evidence).toMatchObject({ code: "project.trial_out_of_time", lastTestSeconds: 240, sameFlow: false });
    }
    expect(run.ran).toHaveLength(1);
  });
});
