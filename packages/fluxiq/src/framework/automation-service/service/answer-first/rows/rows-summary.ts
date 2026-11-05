import type { JsonObject } from "../../../../../core/index.ts";

/** The result's rows as the judge and the answer read them: one dataset, whole. */
export type AutomationStudioAnswerFirstRowsSummary = {
  /** The dataset that is the result; absent when no read stored a row. */
  datasetId?: string;
  totalRows: number;
  /** True when a read returned more rows than the dataset keeps, or the store dropped some. */
  truncated: boolean;
  columns: { id: string; label: string }[];
  rows: JsonObject[];
  /**
   * The latest read of this list holds fewer rows than an earlier one did, and how many that was.
   * The rows are the latest read's all the same: it is what the list says now. This is so a person
   * is told the result got smaller rather than finding it so; absent while it has not.
   */
  fewerThanEarlier?: { earlierRows: number };
};
