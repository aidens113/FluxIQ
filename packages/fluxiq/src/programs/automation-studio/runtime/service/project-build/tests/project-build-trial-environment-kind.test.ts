// A project build's trial wrappers keep the inner port's environment kind
// (traces and offline trials, U7): the whole trials' and the subflow trials'
// ports each carry the `environmentKind` of the port they wrap, so the trial
// gate still sees an offline trial as offline. A whole trial's acts go to the
// build's reset ledgers only when it ran live; an offline trial's acts never
// happened on the site (Decision 6). Through the real wrappers over the real
// inner ports; no model is called beyond the mock judge.
import { describe, expect, it } from "vitest";
import { automationStudioCandidateTrialOffline } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { createAutomationStudioScopedRunEnvironment, AutomationStudioVirtualClock } from "../../../environment/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import type { AutomationStudioProjectBuildRecordStore } from "../../../project-agents/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { trialFixture } from "../../candidate-trial/tests/fixtures.ts";
import { subflowTrialFixture } from "../../subflow-trial/tests/fixtures.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import { automationStudioProjectBuildSubflowTrials } from "../subflow-trials.ts";
import { automationStudioProjectBuildWholeTrials, type AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";
import type { AutomationStudioCandidateTrialSource } from "../../../candidate-trials/authority/index.ts";
import { bindTrialExecutionSource } from "../../../candidate-trials/observation/index.ts";
import { bindPartialTrialContext, observePartialTrialCallback } from "../../../candidate-trials/partial/index.ts";
import { partialAdmissionFixture } from "../../../candidate-trials/partial/tests/fixture.ts";
import { automationStudioProjectDispatchTrialPort, AutomationStudioProjectDispatchReceipts, AutomationStudioProjectDispatchStandingNos } from "../../../project-agents/dispatch/index.ts";
import { AutomationStudioSiteResetObservation, observeAutomationStudioTrialPolicy, observeAutomationStudioTrialResultPolicy } from "../../../flow-bootstrap/reset-observation/index.ts";

const BINDING = { domainId: "isolated", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: {}, effectApplied: false, targetsUnchanged: true }) };
const judge = { provider: mockProvider(async () => judgeReply("yes")), instructions: [] };

/** An offline environment of `kind`, sealed to its own channel scope. */
const offline = (kind: "trace" | "fixture") => createAutomationStudioScopedRunEnvironment({ kind, clock: new AutomationStudioVirtualClock(100) });

/** A whole-trial fixture whose one press lands as a lasting act. */
function pressingTrial() {
  const fixture = trialFixture(["create_new"]);
  fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
  const { judge: _judge, ...environment } = fixture.ports;
  return { fixture, environment };
}

describe("a project build's whole trials, wrapping the inner port (U7)", () => {
  it("live: keeps the start hook, says live, and writes the trial's acts to the ledger as before", async () => {
    const { fixture, environment } = pressingTrial();
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: { ...environment, prepareStart: async () => ({ fixture: "reset" }) }, binding: BINDING, judge, ledger });
    expect(trials.port.environmentKind).toBe("live");
    expect(automationStudioCandidateTrialOffline(trials.port)).toBe(false);
    expect(typeof trials.port.prepareStart).toBe("function");
    const result = await automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment, binding: BINDING, judge, ledger }).port(fixture.request());
    expect(result.acts).toHaveLength(1);
    expect(ledger.snapshot().acts).toHaveLength(1);
  });

  for (const kind of ["trace", "fixture"] as const) {
    it(`${kind}: keeps the kind through the wrapper and writes nothing to the ledger`, async () => {
      const { fixture, environment } = pressingTrial();
      const ledger = new AutomationStudioSiteResetProjectLedger();
      const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: { ...environment, environment: offline(kind), prepareStart: async () => ({ fixture: "reset" }) }, binding: BINDING, judge, ledger });
      expect(trials.port.environmentKind).toBe(kind);
      expect(automationStudioCandidateTrialOffline(trials.port)).toBe(true);
      // An offline trial runs no start hook, so the inner port offers none and neither does the wrapper.
      expect(trials.port.prepareStart).toBeUndefined();
      const result = await trials.port(fixture.request());
      expect(result.acts).toHaveLength(1);
      expect(ledger.snapshot().acts).toEqual([]);
    });
  }
});

