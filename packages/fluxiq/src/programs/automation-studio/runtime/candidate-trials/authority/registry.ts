import type { CandidateTrialModeOwner } from "../contracts/index.ts";
import type { CandidateTrialAuthority } from "../contracts/index.ts";

export const candidateTrialCompanions = new WeakMap<object, { readonly modeOwner: CandidateTrialModeOwner; authority?: CandidateTrialAuthority }>();
