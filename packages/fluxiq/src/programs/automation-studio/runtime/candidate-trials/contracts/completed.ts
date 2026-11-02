import type { CandidateTrialCheckoutSnapshot } from "./snapshot.ts";

export type CandidateTrialCompleted = {
  readonly checkout: CandidateTrialCheckoutSnapshot;
  readonly generation: string;
} & ({ readonly kind: "live" } | { readonly kind: "read_only"; readonly retained: object });
