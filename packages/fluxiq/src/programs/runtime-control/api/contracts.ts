export const RUNTIME_ENDPOINTS = {
  snapshot: "snapshot",
  listClients: "list-clients",
  listCapabilities: "list-capabilities",
  listRuns: "list-runs",
  getRun: "get-run"
} as const;

export type GetRuntimeRunRequest = {
  runId: string;
};
