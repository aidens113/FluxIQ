// P6 (t769, B10, B15): offline-first trials wired into the build's own ports. A
// project build's partial-trial port carries the factory's `offlineFirst` (a
// kept answer reaches `weighed`, its judge spend joins the port's), and so
// does every whole port, a project build's included (D48, revising D40): the
// supervisor's whole test keeps a failure its recording shows without touching
// the site, and completes only on a live yes. On the offline harnesses'
// traced gateway; the judge is a scripted provider, no model is called.
import { afterEach, describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler } from "../../../project-agents/host-resources/index.ts";
import { StubHost } from "../../../project-agents/host-resources/tests/stub-host.ts";
import type { AutomationStudioProjectBuildRecordStore } from "../../../project-agents/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { AutomationStudioOfflineTrialInstallation } from "../../offline-first/index.ts";
import { candidateOf, offlineHarness, requestFor, ROWS, type OfflineHarness, type ReadScript } from "../../offline-trial/tests/offline-harness.ts";
import { SCOPE, subflowHarness, subflowOf, subflowRequestFor } from "../../offline-trial/tests/subflow-harness.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import { automationStudioProjectBuildSubflowTrials } from "../subflow-trials.ts";
import { automationStudioProjectBuildWholeTrials, type AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";
import { AutomationStudioSiteResetProjectLedger, automationStudioSiteResetProjectReset } from "../../../flow-bootstrap/site-reset/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioFlowCandidate } from "../../../flow-bootstrap/candidate/index.ts";
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as WORDS } from "../../../flow-bootstrap/offline-first/index.ts";

const BINDING = { domainId: "test", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {} }) } as unknown as AutomationStudioLlmEvidenceRuntimeBinding;
const REF = { projectId: SCOPE.buildId, flowId: "parent", buildId: SCOPE.buildId };
const records = { read: async () => ({ record: { plans: [{ plan: { digest: SCOPE.planDigest } }], taskSpecs: [] } }) } as unknown as Pick<AutomationStudioProjectBuildRecordStore, "read">;

const SAID = { expected: "Only lamps priced above the limit.", observed: "Too few rows were kept.", changed: "Keep every lamp above the limit." };

let harness: OfflineHarness | undefined;
let uninstall: (() => void) | undefined;

afterEach(async () => {
  uninstall?.();
  uninstall = undefined;
  await harness?.close();
  harness = undefined;
});

/** A read that fails the same way every time: the live trial fails, and so does the next revision against its recording. */
const GONE: ReadScript = () => ({ delayMs: 1, status: "failed", error: "gone", failure: { category: "timeout", code: "example.gone", retryable: false, stage: "dispatch", effect: "unacted" } });

/** The harness's ordinary answer: its rows. */
const SUCCESS: ReadScript = () => ({ delayMs: 2, status: "succeeded", payload: { rows: structuredClone([...ROWS]) } });

async function installed(install = true, script: ReadScript = GONE) {
  harness = await offlineHarness(script);
  if (install) uninstall = AutomationStudioOfflineTrialInstallation.install({ gateway: harness.gateway, storeFor: () => harness!.store, sessionViewFor: () => undefined });
  return harness;
}

/** The project build's partial-trial port over the harness's traced ports, with a judge that says `no`. */
function subflowTrials(h: OfflineHarness, proposals = new AutomationStudioProjectBuildProposals(), phase?: "repair" | "test") {
  const { judge: _judge, predecessorProposals: _predecessors, ...environment } = subflowHarness(h).ports;
  const trials = automationStudioProjectBuildSubflowTrials({
    ref: REF, environment: environment as unknown as AutomationStudioProjectBuildTrialEnvironment, binding: BINDING,
    judge: { provider: mockProvider(async () => judgeReply("no", SAID)) }, records, proposals, leases: { assertCurrent: () => undefined }, running: () => true, ...(phase ? { phase } : {})
  });
  const leases = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })));
  /** Work under the brief's lease, as the dispatcher runs a brief's gate. */
  const held = async <T>(work: () => Promise<T>): Promise<T> => await leases.run({ role: "subflow_builder", briefId: SCOPE.briefId }, work);
  const live = async (proposal: ReturnType<typeof subflowOf>) => await held(async () => await trials.port(subflowRequestFor(proposal)));
  const offline = async (proposal: ReturnType<typeof subflowOf>) => await held(async () => await trials.port.offlineFirst!(subflowRequestFor(proposal)));
  return { trials, live, offline };
}

