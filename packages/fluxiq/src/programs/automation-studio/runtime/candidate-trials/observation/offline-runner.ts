import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult, AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioCandidateTrialRecord } from "../../service/candidate-trial/index.ts";

export interface TrialOfflineRunner {
  pin(candidateId: string, receipt: Pick<AutomationStudioFlowCandidate, "revision" | "digest" | "baseDependencyDigest">): object | undefined;
  current(lease: object, candidateId: string, receipt: Pick<AutomationStudioFlowCandidate, "revision" | "digest" | "baseDependencyDigest">): boolean;
  active(lease: object): boolean;
  run(lease: object, request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult>;
  observe(record: AutomationStudioCandidateTrialRecord): boolean;
}
