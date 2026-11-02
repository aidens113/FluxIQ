import type { AutomationStudioCandidateTrialPort } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialModeOwner } from "../contracts/index.ts";
import { candidateTrialCompanions } from "./registry.ts";

export function bindCandidateTrialModeOwner(port: AutomationStudioCandidateTrialPort, owner: CandidateTrialModeOwner): void {
  if (owner.port !== port || candidateTrialCompanions.has(port)) throw new Error("candidate.trial_mode_rebound");
  candidateTrialCompanions.set(port, { modeOwner: owner });
}
