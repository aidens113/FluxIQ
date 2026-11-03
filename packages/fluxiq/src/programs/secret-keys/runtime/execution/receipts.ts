import { ExecutionCallbackPolicies, OriginalExecutionPromiseReceipts, type ExecutionCallbackIdentity } from "../../../../runtime/execution-observation/index.ts";
import type { SecretKeysExecutionInvocation } from "./invocation.ts";

/** Native bodies issue only after their own work and cleanup, never from result fields. */
export class SecretKeysExecutionReceipts {
  readonly #receipts = new OriginalExecutionPromiseReceipts();

  register<TReceiver, TArguments extends unknown[], TResult>(identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void {
    ExecutionCallbackPolicies.rememberManaged({ ...identity, contract: "managed_direct_effects", consumeCompletion: input => this.#receipts.consume(input) });
  }

  returning<TResult>(actual: Promise<TResult>, invocation: SecretKeysExecutionInvocation): Promise<TResult> {
    const original = actual.then(value => {
      this.#receipts.issueObserved(original, invocation.observation, { disposition: "settled", completionDigest: "secret.native.operation_finished", assessmentDigest: "secret.native.actual_children_complete" });
      return value;
    }, error => {
      if (invocation.completedRefusal(error)) this.#receipts.issueRejectedObserved(original, error, invocation.observation, { disposition: "settled", completionDigest: "secret.native.refusal_finished", assessmentDigest: "secret.native.actual_cleanup_complete" });
      throw error;
    });
    return original;
  }
}
