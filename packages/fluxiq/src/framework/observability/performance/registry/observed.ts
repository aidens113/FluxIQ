import type { ExecutionCallbackObservation } from "../../../../runtime/execution-observation/contracts/index.ts";
import { prepareObservedExecutionCallback } from "../../../../runtime/execution-observation/owned/index.ts";
import type { FluxIQPerformanceMetric } from "../types/index.ts";
import { appendPerformanceMetric } from "./append.ts";
import { performanceMetricRegistry } from "./state.ts";

/** Each real subscriber remains its original callback, receiver and copied metric tuple. */
export async function publishObservedPerformanceMetric(metric: FluxIQPerformanceMetric, observation: ExecutionCallbackObservation): Promise<void> {
  appendPerformanceMetric(metric);
  for (const listener of performanceMetricRegistry.listeners) {
    const owned = await prepareObservedExecutionCallback(observation, { receiver: undefined, callback: listener, args: [{ ...metric }] });
    let failure: { error: unknown } | undefined;
    try {
      await owned.invoke();
      if (owned.completion() !== "settled") {
        owned.unknown();
        throw new Error("repository.execution.telemetry_incomplete");
      }
    } catch (error) {
      failure = { error };
      throw error;
    } finally {
      try {
        await owned.flush();
      } catch (cleanup) {
        if (failure) throw new AggregateError([failure.error, cleanup], "SQL telemetry and observation cleanup failed.", { cause: failure.error });
        throw cleanup;
      }
    }
  }
}
