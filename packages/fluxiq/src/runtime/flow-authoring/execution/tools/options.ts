import type { ExecutionEntry, ExecutionScope } from "../../../execution-admission/index.ts";
import type { ExecutionCallbackRootSource, ExecutionObservationSource } from "../../../execution-observation/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../output-dispatch/admission/index.ts";

export type AutomationStudioBuildToolObserverOptions = {
  readonly scope: ExecutionScope;
  readonly roots: ExecutionCallbackRootSource;
  readonly callbacks: ExecutionObservationSource;
  readonly runBindings: OrdinaryExecutionRunBindingReader & {
    issueOrdinaryRunBinding(originalRoot: ExecutionEntry): Promise<object>;
  };
};
