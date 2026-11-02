import type { CandidateTrialReentry } from "./authority.ts";
import { candidateTrialLoopBindings } from "./registry.ts";

export function bindCandidateTrialReentry(loop: object, reentry: CandidateTrialReentry): void {
  const prior = candidateTrialLoopBindings.get(loop);
  if (prior && prior !== reentry) throw new Error("candidate.reentry_loop_rebound");
  candidateTrialLoopBindings.set(loop, reentry);
}
