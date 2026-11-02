import type { CandidateTrialModeOwner } from "../contracts/index.ts";
import { candidateTrialCompanions } from "./registry.ts";

export function candidateTrialModeOwner(port: object): CandidateTrialModeOwner | undefined {
  return candidateTrialCompanions.get(port)?.modeOwner;
}
