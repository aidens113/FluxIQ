// Where a paged action row ran, and what state-aware recovery recorded on it
// (state-aware recovery plan, C1, C11).
//
// The run detail places a called part's attempts after the Call Subflow
// attempt that called it (`runtime/service/summaries/frame-attempts.ts`): the
// call keeps `subflowTarget`, and each of its part's attempts names it as
// `parentAttemptId` and carries its `framePath`. The paged action rows are
// read from the summary columns, which hold none of this, so a run log reading
// them showed a part's steps flat beside the Flow's own. The fields are read
// out of each row's stored record by SQLite (`json_extract`), so a page never
// parses a whole record, and checked again here: a stored record is data from
// an older or newer writer, never trusted in part. SQLite returns an object or
// array field as JSON text it wrote itself, so text that does not parse is a
// fault in the store and is thrown, not read as an absent field.
//
// Ids, closed codes and times only, as the run detail keeps them: the handler
// that ran, the entry a frame began at and what a failure counted as come
// with the frame fields because the run log words each row from them.

import type { AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";

type FrameFields = Pick<AutomationStudioFlowRunActionAttemptRecord, "parentAttemptId" | "framePath" | "subflowTarget" | "failureClass" | "entry" | "lifecycle">;

/** The row columns `select` reads beside the summary columns, as `fields` reads them back. */
type FrameColumns = { parent_attempt_id?: unknown; frame_path_json?: unknown; subflow_target_json?: unknown; failure_class?: unknown; entry_json?: unknown; lifecycle_json?: unknown };

const FAILURE_CLASSES: ReadonlySet<unknown> = new Set(["true_failure", "planned_fail", "retry", "skip", "state_route", "uncertain"]);

/** The frame and recovery fields of a paged action row: the SQL that selects them, and the reader that checks them. */
export const automationStudioRuntimeActionRowFrame = Object.freeze({
  select: [
    "json_extract(detail_json, '$.parentAttemptId') as parent_attempt_id",
    "json_extract(detail_json, '$.framePath') as frame_path_json",
    "json_extract(detail_json, '$.subflowTarget') as subflow_target_json",
    "json_extract(detail_json, '$.failureClass') as failure_class",
    "json_extract(detail_json, '$.entry') as entry_json",
    "json_extract(detail_json, '$.lifecycle') as lifecycle_json"
  ].join(", "),
  fields(row: FrameColumns): FrameFields {
    const framePath = parsed(row.frame_path_json);
    const subflowTarget = record(parsed(row.subflow_target_json));
    const entry = record(parsed(row.entry_json));
    const lifecycle = record(parsed(row.lifecycle_json));
    return {
      ...(typeof row.parent_attempt_id === "string" && row.parent_attempt_id ? { parentAttemptId: row.parent_attempt_id } : {}),
      ...(Array.isArray(framePath) && framePath.every((id) => typeof id === "string") ? { framePath: framePath as string[] } : {}),
      ...(subflowTarget && typeof subflowTarget.subflowId === "string" && typeof subflowTarget.graphFlowId === "string"
        ? { subflowTarget: { subflowId: subflowTarget.subflowId, graphFlowId: subflowTarget.graphFlowId, graphRevision: typeof subflowTarget.graphRevision === "number" ? subflowTarget.graphRevision : null } }
        : {}),
      ...(FAILURE_CLASSES.has(row.failure_class) ? { failureClass: row.failure_class as NonNullable<FrameFields["failureClass"]> } : {}),
      ...(entry && typeof entry.kind === "string" ? { entry: entry as unknown as NonNullable<FrameFields["entry"]> } : {}),
      ...(lifecycle && typeof lifecycle.event === "string" && typeof lifecycle.handlerId === "string" && record(lifecycle.disposition)
        ? { lifecycle: lifecycle as unknown as NonNullable<FrameFields["lifecycle"]> }
        : {})
    };
  }
});

function parsed(value: unknown): unknown {
  return typeof value === "string" && value ? JSON.parse(value) as unknown : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