describe("a project build's partial-trial port", () => {
  it("runs the next revision offline against its prior live trial, and counts the offline judge's spend", async () => {
    const h = await installed();
    const proposals = new AutomationStudioProjectBuildProposals();
    const told: string[] = [];
    const inner = proposals.trialled.bind(proposals);
    proposals.trialled = (scope, proposal, verdict) => {
      told.push(verdict);
      inner(scope, proposal, verdict);
    };
    const { trials, live, offline } = subflowTrials(h, proposals);
    expect(trials.port.offlineFirst).toBeTypeOf("function");

    await live(subflowOf({ queries: ["lamps"], threshold: 10 }));
    expect(trials.records()).toHaveLength(1);
    expect(trials.records()[0]!.traceId).toBeDefined();

    const sent = h.live.commands().length;
    const next = subflowOf({ queries: ["lamps"], threshold: 15 }, 2);
    const answer = await offline(next);

    expect(answer).toMatchObject({ kind: "kept", result: { revision: 2, verdict: "execution_failed" } });
    // Run offline against the recording: the live port's records are as they were, and the site was not touched again.
    expect(trials.records()).toHaveLength(1);
    expect(h.live.commands()).toHaveLength(sent);
    // The proposals learn the gate's verdict of a kept answer, once.
    trials.port.weighed!({ answer: (answer as { result: Parameters<NonNullable<typeof trials.port.weighed>>[0]["answer"] }).result });
    expect(told).toEqual(["execution_failed"]);
  });

  it("answers live and unchanged without an installation", async () => {
    const h = await installed(false);
    const { trials, live, offline } = subflowTrials(h);
    await live(subflowOf({ queries: ["lamps"], threshold: 10 }));
    const spent = trials.spent();

    const answer = await offline(subflowOf({ queries: ["lamps"], threshold: 15 }, 2));

    expect(answer).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_trials_off" } });
    expect(trials.spent()).toEqual(spent);
  });
});

describe("the offline judge's spend", () => {
  it("joins the port's, for a partial trial and for a candidate build's whole trial, while the records stay live", async () => {
    const h = await installed(true, SUCCESS);
    const { trials, live, offline } = subflowTrials(h);
    await live(subflowOf({ queries: ["lamps"], threshold: 10 }));
    const liveSpent = trials.spent();
    expect(liveSpent.calls).toBeGreaterThan(0);

    // The next revision runs offline and is judged there: the judge is paid again, and the port counts it.
    expect(await offline(subflowOf({ queries: ["lamps"], threshold: 15 }, 2))).toMatchObject({ kind: "live", note: { outcome: "inconclusive" } });
    expect(trials.spent().calls).toBe(liveSpent.calls * 2);
    expect(trials.spent().estimatedCostUsd).toBeCloseTo(liveSpent.estimatedCostUsd * 2);
    expect(trials.records()).toHaveLength(1);

    const whole = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.offline", environment: h.ports as unknown as AutomationStudioProjectBuildTrialEnvironment, binding: BINDING, judge: { provider: mockProvider(async () => judgeReply("no", SAID)), instructions: [] } });
    await whole.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    const wholeSpent = whole.spent();
    await whole.port.offlineFirst!(requestFor(candidateOf({ query: "lamps", threshold: 15 }, 2)));
    expect(whole.spent().calls).toBeGreaterThan(wholeSpent.calls);
    expect(whole.records()).toHaveLength(1);
  });
});

