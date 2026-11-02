// A candidate build's offline-first trials of its whole candidate (trace plan
// P6, t769; D40: never a project build's whole trial, the final judged run).
// One factory per build, beside the live trial port over the same ports
// (`../candidate-trial/port.ts`). The gate asks `offlineFirst` once per
// revision (D41); it answers live `not_tried` without running anything when
// offline trials are off, the request is not the port's, the port is itself
// offline, or the candidate has no live trial yet; otherwise it runs the
// offline candidate trial on the latest eligible live trial's trace
// (`./sources.ts`) and maps its outcome (`./answer.ts`).
//
// An offline run never enters the live records the port keeps (T19): the
// runner bypasses the port, and its record, evidence and judge spend stay
// here (`offlineRecords()`, `spent()`); its derived trace is never a source.
// A cancelled build is not an answer: the runner's abort goes on.

import { observeCandidateTrialChoice } from "../../candidate-trials/authority/index.ts";
import { trialExecutionSource } from "../../candidate-trials/observation/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioTrialOfflineFirstAnswer } from "../../flow-bootstrap/offline-first/index.ts";
import type { AutomationStudioCandidateTrialRecord } from "../candidate-trial/index.ts";
import { runAutomationStudioOfflineCandidateTrial } from "../offline-trial/index.ts";
import { automationStudioOfflineFirstAnswer } from "./answer.ts";
import type { AutomationStudioOfflineFirstRecord, AutomationStudioOfflineFirstWhole, AutomationStudioOfflineFirstWholeInput } from "./contracts.ts";
import { AutomationStudioOfflineFirstSources } from "./sources.ts";
import { automationStudioOfflineFirstSpend } from "./spend.ts";
import { bindTrialOfflineRunner, bindTrialOfflineInvocation, bindTrialReadOnlyInvocation, trialOfflineRunner, type TrialOfflineRunner } from "../../candidate-trials/observation/index.ts";
import { candidateTrialOfflineLease } from "../../candidate-trials/mode/index.ts";
import { automationStudioOfflineFirstDisabled } from "./disabled.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "../../flow-bootstrap/reset-observation/index.ts";

type Answer = AutomationStudioTrialOfflineFirstAnswer<AutomationStudioCandidateTrialResult>;

