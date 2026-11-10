// Inputs of the Automation Studio endpoints for the tables of rows runs
// collected: a run's tables, a page of one, an export, deletion, and a
// project's tables.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the run belongs to.");
const runId = z.string().trim().min(1).describe("The run that collected the table.");
const flowId = z.string().trim().min(1).describe("The Flow that collected the table.");
const datasetId = z.string().trim().min(1).describe("The table of rows.");
const limit = z.number().int().min(1).max(200).optional().describe("The most rows to return in one page; 50 when left out.");
const cursor = z.string().nullable().optional().describe("The cursor a previous page gave for the next page.");

/** `list-run-datasets`: the tables one run collected. */
export const listRunDatasetsInput = programApiInput(z.object({ projectId, runId }));

/** `get-run-dataset-page`: one page of a table's rows. */
export const getRunDatasetPageInput = programApiInput(z.object({ projectId, runId, datasetId, limit, cursor }));

/** `export-run-dataset`: a whole table as CSV or JSON text. */
export const exportRunDatasetInput = programApiInput(z.object({
  projectId,
  runId,
  datasetId,
  format: z.enum(["csv", "json"]).describe("The file format to export.")
}));

/** `delete-run-datasets`: deletes one table a run collected, or all of them. */
export const deleteRunDatasetsInput = programApiInput(z.object({
  projectId,
  runId,
  datasetId: datasetId.optional().describe("Only this table; leave out to delete every table the run collected.")
}));

/** `list-project-datasets`: the tables in a project, newest first. */
export const listProjectDatasetsInput = programApiInput(z.object({
  projectId,
  flowId: flowId.optional().describe("Only tables this Flow collected."),
  search: z.string().trim().min(1).optional().describe("Only tables whose name contains these words."),
  limit,
  cursor
}));

/** `list-dataset-runs`: the runs that hold rows for one table. */
export const listDatasetRunsInput = programApiInput(z.object({
  projectId,
  flowId,
  datasetId,
  status: z.string().trim().min(1).optional().describe("Only runs with this status."),
  runId: runId.optional().describe("Only this run."),
  limit,
  cursor
}));

export type ListRunDatasetsInput = ReturnType<typeof listRunDatasetsInput.parse>;
export type GetRunDatasetPageInput = ReturnType<typeof getRunDatasetPageInput.parse>;
export type ExportRunDatasetInput = ReturnType<typeof exportRunDatasetInput.parse>;
export type DeleteRunDatasetsInput = ReturnType<typeof deleteRunDatasetsInput.parse>;
export type ListProjectDatasetsInput = ReturnType<typeof listProjectDatasetsInput.parse>;
export type ListDatasetRunsInput = ReturnType<typeof listDatasetRunsInput.parse>;
