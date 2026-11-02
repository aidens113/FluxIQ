export type SqlPerformanceMetric = {
  kind: "sql";
  repositoryKind: string;
  databaseName: string;
  operation: "run" | "all" | "get";
  statementType: string;
  fingerprint: string;
  elapsedMs: number;
  rowsReturned: number;
  rowsChanged: number;
  possibleFullScan: boolean;
  ok: boolean;
  recordedAt: number;
};
