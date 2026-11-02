import { candidateTrialLoopBindings } from "./registry.ts";

export function candidateTrialReentry(loop: object) { return candidateTrialLoopBindings.get(loop); }
