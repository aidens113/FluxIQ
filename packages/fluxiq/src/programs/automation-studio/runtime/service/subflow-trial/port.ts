// The partial-trial port the service injects into each subflow builder
// (`AutomationStudioSubflowTrialPort`, `../../flow-bootstrap/subflow-candidate/`):
// one per build, bound to the build id Core minted, shared by every brief of
// that build and keeping a record of every partial trial for the build record
// and its accounting. Briefs may call it at the same time; each trial opens
// its own session and run id, and nothing here is shared between them but the
// record list.

import type { AutomationStudioSubflowTrialPort } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { runAutomationStudioSubflowTrial } from "./run.ts";
import type { AutomationStudioSubflowTrialPorts, AutomationStudioSubflowTrialRecord } from "./types.ts";

/** The port, the partial trials it ran, and what their judges spent. */
export function automationStudioSubflowTrialPort(buildId: string, ports: AutomationStudioSubflowTrialPorts): {
  port: AutomationStudioSubflowTrialPort;
  records(): AutomationStudioSubflowTrialRecord[];
  spent(): AutomationStudioSubflowTrialRecord["judge"];
} {
  const records: AutomationStudioSubflowTrialRecord[] = [];
  const port: AutomationStudioSubflowTrialPort = async (request) => {
    // A request of another build runs nothing; the run refuses a proposal of another scope itself.
    if (request.scope.buildId !== buildId) {
      return {
        partial: true,
        scope: "subflow",
        identity: { buildId: request.scope.buildId, briefId: request.scope.briefId, planDigest: request.scope.planDigest, subflowKey: request.scope.subflowKey },
        revision: request.proposal.revision,
        digest: request.proposal.digest,
        verdict: "execution_failed",
        feedback: { code: "subflow.trial_other_build", partial: true, entryPrepared: false },
        entryPrepared: false
      };
    }
    const trial = await runAutomationStudioSubflowTrial(request, ports);
    records.push(structuredClone(trial.record));
    return trial.result;
  };
  return {
    port,
    records: () => structuredClone(records),
    spent: () => records.reduce((total, record) => ({
      calls: total.calls + record.judge.calls,
      inputTokens: total.inputTokens + record.judge.inputTokens,
      outputTokens: total.outputTokens + record.judge.outputTokens,
      totalTokens: total.totalTokens + record.judge.totalTokens,
      estimatedCostUsd: total.estimatedCostUsd + record.judge.estimatedCostUsd
    }), { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
  };
}
