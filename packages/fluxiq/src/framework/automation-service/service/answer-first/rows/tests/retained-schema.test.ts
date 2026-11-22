import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import { automationStudioAnswerFirstRowSink } from "../row-sink.ts";
import { call, liveAnswer, replayedAnswer, stubStore, READ_ROWS_KEY } from "./support.ts";

const schema: AutomationStudioRecordSchema = {
  schemaVersion: "0.1", primaryKey: ["id"], fields: [
    { id: "id", label: "Id", valueType: "string", semanticType: "id" },
    { id: "price", label: "Price", valueType: "string", semanticType: "currency" },
    { id: "promoted", label: "Promoted", valueType: "boolean", semanticType: "flag", mark: "badge" },
    { id: "private", label: "Private", valueType: "string", handling: "exclude" }
  ]
};
const rows = [{ id: "same", price: "$12.50", promoted: true }, { id: "same", price: "$11.25", promoted: false }];

describe("retained read schemas", () => {
  it("persists a known empty host-schema read, keeps legacy absence compatible and refuses rejected metadata", async () => {
    const store = stubStore();
    const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: store.onRecordBatch });
    const empty = await sink.fromCall(call("empty"), { ...liveAnswer([]), recordSchema: schema });
    expect(empty).toMatchObject({ rows: [], datasetId: "read.empty", invalidCount: 0, schema: { ...schema, fields: schema.fields.slice(0, 3) } });
    expect(store.batches).toHaveLength(1);
    expect(store.batches[0]).toMatchObject({ rows: [], schema });
    expect(sink.summary(empty?.datasetId)).toMatchObject({ totalRows: 0, rows: [], schema: empty?.schema });
    expect(await sink.fromCall(call("legacy-empty"), liveAnswer([]))).toEqual({ rows: [], invalidCount: 0, truncated: false });
    expect(await sink.fromCall(call("invalid-empty"), { ...liveAnswer([]), recordSchema: null })).toMatchObject({ failure: { code: "answer_first.rows_invalid_schema" } });
    expect(store.batches).toHaveLength(1);
    expect(sink.readsAnswered()).toBe(2);
  });

  it("preserves raw display values, identity and marks on live and replay reads while excluding private fields", async () => {
    const store = stubStore();
    const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: store.onRecordBatch });
    for (const [index, answer] of [liveAnswer(rows.map((row) => ({ ...row, private: "synthetic excluded value" }))), replayedAnswer(rows)].entries()) {
      answer.recordSchema = schema;
      const result = await sink.fromCall(call(`read.${index}`), answer);
      expect(result?.rows).toEqual(rows);
      expect(result?.schema).toEqual({ ...schema, fields: schema.fields.slice(0, 3) });
      expect(sink.summary(result?.datasetId).schema).toEqual(result?.schema);
      expect(JSON.stringify(result)).not.toContain("private");
    }
    expect(store.batches).toHaveLength(2);
  });

  it("reports invalid metadata and overflow explicitly instead of inferring or slicing fields", async () => {
    const store = stubStore();
    const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: store.onRecordBatch });
    expect(await sink.fromCall(call("invalid"), { ...liveAnswer(rows), recordSchema: null })).toMatchObject({ failure: { code: "answer_first.rows_invalid_schema" } });
    const wide = Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`field_${index}`, "value"]));
    expect(await sink.fromCall(call("overflow"), liveAnswer([wide]))).toMatchObject({ failure: { code: "answer_first.rows_invalid_schema", issues: ["record_schema.too_many_fields"] } });
    expect(store.batches).toEqual([]);
  });

  it("unions additive batch schemas and replaces an earlier retry without duplicating its rows", async () => {
    const store = stubStore();
    const sink = automationStudioAnswerFirstRowSink({ runId: "run.a", onRecordBatch: store.onRecordBatch });
    const first: AutomationStudioRecordBatch = { nodeId: "read", attemptId: "first", batchKey: "first", datasetId: "items", writeMode: "append", schema: { ...schema, fields: schema.fields.slice(0, 2) }, rows: [{ id: "one", price: "$12.50" }], invalidCount: 0, truncated: false, process: { columns: ["id"] } };
    const later: AutomationStudioRecordBatch = { ...first, attemptId: "later", batchKey: "later", schema: { ...schema, fields: [schema.fields[0]!, schema.fields[2]!] }, rows: [{ id: "two", promoted: false }], process: { columns: ["promoted"] } };
    await sink.recordBatch(first);
    await sink.recordBatch(later);
    const ordered = structuredClone(sink.summary("items").rows);
    await sink.recordBatch(first);
    expect(sink.summary("items").rows).toEqual(ordered);
    expect(ordered).toEqual([first.rows[0], later.rows[0]]);
    expect(sink.summary("items").schema?.fields.map((field) => field.id)).toEqual(["id", "price", "promoted"]);
    expect(sink.summary("items").schema?.primaryKey).toEqual(["id"]);
    const before = structuredClone(sink.summary("items"));
    await expect(sink.recordBatch({ ...first, batchKey: "conflict", schema: { ...first.schema, primaryKey: ["price"] } })).rejects.toThrow("union_primary_key_conflict");
    expect(sink.summary("items")).toEqual(before);
    expect(store.batches).toHaveLength(3);
    await sink.recordBatch({ ...first, rows: [{ id: "changed", price: "$2.00" }] });
    expect(sink.summary("items").rows).toEqual([later.rows[0], { id: "changed", price: "$2.00" }]);
    await sink.recordBatch({ ...first, writeMode: "replace", batchKey: "replacement", rows: [{ id: "replaced", price: "$4.00" }] });
    expect(sink.summary("items")).toMatchObject({ rows: [{ id: "replaced", price: "$4.00" }], schema: first.schema });
  });
});
