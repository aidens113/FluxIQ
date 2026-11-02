import type { ExecutionScope } from "../execution-admission/index.ts";
import type { ExecutionRetrySeries, PreparedExecutionCallback } from "./contracts/index.ts";
import type { ExecutionObservationSource } from "./source.ts";
import { ExecutionRetrySeriesOwner } from "./series.ts";

/** Fences one real backend retry series, never all uses of a method or reservation. */
export class ExecutionBackendAttempts {
  private readonly attempts = new WeakMap<object, { readonly invocation?: PreparedExecutionCallback }>();

  constructor(private readonly scope: ExecutionScope, private readonly source: ExecutionObservationSource) {}

  begin(series: ExecutionRetrySeries): void {
    ExecutionRetrySeriesOwner.require(series, this.scope);
    const previous = this.attempts.get(series);
    if (previous && (!previous.invocation || this.source.completion(previous.invocation) !== "settled")) throw new Error("execution_observation.unverified_backend_retry");
    this.attempts.set(series, Object.freeze({}));
  }

  entered(series: ExecutionRetrySeries, invocation: PreparedExecutionCallback): void {
    if (!this.attempts.has(series)) throw new Error("execution_observation.retry_series_not_started");
    this.attempts.set(series, { invocation });
  }
}
