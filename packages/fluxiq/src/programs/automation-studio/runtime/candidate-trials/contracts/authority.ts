import type { JsonObject } from "../../../../../core/index.ts";
import type { ExecutionObservationContext } from "../../../../../runtime/execution-admission/index.ts";
import type { AutomationStudioFlowCandidate } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialModeOwner } from "./mode-owner.ts";
import type { CandidateTrialCheckout } from "./checkout.ts";
import type { CandidateTrialCheckoutSnapshot } from "./snapshot.ts";
import type { CandidateTrialCompletion } from "./completion.ts";
import type { CandidateTrialCompleted } from "./completed.ts";
import type { CandidateTrialInvocationPhase } from "./phase.ts";
import type { ExecutionCallbackCall, ExecutionCallbackIdentity } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationExecutionObservation } from "../../../../../engine/automation/execution-admission/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialReceiver } from "./trial-receiver.ts";
import type { PartialTrialContext } from "../partial/index.ts";

export interface CandidateTrialAuthority {
  readonly modeOwner: CandidateTrialModeOwner;
  checkout(gate: object, candidate: AutomationStudioFlowCandidate, value: JsonObject): CandidateTrialCheckout;
  read(checkout: object): CandidateTrialCheckoutSnapshot | null;
  reserve(checkout: CandidateTrialCheckout, signal: AbortSignal): Promise<void>;
  observation(checkout: CandidateTrialCheckout): ExecutionObservationContext | undefined;
  executionObservation(checkout: CandidateTrialCheckout): AutomationExecutionObservation | undefined;
  callbackObservation(checkout: CandidateTrialCheckout): PartialTrialContext | undefined;
  bindFrame<TReceiver, TArguments extends unknown[], TResult>(identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void;
  invoke<TReceiver, TArguments extends unknown[], TResult>(checkout: CandidateTrialCheckout, phase: CandidateTrialInvocationPhase, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>, prepared?: (originalContext: ExecutionObservationContext) => void | Promise<void>): Promise<Awaited<TResult>>;
  invokeSync<TReceiver, TArguments extends unknown[], TResult>(checkout: CandidateTrialCheckout, call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): TResult;
  invokeTrial(checkout: CandidateTrialCheckout, receiver: CandidateTrialReceiver, request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult>;
  canPromote(checkout: CandidateTrialCheckout): Promise<boolean>;
  isOfflineDiagnostic(checkout: CandidateTrialCheckout): boolean;
  isReadOnlyCheckout(checkout: CandidateTrialCheckout): boolean;
  pinReadOnly(gate: object, candidate: AutomationStudioFlowCandidate, value: JsonObject, retained: object): boolean;
  discardPrepared(gate: object): void;
  completion(checkout: CandidateTrialCheckout): CandidateTrialCompletion | undefined;
  consumeCompletion(proof: object): CandidateTrialCompleted | null;
  release(checkout: CandidateTrialCheckout): Promise<void>;
}
