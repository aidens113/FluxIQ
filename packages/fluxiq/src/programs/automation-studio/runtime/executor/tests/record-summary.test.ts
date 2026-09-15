import { describe, expect, it } from "vitest";
import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, type AutomationStudioRecordBatch } from "../index.ts";
import { automationStudioRecordTraceSummary, isAutomationStudioRecordTraceMarker } from "../record-summary.ts";

function batch(rows: JsonObject[], overrides: Partial<AutomationStudioRecordBatch> = {}): AutomationStudioRecordBatch {
  return {
    nodeId: "extract",
    attemptId: "extract.attempt.1",
    batchKey: "extract.attempt.1",
    datasetId: "products",
    writeMode: "append",
    schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }] },
    rows,
    invalidCount: 0,
    truncated: false,
    ...overrides
  };
}

function syntheticRows(): JsonObject[] {
  return [{ name: "synthetic-row-one" }, { name: "synthetic-row-two" }];
}

const dataset = { $dataset: { datasetId: "products", recordCount: 2 } };
const row = (ordinal: number) => ({ $datasetRow: { datasetId: "products", ordinal } });

describe("the saved trace's record summary", () => {
  it("replaces a captured array and each captured row by identity, wherever they sit", () => {
    const rows = syntheticRows();
    const summary = automationStudioRecordTraceSummary();
    summary.record(batch(rows));
    const trace = {
      status: "succeeded",
      values: { "extract.records": rows, records: rows, first: rows[0] },
      attempts: [{ inputs: { records: rows }, outputs: { records: rows, result: { page: { items: rows } }, items: [rows[1]] } }]
    };

    const saved = summary.apply(trace);

    expect(saved).toEqual({
      status: "succeeded",
      values: { "extract.records": dataset, records: dataset, first: row(1) },
      attempts: [{ inputs: { records: dataset }, outputs: { records: dataset, result: { page: { items: dataset } }, items: [row(2)] } }]
    });
    expect(JSON.stringify(saved)).not.toContain("synthetic-row");
    expect(trace.values.records).toBe(rows);
    expect(isAutomationStudioRecordTraceMarker(saved.values.records)).toBe(true);
    expect(isAutomationStudioRecordTraceMarker(saved.values.first)).toBe(true);
    expect(isAutomationStudioRecordTraceMarker({ $dataset: { datasetId: "products", recordCount: 2 } })).toBe(false);
  });

  it("leaves an array or a row with equal contents but another reference untouched", () => {
    const rows = syntheticRows();
    const summary = automationStudioRecordTraceSummary();
    summary.record(batch(rows));
    const copies = { values: { copy: structuredClone(rows), rowCopy: { ...rows[0] } }, other: { kept: true } };

    expect(summary.apply(copies)).toBe(copies);

    const mixed = { values: { copy: copies.values.copy, records: rows }, other: copies.other };
    const saved = summary.apply(mixed);
    expect(saved.values.copy).toBe(copies.values.copy);
    expect(saved.other).toBe(copies.other);
    expect(saved.values.records).toEqual(dataset);
  });

  it("replaces what a Call Flow child captured once the parent includes it", () => {
    const rows = syntheticRows();
    const child = automationStudioRecordTraceSummary();
    child.record(batch(rows));
    const parent = automationStudioRecordTraceSummary();
    const trace = { attempts: [{ outputs: { rows, kept: rows[1] } }] };

    expect(parent.apply(trace)).toBe(trace);
    parent.include(child.captured());
    expect(parent.apply(trace)).toEqual({ attempts: [{ outputs: { rows: dataset, kept: row(2) } }] });
  });

  it("hands a trace back untouched when nothing was captured", () => {
    const trace = { status: "succeeded", values: { total: 3 }, attempts: [] };

    expect(automationStudioRecordTraceSummary().apply(trace)).toBe(trace);
  });

  it("numbers rows as the dataset store does: append continues per dataset, replace starts again at 1", () => {
    const first = syntheticRows();
    const second: JsonObject[] = [{ name: "synthetic-row-three" }];
    const other: JsonObject[] = [{ name: "synthetic-row-other" }];
    const replaced: JsonObject[] = [{ name: "synthetic-row-replaced" }];
    const summary = automationStudioRecordTraceSummary();
    summary.record(batch(first));
    summary.record(batch(second, { attemptId: "extract.attempt.2" }));
    summary.record(batch(other, { datasetId: "reviews" }));
    summary.record(batch(replaced, { writeMode: "replace" }));

    expect(summary.apply({ rows: [first[1], second[0], other[0], replaced[0]] })).toEqual({
      rows: [row(2), row(3), { $datasetRow: { datasetId: "reviews", ordinal: 1 } }, row(1)]
    });
  });

  it("takes the schema digest and the first ordinal from the stored summary the hook answered", () => {
    const rows = syntheticRows();
    const stored: AutomationStudioRunDatasetSummary = { runId: "run.synthetic", datasetId: "products", nodeIds: ["extract"], schemaDigest: "a".repeat(64), recordCount: 12, truncated: false, invalidCount: 0, updatedAt: 1 };
    const summary = automationStudioRecordTraceSummary();
    summary.record(batch(rows), stored);

    expect(summary.apply({ records: rows, kept: rows })).toEqual({
      records: { $dataset: { datasetId: "products", recordCount: 2, schemaDigest: "a".repeat(64) } },
      kept: { $dataset: { datasetId: "products", recordCount: 2, schemaDigest: "a".repeat(64) } }
    });
    expect(summary.apply({ rows: [rows[0], rows[1]] })).toEqual({ rows: [row(11), row(12)] });
  });

  it("withholds a subtree past the depth bound whole rather than passing a captured row through", () => {
    const rows = syntheticRows();
    const summary = automationStudioRecordTraceSummary();
    summary.record(batch(rows));
    let nested: Record<string, unknown> = { kept: [rows[0]] };
    for (let level = 0; level < 70; level += 1) nested = { next: nested };

    const saved = JSON.stringify(summary.apply(nested));

    expect(saved).not.toContain("synthetic-row");
    expect(saved).toContain(AUTOMATION_STUDIO_WITHHELD_VALUE);
  });
});
