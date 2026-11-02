declare const candidateTrialCheckout: unique symbol;

export interface CandidateTrialCheckout {
  readonly [candidateTrialCheckout]: never;
}
