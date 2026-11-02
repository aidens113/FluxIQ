import type { ExecutionEntry, ExecutionScope } from "../../../../../runtime/execution-admission/index.ts";
import type { ExecutionCallbackRootSource, ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "../../../../../runtime/output-dispatch/admission/index.ts";

export type AutomationStudioBuildToolObserverOptions = {
  readonly scope: ExecutionScope;
  readonly roots: ExecutionCallbackRootSource;
  readonly callbacks: ExecutionObservationSource;
  readonly runBindings: OrdinaryExecutionRunBindingReader & {
    issueOrdinaryRunBinding(originalRoot: ExecutionEntry): Promise<object>;
  };
};
