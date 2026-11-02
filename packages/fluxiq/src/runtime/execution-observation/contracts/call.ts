import type { ExecutionCallbackIdentity } from "./identity.ts";

export interface ExecutionCallbackCall<TReceiver, TArguments extends unknown[], TResult> extends ExecutionCallbackIdentity<TReceiver, TArguments, TResult> {
  readonly args: TArguments;
}
