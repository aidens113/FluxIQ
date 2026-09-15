// Mutations over a run's datasets, and the command set the panel is given.
//
// The panel never builds a transport of its own: `runtime-host.ts` binds these
// and passes them in, so a test injects stubs instead of mocking the network.

import type { ProgramCommandTransport } from "../data/program-transport";
import { commitAutomationStudioMutation } from "../stores/mutation-transaction-store";
import type { exportRunDataset, getRunDatasetPage, listRunDatasets } from "./dataset-queries";
import type { RunDatasetDownloadHrefInput } from "./download-href";

/** Without `datasetId`, every dataset the run stored is deleted (CD17). Audited server-side. */
export function deleteRunDatasets(
  api: ProgramCommandTransport,
  payload: { projectId: string; runId: string; datasetId?: string }
) {
  return api.post<{ deleted?: { datasetCount: number; rowCount: number } }>("delete-run-datasets", payload);
}

export function commitRunDatasetsChanged(detail: { projectId: string | null; runId: string }): void {
  commitAutomationStudioMutation({ kind: "runtime-run.changed", ...detail });
}

export type RunDatasetCommands = {
  list(payload: { projectId: string; runId: string }, signal?: AbortSignal): ReturnType<typeof listRunDatasets>;
  page(
    payload: { projectId: string; runId: string; datasetId: string; limit: number; cursor?: string | null },
    signal?: AbortSignal
  ): ReturnType<typeof getRunDatasetPage>;
  export(payload: {
    projectId: string;
    runId: string;
    datasetId: string;
    format: "csv" | "json";
  }): ReturnType<typeof exportRunDataset>;
  remove(payload: { projectId: string; runId: string; datasetId?: string }): ReturnType<typeof deleteRunDatasets>;
  /** Appends the caller's `domainId`, so a `tooLarge` download stays in scope. */
  downloadHref(input: Omit<RunDatasetDownloadHrefInput, "domainId">): string;
};
