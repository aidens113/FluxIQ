/** Execution status, independent of persistence and presentation. */
export type ExecutableFlowRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  /** Its process ended while running; the last lasting act may have landed. */
  | "interrupted";