describe("the whole trial's offline-first port", () => {
  const judge = { provider: mockProvider(async () => judgeReply("no", SAID)), instructions: [] };

  it("is present on a project build too, beside its start hook and environment kind (D48)", async () => {
    const h = await installed();
    const environment = { ...h.ports, prepareStart: async () => ({ fixture: "reset" }) } as unknown as AutomationStudioProjectBuildTrialEnvironment;
    const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.offline", environment, binding: BINDING, judge, ledger: new AutomationStudioSiteResetProjectLedger() });
    expect(trials.port.offlineFirst).toBeTypeOf("function");
    expect(trials.port.prepareStart).toBeTypeOf("function");
    expect(trials.port.environmentKind).toBe("live");
  });

  it("is present on a candidate build, live without a recording, and its spend and records stay the live port's", async () => {
    const h = await installed();
    const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.offline", environment: h.ports as unknown as AutomationStudioProjectBuildTrialEnvironment, binding: BINDING, judge });
    expect(trials.port.offlineFirst).toBeTypeOf("function");

    expect(await trials.port.offlineFirst!(requestFor(candidateOf({ query: "lamps", threshold: 10 })))).toEqual({ kind: "live", note: { outcome: "not_tried", why: "no_live_source" } });
    await trials.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    const spent = trials.spent();

    const answer = await trials.port.offlineFirst!(requestFor(candidateOf({ query: "lamps", threshold: 15 }, 2)));

    expect(answer).toMatchObject({ kind: "kept" });
    expect(trials.records()).toHaveLength(1);
    expect(trials.spent()).toEqual(spent);
  });

  it("answers live without an installation", async () => {
    const h = await installed(false);
    const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.offline", environment: h.ports as unknown as AutomationStudioProjectBuildTrialEnvironment, binding: BINDING, judge });
    await trials.port(requestFor(candidateOf({ query: "lamps", threshold: 10 })));
    expect(await trials.port.offlineFirst!(requestFor(candidateOf({ query: "lamps", threshold: 15 }, 2)))).toEqual({ kind: "live", note: { outcome: "not_tried", why: "offline_trials_off" } });
  });
});

/**
 * The whole candidate's gate over a project build's whole trials on the harness, as the supervisor's whole test runs it
 * (`project-agents/supervisor/supervisor-loop.ts`), with the build's one reset over its ledger: every start hook, site
 * reset and live command counted. `said` is what the judge answers next. What the supervisor keeps of a kept answer
 * is in `project-agents/supervisor/tests/whole-trial.test.ts`.
 */
function supervisorWholeTest(h: OfflineHarness, said: { current: "yes" | "no" }) {
  const counted = { hooks: 0, resets: 0 };
  const ledger = new AutomationStudioSiteResetProjectLedger();
  const environment = { ...h.ports, prepareStart: async () => {
    counted.hooks += 1;
    return { fixture: "reset" };
  } } as unknown as AutomationStudioProjectBuildTrialEnvironment;
  const judge = { provider: mockProvider(async () => judgeReply(said.current, said.current === "no" ? { ...SAID, defects: [] } : {})), instructions: [] };
  const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.offline", environment, binding: BINDING, judge, ledger });
  const shared = automationStudioSiteResetProjectReset({ project: ledger, checks: () => ({ compare: async () => ({ moved: false }) }) });
  const reset = { ...shared, beforeTrial: async (...args: Parameters<typeof shared.beforeTrial>) => {
    counted.resets += 1;
    return await shared.beforeTrial(...args);
  } };
  let latest: AutomationStudioFlowCandidate | undefined;
  const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "candidate.offline", port: trials.port }, reset });
  const test = async (candidate: AutomationStudioFlowCandidate) => {
    latest = candidate;
    return (await gate.test({ revision: candidate.revision, digest: candidate.digest })).evidence as JsonObject;
  };
  return { trials, ledger, gate, counted, test };
}

