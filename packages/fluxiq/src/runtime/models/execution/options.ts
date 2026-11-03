import type { ExecutionCallbackObservation } from "../../execution-observation/index.ts";

/** Internal execution authority; never part of a model request or provider payload. */
export interface ModelExecutionOptions {
  readonly observation?: ExecutionCallbackObservation | undefined;
}
