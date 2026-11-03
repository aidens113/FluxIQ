import type sqlite3 from "sqlite3";
import type { ExecutionCallbackObservation } from "../../../../../runtime/execution-observation/contracts/index.ts";
import { prepareObservedExecutionCallback } from "../../../../../runtime/execution-observation/owned/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/policies/index.ts";
import { OriginalExecutionPromiseReceipts } from "../../../../../runtime/execution-observation/queue-completion/index.ts";
import { recordObservedSqlPerformance } from "../../../../observability/performance/sql/index.ts";
import type { SQLiteNativeCompletion } from "./completion.ts";
import { sqliteNativeDriver } from "./driver.ts";
import type { SQLiteNativeStage } from "./stage.ts";

/** One original native operation's actual callbacks and connection cleanup frontier. */
export class SQLiteNativeObservation {
  readonly #expected: readonly SQLiteNativeStage[];
  readonly #acknowledged: SQLiteNativeStage[] = [];
  readonly #receipts = new OriginalExecutionPromiseReceipts();
  #active: SQLiteNativeStage | undefined;
  #connection: sqlite3.Database | undefined;
  #closeStarted = false;
  #closed = false;
  #failed = false;

  constructor(readonly observation: ExecutionCallbackObservation, operation: "list" | "put", readonly assertOriginal: () => void) {
    this.#expected = operation === "list" ? ["open", "exec", "all"] : ["open", "exec", "get", "run"];
  }

  /** Called only by the fixed native wrappers, with the original driver's callback. */
  async perform<TResult>(stage: SQLiteNativeStage, submit: (complete: SQLiteNativeCompletion<TResult>) => void): Promise<TResult> {
    if (this.#failed || this.#active || this.#expected[this.#acknowledged.length] !== stage) throw new Error("repository.execution.native_frontier_mismatch");
    this.#active = stage;
    const carrier: { observation?: ExecutionCallbackObservation | undefined } = {};
    const receipts = this.#receipts;
    const owner = this;
    const receiver = {
      run(actual: typeof carrier): Promise<TResult> {
        let resolve!: (result: TResult) => void;
        let reject!: (error: unknown) => void;
        const original = new Promise<TResult>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        let called = false;
        const complete: SQLiteNativeCompletion<TResult> = (error, value, metric) => {
          if (called) {
            owner.#failed = true;
            reject(new Error("repository.execution.duplicate_native_callback"));
            return;
          }
          called = true;
          if (!error && stage === "open") owner.#connection = value as sqlite3.Database;
          const finish = async (): Promise<TResult> => {
            try {
              owner.assertOriginal();
              sqliteNativeDriver.assert();
              if (metric) await recordObservedSqlPerformance(metric, actual.observation!);
            } catch (telemetryError) {
              if (error) throw new AggregateError([error, telemetryError], "SQLite callback and telemetry failed.", { cause: error });
              throw telemetryError;
            }
            if (error) throw error;
            owner.#acknowledged.push(stage);
            owner.#active = undefined;
            receipts.issueObserved(original, actual.observation!, {
              disposition: "settled", completionDigest: "repository.sqlite.native_callback_ack", assessmentDigest: "repository.sqlite.telemetry_children_completed"
            });
            return value;
          };
          finish().then(resolve, failure => {
            owner.#failed = true;
            reject(failure);
          });
        };
        try {
          owner.assertOriginal();
          sqliteNativeDriver.assert();
          submit(complete);
        } catch (error) {
          owner.#failed = true;
          reject(error);
        }
        return original;
      }
    };
    ExecutionCallbackPolicies.rememberManaged({ receiver, callback: receiver.run, contract: "managed_direct_effects", consumeCompletion: input => receipts.consume(input) });
    const owned = await prepareObservedExecutionCallback(this.observation, { receiver, callback: receiver.run, args: [carrier] });
    carrier.observation = owned.observation;
    Object.freeze(carrier);
    let failure: { error: unknown } | undefined;
    try {
      const value = await owned.invoke();
      if (owned.completion() !== "settled") {
        this.#failed = true;
        owned.unknown();
        throw new Error("repository.execution.native_completion_unknown");
      }
      return value;
    } catch (error) {
      this.#failed = true;
      failure = { error };
      throw error;
    } finally {
      try {
        await owned.flush();
      } catch (cleanup) {
        if (failure) throw new AggregateError([failure.error, cleanup], "SQLite callback and observation cleanup failed.", { cause: failure.error });
        throw cleanup;
      }
    }
  }

  /** Cleanup belongs to the already-admitted operation, including its failure path. */
  close(db: sqlite3.Database): Promise<void> {
    if (this.#connection !== db || this.#closeStarted) throw new Error("repository.execution.foreign_connection");
    this.#closeStarted = true;
    return new Promise<void>((resolve, reject) => {
      sqliteNativeDriver.close.call(db, (error: Error | null) => {
        if (error) {
          this.#failed = true;
          reject(error);
        } else {
          this.#connection = undefined;
          this.#closed = true;
          resolve();
        }
      });
    });
  }

  async cleanup(): Promise<void> {
    if (this.#connection && !this.#closeStarted) await this.close(this.#connection);
  }

  now(): number {
    this.assertOriginal();
    sqliteNativeDriver.assert();
    return sqliteNativeDriver.now.call(sqliteNativeDriver.date);
  }

  assertComplete(): void {
    if (this.#failed || this.#active || !this.#closed || this.#connection
      || this.#acknowledged.length !== this.#expected.length
      || this.#expected.some((stage, index) => this.#acknowledged[index] !== stage)) throw new Error("repository.execution.native_frontier_incomplete");
  }
}
