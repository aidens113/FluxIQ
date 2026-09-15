/**
 * One table in a project's Data window: the rows one Flow stores under one
 * `datasetId`, summarized across that Flow's runs. The pair (`flowId`,
 * `datasetId`) identifies the table; two Flows may reuse a `datasetId`.
 */
export type AutomationStudioProjectDatasetSummary = {
  flowId: string;
  datasetId: string;
  /** The label the newest run stored. */
  label?: string;
  /** The run that wrote to this table most recently. */
  latestRunId: string;
  /** Epoch milliseconds of that run's last write. */
  latestUpdatedAt: number;
  /** Runs that hold rows for this table. */
  runCount: number;
  latestRecordCount: number;
  latestTruncated: boolean;
  /** Digest of the newest run's stored schema; earlier runs may differ. */
  schemaDigest: string;
  /** Field ids the newest run stored encrypted. Never set before record keys exist (K11). */
  encryptedFieldIds?: string[];
};

/** One page of a project's tables, newest write first. */
export type AutomationStudioProjectDatasetSummaryPage = {
  datasets: AutomationStudioProjectDatasetSummary[];
  nextCursor: string | null;
};
