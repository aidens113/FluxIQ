import { ExecutionCallbackPolicies, OriginalExecutionPromiseReceipts, type ExecutionCallbackIdentity } from "../../execution-observation/index.ts";
import type { ModelExecutionOptions } from "./options.ts";

/** An original Core delegator: its private receipt still requires every real child to finish. */
export class ModelExecutionReceiptOwner {
  readonly #receipts = new OriginalExecutionPromiseReceipts();

  register<TReceiver, TArguments extends unknown[], TResult>(identity: ExecutionCallbackIdentity<TReceiver, TArguments, TResult>): void {
    ExecutionCallbackPolicies.rememberManaged({ ...identity, contract: "managed_direct_effects", consumeCompletion: input => this.#receipts.consume(input) });
  }

  registerLexical<TArguments extends unknown[], TResult>(callback: ExecutionCallbackIdentity<unknown, TArguments, TResult>["callback"]): void {
    ExecutionCallbackPolicies.rememberManagedLexical({ receiver: undefined, callback, contract: "managed_direct_effects", consumeCompletion: input => this.#receipts.consume(input) });
  }

  returning<TResult>(actual: Promise<TResult>, execution: ModelExecutionOptions | undefined): Promise<TResult> {
    const observation = execution?.observation;
    const original = actual.then(value => {
      if (observation) this.#receipts.issueObserved(original, observation, { disposition: "settled", completionDigest: "model.owned.completed", assessmentDigest: "model.original.children_accounted" });
      return value;
    }, error => {
      if (observation) this.#receipts.issueRejectedObserved(original, error, observation, { disposition: "settled", completionDigest: "model.owned.completed_rejection", assessmentDigest: "model.original.children_accounted" });
      throw error;
    });
    return original;
  }
}
