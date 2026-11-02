import type { ExecutionObservationContext } from "../../execution-admission/index.ts";
import type { PreparedExecutionCallback } from "../../execution-observation/index.ts";
import type { NativeAdmissionState } from "./state.ts";

export interface NativeObservedPending {
  readonly state: NativeAdmissionState;
  readonly parent: ExecutionObservationContext;
  invocation?: PreparedExecutionCallback;
}
