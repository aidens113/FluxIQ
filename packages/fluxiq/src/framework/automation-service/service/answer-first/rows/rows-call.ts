import type { JsonObject } from "../../../../../core/index.ts";

/** One tool call of the exploration: its id, the tool, and the input it was sent. The input is never a source of rows. */
export type AutomationStudioAnswerFirstRowCall = { callId: string; toolId: string; value: JsonObject };

/** What storing one call's answer came to. */
export type AutomationStudioAnswerFirstRowsStored = {
  /** The rows stored, as the schema kept them. Empty when none were or the store failed. */
  rows: JsonObject[];
  datasetId?: string;
  /** Rows the schema refused. */
  invalidCount: number;
  /** True when the read returned more rows than were kept. */
  truncated: boolean;
  /** This read started its list over (`./list-after-read.ts`): its rows are now all the list holds. */
  startedOver?: boolean;
  /** Present when the rows could not be stored: a code and an error name, never the error's words or a value. */
  failure?: { code: "answer_first.rows_not_stored" | "answer_first.rows_no_columns"; errorName?: string };
};

