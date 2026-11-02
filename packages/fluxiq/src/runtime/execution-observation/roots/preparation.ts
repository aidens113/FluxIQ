import type { ExecutionEntry, ExecutionObservationContext } from "../../execution-admission/index.ts";

/** Trusted composition only: never part of implementation arguments or serialized data. */
export interface ExecutionCallbackRootPreparation {
  prepared(originalContext: ExecutionObservationContext, originalRoot: ExecutionEntry): void | Promise<void>;
}
