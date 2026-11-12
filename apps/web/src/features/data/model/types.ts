// What the Data page shows: one table of collected rows, in plain words.

/** One table a Flow collected, as its newest run left it. */
export type DatasetRow = {
  projectId: string;
  flowId: string;
  flowName: string;
  /** The run that wrote this table most recently. */
  runId: string;
  datasetId: string;
  /** The table's label, or its id when it has none. */
  name: string;
  rowCount: number;
  /** Epoch milliseconds the run last wrote to it. */
  collectedAt: number;
  /** Runs that hold rows for this table. */
  runCount: number;
  truncated: boolean;
};

/** The two filters: which Flow ("any" keeps all) and a text search over names. */
export type DatasetFilter = { flowId: "any" | string; search: string };
