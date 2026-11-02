import type { OutputDispatchIo, OutputDispatchRuntime, OutputTargetPreparer } from "../../../runtime/output-dispatch/index.ts";
import type { AutomationStudioRunEnvironment } from "../../../runtime/environment/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../contracts/index.ts";
import type { AutomationNativeExecutionPort } from "./native-runtime.ts";
export type AutomationGraphOptionsInput = {
  inputs?: Record<string, any> | undefined;
  /** The enclosing session's persisted start, separate from its live clock. */
  referenceNow?: number;
  signal: AbortSignal;
  io?: {
    io: OutputDispatchIo;
    domainId: string | null;
  } | undefined;
  runtimeService?: OutputDispatchRuntime | undefined;
  /** The domains the run's caller authorized; only the bound domain's survives. */
  authorizedDomainIds: readonly string[];
  nativeNodeRuntime?: AutomationNativeExecutionPort | undefined;
  hostRuntime?: AutomationStudioGraphExecutionOptions["hostRuntime"];
  maxSteps?: number | undefined;
  onRecordBatch?: AutomationStudioGraphExecutionOptions["onRecordBatch"];
  parking?: AutomationStudioGraphExecutionOptions["parking"];
  /** Where the run's clock, waits and randomness come from; absent, the live environment. */
  environment?: AutomationStudioRunEnvironment | undefined;
  /** Explicit trusted target adaptation; absence leaves parameters opaque. */
  targetPreparer?: OutputTargetPreparer | undefined;
};
