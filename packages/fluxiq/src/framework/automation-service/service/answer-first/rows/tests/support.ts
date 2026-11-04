// Test support for the row sink: a read's answer and a stub dataset store.
import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";

export const READ_ROWS_KEY = "read.extracted";

/** A live read's answer: its kept rows under `read.extracted`. */
export function liveAnswer(rows: JsonValue[], extra: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { read: { extracted: rows }, ...extra }, effectApplied: false };
}

/** A replayed read's answer: its rows under `outputs.records`. */
export function replayedAnswer(rows: JsonObject[]): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { said: "replayed" }, effectApplied: false, outputs: { records: rows } };
}

export function call(callId: string, toolId = "web.read", value: JsonObject = { target: "list" }): { callId: string; toolId: string; value: JsonObject } {
  return { callId, toolId, value };
}

export function item(n: number): JsonObject {
  return { title: `Item ${n}`, price: n };
}

/** A store that keeps every batch it is handed and can be told to refuse. */
export function stubStore(): { batches: AutomationStudioRecordBatch[]; refuse: { on: boolean }; onRecordBatch(batch: AutomationStudioRecordBatch): Promise<AutomationStudioRunDatasetSummary> } {
  const batches: AutomationStudioRecordBatch[] = [];
  const refuse = { on: false };
  return {
    batches,
    refuse,
    async onRecordBatch(batch) {
      if (refuse.on) throw new TypeError("the store refused a batch");
      batches.push(batch);
      const held = batches.filter((entry) => entry.datasetId === batch.datasetId);
      return { runId: "run.a", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "sha256:stub", recordCount: held.reduce((sum, entry) => sum + entry.rows.length, 0), truncated: batch.truncated, invalidCount: batch.invalidCount, updatedAt: 1 };
    }
  };
}
