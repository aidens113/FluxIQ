import type { ExecutionCallbackObservation } from "../../../../../runtime/execution-observation/contracts/index.ts";
import { prepareObservedExecutionCallback } from "../../../../../runtime/execution-observation/owned/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/policies/index.ts";
import { OriginalExecutionPromiseReceipts } from "../../../../../runtime/execution-observation/queue-completion/index.ts";
import { SQLiteNativeObservation } from "../native/index.ts";

/** The native body acknowledges only its real callbacks and required connection cleanup. */
export async function invokeSQLiteRepositoryOperation<TResult>(observation: ExecutionCallbackObservation, operation: "list" | "put", assertOriginal: () => void, execute: (native: SQLiteNativeObservation) => Promise<TResult>): Promise<TResult> {
  const receipts = new OriginalExecutionPromiseReceipts();
  const carrier: { observation?: ExecutionCallbackObservation | undefined } = {};
  const receiver = {
    run(actual: typeof carrier): Promise<TResult> {
      const native = new SQLiteNativeObservation(actual.observation!, operation, assertOriginal);
      const original: Promise<TResult> = Promise.resolve().then(async (): Promise<TResult> => {
        let value: TResult;
        let failure: { error: unknown } | undefined;
        try {
          assertOriginal();
          value = await execute(native);
        } catch (error) {
          failure = { error };
          throw error;
        } finally {
          try {
            await native.cleanup();
          } catch (cleanup) {
            if (failure) throw new AggregateError([failure.error, cleanup], "SQLite operation and native cleanup failed.", { cause: failure.error });
            throw cleanup;
          }
        }
        native.assertComplete();
        receipts.issueObserved(original, actual.observation!, {
          disposition: "settled", completionDigest: "repository.sqlite.operation_ack", assessmentDigest: "repository.sqlite.native_and_cleanup_frontier"
        });
        return value;
      });
      return original;
    }
  };
  ExecutionCallbackPolicies.rememberManaged({ receiver, callback: receiver.run, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
  const owned = await prepareObservedExecutionCallback(observation, { receiver, callback: receiver.run, args: [carrier] });
  carrier.observation = owned.observation;
  Object.freeze(carrier);
  let failure: { error: unknown } | undefined;
  try {
    const value = await owned.invoke();
    if (owned.completion() !== "settled") {
      owned.unknown();
      throw new Error("repository.execution.completion_unknown");
    }
    return value;
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    try {
      await owned.flush();
    } catch (cleanup) {
      if (failure) throw new AggregateError([failure.error, cleanup], "SQLite operation and observation cleanup failed.", { cause: failure.error });
      throw cleanup;
    }
  }
}
