declare const candidateTrialCompletion: unique symbol;

export interface CandidateTrialCompletion {
  readonly [candidateTrialCompletion]: never;
}
