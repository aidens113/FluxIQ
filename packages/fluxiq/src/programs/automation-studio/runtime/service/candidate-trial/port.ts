// The trial port the service injects into candidate authoring
// (`AutomationStudioCandidateTrialPort`, pinned by U1): one per build, bound to
// the candidate id Core minted before the loop, keeping a record of every
// trial it ran for the promotion's audit and the build's accounting.

import type { AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateTrialPorts, AutomationStudioCandidateTrialRecord } from "./contracts.ts";
import { runAutomationStudioCandidateTrial } from "./run.ts";

/** The port, the trials it ran, and what their judges spent. */
export function automationStudioCandidateTrialPort(candidateId: string, ports: AutomationStudioCandidateTrialPorts): {
  port: AutomationStudioCandidateTrialPort;
  records(): AutomationStudioCandidateTrialRecord[];
  spent(): AutomationStudioCandidateTrialRecord["judge"];
} {
  const records: AutomationStudioCandidateTrialRecord[] = [];
  const port: AutomationStudioCandidateTrialPort = async (request) => {
    // A request for another candidate, or whose frozen bytes are not the revision and digest it names, runs nothing.
    if (request.candidateId !== candidateId || request.candidate.revision !== request.revision || request.candidate.digest !== request.digest) {
      const refused: AutomationStudioCandidateTrialResult = { revision: request.revision, digest: request.digest, verdict: "execution_failed", feedback: { code: "candidate.trial_identity_mismatch" } };
      return refused;
    }
    const trial = await runAutomationStudioCandidateTrial(request, ports);
    records.push(structuredClone(trial.record));
    return trial.result;
  };
  return {
    port,
    records: () => structuredClone(records),
    spent: () => records.reduce((total, record) => ({
      calls: total.calls + record.judge.calls, inputTokens: total.inputTokens + record.judge.inputTokens, outputTokens: total.outputTokens + record.judge.outputTokens,
      totalTokens: total.totalTokens + record.judge.totalTokens, estimatedCostUsd: total.estimatedCostUsd + record.judge.estimatedCostUsd
    }), { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 })
  };
}
