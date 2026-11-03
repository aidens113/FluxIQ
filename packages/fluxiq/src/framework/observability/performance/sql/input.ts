import type { SqlPerformanceMetric } from "../types/index.ts";

export type SqlPerformanceInput = {
  operation: SqlPerformanceMetric["operation"];
  sql: string;
  elapsedMs: number;
  rowsReturned?: number;
  rowsChanged?: number;
  ok: boolean;
};
