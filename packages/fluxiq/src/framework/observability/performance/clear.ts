import { performanceMetricRegistry } from "./registry/index.ts";
const { metrics } = performanceMetricRegistry;

export function clearFluxIQPerformanceMetrics(): void {
  metrics.length = 0;
}
