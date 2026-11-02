import type { CandidateTrialModeOwner } from "../contracts/index.ts";
import type { CandidateTrialCheckout } from "../contracts/index.ts";

export const candidateTrialInvocations = new WeakMap<object, { readonly modeOwner: CandidateTrialModeOwner; readonly checkout: CandidateTrialCheckout }>();
