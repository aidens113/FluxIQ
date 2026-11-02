import type { ManagedExecutionCallbackRegistration } from "../contracts/index.ts";

/** Declaration-only surface; no observation or admission capabilities. */
export interface ExecutionCallbackRegistrar {
  manage<TReceiver, TArguments extends unknown[], TResult>(registration: ManagedExecutionCallbackRegistration<TReceiver, TArguments, TResult>): void;
}
