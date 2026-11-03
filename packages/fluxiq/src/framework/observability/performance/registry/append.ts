import type { FluxIQPerformanceMetric } from "../types/index.ts";
import { performanceMetricRegistry } from "./state.ts";
const { MAX_METRICS, metrics } = performanceMetricRegistry;

export function appendPerformanceMetric(metric: FluxIQPerformanceMetric): void {
  metrics.push(metric);
  if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);
}