export function automationStudioOfflineFirstWhole(input: AutomationStudioOfflineFirstWholeInput): AutomationStudioOfflineFirstWhole {
  const { candidateId, ports, installation, phase } = input;
  const sources = new AutomationStudioOfflineFirstSources();
  const diagnosticSources = new AutomationStudioOfflineFirstSources();
  const scope = AutomationStudioOfflineFirstSources.wholeScope(candidateId);
  const offline: AutomationStudioOfflineFirstRecord<AutomationStudioCandidateTrialRecord>[] = [];
  const notTried = (why: string): Answer => ({ kind: "live", note: { outcome: "not_tried", why } });
  // Another candidate's trial is never this candidate's recording (T17).
  const observe = (record: AutomationStudioCandidateTrialRecord): boolean => {
    if (record.candidateId !== candidateId) return false;
    diagnosticSources.observeWhole(record);
    return sources.observeWhole(record);
  };
  const leases = new WeakMap<object, { source: NonNullable<ReturnType<typeof sources.latest>>; receipt: { revision: number; digest: string; baseDependencyDigest: string }; callbacks: readonly unknown[]; phase: "ready" | "running" | "done"; runtime: { environment: object; matcher: object; session: object; lease: object } | undefined }>();
  const callbacks = () => ["graphOptions", "execute", "environment"].flatMap(key => {
    const descriptor = Object.getOwnPropertyDescriptor(ports, key);
    return [descriptor?.value, descriptor?.get, descriptor?.set];
  });
  const raw = Object.freeze<TrialOfflineRunner>({
    pin(askedCandidateId, receipt) {
      const source = diagnosticSources.latest(scope);
      if (!installation || askedCandidateId !== candidateId || !source) return undefined;
      const lease = Object.freeze({});
      leases.set(lease, { source, receipt: { revision: receipt.revision, digest: receipt.digest, baseDependencyDigest: receipt.baseDependencyDigest }, callbacks: callbacks(), phase: "ready", runtime: undefined });
      return lease;
    },
    current(lease, askedCandidateId, receipt) {
      const original = leases.get(lease);
      const latest = diagnosticSources.latest(scope);
      const actual = callbacks();
      return original !== undefined && original.phase === "ready" && askedCandidateId === candidateId && latest?.traceId === original.source.traceId && latest.trialRunId === original.source.trialRunId
        && receipt.revision === original.receipt.revision && receipt.digest === original.receipt.digest && receipt.baseDependencyDigest === original.receipt.baseDependencyDigest
        && actual.length === original.callbacks.length && actual.every((value, index) => value === original.callbacks[index]);
    },
    active(lease) {
      const original = leases.get(lease);
      return original?.phase === "running" && original.runtime !== undefined && candidateTrialOfflineLease(original.runtime.environment) === original.runtime.lease;
    },
    async run(lease, request) {
      const original = leases.get(lease);
      if (!original || !installation || !raw.current(lease, request.candidateId, request.candidate)) throw new Error("candidate.trial_offline_lease_lost");
      const contract = trialOfflineRunner(ports)?.contract;
      if (!contract?.current()) throw new Error("candidate.trial_offline_contract_missing");
      original.phase = "running";
      const clear = bindTrialReadOnlyInvocation(request, { current: () => contract.current() && raw.active(lease) });
      try {
      request.signal.throwIfAborted();
      const sessionView = installation.sessionViewFor(ports.projectId);
      const input = { request, ports, phase, gateway: installation.gateway,
        source: { store: installation.storeFor(ports.projectId), traceId: original.source.traceId },
        ...(sessionView ? { sessionView } : {}), ...(installation.reevaluator ? { reevaluator: installation.reevaluator } : {}) };
      bindTrialOfflineInvocation(input, { attach(environment, matcher, session, actualLease) {
        if (original.runtime || original.phase !== "running") throw new Error("candidate.trial_offline_runtime_rebound");
        original.runtime = { environment, matcher, session, lease: actualLease };
      } });
        const outcome = await runAutomationStudioOfflineCandidateTrial(input);
        if (outcome.status !== "ran") return { revision: request.revision, digest: request.digest, verdict: "execution_failed", feedback: { code: "candidate.trial_offline_refused", reason: outcome.reasonCode } };
        if (!original.runtime) throw new Error("candidate.trial_offline_runtime_missing");
        diagnosticSources.noteDerived(outcome.trial.record.traceId);
        offline.push(structuredClone({ record: outcome.trial.record, evidence: outcome.evidence, answered: "kept" }));
        return outcome.trial.result;
      } finally {
        clear();
        original.phase = "done";
      }
    },
    observe: record => record.candidateId === candidateId && diagnosticSources.observeWhole(record)
  });
  if (!trialOfflineRunner(ports)) bindTrialOfflineRunner(ports, raw);
  const choose = async (request: AutomationStudioCandidateTrialRequest): Promise<Answer> => {
    request.signal.throwIfAborted();
    if (!installation) return notTried("offline_trials_off");
    input.liveRecords?.().forEach(observe);
    if (request.candidateId !== candidateId || request.candidate.revision !== request.revision || request.candidate.digest !== request.digest) return notTried("offline_request_mismatch");
    if ((ports.environment?.kind ?? "live") !== "live") return notTried("offline_port_not_live");
    const source = sources.latest(scope);
    if (!source) return notTried("no_live_source");
    const sessionView = installation.sessionViewFor(ports.projectId);
    const outcome = await runAutomationStudioOfflineCandidateTrial({
      request, ports, phase, gateway: installation.gateway,
      source: { store: installation.storeFor(ports.projectId), traceId: source.traceId },
      ...(sessionView ? { sessionView } : {}),
      ...(installation.reevaluator ? { reevaluator: installation.reevaluator } : {})
    });
    const answer = automationStudioOfflineFirstAnswer(outcome);
    if (outcome.status === "ran") {
      sources.noteDerived(outcome.trial.record.traceId);
      offline.push(structuredClone({ record: outcome.trial.record, evidence: outcome.evidence, answered: answer.kind }));
    }
    return answer;
  };
  const offlineFirst: (request: AutomationStudioCandidateTrialRequest) => Promise<Answer> = !installation
    ? async request => await automationStudioOfflineFirstDisabled(trialExecutionSource(ports), request.signal)
    : async (request): Promise<Answer> => {
    const source = trialExecutionSource(ports);
    return await observeCandidateTrialChoice(source, request,
      JSON.stringify(["whole.offline_choice", candidateId, request.revision, request.digest]), { receiver: undefined, callback: choose, args: [request] }, request.signal);
  };
  if (!installation) AutomationStudioSiteResetCallbackPolicies.rememberLexical(offlineFirst, "pure");
  return {
    offlineFirst,
    observe,
    offlineRecords: () => structuredClone(offline),
    spent: () => automationStudioOfflineFirstSpend(offline)
  };
}