const REF = { projectId: "project", flowId: "parent", buildId: "build.1" };
const records = { read: async () => undefined } as unknown as Pick<AutomationStudioProjectBuildRecordStore, "read">;

function subflowTrials(environmentOf?: ReturnType<typeof offline>, configured?: AutomationStudioCandidateTrialSource) {
  const f = subflowTrialFixture();
  const { judge: _judge, predecessorProposals: _predecessors, ...environment } = f.ports;
  const given = environmentOf ? { ...environment, environment: environmentOf } : environment;
  if (configured) bindTrialExecutionSource(given, configured);
  const trials = automationStudioProjectBuildSubflowTrials({
    ref: REF, environment: given as AutomationStudioProjectBuildTrialEnvironment, binding: BINDING as unknown as AutomationStudioLlmEvidenceRuntimeBinding,
    judge: { provider: mockProvider(async () => judgeReply("yes")) }, records, proposals: new AutomationStudioProjectBuildProposals(), leases: { assertCurrent: () => undefined }, running: () => true
  });
  return { ...trials, fixture: f, environment: given };
}

describe("a project build's subflow trials, wrapping the inner port (U7)", () => {
  it("live: says live", () => {
    expect(subflowTrials().port.environmentKind).toBe("live");
  });

  for (const kind of ["trace", "fixture"] as const) {
    it(`${kind}: keeps the kind through the wrapper`, () => {
      const trials = subflowTrials(offline(kind));
      expect(trials.port.environmentKind).toBe(kind);
      expect(automationStudioCandidateTrialOffline(trials.port)).toBe(true);
    });
  }
});

