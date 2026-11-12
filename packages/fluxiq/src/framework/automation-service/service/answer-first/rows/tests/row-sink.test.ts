import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, item, liveAnswer, READ_ROWS_KEY, replayedAnswer, stubStore } from "./support.ts";

const setup = () => {
  const store = stubStore();
  return { store, sink: automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: store.onRecordBatch }) };
};

describe("a page store never chooses the attempt's result", () => {
  it("stores real kept rows and a derived schema under the explicit source identity", async () => {
    const { sink, store } = setup();
    const read = await sink.fromCall(call("one"), liveAnswer([item(1), item(2)]));
    expect(read).toMatchObject({ datasetId: "read.one", rows: [item(1), item(2)], invalidCount: 0, truncated: false });
    expect(store.batches[0]).toMatchObject({ writeMode: "replace", schema: { fields: [{ id: "title", label: "title", valueType: "string" }, { id: "price", label: "price", valueType: "number" }] } });
    expect(sink.summary()).toEqual({ totalRows: 0, truncated: false, columns: [], rows: [] });
    expect(sink.summary(read?.datasetId).rows).toEqual([item(1), item(2)]);
  });
  it("independent captures never join by target, overlap, address, column names or replay flags", async () => {
    const { sink, store } = setup();
    for (const id of ["one", "two"]) await sink.fromCall(call(id, "web.read", { target: "same", page: 1 }), liveAnswer([item(1)]));
    await sink.fromCall(call("three", "web.read", { target: "same", replay: "step" }), replayedAnswer([item(1)]));
    expect(new Set(store.batches.map((batch) => batch.datasetId)).size).toBe(3);
    expect(sink.summary("read.one").totalRows).toBe(1);
    expect(sink.summary("read.two").totalRows).toBe(1);
    expect(sink.summary()).not.toHaveProperty("datasetId");
  });
  it("preserves a capture's repeated rows; only declared result processing decides dedupe", async () => {
    const { sink } = setup();
    await sink.fromCall(call("one"), liveAnswer([item(1), item(1)]));
    expect(sink.summary("read.one").rows).toEqual([item(1), item(1)]);
  });
  it("validates all captured cells and strips minted handles rather than persisting them", async () => {
    const { sink, store } = setup();
    const read = await sink.fromCall(call("one"), liveAnswer([item(1), "not a row", { ...item(2), $ref: "x", rowHandle: "h1", evidenceRef: "e1" }]));
    expect(read).toMatchObject({ invalidCount: 1, rows: [item(1), item(2)] });
    expect(store.batches[0]?.schema.fields.map((field) => field.id)).toEqual(["title", "price"]);
  });
  it("reports declared record-output truncation honestly", async () => {
    const { sink } = setup();
    const read = await sink.fromCall(call("one"), liveAnswer(Array.from({ length: 10001 }, (_, index) => item(index))));
    expect(read).toMatchObject({ truncated: true });
    expect(sink.summary("read.one").rows).toHaveLength(10000);
  });
  it.each([
    ["input", { rows: [item(1)] }, { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false }],
    ["model answer", {}, { kind: "llm_evidence_tool_execution", evidence: { result: { rows: [item(1)] }, answer: [item(1)] }, effectApplied: false }],
    ["failed call", {}, { ...liveAnswer([item(1)]), failure: { category: "output_not_observed", code: "failed", retryable: true, stage: "dispatch" } }]
  ])("never stores rows from %s", async (_name, value, answer) => {
    const { sink, store } = setup();
    expect(await sink.fromCall(call("one", "web.read", value), answer as AutomationStudioLlmEvidenceToolExecutionResult)).toBeUndefined();
    expect(store.batches).toHaveLength(0);
  });
  it("reports a lost capture without contributing rows or a successful read", async () => {
    const { sink, store } = setup();
    store.refuse.on = true;
    expect(await sink.fromCall(call("one"), liveAnswer([item(1)]))).toMatchObject({ rows: [], failure: { code: "answer_first.rows_not_stored", errorName: "TypeError" } });
    expect(sink.readsAnswered()).toBe(0);
    expect(sink.summary("read.one").totalRows).toBe(0);
  });
  it("distinguishes a successful empty read from no read and from a failed store", async () => {
    const { sink } = setup();
    await sink.fromCall(call("empty"), liveAnswer([]));
    expect(sink.readsAnswered()).toBe(1);
    expect(sink.summary()).not.toHaveProperty("datasetId");
  });
  it("stores a saved batch under its explicit dataset with its source evidence unchanged", async () => {
    const { sink, store } = setup();
    await sink.fromCall(call("schema"), liveAnswer([item(1)]));
    const batch = { ...store.batches[0]!, datasetId: "saved", evidence: { pages: [] } };
    await sink.recordBatch(batch);
    expect(sink.summary("saved").rows).toEqual([item(1)]);
    expect(store.batches.at(-1)?.evidence).toEqual({ pages: [] });
  });
});
