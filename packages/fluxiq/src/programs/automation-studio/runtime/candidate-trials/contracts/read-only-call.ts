import type { ExecutionCallbackCall, ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";
import type { AutomationStudioCandidateTrialRequest, AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import type { TrialOfflineRunner } from "../observation/index.ts";

export type CandidateTrialReadOnlyCall<TReceiver> =
  | { readonly kind: "port"; readonly call: ExecutionCallbackCall<TReceiver, [AutomationStudioCandidateTrialRequest], Promise<AutomationStudioCandidateTrialResult>> }
  | { readonly kind: "owned"; readonly callbacks: ExecutionObservationSource; readonly call: ExecutionCallbackCall<TrialOfflineRunner, [object, AutomationStudioCandidateTrialRequest], Promise<AutomationStudioCandidateTrialResult>> };
