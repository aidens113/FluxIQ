// A saved Flow's run writes rows under the dataset its record output names; a read afterwards has
// an id of its own. They must end as one result, and a read of something else must not replace
// the result with less (`../row-sink.ts`, `../result-dataset.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import { automationStudioAnswerFirstResultDataset, automationStudioAnswerFirstRowSink } from "../index.ts";
import { call, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

const LOAN_SCHEMA: AutomationStudioRecordBatch["schema"] = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "due", label: "Due", valueType: "string" }] };
const loan = (title: string): JsonObject => ({ title, due: "2030-01-01" });
const shown = (title: string, index: number): JsonObject => ({ ...loan(title), shelfmark: `Shelf ${index}`, $handle: `read-row-${index}` });
const THREE = ["Atlas", "Birds", "Clocks"];

function batch(rows: JsonObject[], over: Partial<AutomationStudioRecordBatch> = {}): AutomationStudioRecordBatch {
  return { nodeId: "node.read", attemptId: "attempt.1", batchKey: "attempt.1", datasetId: "loans", label: "Loans", writeMode: "append", schema: LOAN_SCHEMA, rows, invalidCount: 0, truncated: false, ...over };
}

function sinkOver(store = stubStore()) {
  return { store, sink: automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: (each) => store.onRecordBatch(each) }) };
}

