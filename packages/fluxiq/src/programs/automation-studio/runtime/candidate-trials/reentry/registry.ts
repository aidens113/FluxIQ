import type { CandidateTrialReentry } from "./authority.ts";

export const candidateTrialLoopBindings = new WeakMap<object, CandidateTrialReentry>();
