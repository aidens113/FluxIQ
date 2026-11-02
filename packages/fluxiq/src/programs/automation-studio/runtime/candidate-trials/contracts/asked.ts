import type { AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";

export interface CandidateTrialAsked {
  readonly valid: boolean;
  readonly answer: AutomationStudioCandidateTrialResult;
  readonly standingNo?: unknown;
}
