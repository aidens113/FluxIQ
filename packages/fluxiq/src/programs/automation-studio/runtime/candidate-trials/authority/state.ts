import type { ExecutionObservationContext, ExecutionOriginRecord, ReservedExecution } from "../../../../../runtime/execution-admission/index.ts";
import type { PreparedExecutionCallback } from "../../../../../runtime/execution-observation/index.ts";
import type { CandidateTrialCheckoutSnapshot, CandidateTrialCompletion, CandidateTrialCheckout, CandidateTrialReadOnlyLease } from "../contracts/index.ts";

export interface CandidateTrialAuthorityState {
  snapshot: CandidateTrialCheckoutSnapshot;
  readonly checkout: CandidateTrialCheckout;
  readonly origin: object;
  readonly record: ExecutionOriginRecord;
  reserved: ReservedExecution | undefined;
  signal: AbortSignal | undefined;
  started: boolean;
  readOnly: CandidateTrialReadOnlyLease | undefined;
  active: ExecutionObservationContext | undefined;
  readonly invocations: PreparedExecutionCallback[];
  readonly errors: unknown[];
  frameCompleted: boolean;
  trialCompleted: boolean;
  completion: CandidateTrialCompletion | undefined;
  released: boolean;
}
