import type { AutomationStudioProjectPartCall, AutomationStudioProjectPartVersionSource, AutomationStudioProjectPartRecord, AutomationStudioProjectPartRunRecord, AutomationStudioProjectPartVersionRecord } from "./types.ts";

export type PartRow = { part_id: string; latest_version: number; source_flow_id: string; source_subflow_id: string; created_at_ms: number; updated_at_ms: number };
export type PartVersionRow = { part_id: string; version: number; card_json: string; shape_hash: string; snapshot_object_id: string; source_graph_flow_id: string; source_graph_revision: number | null; created_at_ms: number };
export type PartCallRow = { caller_kind: "part_version" | "flow_graph"; caller_id: string; caller_version: number; caller_node_id: string; caller_flow_id: string | null; part_id: string; version: number };
export type PartRunRow = { part_id: string; version: number; run_id: string; outcome: AutomationStudioProjectPartRunRecord["outcome"]; model_calls: number; finished_at_ms: number };

export type PartVersionSourceRow = { graph_flow_id: string; revision: number | null };

export function partFromRow(row: PartRow): AutomationStudioProjectPartRecord {
  return { partId: row.part_id, latestVersion: row.latest_version, sourceFlowId: row.source_flow_id, sourceSubflowId: row.source_subflow_id, createdAtMs: row.created_at_ms, updatedAtMs: row.updated_at_ms };
}

export function versionFromRow(row: PartVersionRow): AutomationStudioProjectPartVersionRecord {
  return { partId: row.part_id, version: row.version, card: JSON.parse(row.card_json) as unknown, shapeHash: row.shape_hash, snapshotObjectId: row.snapshot_object_id, sourceGraphFlowId: row.source_graph_flow_id, sourceGraphRevision: row.source_graph_revision, createdAtMs: row.created_at_ms };
}

export function callFromRow(row: PartCallRow): AutomationStudioProjectPartCall {
  return { callerKind: row.caller_kind, callerId: row.caller_id, callerVersion: row.caller_version, callerNodeId: row.caller_node_id, ...(row.caller_flow_id ? { callerFlowId: row.caller_flow_id } : {}), partId: row.part_id, version: row.version };
}

export function runFromRow(row: PartRunRow): AutomationStudioProjectPartRunRecord {
  return { partId: row.part_id, version: row.version, runId: row.run_id, outcome: row.outcome, modelCalls: row.model_calls, finishedAtMs: row.finished_at_ms };
}

export function versionSourceFromRow(row: PartVersionSourceRow): AutomationStudioProjectPartVersionSource {
  return { graphFlowId: row.graph_flow_id, revision: row.revision };
}