// The harness's stub binding reads no stored rows, so the build-test judge cannot confirm a no here (it comes back
// unsure); a failure the recording shows is a stop (`GONE`). A kept judged no, and what the supervisor keeps of it,
// are in `project-agents/supervisor/tests/whole-trial.test.ts`.
describe("a project build's whole test, offline first (D48)", () => {
  it("after a live failure, keeps the next revision's recorded failure: no start hook, reset or site command, the ledger untouched; its retest is live (D41)", async () => {
    const h = await installed(true, GONE);
    const run = supervisorWholeTest(h, { current: "no" });

    const first = await run.test(candidateOf({ query: "lamps", threshold: 10 }));
    expect(first).toMatchObject({ verdict: "execution_failed", revision: 1 });
    // A first test has no recording to stand in for it: it runs live, and a note not tried adds nothing (D46).
    expect(first).not.toHaveProperty("offlineCheck");
    expect(run.counted).toEqual({ hooks: 1, resets: 1 });
    expect(run.trials.records()).toHaveLength(1);
    const sent = h.live.commands().length;
    const ledgerBefore = run.ledger.snapshot();
    const spentBefore = run.trials.spent();

    const next = candidateOf({ query: "lamps", threshold: 15 }, 2);
    const kept = await run.test(next);

    expect(kept).toMatchObject({ ok: false, verdict: "execution_failed", revision: 2, digest: next.digest, checkedAgainst: "recorded_run" });
    expect(String(kept.instruction).startsWith(WORDS.kept)).toBe(true);
    // Nothing was done on the site: no hook, no reset, no command, no live record, nothing in the ledger.
    expect(run.counted).toEqual({ hooks: 1, resets: 1 });
    expect(h.live.commands()).toHaveLength(sent);
    expect(run.trials.records()).toHaveLength(1);
    expect(run.ledger.snapshot()).toEqual(ledgerBefore);
    expect(run.trials.spent()).toEqual(spentBefore);
    // The gate stands the kept failure, naming the offline run, and refuses completion on it.
    expect(typeof kept.trialRunId).toBe("string");
    expect(kept.trialRunId).not.toBe(first.trialRunId);
    expect(run.gate.standing(next)).toMatchObject({ verdict: "execution_failed", trialRunId: kept.trialRunId });
    expect(run.gate.completion({ revision: 2, digest: next.digest }).ok).toBe(false);

    // The same revision tested again runs live, without asking the recording again (D41).
    const retest = await run.test(next);

    expect(retest).toMatchObject({ verdict: "execution_failed", revision: 2 });
    expect(retest).not.toHaveProperty("checkedAgainst");
    expect(retest).not.toHaveProperty("offlineCheck");
    expect(run.counted).toEqual({ hooks: 2, resets: 2 });
    expect(h.live.commands().length).toBeGreaterThan(sent);
    expect(run.trials.records()).toHaveLength(2);
  });

  it("runs a revision that passes against the recording live in the same call, and completes on that live yes only", async () => {
    const h = await installed(true, SUCCESS);
    const said = { current: "no" as "yes" | "no" };
    const run = supervisorWholeTest(h, said);
    // The judge's no without a defect Core can find comes back unsure: a live test that did not pass.
    expect(await run.test(candidateOf({ query: "lamps", threshold: 10 }))).toMatchObject({ ok: false, verdict: "unsure" });
    const sent = h.live.commands().length;
    const spent = run.trials.spent();

    said.current = "yes";
    const next = candidateOf({ query: "lamps", threshold: 15 }, 2);
    const passed = await run.test(next);

    expect(passed).toMatchObject({ ok: true, verdict: "yes", revision: 2, offlineCheck: { outcome: "passed" } });
    expect(passed).not.toHaveProperty("checkedAgainst");
    expect(run.counted).toEqual({ hooks: 2, resets: 2 });
    expect(h.live.commands().length).toBeGreaterThan(sent);
    expect(run.trials.records()).toHaveLength(2);
    // The offline judge was paid, and the port counts it beside the live trials': two judge calls for each yes.
    expect(run.trials.spent().calls).toBe(spent.calls + 4);
    expect(run.gate.completion({ revision: 2, digest: next.digest }).ok).toBe(true);
  });
});
