import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, item, liveAnswer, READ_ROWS_KEY, replayedAnswer, stubStore } from "./support.ts";

function sinkOver(store = stubStore()) {
  return { store, sink: automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (batch) => store.onRecordBatch(batch) }) };
}

describe("automationStudioAnswerFirstRowSink", () => {
  it("stores a live read's kept rows as a real batch with a derived schema", async () => {
    const { store, sink } = sinkOver();
    const stored = await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)]));
    expect(stored).toMatchObject({ rows: [item(1), item(2)], invalidCount: 0, truncated: false });
    expect(store.batches).toHaveLength(1);
    const [batch] = store.batches;
    expect(batch).toMatchObject({ attemptId: "call.1", writeMode: "append", invalidCount: 0, truncated: false });
    expect(batch!.schema).toEqual({ schemaVersion: "0.1", fields: [{ id: "title", label: "title", valueType: "string" }, { id: "price", label: "price", valueType: "number" }] });
    expect(sink.summary()).toMatchObject({ datasetId: batch!.datasetId, totalRows: 2, truncated: false, columns: [{ id: "title" }, { id: "price" }], rows: [item(1), item(2)] });
  });

  it("stores a replayed read's outputs.records", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1", "core.run_flow"), replayedAnswer([item(1)]));
    expect(store.batches[0]!.rows).toEqual([item(1)]);
  });

  it("adds a later page of the same read to the same dataset, with a batch key of its own", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1", "web.read", { target: "list", page: 1 }), liveAnswer([item(1), item(2)]));
    await sink.fromCall(call("call.2", "web.read", { target: "list", page: 2 }), liveAnswer([item(3), item(4), item(5)]));
    expect(store.batches[0]!.datasetId).toBe(store.batches[1]!.datasetId);
    expect(store.batches[0]!.batchKey).not.toBe(store.batches[1]!.batchKey);
    expect(sink.summary()).toMatchObject({ totalRows: 5 });
    expect(sink.summary().rows.map((row) => row.price)).toEqual([1, 2, 3, 4, 5]);
  });

  it("counts a row read again on the same dataset once, as processing does", async () => {
    const { sink } = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([item(1), item(2)]));
    await sink.fromCall(call("call.2"), liveAnswer([item(2), item(3)]));
    expect(sink.summary().rows.map((row) => row.price)).toEqual([1, 2, 3]);
  });

  it("is honest about a read that returned more rows than are kept", async () => {
    const { store, sink } = sinkOver();
    const many = Array.from({ length: 10_001 }, (_, index) => ({ title: `T${index}`, price: index }));
    const stored = await sink.fromCall(call("call.1"), liveAnswer(many));
    expect(stored).toMatchObject({ truncated: true });
    expect(store.batches[0]!.truncated).toBe(true);
    expect(store.batches[0]!.rows).toHaveLength(10_000);
    expect(sink.summary()).toMatchObject({ truncated: true, totalRows: 10_000 });
  });

  it("counts rows the schema refuses", async () => {
    const { store, sink } = sinkOver();
    const stored = await sink.fromCall(call("call.1"), liveAnswer([item(1), "not a row", item(2)]));
    expect(stored).toMatchObject({ invalidCount: 1 });
    expect(store.batches[0]).toMatchObject({ invalidCount: 1 });
    expect(store.batches[0]!.rows).toHaveLength(2);
  });

  it("stores no minted field as a column or a cell", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1"), liveAnswer([{ title: "A", price: 1, $ref: "x", rowHandle: "h1", evidenceRef: "e1" }]));
    expect(store.batches[0]!.schema.fields.map((field) => field.id)).toEqual(["title", "price"]);
    expect(store.batches[0]!.rows).toEqual([{ title: "A", price: 1 }]);
  });

  it("stores nothing when a call's input holds rows", async () => {
    const { store, sink } = sinkOver();
    const inputRows = [item(1), item(2)];
    const stored = await sink.fromCall({ callId: "call.1", toolId: "web.press", value: { rows: inputRows, records: inputRows, read: { extracted: inputRows } } }, { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true });
    expect(stored).toBeUndefined();
    expect(store.batches).toHaveLength(0);
    expect(sink.summary()).toEqual({ totalRows: 0, truncated: false, columns: [], rows: [] });
  });

  it("stores nothing from a complete decision's result or a model-written field", async () => {
    const { store, sink } = sinkOver();
    expect(await sink.fromCall(call("call.1", "complete"), { kind: "llm_evidence_tool_execution", evidence: { result: { rows: [item(1)] }, answer: [item(2)] }, effectApplied: false })).toBeUndefined();
    expect(store.batches).toHaveLength(0);
  });

  it("stores nothing from a failed call", async () => {
    const { store, sink } = sinkOver();
    const failed: AutomationStudioLlmEvidenceToolExecutionResult = { ...liveAnswer([item(1)]), failure: { category: "output_not_observed", code: "x.failed", retryable: true, stage: "dispatch" } };
    expect(await sink.fromCall(call("call.1"), failed)).toBeUndefined();
    expect(store.batches).toHaveLength(0);
  });

  it("reports a failed store as data, adds nothing to its account, and stores the rows when they come again", async () => {
    const { store, sink } = sinkOver();
    store.refuse.on = true;
    const failed = await sink.fromCall(call("call.1"), liveAnswer([item(1)]));
    expect(failed).toMatchObject({ rows: [], failure: { code: "answer_first.rows_not_stored", errorName: "TypeError" } });
    expect(JSON.stringify(failed)).not.toContain("refused a batch");
    expect(sink.summary().totalRows).toBe(0);
    store.refuse.on = false;
    await sink.fromCall(call("call.2"), liveAnswer([item(1)]));
    expect(sink.summary().totalRows).toBe(1);
  });

  it("keeps a read's schema across pages even when a later page's values look different", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1", "web.read", { page: 1 }), liveAnswer([{ title: "A", price: 1 }]));
    const later = await sink.fromCall(call("call.2", "web.read", { page: 2 }), liveAnswer([{ title: "B", price: "free" }]));
    expect(store.batches[1]!.schema).toEqual(store.batches[0]!.schema);
    expect(later).toMatchObject({ invalidCount: 1 });
  });

  it("makes the dataset the latest read that stored rows the result, and an empty read displaces nothing", async () => {
    const { store, sink } = sinkOver();
    await sink.fromCall(call("call.1", "web.read.a"), liveAnswer([item(1)]));
    await sink.fromCall(call("call.2", "web.read.b"), liveAnswer([{ name: "N", stock: 4 }]));
    await sink.fromCall(call("call.3", "web.read.c"), liveAnswer([]));
    const result = sink.summary();
    expect(result.datasetId).toBe(store.batches[1]!.datasetId);
    expect(result.columns.map((column) => column.id)).toEqual(["name", "stock"]);
  });
});
