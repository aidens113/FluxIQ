import type { FluxIQPerformanceMetric } from "./types/index.ts";
import { performanceMetricRegistry } from "./registry/index.ts";
const { listeners } = performanceMetricRegistry;

export function subscribeFluxIQPerformanceMetrics(listener: (metric: FluxIQPerformanceMetric) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
