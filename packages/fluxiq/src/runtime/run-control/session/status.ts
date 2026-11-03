export type AutomationStudioRuntimeSessionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  /** Left `running` by a process that ended; its last lasting act is unknown (C8, the orphaned-run sweep). */
  | "interrupted";
