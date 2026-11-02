import type { ExecutionCallbackIdentity } from "./identity.ts";
import type { ExecutionCallbackOutcome } from "./outcome.ts";
import type { ExecutionCallbackSettlement } from "./settlement.ts";

export type ManagedExecutionCallbackRegistration<TReceiver, TArguments extends unknown[], TResult> = ExecutionCallbackIdentity<TReceiver, TArguments, TResult> & (
  | { readonly contract: "no_direct_effects" }
  | {
      readonly contract: "managed_direct_effects";
      consumeCompletion(input: {
        readonly invocation: object;
        readonly outcome: ExecutionCallbackOutcome<Awaited<TResult>>;
        /** Original unawaited return, for private producer-owned asynchronous receipts. */
        readonly returned?: TResult | undefined;
      }): ExecutionCallbackSettlement | null;
    }
);
