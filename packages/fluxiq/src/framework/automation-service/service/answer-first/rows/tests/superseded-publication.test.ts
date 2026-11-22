// A publication a later one superseded leaves the run, and the run's captures stay (`../row-sink.ts`, "One result in
// the run"). Under D1 a changed output step or version is a new dataset (`step.<id>.v<n>`), and the earlier one listed
// beside it in Data/export was a second result (t905, `latest-read.test.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioAnswerFirstRowSink, type AutomationStudioAnswerFirstRowsSummary } from "../index.ts";
import { call, item, liveAnswer, READ_ROWS_KEY, stubStore } from "./support.ts";

const answer = (datasetId: string, rows: JsonObject[]): AutomationStudioAnswerFirstRowsSummary => ({ datasetId, totalRows: rows.length, truncated: false, columns: [{ id: "title", label: "title" }, { id: "price", label: "price" }], rows });

const setup = (refuse: Set<string> = new Set()) => {
  const store = stubStore();
  const retired: string[] = [];
  const retire = async (datasetId: string): Promise<void> => {
    if (refuse.delete(datasetId)) throw new Error("store unavailable");
    retired.push(datasetId);
  };
  return { store, retired, sink: automationStudioAnswerFirstRowSink({ runId: "run.a", readRowsKey: READ_ROWS_KEY, onRecordBatch: store.onRecordBatch, retire }) };
};

describe("a superseded publication", () => {
  it("withholds this attempt's earlier answer and carried publications while keeping raw captures", async () => {
    const { sink, retired } = setup();
    await sink.fromCall(call("raw"), liveAnswer([item(1)]));
    await sink.publish(answer("step.ready.v1", [item(1)]));
    sink.carried("step.carried.v1");
    sink.carried("read.unrelated");
    await sink.withhold();
    expect(retired).toEqual(["step.ready.v1", "step.carried.v1"]);
    expect(sink.summary("step.ready.v1").rows).toEqual([]);
    expect(sink.summary("read.raw").rows).toEqual([item(1)]);
    await sink.withhold();
    expect(retired).toHaveLength(2);
  });
  it("reports a partial retirement failure, forgets only successful removals, and retries the rest", async () => {
    const { sink, retired } = setup(new Set(["step.second.v1"]));
    sink.carried("step.first.v1");
    sink.carried("step.second.v1");
    sink.carried("step.third.v1");
    expect(sink.publicationState()).toEqual({ version: 1, knownDatasetIds: ["step.first.v1", "step.second.v1", "step.third.v1"], complete: true });
    await expect(sink.withhold()).rejects.toThrow("store unavailable");
    expect(retired).toEqual(["step.first.v1"]);
    expect(sink.publicationState()).toEqual({ version: 1, knownDatasetIds: ["step.second.v1", "step.third.v1"], complete: true });
    await sink.withhold();
    expect(retired).toEqual(["step.first.v1", "step.second.v1", "step.third.v1"]);
    expect(sink.publicationState()).toEqual({ version: 1, knownDatasetIds: [], complete: true });
  });
  it("keeps an unknown tracking gap explicit after retiring its known subset and never scans raw dataset names", async () => {
    const { sink, store, retired } = setup();
    await sink.fromCall(call("raw"), liveAnswer([item(1)]));
    await sink.recordBatch({ ...store.batches[0]!, nodeId: "fixture.raw", datasetId: "step.raw-user-owned", batchKey: "raw-user-owned", writeMode: "replace" });
    sink.carried("step.actual-publication.v1");
    const shown = sink.publicationState();
    shown.knownDatasetIds.length = 0;
    sink.publicationsUnavailable();
    await sink.withhold();
    expect(retired).toEqual(["step.actual-publication.v1"]);
    expect(sink.summary("step.raw-user-owned").rows).toEqual([item(1)]);
    expect(sink.publicationState()).toEqual({ version: 1, knownDatasetIds: [], complete: false });
  });
  it("is retired once the new one is stored, and a capture never is", async () => {
    const { sink, store, retired } = setup();
    await sink.fromCall(call("first"), liveAnswer([item(1)]));
    await sink.publish(answer("step.first.v1", [item(1)]));
    expect(retired).toEqual([]);
    await sink.publish(answer("step.by-hand.v1", [item(2)]));
    expect(retired).toEqual(["step.first.v1"]);
    expect(store.batches.at(-1)?.datasetId).toBe("step.by-hand.v1");
    expect(sink.summary("step.first.v1").totalRows).toBe(0);
    expect(sink.summary("read.first").totalRows).toBe(1);
  });

  it("is retired when a new version of the same step supersedes it, and a publication again under its id is written again", async () => {
    const { sink, store, retired } = setup();
    await sink.publish(answer("step.first.v1", [item(1)]));
    await sink.publish(answer("step.first.v2", [item(1), item(2)]));
    await sink.publish(answer("step.first.v1", [item(1)]));
    expect(retired).toEqual(["step.first.v1", "step.first.v2"]);
    expect(store.batches.map((batch) => batch.datasetId)).toEqual(["step.first.v1", "step.first.v2", "step.first.v1"]);
  });

  it("that the store could not remove is tried again by the next publication, and the result is never lost to it", async () => {
    const { sink, retired } = setup(new Set(["step.first.v1"]));
    await sink.publish(answer("step.first.v1", [item(1)]));
    await expect(sink.publish(answer("step.second.v1", [item(2)]))).resolves.toBeUndefined();
    expect(retired).toEqual([]);
    // The same answer again writes nothing, and still retires what is left over.
    await sink.publish(answer("step.second.v1", [item(2)]));
    expect(retired).toEqual(["step.first.v1"]);
  });

  it("includes a carried-on copy of the earlier segment's publication, and never a carried capture", async () => {
    const { sink, retired } = setup();
    sink.carried("step.first.v1");
    sink.carried("read.first");
    await sink.publish(answer("step.again.v1", [item(1)]));
    expect(retired).toEqual(["step.first.v1"]);
  });

  it("is not retired when the carried publication is the one published again", async () => {
    const { sink, store, retired } = setup();
    sink.carried("step.first.v1");
    await sink.publish(answer("step.first.v1", [item(1)]));
    expect(retired).toEqual([]);
    expect(store.batches.map((batch) => batch.datasetId)).toEqual(["step.first.v1"]);
  });
});
