import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioCandidateTrialPort, AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";

export interface CandidateTrialGateCall {
  readonly trial: { candidateId: string; port: AutomationStudioCandidateTrialPort };
  readonly latest: AutomationStudioFlowCandidate;
  readonly tried: number;
  readonly value: JsonObject;
  readonly signal: AbortSignal;
}
