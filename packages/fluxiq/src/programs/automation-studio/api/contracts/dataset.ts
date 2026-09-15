// Requests for the run dataset endpoints: a run's datasets, one page of a
// dataset's rows, an inline export, deletion, and the Data window's project
// table and table-run lists (CD16, CD17, CD21).
//
// `limit` and `cursor` stay `unknown`/nullable because the handler clamps the
// limit through the shared paging helper and the store validates the cursor.

import type { AutomationStudioRunDatasetExportFormat } from "@fluxiq/contracts/automation-studio";
import type { FlowProjectRequest } from "./flow.ts";

/** Every dataset one run stored. */
export type RunDatasetListRequest = FlowProjectRequest & {
  runId: string;
};

/** One page of one dataset's rows, 1-200 rows and 50 by default. */
export type RunDatasetPageRequest = FlowProjectRequest & {
  runId: string;
  datasetId: string;
  limit?: unknown;
  cursor?: string | null;
};

/** One dataset as a single CSV or JSON body, or a `tooLarge` answer pointing at the streaming route. */
export type RunDatasetExportRequest = FlowProjectRequest & {
  runId: string;
  datasetId: string;
  format: AutomationStudioRunDatasetExportFormat;
};

/** Without `datasetId`, every dataset the run stored is deleted (CD17). */
export type RunDatasetDeleteRequest = FlowProjectRequest & {
  runId: string;
  datasetId?: string;
};

/** The Data window's tables for a project, newest write first (CD21). */
export type ProjectDatasetListRequest = FlowProjectRequest & {
  flowId?: string;
  search?: string;
  limit?: unknown;
  cursor?: string | null;
};

/** The runs holding rows for one table, identified by the pair (`flowId`, `datasetId`). */
export type DatasetRunListRequest = FlowProjectRequest & {
  flowId: string;
  datasetId: string;
  status?: string;
  runId?: string;
  limit?: unknown;
  cursor?: string | null;
};