describe("the original configured project offline choice", () => {
  it.each(["before", "after"] as const)("finishes through the ACTUAL dispatch receiver with source bound %s factory creation", async binding => {
    const f = await partialAdmissionFixture({ port: async () => { throw new Error("No live partial trial may run."); } });
    const trials = subflowTrials(undefined, binding === "before" ? f.configured : undefined);
    if (binding === "after") bindTrialExecutionSource(trials.environment, f.configured);
    const dispatchInput = {
      port: trials.port,
      scope: f.scope,
      receipts: new AutomationStudioProjectDispatchReceipts(f.scope.briefId),
      spend: { allowance: undefined, trials: [] },
      standingNos: new AutomationStudioProjectDispatchStandingNos(),
      remember: () => undefined
    };
    f.callbacks.manage({ receiver: dispatchInput, callback: dispatchInput.remember, contract: "no_direct_effects" });
    const dispatched = automationStudioProjectDispatchTrialPort(dispatchInput);
    const callback = dispatched.offlineFirst;
    if (!callback) throw new Error("The project factory must return its original offline choice.");
    expect(dispatched).not.toBe(trials.port);
    expect(callback).toBe(trials.port.offlineFirst);
    expect(f.callbacks.isManaged({ receiver: dispatched, callback })).toBe(false);
    const signal = new AbortController().signal;
    const { origin, record } = f.configured.original("controlled.project.offline_choice");
    if (!record.invocationId) throw new Error("An actual admitted root needs its original invocation id.");
    const reserved = await f.configured.reserve(origin, signal);
    const request = { scope: f.scope, proposal: f.proposal, signal };
    const context = { parent: { reservation: reserved.reservation, parent: reserved.root }, callbacks: f.callbacks, automation: undefined, originalRoot: reserved.root };
    bindPartialTrialContext(request, context);
    expect(await observePartialTrialCallback(request, { receiver: dispatched, callback, args: [request] }, signal, request)).toMatchObject({ kind: "live", note: { outcome: "not_tried", why: "offline_trials_off" } });
    expect(f.callbacks.isManaged({ receiver: dispatched, callback })).toBe(true);
    const predecessors = dispatched.admissionPredecessors;
    if (!predecessors) throw new Error("The actual project port must preserve predecessor admission.");
    expect(predecessors).toBe(trials.port.admissionPredecessors);
    expect(f.callbacks.isManaged({ receiver: dispatched, callback: predecessors })).toBe(false);
    const scope = structuredClone(f.scope);
    expect(await observeAutomationStudioTrialPolicy(request, "prepare", { receiver: dispatched, callback: predecessors, args: [scope] }, scope)).toEqual([]);
    expect(f.callbacks.isManaged({ receiver: dispatched, callback: predecessors })).toBe(true);
    expect(AutomationStudioSiteResetObservation.of(scope)).toBeUndefined();
    const checkRows = dispatched.checkRows;
    if (!checkRows) throw new Error("The actual dispatch port must preserve its row reader.");
    expect(checkRows).toBe(trials.port.checkRows);
    expect(await observePartialTrialCallback(request, { receiver: dispatched, callback: checkRows, args: [{ scope, revision: f.proposal.revision, digest: f.proposal.digest, reads: [], signal }] }, signal)).toBeUndefined();
    const weighed = dispatched.weighed;
    if (!weighed) throw new Error("The actual dispatch port must retain its verdict observer.");
    const kept = { answer: { partial: true as const, scope: "subflow" as const, identity: { buildId: f.scope.buildId, briefId: f.scope.briefId, planDigest: f.scope.planDigest, subflowKey: f.scope.subflowKey }, revision: f.proposal.revision, digest: f.proposal.digest, verdict: "execution_failed" as const, entryPrepared: false, feedback: { code: "controlled.no_live_trial" } } };
    await observeAutomationStudioTrialResultPolicy(request, { receiver: dispatched, callback: weighed, args: [kept] }, kept);
    expect(AutomationStudioSiteResetObservation.of(kept)).toBeUndefined();
    expect(AutomationStudioSiteResetObservation.of(dispatched)).toBeUndefined();
    expect(trials.records()).toEqual([]);
    expect(trials.spent().calls).toBe(0);
    expect(trials.fixture.sessions).toEqual([]);
    expect(trials.fixture.judged).toEqual([]);
    expect(trials.fixture.pressed).toEqual([]);
    await f.configured.finish(reserved.root, origin, record.invocationId);
    await f.assembly.consumer.release(reserved.reservation);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("clear");
  });

  it("does not grant the factory contract to a supplied fulfilled callback or allow another call", async () => {
    const f = await partialAdmissionFixture({ port: async () => { throw new Error("No live partial trial may run."); } });
    const trials = subflowTrials(undefined, f.configured);
    let calls = 0;
    const supplied = async () => {
      calls++;
      return { kind: "live" as const, note: { outcome: "not_tried" as const, why: "controlled supplied callback" } };
    };
    expect(f.callbacks.isManaged({ receiver: trials.port, callback: supplied })).toBe(false);
    const signal = new AbortController().signal;
    const { origin } = f.configured.original("controlled.project.supplied_choice");
    const reserved = await f.configured.reserve(origin, signal);
    const request = { scope: f.scope, proposal: f.proposal, signal };
    bindPartialTrialContext(request, { parent: { reservation: reserved.reservation, parent: reserved.root }, callbacks: f.callbacks, automation: undefined, originalRoot: reserved.root });
    expect(await observePartialTrialCallback(request, { receiver: trials.port, callback: supplied, args: [] }, signal, request)).toMatchObject({ kind: "live" });
    await expect(observePartialTrialCallback(request, { receiver: trials.port, callback: supplied, args: [] }, signal, request)).rejects.toThrow();
    expect(calls).toBe(1);
    await f.assembly.consumer.release(reserved.reservation);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
  });

  it("does not grant the original row reader's contract to a replacement", async () => {
    const f = await partialAdmissionFixture({ port: async () => { throw new Error("No live partial trial may run."); } });
    const trials = subflowTrials(undefined, f.configured);
    let calls = 0;
    const supplied = async () => {
      calls++;
      return { checked: true };
    };
    const signal = new AbortController().signal;
    const { origin } = f.configured.original("controlled.project.replaced_rows");
    const reserved = await f.configured.reserve(origin, signal);
    const request = { scope: f.scope, proposal: f.proposal, signal };
    bindPartialTrialContext(request, { parent: { reservation: reserved.reservation, parent: reserved.root }, callbacks: f.callbacks, automation: undefined, originalRoot: reserved.root });
    Object.assign(trials.port, { checkRows: supplied });
    expect(await observePartialTrialCallback(request, { receiver: trials.port, callback: supplied, args: [] }, signal)).toEqual({ checked: true });
    await expect(observePartialTrialCallback(request, { receiver: trials.port, callback: supplied, args: [] }, signal)).rejects.toThrow();
    expect(calls).toBe(1);
    await f.assembly.consumer.release(reserved.reservation);
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("pending");
  });
});
