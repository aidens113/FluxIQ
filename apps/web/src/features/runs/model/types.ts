// What the Runs page shows, already in plain words. Fields the run store did not record stay absent.

/** The kinds of client a run can come from. */
export type RunClient = "extension" | "program" | "panel";

/** One run as the Runs page reads it. */
export type RunRow = {
  runId: string;
  flowId: string;
  projectId: string;
  flowName: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  costUsd?: number;
  /** Actions the run took, from the run summary. */
  steps?: number;
  client?: RunClient;
  /** "replayed", "explored" or "repaired", where the run says so. */
  howRan?: string;
  startedBy?: string;
  /** What confirmed the result: "type", "check" or "judge". */
  confirmedBy?: string;
};

/** Results grouped the way a person filters them. */
export type ResultGroup = "passed" | "failed" | "stopped" | "running";

/** The three filters. "any" keeps everything; a client of "unknown" keeps runs that did not say where they came from. */
export type RunFilter = {
  flowId: "any" | string;
  client: "any" | RunClient | "unknown";
  result: "any" | ResultGroup;
};
