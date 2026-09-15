import type { AutomationStudioRunDatasetSummary } from "./dataset.ts";

/**
 * The statuses a stored run holds, as a table's run list reports and filters
 * them. A run that is waiting on an intervention is stored as `running`.
 */
export const AUTOMATION_STUDIO_DATASET_RUN_STATUSES = Object.freeze(["queued", "running", "succeeded", "failed", "cancelled"] as const);

export type AutomationStudioDatasetRunStatus = (typeof AUTOMATION_STUDIO_DATASET_RUN_STATUSES)[number];

/** One run's copy of a table, with the run fields the Data window lists beside it. */
export type AutomationStudioDatasetRunSummary = AutomationStudioRunDatasetSummary & {
  /** The run's Flow, which is also the table's Flow. */
  flowId: string;
  runStatus: AutomationStudioDatasetRunStatus;
  /** Epoch milliseconds; null for a run that has not started. */
  runStartedAt: number | null;
};

/** One page of a table's runs, newest write first. */
export type AutomationStudioDatasetRunSummaryPage = {
  runs: AutomationStudioDatasetRunSummary[];
  nextCursor: string | null;
};
