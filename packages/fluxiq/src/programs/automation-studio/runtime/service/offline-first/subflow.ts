// A build's offline-first partial trials of its subflow proposals (trace plan
// P6, t769), the twin of `./whole.ts`. One factory per build, beside the live
// partial-trial port over the same ports (`../subflow-trial/port.ts`), shared
// by every brief of the build. The gate asks `offlineFirst` once per revision
// (D41); it answers live `not_tried` without running anything when offline
// trials are off, the request is another build's, the port is itself offline,
// or the subflow has no eligible live trial yet; otherwise it runs the
// offline subflow trial on the latest eligible live partial trial of that
// subflow (`./sources.ts`: its entry prepared) and maps the outcome
// (`./answer.ts`). On a gap the gate runs the trial live in the same call
// (D40), and that live trial, handed to `observe`, becomes the subflow's next
// recording (T21).
//
// Offline runs stay out of the live port's records, their judge spend is
// counted here, and their derived traces are never a source. The judge calls
// are held at the largest prompt any judge of this build's partial trials was
// sent, live or offline (`../candidate-trial/judging-fits.ts`, t661). A
// cancelled build is not an answer: the runner's abort goes on.

import type { AutomationStudioTrialOfflineFirstAnswer } from "../../flow-bootstrap/offline-first/index.ts";
import type { AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioTrialLargestJudgePrompt } from "../candidate-trial/index.ts";
import { runAutomationStudioOfflineSubflowTrial } from "../offline-trial/index.ts";
import type { AutomationStudioSubflowTrialRecord } from "../subflow-trial/index.ts";
import { automationStudioOfflineFirstAnswer } from "./answer.ts";
import type { AutomationStudioOfflineFirstRecord, AutomationStudioOfflineFirstSpent, AutomationStudioOfflineFirstSubflow, AutomationStudioOfflineFirstSubflowInput } from "./contracts.ts";
import { AutomationStudioOfflineFirstSources } from "./sources.ts";
import { automationStudioOfflineFirstSpend } from "./spend.ts";

type Answer = AutomationStudioTrialOfflineFirstAnswer<AutomationStudioSubflowTrialResult>;

export function automationStudioOfflineFirstSubflow(input: AutomationStudioOfflineFirstSubflowInput): AutomationStudioOfflineFirstSubflow {
  const { buildId, ports, installation, phase } = input;
  const sources = new AutomationStudioOfflineFirstSources();
  const offline: AutomationStudioOfflineFirstRecord<AutomationStudioSubflowTrialRecord>[] = [];
  /** What each live partial trial handed to `observe` paid its judge, for sizing the offline judge calls (header). */
  const liveJudges = new Map<string, { judge: AutomationStudioOfflineFirstSpent }>();
  const notTried = (why: string): Answer => ({ kind: "live", note: { outcome: "not_tried", why } });
  const observe = (record: AutomationStudioSubflowTrialRecord): boolean => {
    // Another build's trial is never this build's recording (T17).
    if (record.identity.buildId !== buildId) return false;
    if (record.trialRunId !== undefined) liveJudges.set(record.trialRunId, { judge: { ...record.judge } });
    return sources.observeSubflow(record);
  };
  const offlineFirst = async (request: AutomationStudioSubflowTrialRequest): Promise<Answer> => {
    request.signal.throwIfAborted();
    input.liveRecords?.().forEach(observe);
    if (!installation) return notTried("offline_trials_off");
    if (request.scope.buildId !== buildId) return notTried("offline_request_mismatch");
    if ((ports.environment?.kind ?? "live") !== "live") return notTried("offline_port_not_live");
    const source = sources.latest(AutomationStudioOfflineFirstSources.subflowScope(buildId, request.scope.subflowKey));
    if (!source) return notTried("no_live_source");
    const sessionView = installation.sessionViewFor(ports.projectId);
    const judgeInputTokens = automationStudioTrialLargestJudgePrompt([...liveJudges.values(), ...offline.map((entry) => entry.record)]);
    const outcome = await runAutomationStudioOfflineSubflowTrial({
      request, ports, phase, gateway: installation.gateway,
      source: { store: installation.storeFor(ports.projectId), traceId: source.traceId },
      ...(sessionView ? { sessionView } : {}),
      ...(installation.reevaluator ? { reevaluator: installation.reevaluator } : {}),
      ...(judgeInputTokens !== undefined ? { judgeInputTokens } : {})
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
