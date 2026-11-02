import type { FluxIQPerformanceMetric } from "./types/index.ts";
import { performanceMetricRegistry } from "./registry/index.ts";
const { MAX_METRICS, metrics } = performanceMetricRegistry;

export function fluxiqPerformanceMetricsSnapshot(limit = 200): FluxIQPerformanceMetric[] {
  const safeLimit = Math.max(1, Math.min(MAX_METRICS, Math.trunc(limit) || 200));
  return metrics.slice(-safeLimit).map((metric) => ({ ...metric }));
}
