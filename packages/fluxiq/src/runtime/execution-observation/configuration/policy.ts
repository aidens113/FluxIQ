import type { ExecutionCallbackRegistrar } from "./registrar.ts";

/** Immutable declaration snapshot; each target registry remains authoritative. */
export interface ExecutionCallbackCompletionPolicy {
  apply(registrar: ExecutionCallbackRegistrar): void;
}
