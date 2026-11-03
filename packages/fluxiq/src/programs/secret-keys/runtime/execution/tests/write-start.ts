import { subscribeFluxIQPerformanceMetrics } from "../../../../../framework/observability/performance/index.ts";
import type { FluxIQPerformanceMetric } from "../../../../../framework/observability/performance/types/index.ts";
import { ExecutionCallbackPolicies } from "../../../../../runtime/execution-observation/index.ts";

/** Observe the real native get preceding the held update; no fake SQL acknowledgement. */
export function secretWriteStarted(kind: string) {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const listener = (metric: FluxIQPerformanceMetric): void => {
    if (metric.kind === "sql" && metric.repositoryKind === kind && metric.operation === "get") entered();
  };
  ExecutionCallbackPolicies.rememberLexical(listener, "pure");
  return { started, unsubscribe: subscribeFluxIQPerformanceMetrics(listener) };
}
