import { candidateTrialCompanions } from "./registry.ts";

export function inheritCandidateTrialAuthority(source: object, target: object): void {
  const companion = candidateTrialCompanions.get(source);
  if (!companion) return;
  const current = candidateTrialCompanions.get(target);
  if (current && current !== companion) throw new Error("candidate.trial_authority_rebound");
  candidateTrialCompanions.set(target, companion);
}
