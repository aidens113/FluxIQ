import type { CandidateTrialAuthority } from "../contracts/index.ts";
import { candidateTrialCompanions } from "./registry.ts";

export function candidateTrialAuthority(port: object): CandidateTrialAuthority | undefined {
  return candidateTrialCompanions.get(port)?.authority;
}
