import type { SqlPerformanceContext } from "../types/index.ts";
import { performanceMetricRegistry } from "../registry/index.ts";
const { sqlContext } = performanceMetricRegistry;

export function withSqlPerformanceContext<T>(context: SqlPerformanceContext, operation: () => Promise<T>): Promise<T> {
  return sqlContext.run(context, operation);
}
