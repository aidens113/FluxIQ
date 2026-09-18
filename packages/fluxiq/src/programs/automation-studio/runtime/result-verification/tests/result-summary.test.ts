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

describe("the required-value check", () => {
  // Only what the Flow declared counts. The schema below requires `address`
  // and `price` and leaves `listed` optional, which is how a built Flow marks
  // a field its source may not always show.
  const homes: AutomationStudioRecordSchema = {
    schemaVersion: "0.1",
    fields: [
      { id: "address", label: "Address", valueType: "string", required: true },
      { id: "price", label: "Price", valueType: "string", required: true },
      { id: "listed", label: "Listed", valueType: "string" }
    ]
  };

  it("counts a row whose required value is empty or only whitespace, and names the field, never the value", () => {
    // Mutation: treat an empty string as a value. Every row then carries its
    // required fields, `rowsMissingRequired` is 0, and this fails.
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{
        summary: datasetSummary({ datasetId: "homes", recordCount: 3 }),
        schema: homes,
        rows: [
          { address: "4 Kelford Row", price: "" },
          { address: "   ", price: "£410,000" },
          { address: "9 Mill Lane", price: "£395,000" }
        ]
      }],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.rowsChecked).toBe(3);
    expect(summary.recordSets[0]?.rowsMissingRequired).toBe(2);
    expect(summary.recordSets[0]?.missingRequiredColumns).toEqual(["address", "price"]);
    expect(summary.totalRowsMissingRequired).toBe(2);
  });

  it("does not demand a field the schema leaves optional, however many rows lack it", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{
        summary: datasetSummary({ datasetId: "homes", recordCount: 2 }),
        schema: homes,
        rows: [{ address: "4 Kelford Row", price: "£410,000" }, { address: "9 Mill Lane", price: "£395,000", listed: "" }]
      }],
      deniedEvidenceKeys: []
    });
    expect(summary.totalRowsMissingRequired).toBe(0);
    expect(summary.recordSets[0]?.missingRequiredColumns).toEqual([]);
  });

  it("checks the rows it was given to check, not only the few it samples, and still samples only a few", () => {
    const good = { address: "9 Mill Lane", price: "£395,000" };
    const checkedRows = [good, good, good, good, good, { address: "12 Dene Road", price: "" }];
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ datasetId: "homes", recordCount: 6 }), schema: homes, rows: checkedRows.slice(0, 4), checkedRows }],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.rowsChecked).toBe(6);
    expect(summary.recordSets[0]?.rowsMissingRequired).toBe(1);
    expect(summary.recordSets[0]?.sampleRows?.length).toBeLessThanOrEqual(AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxSampleRowsPerSet);
  });

  it("checks whether or not any row may be sampled, since nothing it reads is sent", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ datasetId: "homes", recordCount: 1 }), schema: homes, rows: [{ address: "", price: "£1" }] }]
    });
    expect(summary.recordSets[0]?.sampleRows).toBeUndefined();
    expect(summary.totalRowsMissingRequired).toBe(1);
  });

  it("checks no row of a set whose schema could not be read, rather than passing rows it never compared", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ datasetId: "homes", recordCount: 5 }), rows: [{ address: "" }] }],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.rowsChecked).toBe(0);
    expect(summary.totalRowsMissingRequired).toBe(0);
  });

  it("reads no more than its own bound of rows per set", () => {
    const row = { address: "9 Mill Lane", price: "" };
    const many = Array.from({ length: AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxRowsCheckedPerSet + 50 }, () => row);
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ datasetId: "homes", recordCount: many.length }), schema: homes, checkedRows: many }],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.rowsChecked).toBe(AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxRowsCheckedPerSet);
  });
});
