import { candidateTrialLoopBindings } from "./registry.ts";
import { bindCandidateTrialReentry } from "./bind.ts";

export function inheritCandidateTrialReentry(source: object, target: object): void {
  const original = candidateTrialLoopBindings.get(source);
  if (original) bindCandidateTrialReentry(target, original);
}
