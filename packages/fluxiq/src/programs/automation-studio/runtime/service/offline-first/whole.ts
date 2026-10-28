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

import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioTrialOfflineFirstAnswer } from "../../flow-bootstrap/offline-first/index.ts";
import type { AutomationStudioCandidateTrialRecord } from "../candidate-trial/index.ts";
import { runAutomationStudioOfflineCandidateTrial } from "../offline-trial/index.ts";
import { automationStudioOfflineFirstAnswer } from "./answer.ts";
import type { AutomationStudioOfflineFirstRecord, AutomationStudioOfflineFirstWhole, AutomationStudioOfflineFirstWholeInput } from "./contracts.ts";
import { AutomationStudioOfflineFirstSources } from "./sources.ts";
import { automationStudioOfflineFirstSpend } from "./spend.ts";

type Answer = AutomationStudioTrialOfflineFirstAnswer<AutomationStudioCandidateTrialResult>;

export function automationStudioOfflineFirstWhole(input: AutomationStudioOfflineFirstWholeInput): AutomationStudioOfflineFirstWhole {
  const { candidateId, ports, installation, phase } = input;
  const sources = new AutomationStudioOfflineFirstSources();
  const scope = AutomationStudioOfflineFirstSources.wholeScope(candidateId);
  const offline: AutomationStudioOfflineFirstRecord<AutomationStudioCandidateTrialRecord>[] = [];
  const notTried = (why: string): Answer => ({ kind: "live", note: { outcome: "not_tried", why } });
  // Another candidate's trial is never this candidate's recording (T17).
  const observe = (record: AutomationStudioCandidateTrialRecord): boolean => record.candidateId === candidateId && sources.observeWhole(record);
  const offlineFirst = async (request: AutomationStudioCandidateTrialRequest): Promise<Answer> => {
    request.signal.throwIfAborted();
    input.liveRecords?.().forEach(observe);
    if (!installation) return notTried("offline_trials_off");
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
  return {
    offlineFirst,
    observe,
    offlineRecords: () => structuredClone(offline),
    spent: () => automationStudioOfflineFirstSpend(offline)
  };
}
