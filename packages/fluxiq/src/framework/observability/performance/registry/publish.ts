import type { FluxIQPerformanceMetric } from "../types/index.ts";
import { appendPerformanceMetric } from "./append.ts";
import { performanceMetricRegistry } from "./state.ts";
const { listeners } = performanceMetricRegistry;

export function publishPerformanceMetric(metric: FluxIQPerformanceMetric): void {
  appendPerformanceMetric(metric);
  for (const listener of listeners) listener({ ...metric });
}
