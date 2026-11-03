import { publishPerformanceMetric } from "../registry/index.ts";
import type { SqlPerformanceInput } from "./input.ts";
import { createSqlPerformanceMetric } from "./metric.ts";

export function recordSqlPerformance(input: SqlPerformanceInput): void {
  const metric = createSqlPerformanceMetric(input);
  if (metric) publishPerformanceMetric(metric);
}
