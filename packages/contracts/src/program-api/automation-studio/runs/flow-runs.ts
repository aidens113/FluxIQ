// Inputs of the Automation Studio endpoints that read a Flow's runs: the list,
// one run's detail, its actions and events, its audit, and what a Flow spent.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the run belongs to.");
const runId = z.string().trim().min(1).describe("The run.");
const flowId = z.string().trim().min(1).describe("The Flow.");
const limit = z.number().int().min(1).max(200).optional().describe("The most rows to return in one page.");
const offset = z.number().int().min(0).optional().describe("How many rows to skip, for the next page.");
const cursor = z.string().optional().describe("The cursor a previous page gave for the next page.");

/** `list-flow-runs`: a page of the project's runs, optionally of one Flow. */
export const listFlowRunsInput = programApiInput(z.object({
  projectId,
  flowId: flowId.optional().describe("Only this Flow's runs; leave out for every Flow in the project."),
  status: z.string().trim().min(1).optional().describe("Only runs with this status, such as succeeded or failed."),
  search: z.string().trim().min(1).optional().describe("Only runs whose details contain these words."),
  sort: z.enum(["updated", "started", "duration", "actions", "status"]).optional().describe("What to order the runs by."),
  direction: z.enum(["asc", "desc"]).optional().describe("Ascending or descending order."),
  limit,
  offset
}));

/** `get-flow-run-detail`: one run's record. */
export const getFlowRunDetailInput = programApiInput(z.object({
  projectId,
  runId,
  compact: z.boolean().optional().describe("True to leave out the long lists and keep the summary.")
}));

/** `export-flow-run-audit`: one run's full audit record. */
export const exportFlowRunAuditInput = programApiInput(z.object({ projectId, runId }));

/** `get-flow-spend`: what one Flow has spent. */
export const getFlowSpendInput = programApiInput(z.object({ projectId, flowId }));

/** `list-flow-run-actions`: a page of what one run did, step by step. */
export const listFlowRunActionsInput = programApiInput(z.object({ projectId, runId, limit, offset, cursor }));

/** `get-flow-run-action-detail`: one action of a run. */
export const getFlowRunActionDetailInput = programApiInput(z.object({
  projectId,
  runId,
  attemptId: z.string().trim().min(1).describe("The action, as listed with the run's actions.")
}));

/** `list-flow-run-events`: a page of one run's event log. */
export const listFlowRunEventsInput = programApiInput(z.object({
  projectId,
  runId,
  afterSequence: z.number().int().min(0).optional().describe("Only events after this sequence number."),
  cursor,
  limit
}));

/** `get-flow-run-event-detail`: one event of a run's log. */
export const getFlowRunEventDetailInput = programApiInput(z.object({
  projectId,
  runId,
  sequence: z.number().int().min(0).describe("The event's sequence number in the run's log.")
}));

export type ListFlowRunsInput = ReturnType<typeof listFlowRunsInput.parse>;
export type GetFlowRunDetailInput = ReturnType<typeof getFlowRunDetailInput.parse>;
export type ExportFlowRunAuditInput = ReturnType<typeof exportFlowRunAuditInput.parse>;
export type GetFlowSpendInput = ReturnType<typeof getFlowSpendInput.parse>;
export type ListFlowRunActionsInput = ReturnType<typeof listFlowRunActionsInput.parse>;
export type GetFlowRunActionDetailInput = ReturnType<typeof getFlowRunActionDetailInput.parse>;
export type ListFlowRunEventsInput = ReturnType<typeof listFlowRunEventsInput.parse>;
export type GetFlowRunEventDetailInput = ReturnType<typeof getFlowRunEventDetailInput.parse>;
