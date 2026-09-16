// Mutations over a run's datasets, and the command set the panel is given.
//
// The panel never builds a transport of its own: `runtime-host.ts` binds these
// and passes them in, so a test injects stubs instead of mocking the network.

import type { ProgramCommandTransport } from "../data/program-transport";
import { commitAutomationStudioMutation } from "../stores";
import type { exportRunDataset, getRunDatasetPage, listRunDatasets } from "./dataset-queries";
import type { RunDatasetDownloadHrefInput } from "./download-href";

/**
 * Without `datasetId`, every dataset the run stored is deleted (CD17). Audited
 * server-side.
 *
 * `delete-run-datasets` is a `destructive` endpoint, so `registry.call()` refuses
 * it without the operator's session PIN; `authorizationPin` is required here so a
 * caller cannot omit it and discover the refusal at runtime. The route stamps
 * `authSessionId` itself, so the PIN is the only credential the panel supplies.
 */
export function deleteRunDatasets(
  api: ProgramCommandTransport,
  payload: { projectId: string; runId: string; datasetId?: string; authorizationPin: string }
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
  remove(payload: { projectId: string; runId: string; datasetId?: string; authorizationPin: string }): ReturnType<typeof deleteRunDatasets>;
  /** Appends the caller's `domainId`, so a `tooLarge` download stays in scope. */
  downloadHref(input: Omit<RunDatasetDownloadHrefInput, "domainId">): string;
};
