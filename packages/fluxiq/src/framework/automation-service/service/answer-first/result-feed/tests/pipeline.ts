import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstRowSink } from "../../rows/index.ts";
import { automationStudioAnswerFirstResultFeed } from "../index.ts";

export function resultPipeline(instructionText = "Give columns title and price.", store?: (batch: AutomationStudioRecordBatch) => Promise<unknown>) {
  const batches: AutomationStudioRecordBatch[] = [];
  const sink = automationStudioAnswerFirstRowSink({ runId: "run.one", readRowsKey: "read.extracted", onRecordBatch: async (batch) => {
    await store?.(batch);
    batches.push(batch);
    return { runId: "run.one", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "sha256:fixture", recordCount: batch.rows.length, invalidCount: batch.invalidCount, truncated: batch.truncated, updatedAt: 1 };
  } });
  const feed = automationStudioAnswerFirstResultFeed({ instructionText, readRowsKey: "read.extracted" });
  const input = (where: JsonValue[] = [], fields: JsonObject = { title: ".name", price: ".price" }, process?: JsonObject): JsonObject => ({ node: "example.read", parameters: { read: { fields, where }, ...(process ? { recordOutput: { process } } : {}) } });
  const step = (id: string, value: JsonObject, position = 1): AutomationStudioFlowDraftStep => ({ id, callId: id, position, disposition: "kept", proposes: true, effect: "observe", input: value, toolId: "core.run_node" } as AutomationStudioFlowDraftStep);
  const read = async (options: { source: string; rows: JsonObject[]; place?: string; listKey?: string; value?: JsonObject; kind?: "add" | "rerun" | "look"; id?: string; position?: number; extra?: JsonObject }) => {
    const value = options.value ?? input();
    const call = { callId: options.source, toolId: "core.run_node", value };
    const answer = { kind: "llm_evidence_tool_execution" as const, effectApplied: false, evidence: { read: { extracted: options.rows, listKey: options.listKey ?? "list.catalogue", ...(options.place ? { place: options.place } : {}), ...options.extra } } };
    const saved = await sink.fromCall(call, answer);
    feed.expect(options.kind === "look" ? undefined : options.kind === "rerun" ? { kind: "rerun", step: step(options.id ?? "s1", value, options.position) } : { kind: "add", position: options.position ?? 1, intermediate: false });
    const line = feed.called(call, answer, saved);
    return { saved, line };
  };
  return { sink, feed, batches, input, step, read };
}
