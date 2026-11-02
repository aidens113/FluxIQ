/** Presentation-independent progress states derived from execution and control. */
export const AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES = [
  "ready",
  "running",
  "waiting",
  "paused",
  "adapting",
  "user_action_required",
  "completed",
  "failed",
  "stopped",
  "interrupted"
] as const;
