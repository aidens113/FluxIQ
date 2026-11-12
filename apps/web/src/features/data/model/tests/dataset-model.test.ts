import { describe, expect, it } from "vitest";
import { ANY_DATASET_FILTER, datasetFlowOptions, filterDatasets, shapeDatasetRow, type DatasetRow } from "../index";

const row = (over: Partial<DatasetRow>): DatasetRow => ({ projectId: "p", flowId: "f1", flowName: "Flow one", runId: "r", datasetId: "d", name: "Prices", rowCount: 1, collectedAt: 1, runCount: 1, truncated: false, ...over });

describe("dataset model", () => {
  it("uses the id when a table has no label and drops summaries it cannot link", () => {
    const raw = { flowId: "f", datasetId: "d9", latestRunId: "r", latestUpdatedAt: 3, latestRecordCount: 4 };
    expect(shapeDatasetRow(raw, "p", new Map())).toMatchObject({ name: "d9", flowName: "A Flow", rowCount: 4, runCount: 1 });
    expect(shapeDatasetRow({ ...raw, latestRunId: undefined }, "p", new Map())).toBeUndefined();
  });
  it("filters by Flow and text, newest first", () => {
    const rows = [row({ datasetId: "a", collectedAt: 1 }), row({ datasetId: "b", name: "Reviews", collectedAt: 9 }), row({ datasetId: "c", flowId: "f2", flowName: "Other", collectedAt: 5 })];
    expect(filterDatasets(rows, ANY_DATASET_FILTER).map((r) => r.datasetId)).toEqual(["b", "c", "a"]);
    expect(filterDatasets(rows, { flowId: "f1", search: "" }).map((r) => r.datasetId)).toEqual(["b", "a"]);
    expect(filterDatasets(rows, { flowId: "any", search: " REVIEW " }).map((r) => r.datasetId)).toEqual(["b"]);
    expect(filterDatasets(rows, { flowId: "any", search: "other" }).map((r) => r.datasetId)).toEqual(["c"]);
  });
  it("lists each Flow once, by name", () => {
    expect(datasetFlowOptions([row({}), row({ flowId: "f0", flowName: "Alpha" }), row({})])).toEqual([{ flowId: "f0", name: "Alpha" }, { flowId: "f1", name: "Flow one" }]);
  });
});
