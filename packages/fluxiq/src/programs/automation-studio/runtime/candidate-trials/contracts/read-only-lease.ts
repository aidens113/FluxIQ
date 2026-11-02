declare const readOnlyLease: unique symbol;

export interface CandidateTrialReadOnlyLease { readonly [readOnlyLease]: never; }
