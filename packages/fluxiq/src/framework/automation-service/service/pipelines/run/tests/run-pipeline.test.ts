import { describe, expect, it } from "vitest";
import { context, datasetPort, fakeCaller } from "../../tests/support.ts";
import { runPipeline } from "../run-pipeline.ts";

describe("runPipeline sources", () => {
  it("reads a stored dataset, with a read lineage per row, and sinks to a dataset", async () => {
    const store = datasetPort();
    const readDataset = async () => [{ n: 1 }, { n: 2 }];
    const outcome = await runPipeline(
      { name: "demo.copy", source: { kind: "dataset", dataset: { datasetId: "ds-in" } }, steps: [{ id: "keep", kind: "filter", where: { op: "gt", args: [{ field: "n" }, { value: 1 }] } }, { id: "save", kind: "sink", to: { kind: "dataset", name: "out" } }] },
      context({ readDataset, writeDataset: store.write })
    );
    expect(outcome.records.map((record) => record.data)).toEqual([{ n: 2 }]);
    expect(outcome.records[0]?.lineage[0]).toMatchObject({ stepId: "source", source: { kind: "read", readId: "ds-in:1" } });
    expect(outcome.datasets).toEqual([{ datasetId: "ds-out", name: "out", rowCount: 1 }]);
  });

  it("calls a source Flow and keeps its lineage for each record", async () => {
    const caller = async () => ({
      outputs: [{ title: "a" }, { title: "b" }],
      lineage: [{ pointer: "/1/title", runId: "child", stepId: "read-title", source: { kind: "read" as const, readId: "r-9" } }]
    });
    const outcome = await runPipeline({ name: "demo.list", source: { kind: "flow", target: { flowId: "flow-list" } }, steps: [{ id: "all", kind: "limit", count: 5 }] }, context({ callFlow: caller }));
    expect(outcome.records[1]?.lineage).toEqual([{ pointer: "/title", runId: "child", stepId: "read-title", source: { kind: "read", readId: "r-9" } }]);
    expect(outcome.records[0]?.lineage[0]?.source).toEqual({ kind: "read", readId: "run-1:source:0" });
  });

  it("marks input records with the pointer they came from, and refuses a source that is not records", async () => {
    const outcome = await runPipeline({ name: "demo.in", source: { kind: "input", field: "rows" }, steps: [{ id: "all", kind: "limit", count: 5 }] }, context({}, { rows: [{ a: 1 }] }));
    expect(outcome.records[0]?.lineage[0]?.source).toEqual({ kind: "input", pointer: "/rows/0" });
    await expect(runPipeline({ name: "demo.in", source: { kind: "input", field: "rows" }, steps: [{ id: "all", kind: "limit", count: 5 }] }, context({}, { rows: [1] }))).rejects.toMatchObject({ code: "pipeline.source_not_records" });
  });

  it("maps over a source Flow result without a model", async () => {
    const fake = fakeCaller();
    const caller: typeof fake.caller = async (target, inputs, signal) => (("flowId" in target && target.flowId === "flow-list") ? { outputs: [{ n: 1 }, { n: 2 }], lineage: [] } : fake.caller(target, inputs, signal));
    const outcome = await runPipeline(
      { name: "demo.two", source: { kind: "flow", target: { flowId: "flow-list" } }, steps: [{ id: "twice", kind: "map", target: { fluxNode: "demo.double" }, inputs: { n: { field: "n" } } }] },
      context({ callFlow: caller })
    );
    expect(outcome.records.map((record) => record.data["result"])).toEqual([{ doubled: 2 }, { doubled: 4 }]);
  });
});
