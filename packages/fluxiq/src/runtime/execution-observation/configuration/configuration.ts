import type { ExecutionCallbackRegistrar } from "./registrar.ts";

/** Original trusted declarations run synchronously before source setup. */
export interface ExecutionCallbackCompletionConfiguration {
  configure(registrar: ExecutionCallbackRegistrar): void;
}