describe("a run's rows and a later read", () => {
  it("three rows from a run and two more of the same list from a read give five, in one dataset", async () => {
    const { store, sink } = sinkOver();
    await sink.recordBatch(batch(THREE.map(loan)));
    const stored = await sink.fromCall(call("read.more", "core.run_node", { node: "read" }), liveAnswer(["Dials", "Ephemera"].map(shown)));
    expect(stored).toMatchObject({ datasetId: "loans", invalidCount: 0 });
    expect(sink.summary()).toMatchObject({ datasetId: "loans", totalRows: 5, columns: [{ id: "title" }, { id: "due" }] });
    expect(sink.summary().rows).toEqual([...THREE, "Dials", "Ephemera"].map(loan));
    // What the read minted and the column the run does not keep are gone, and the store is given what it will accept.
    expect(store.batches[1]).toMatchObject({ datasetId: "loans", label: "Loans", writeMode: "append", schema: LOAN_SCHEMA, rows: ["Dials", "Ephemera"].map(loan) });
    expect(store.batches[1]!.batchKey).not.toBe(store.batches[0]!.batchKey);
  });

  it("the same rows read again give three", async () => {
    const { sink } = sinkOver();
    await sink.recordBatch(batch(THREE.map(loan)));
    await sink.fromCall(call("read.again", "core.run_node", { node: "read" }), liveAnswer(THREE.map(shown)));
    expect(sink.summary()).toMatchObject({ datasetId: "loans", totalRows: 3 });
  });

  it("a read of something else does not replace the result with less, and its rows stay stored", async () => {
    const { store, sink } = sinkOver();
    await sink.recordBatch(batch(THREE.map(loan)));
    await sink.fromCall(call("look.up", "core.run_node", { node: "branches" }), liveAnswer([{ branch: "Central" }, { branch: "North" }]));
    expect(sink.summary()).toMatchObject({ datasetId: "loans", totalRows: 3 });
    expect(store.batches).toHaveLength(2);
    expect(store.batches[1]!.datasetId).not.toBe("loans");
  });

  it("a read of something else that holds as many rows becomes the result, by the plain rule", async () => {
    const { sink } = sinkOver();
    await sink.recordBatch(batch(THREE.map(loan)));
    await sink.fromCall(call("read.other", "core.run_node", { node: "branches" }), liveAnswer([{ branch: "Central" }, { branch: "North" }, { branch: "West" }]));
    expect(sink.summary()).toMatchObject({ totalRows: 3, columns: [{ id: "branch" }] });
  });

  it("a read whose rows do not fit the run's schema is something else, not a row quietly dropped", async () => {
    const { store, sink } = sinkOver();
    await sink.recordBatch(batch(THREE.map(loan)));
    await sink.fromCall(call("read.odd", "core.run_node", { node: "read" }), liveAnswer([{ title: "Dials", due: { day: 1 } }]));
    expect(store.batches[1]!.datasetId).not.toBe("loans");
    expect(sink.summary()).toMatchObject({ datasetId: "loans", totalRows: 3 });
  });

  it("a read with fewer columns than the run keeps is something else", async () => {
    const { store, sink } = sinkOver();
    await sink.recordBatch(batch(THREE.map(loan)));
    await sink.fromCall(call("read.narrow", "core.run_node", { node: "read" }), liveAnswer([{ title: "Atlas" }]));
    expect(store.batches[1]!.datasetId).not.toBe("loans");
    expect(sink.summary()).toMatchObject({ datasetId: "loans", totalRows: 3 });
  });

  it("carries the run's processing with a joined batch, as the store refuses it changing within a run", async () => {
    const { store, sink } = sinkOver();
    const process = { dedupe: { by: ["title"] } } as unknown as NonNullable<AutomationStudioRecordBatch["process"]>;
    await sink.recordBatch(batch([loan("Atlas")], { process }));
    await sink.fromCall(call("read.more", "core.run_node", {}), liveAnswer([shown("Birds", 1)]));
    expect(store.batches[1]!.process).toEqual(process);
  });

  it("a run's replace clears what it held, as the store does", async () => {
    const { sink } = sinkOver();
    await sink.recordBatch(batch(THREE.map(loan)));
    await sink.recordBatch(batch([loan("Dials")], { writeMode: "replace", batchKey: "attempt.2" }));
    expect(sink.summary()).toMatchObject({ datasetId: "loans", totalRows: 1, rows: [loan("Dials")] });
  });

  it("a store that refuses a run's batch throws, for the engine to fail the step, and the sink does not count the rows", async () => {
    const { store, sink } = sinkOver();
    store.refuse.on = true;
    await expect(sink.recordBatch(batch(THREE.map(loan)))).rejects.toThrow();
    expect(sink.summary()).toMatchObject({ totalRows: 0 });
  });

  it("a judge's no on the run's rows ends both: a short read of the right list can then be the result", async () => {
    const { store, sink } = sinkOver();
    await sink.recordBatch(batch(THREE.map(loan)));
    sink.runRowsRefused();
    expect(sink.summary()).toMatchObject({ datasetId: "loans", totalRows: 3 });
    await sink.fromCall(call("read.right", "core.run_node", { node: "read" }), liveAnswer([shown("Atlas", 0)]));
    expect(store.batches[1]!.datasetId).not.toBe("loans");
    expect(sink.summary()).toMatchObject({ totalRows: 1, rows: [{ title: "Atlas", due: "2030-01-01", shelfmark: "Shelf 0" }] });
  });

  it("a read before any run, then a run, is the run's: the latest", async () => {
    const { sink } = sinkOver();
    await sink.fromCall(call("read.first", "core.run_node", { node: "branches" }), liveAnswer([{ branch: "Central" }, { branch: "North" }, { branch: "West" }, { branch: "East" }]));
    await sink.recordBatch(batch([loan("Atlas")]));
    expect(sink.summary()).toMatchObject({ datasetId: "loans", totalRows: 1 });
  });
});

describe("the result rule alone", () => {
  const rows: Record<string, number> = { run: 3, small: 2, same: 3, large: 9 };
  const ran = { ids: new Set(["run"]), rowsOf: (id: string) => rows[id] ?? 0 };

  it("is the plain latest with no run", () => {
    expect(automationStudioAnswerFirstResultDataset([])).toBeUndefined();
    expect(automationStudioAnswerFirstResultDataset(["a", "b"])).toBe("b");
    expect(automationStudioAnswerFirstResultDataset(["run", "small"], undefined)).toBe("small");
  });

  it("keeps the run's over a later read with fewer rows, and only those", () => {
    expect(automationStudioAnswerFirstResultDataset(["run", "small"], ran)).toBe("run");
    expect(automationStudioAnswerFirstResultDataset(["run", "same"], ran)).toBe("same");
    expect(automationStudioAnswerFirstResultDataset(["run", "large"], ran)).toBe("large");
    expect(automationStudioAnswerFirstResultDataset(["small", "run"], ran)).toBe("run");
  });
});
