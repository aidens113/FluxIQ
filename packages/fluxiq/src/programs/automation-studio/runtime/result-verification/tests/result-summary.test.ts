import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";

// What leaves the process for a verification, and what may not.
//
// The result is shown whole (2026-09-30, "the model sees the whole page"):
// every record set, every column, every stored row and every value. The rows
// come off a medium Core does not know, so they still go through the screen
// every other evidence slot passes: a denied column is left out, a
// credential-shaped value is replaced by a marker, and no declaration means no
// rows at all.

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
  it("carries every row of every record set it was given, and says nothing was withheld", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ recordCount: 50 }), schema: schema(["name", "role"]), rows: rows(50) }],
      deniedEvidenceKeys: []
    });
    expect(summary.totalRecordCount).toBe(50);
    expect(summary.recordSetCount).toBe(1);
    expect(summary.recordSets[0]?.columns).toEqual(["name", "role"]);
    expect(summary.recordSets[0]?.sampleRows).toEqual(rows(50));
    expect(summary.withheld).toBe(false);
  });

  // The nothing-capped pin: 50 rows by 40 columns, long values, six record
  // sets and sixty steps, all whole.
  it("carries a 50-row by 40-column result whole, every set, every value at full length, and every step", () => {
    const ids = Array.from({ length: 40 }, (_field, index) => `field${index}`);
    const wide = schema(ids);
    const tableRows: JsonObject[] = Array.from({ length: 50 }, (_row, row) => Object.fromEntries(ids.map((id) => [id, `${id} of row ${row} ${"v".repeat(200)}`])));
    const sets = Array.from({ length: 6 }, (_set, index) => ({ summary: datasetSummary({ datasetId: `set${index}`, recordCount: 50 }), schema: wide, rows: tableRows }));
    const summary = summarizeAutomationStudioRunResult({
      recordSets: sets,
      flowNodes: Array.from({ length: 60 }, (_node, index) => ({ id: `n${index}`, definitionId: "web.extract.list", label: `Step ${index} ${"l".repeat(120)}`, parameterValues: { maxRows: index } })),
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets).toHaveLength(6);
    for (const set of summary.recordSets) {
      expect(set.columns).toEqual(ids);
      expect(set.columnsWithheld).toBe(false);
      expect(set.sampleRows).toEqual(tableRows);
    }
    expect(summary.flowShape).toHaveLength(60);
    expect(summary.flowShape.every((step) => step.parameters !== undefined)).toBe(true);
    expect(summary.flowShape[59]?.label).toBe(`Step 59 ${"l".repeat(120)}`);
    expect(summary.flowParametersWithheld).toBeUndefined();
    expect(summary.withheld).toBe(false);
    expect(Buffer.byteLength(JSON.stringify(summary), "utf8")).toBeGreaterThan(400_000);
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

  it("says what each step runs with, full URL included, which is what a definition id alone cannot", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ recordCount: 2 }), schema: schema(["name"]), rows: rows(2) }],
      flowNodes: [
        { id: "n1", definitionId: "builtin.navigate", label: "Open the directory", parameterValues: { url: "https://members.test/list?team=ops", newTab: false } },
        { id: "n2", definitionId: "web.extract.list", parameterValues: { maxRows: 25, where: [{ field: "role", matches: "admin" }] } }
      ],
      deniedEvidenceKeys: []
    });
    const [navigate, extract] = summary.flowShape;
    expect(navigate?.label).toBe("Open the directory");
    expect(navigate?.parameters).toEqual({ url: "https://members.test/list?team=ops", newTab: false });
    expect(navigate?.parametersWithheld).toBeUndefined();
    expect(extract?.parameters?.maxRows).toBe(25);
    expect(extract?.parameters?.where).toEqual({ count: 1, items: [{ field: "role", matches: "admin" }] });
    expect(summary.flowParametersWithheld).toBeUndefined();
  });

  it("carries no step parameters at all when no denied-key declaration was made", () => {
    // The same rule the rows follow: absent means nobody said what this
    // medium's raw payload is called, never "deny nothing".
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ recordCount: 2 }) }],
      flowNodes: [{ id: "n1", definitionId: "builtin.navigate", parameterValues: { url: "https://members.test" } }]
    });
    expect(summary.flowShape[0]?.parameters).toBeUndefined();
    expect(summary.flowParametersWithheld).toBeUndefined();
  });

  it("withholds a denied key and a secret-named value from a step's parameters, and names the paths", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ recordCount: 1 }) }],
      flowNodes: [{ id: "n1", definitionId: "web.output.type", parameterValues: { text: "Hollis", selector: "#name", password: "hunter2", timeoutMs: 5000 } }],
      deniedEvidenceKeys: ["selector"]
    });
    expect(summary.flowShape[0]?.parameters).toEqual({ text: "Hollis", password: null, timeoutMs: 5000 });
    expect(summary.flowShape[0]?.parametersWithheld).toEqual(["selector", "password"]);
    expect(JSON.stringify(summary)).not.toContain("#name");
    expect(JSON.stringify(summary)).not.toContain("hunter2");
  });

  it("carries no row at all when no denied-key declaration was made", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary(), schema: schema(["name"]), rows: rows(3) }]
    });
    expect(summary.recordSets[0]?.sampleRows).toBeUndefined();
    expect(summary.recordSets[0]?.recordCount).toBe(240);
    expect(summary.withheld).toBe(true);
  });

  it("leaves a denied column out of every row and carries the rest", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary(), schema: schema(["name", "innerHtml"]), rows: [{ name: "Hollis", innerHtml: "<div>x</div>" }] }],
      deniedEvidenceKeys: ["inner_html"]
    });
    expect(summary.recordSets[0]?.sampleRows).toEqual([{ name: "Hollis" }]);
    expect(JSON.stringify(summary)).not.toContain("<div>x</div>");
    expect(summary.withheld).toBe(true);
  });

  it("replaces a credential-shaped value with a marker and carries the rest of the row", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary(), schema: schema(["name", "note"]), rows: [{ name: "Hollis", note: "Authorization: Bearer abcd1234efgh5678ijkl9012" }] }],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.sampleRows).toEqual([{ name: "Hollis", note: "[withheld]" }]);
    expect(summary.withheld).toBe(true);
  });

  it("carries only the columns the schema names, each value whole, nested values included", () => {
    const long = "x".repeat(5_000);
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
    expect(sampled.name).toBe(long);
    expect(sampled.detail).toEqual({ nested: "value" });
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

  it("checks the rows it was given to check", () => {
    const good = { address: "9 Mill Lane", price: "£395,000" };
    const checkedRows = [good, good, good, good, good, { address: "12 Dene Road", price: "" }];
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ datasetId: "homes", recordCount: 6 }), schema: homes, rows: checkedRows.slice(0, 4), checkedRows }],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.rowsChecked).toBe(6);
    expect(summary.recordSets[0]?.rowsMissingRequired).toBe(1);
    expect(summary.recordSets[0]?.sampleRows).toHaveLength(4);
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

  it("checks every row it was given, with no bound", () => {
    const row = { address: "9 Mill Lane", price: "" };
    const many = Array.from({ length: 1_250 }, () => row);
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ datasetId: "homes", recordCount: many.length }), schema: homes, checkedRows: many }],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.rowsChecked).toBe(1_250);
    expect(summary.recordSets[0]?.rowsMissingRequired).toBe(1_250);
  });
});
