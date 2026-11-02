export type ProgramEndpointPerformanceMetric = {
  kind: "endpoint";
  programId: string;
  endpoint: string;
  elapsedMs: number;
  responseBytes: number;
  sqlDurationMs: number;
  sqlQueryCount: number;
  sqlRowsReturned: number;
  sqlRowsChanged: number;
  possibleFullScanCount: number;
  ok: boolean;
  recordedAt: number;
};
