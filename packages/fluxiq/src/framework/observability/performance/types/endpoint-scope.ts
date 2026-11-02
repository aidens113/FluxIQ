export type EndpointScope = {
  sqlDurationMs: number;
  sqlQueryCount: number;
  sqlRowsReturned: number;
  sqlRowsChanged: number;
  possibleFullScanCount: number;
};
