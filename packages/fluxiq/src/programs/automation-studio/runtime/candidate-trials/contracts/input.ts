import type { CandidateTrialModeOwner } from "./mode-owner.ts";
import type { AutomationStudioCandidateTrialSource } from "../authority/index.ts";

export interface CandidateTrialAuthorityInput {
  readonly source: AutomationStudioCandidateTrialSource;
  readonly modeOwner: CandidateTrialModeOwner;
}
