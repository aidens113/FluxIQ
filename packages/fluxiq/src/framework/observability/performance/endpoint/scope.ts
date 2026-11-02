import type { EndpointScope } from "../types/index.ts";
import { performanceMetricRegistry } from "../registry/index.ts";
const { endpointScope } = performanceMetricRegistry;

export async function withEndpointPerformanceScope<T>(operation: () => Promise<T>): Promise<{ result: T; sql: EndpointScope }> {
  const sql = emptyEndpointScope();
  const result = await endpointScope.run(sql, operation);
  return { result, sql: { ...sql } };
}

function emptyEndpointScope(): EndpointScope {
  return { sqlDurationMs: 0, sqlQueryCount: 0, sqlRowsReturned: 0, sqlRowsChanged: 0, possibleFullScanCount: 0 };
}
