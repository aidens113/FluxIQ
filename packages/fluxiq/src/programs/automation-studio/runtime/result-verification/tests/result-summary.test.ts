import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS } from "../contracts.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";

// What leaves the process for a verification, and what may not.
//
// A verification is one call, so the result it is shown is a count, a column
// list and a handful of rows -- never a dataset. And the rows come off a medium
// Core does not know, so they go through the same screen every other evidence
// slot passes before anything is sent.

const datasetSummary = (fields: Partial<AutomationStudioRunDatasetSummary> = {}): AutomationStudioRunDatasetSummary => ({
  runId: "run-1",
  datasetId: "members",
  nodeIds: ["n2"],
  schemaDigest: "digest",
  recordCount: 240,
  truncated: false,
  invalidCount: 0,
  updatedAt: 1,
  ...fields
});

const schema = (ids: string[]): AutomationStudioRecordSchema => ({
  schemaVersion: "0.1",
  fields: ids.map((id) => ({ id, label: id, valueType: "string" }))
});

const rows = (count: number, value = "Hollis"): JsonObject[] =>
  Array.from({ length: count }, (_row, index) => ({ name: `${value} ${index}`, role: "admin" }));

describe("summarizeAutomationStudioRunResult", () => {
  it("counts every record set and samples only a few rows of the ones it lists", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary(), schema: schema(["name", "role"]), rows: rows(50) }],
      deniedEvidenceKeys: []
    });
    expect(summary.totalRecordCount).toBe(240);
    expect(summary.recordSetCount).toBe(1);
    expect(summary.recordSets[0]?.columns).toEqual(["name", "role"]);
    expect(summary.recordSets[0]?.sampleRows?.length).toBeLessThanOrEqual(AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxSampleRowsPerSet);
    expect(summary.withheld).toBe(true);
  });

  it("carries the Flow's authored shape, which is where a missing filtering step shows", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary(), schema: schema(["name"]), rows: rows(2) }],
      flowNodes: [
        { id: "n1", definitionId: "builtin.navigate" },
        { id: "n2", definitionId: "builtin.policy.action" },
        { id: "n3", definitionId: "builtin.end" }
      ],
      deniedEvidenceKeys: []
    });
    expect(summary.flowShape.map((step) => step.definitionId)).toEqual(["builtin.navigate", "builtin.policy.action", "builtin.end"]);
  });

  it("samples no row at all when no denied-key declaration was made", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary(), schema: schema(["name"]), rows: rows(3) }]
    });
    expect(summary.recordSets[0]?.sampleRows).toBeUndefined();
    expect(summary.recordSets[0]?.recordCount).toBe(240);
  });

  it("drops a sample whose rows carry a key the domain denies", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary(), schema: schema(["name", "innerHtml"]), rows: [{ name: "Hollis", innerHtml: "<div>x</div>" }] }],
      deniedEvidenceKeys: ["inner_html"]
    });
    expect(summary.recordSets[0]?.sampleRows).toBeUndefined();
    expect(summary.withheld).toBe(true);
  });

  it("drops a sample whose rows carry credential-shaped text", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary(), schema: schema(["name", "note"]), rows: [{ name: "Hollis", note: "Authorization: Bearer abcd1234efgh5678ijkl9012" }] }],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.sampleRows).toBeUndefined();
  });

  it("carries only the columns the schema names, cut to a fixed value length, with nested values withheld", () => {
    const long = "x".repeat(AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxValueLength + 40);
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{
        summary: datasetSummary({ recordCount: 1 }),
        schema: schema(["name", "detail"]),
        rows: [{ name: long, detail: { nested: "value" }, notInSchema: "dropped" } as unknown as JsonObject]
      }],
      deniedEvidenceKeys: []
    });
    const sampled = summary.recordSets[0]?.sampleRows?.[0] ?? {};
    expect(Object.keys(sampled)).toEqual(["name", "detail"]);
    expect(String(sampled.name).length).toBe(AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxValueLength + 1);
    expect(sampled.detail).toBe("[withheld]");
  });

  it("stays inside its byte budget by dropping every sample rather than sending a large one", () => {
    const wide = schema(Array.from({ length: 20 }, (_field, index) => `field${index}`));
    const heavyRow: JsonObject = Object.fromEntries(wide.fields.map((field) => [field.id, "y".repeat(110)]));
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [
        { summary: datasetSummary({ datasetId: "a", recordCount: 4 }), schema: wide, rows: [heavyRow, heavyRow, heavyRow, heavyRow] },
        { summary: datasetSummary({ datasetId: "b", recordCount: 4 }), schema: wide, rows: [heavyRow, heavyRow, heavyRow, heavyRow] }
      ],
      deniedEvidenceKeys: []
    });
    expect(Buffer.byteLength(JSON.stringify(summary), "utf8")).toBeLessThanOrEqual(AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxBytes);
    expect(summary.recordSets.every((set) => set.sampleRows === undefined)).toBe(true);
    expect(summary.withheld).toBe(true);
  });
});
