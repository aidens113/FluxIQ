import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialRequest, AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialCheckout } from "./checkout.ts";
import type { CandidateTrialCheckoutSnapshot } from "./snapshot.ts";
import type { CandidateTrialReadOnlyLease } from "./read-only-lease.ts";
import type { CandidateTrialReadOnlyCall } from "./read-only-call.ts";

export interface CandidateTrialModeOwner {
  readonly port: AutomationStudioCandidateTrialPort;
  checkout(gate: object, candidate: AutomationStudioFlowCandidate, value: JsonObject): CandidateTrialCheckout;
  checkoutReadOnly(gate: object, candidate: AutomationStudioFlowCandidate, value: JsonObject, retained: object): CandidateTrialCheckout | undefined;
  read(checkout: object): CandidateTrialCheckoutSnapshot | null;
  attachStart(input: Parameters<NonNullable<AutomationStudioCandidateTrialPort["prepareStart"]>>[0], checkout: CandidateTrialCheckout): void;
  attachRun(request: AutomationStudioCandidateTrialRequest, checkout: CandidateTrialCheckout): void;
  readOnlyLease(checkout: CandidateTrialCheckout): CandidateTrialReadOnlyLease | undefined;
  readOnlyCall<TReceiver>(checkout: CandidateTrialCheckout, port: object, receiver: TReceiver, request: AutomationStudioCandidateTrialRequest): CandidateTrialReadOnlyCall<TReceiver> | undefined;
  producedRetained(checkout: CandidateTrialCheckout): object | undefined;
  readOnlyTarget(checkout: CandidateTrialCheckout): object | undefined;
  selectReadOnly(checkout: CandidateTrialCheckout): boolean;
  offlineInvocationActive(checkout: CandidateTrialCheckout): boolean;
  release(checkout: CandidateTrialCheckout): void;
}
