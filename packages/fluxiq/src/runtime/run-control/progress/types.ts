import type { ExecutableFlowRunStatus } from "../../../flows/executable/execution/index.ts";
import type { AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES } from "./statuses.ts";

export type AutomationStudioRunProgressStatus = typeof AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES[number];

/** The execution facts a progress decision reads; no persisted session is required. */
export type AutomationStudioRunProgressFacts = {
  status: ExecutableFlowRunStatus;
  trace?: { parked?: unknown } | undefined;
};
