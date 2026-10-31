import { describe, expect, it, vi } from "vitest";
import { processAutomationStudioRecordRows, type AutomationStudioRecordSchema, type AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";
import { automationStudioResultOrderFact } from "../computed-facts/index.ts";
import { automationStudioResultOrderClaimContradicted } from "../value-readings/index.ts";
import { automationStudioResultVerificationNoRecord } from "../agreement/index.ts";
import { automationStudioResultVerdict } from "../verdict/index.ts";
import { ANSWER, flow, harness, instruction, session, verify } from "./run-outcome-harness.ts";

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

describe("each record set's processing account", () => {
  // Read-list design 5.2: a record set is the answer, and says how the rows it collected became it.
  it("carries each set's processing account, and none for a set the run did not process", () => {
    const processing = {
      collected: 15, duplicates: 2, filteredOut: 0, cut: 0, kept: 13,
      passes: [{ node: "read", pass: 1, rows: 3, newRows: 3 }, { node: "read", pass: 2, rows: 4, newRows: 2 }]
    };
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [
        { summary: datasetSummary({ datasetId: "answer", recordCount: 13, processing }), schema: schema(["name"]), rows: rows(13) },
        { summary: datasetSummary({ datasetId: "unprocessed", recordCount: 2 }), schema: schema(["name"]), rows: rows(2) }
      ],
      deniedEvidenceKeys: []
    });
    expect(summary.recordSets[0]?.processing).toEqual(processing);
    expect(summary.recordSets[0]?.processing).not.toBe(processing);
    expect(summary.recordSets[1]).not.toHaveProperty("processing");
    const none = summarizeAutomationStudioRunResult({
      recordSets: [{ summary: datasetSummary({ recordCount: 0, processing: { collected: 4, duplicates: 0, filteredOut: 4, cut: 0, kept: 0, keptNone: true, passes: [] } }) }]
    });
    expect(none.recordSets[0]?.processing).toMatchObject({ kept: 0, keptNone: true, filteredOut: 4 });
  });

  // t493, live run `run-mv6bg8d8-1a461436`: the account said `filteredOut: 5` and never which rows.
  it("names, per where condition, the rows it alone left out by label, screened as stored rows are, and only under a declaration", () => {
    const processing = {
      collected: 4, duplicates: 0, filteredOut: 3, cut: 0, kept: 1, passes: [{ node: "read", pass: 1, rows: 4, newRows: 4 }],
      conditions: [
        { field: "name", condition: "name not contains \"Dock\"", rejected: 2, alone: 2, leftOutOnlyByThis: [{ field: "name", label: "Trail Watch 2 with Charging Dock" }, { field: "secretNote", label: "Trail Watch Kids" }] },
        { field: "price", condition: "price lessThan 50", rejected: 1, alone: 1, leftOutOnlyByThis: [{ field: "name", label: "Trail Watch Pro" }] },
        { field: "secretNote", condition: "secretNote is absent", rejected: 0, alone: 0, leftOutOnlyByThis: [] }
      ]
    };
    const input = { summary: datasetSummary({ recordCount: 1, processing }), schema: schema(["name", "price", "secretNote"]), rows: rows(1) };
    const summarized = summarizeAutomationStudioRunResult({ recordSets: [input], deniedEvidenceKeys: ["secretNote"] });
    const shown = summarized.recordSets[0]?.processing;
    expect(shown?.conditions).toEqual([
      { number: 1, condition: "name not contains \"Dock\"", rejected: 2, alone: 2, leftOutOnlyByThis: ["Trail Watch 2 with Charging Dock", "(withheld)"] },
      { number: 2, condition: "price lessThan 50", rejected: 1, alone: 1, leftOutOnlyByThis: ["Trail Watch Pro"] },
      { number: 3, rejected: 0, alone: 0 }
    ]);
    expect(summarized.withheld).toBe(true);
    expect(shown).toMatchObject({ collected: 4, filteredOut: 3, kept: 1 });
    // The first condition tested the label of every row it names but the withheld one, whose label came from another column.
    const single = summarizeAutomationStudioRunResult({ recordSets: [{ ...input, summary: datasetSummary({ recordCount: 1, processing: { ...processing, conditions: [{ ...processing.conditions[0]!, leftOutOnlyByThis: [processing.conditions[0]!.leftOutOnlyByThis[0]!] }] } }) }], deniedEvidenceKeys: [] });
    expect(single.recordSets[0]?.processing?.conditions?.[0]).toMatchObject({ leftOutOnlyByThis: ["Trail Watch 2 with Charging Dock"], testedLabel: true });
    expect(processing.conditions[0]!.leftOutOnlyByThis[0]).toEqual({ field: "name", label: "Trail Watch 2 with Charging Dock" });
    // No declaration, no row and no wording: absent means nobody said.
    const undeclared = summarizeAutomationStudioRunResult({ recordSets: [input] }).recordSets[0]?.processing;
    expect(undeclared?.conditions).toEqual([{ number: 1, rejected: 2, alone: 2 }, { number: 2, rejected: 1, alone: 1 }, { number: 3, rejected: 0, alone: 0 }]);
  });
});

// A run's summary flags a read that kept every item it saw after an act over a
// narrower read of the same list (t692, `../result-summary.ts`), from the
// Flow's edges, which say what list a loop walks: the judge is shown the flag
// beside that read. A shop's returns desk: the returns of at most 50 are
// approved, then the returns list is read with no condition.
describe("a run summary's reads after an act over a narrower read (t692)", () => {
  const nodes: AutomationStudioFlowNode[] = [
    { id: "s3", definitionId: "unit.list", parameterValues: { list: { item: "returns", fields: { title: { kind: "text" } }, where: [{ field: "amount", atMost: 50 }] } } },
    { id: "s4", definitionId: "builtin.control.for-each" },
    { id: "s5", definitionId: "unit.press", metadata: { declaredConsequences: ["modify_existing"] } },
    { id: "s7", definitionId: "unit.list", parameterValues: { list: { item: "returns", fields: { title: { kind: "text" } } } } }
  ];
  const edges: AutomationStudioFlowEdge[] = [
    { id: "e1", sourceNodeId: "s3", sourcePortId: "records", targetNodeId: "s4", targetPortId: "items" },
    { id: "e2", sourceNodeId: "s4", sourcePortId: "body", targetNodeId: "s5" },
    { id: "e3", sourceNodeId: "s5", targetNodeId: "s4" },
    { id: "e4", sourceNodeId: "s4", sourcePortId: "done", targetNodeId: "s7" }
  ];
  let order = 0;
  const attempt = (nodeId: string, extra: Partial<AutomationStudioFlowRunActionAttemptRecord> = {}): AutomationStudioFlowRunActionAttemptRecord =>
    ({ attemptId: `a${++order}`, nodeId, definitionId: nodes.find((node) => node.id === nodeId)!.definitionId, order, status: "succeeded", startedAt: order, ...extra });
  const read = (seen: number, kept: number, rejected?: number[]) => ({ metadata: { extraction: { recordCount: kept, pagesRead: 1, truncated: false, itemsSeen: seen, ...(rejected ? { conditions: { applied: seen, kept, rejected } } : {}) } } });
  const actionAttempts = [attempt("s3", read(7, 3, [4])), attempt("s4", { route: "body" }), attempt("s5"), attempt("s4", { route: "done" }), attempt("s7", read(7, 7))];

  it("flag the read that kept every item after an act over a narrower read of the same list, given the Flow's edges", () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, flowEdges: edges, actionAttempts, deniedEvidenceKeys: [] });
    expect(summary.reads?.find((entry) => entry.nodeId === "s7")?.keptEveryRow).toMatchObject({ narrowerRead: "s3", narrowerSeen: 7, narrowerKept: 3, actedBy: ["s5"] });
    expect(summary.reads?.find((entry) => entry.nodeId === "s3")).not.toHaveProperty("keptEveryRow");
  });

  it("flag nothing where the caller gives no edges", () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, actionAttempts, deniedEvidenceKeys: [] });
    expect(summary.reads?.some((entry) => entry.keptEveryRow)).toBe(false);
  });
});

describe("the execution's reference date in result verification", () => {
  const START = Date.UTC(2026, 9, 31, 23, 59);
  const LATER = Date.UTC(2026, 10, 1, 0, 1);
  const schema: AutomationStudioRecordSchema = {
    schemaVersion: "0.1", fields: ["title", "starts"].map((id) => ({ id, label: id, valueType: "string" as const }))
  };

  const where = [{ field: "starts", atLeast: "today", as: "date" as const }];
  const process = { where, sort: [{ field: "starts", order: "desc" as const, as: "date" as const }] };
  const rows: JsonObject[] = [{ title: "Workshop", starts: "Today" }];
  const node: AutomationStudioFlowNode = {
    id: "read", definitionId: "catalog.read-events",
    parameterValues: {
      extractList: { item: ".event", fields: { title: { kind: "text" }, starts: { kind: "text" } }, where },
      recordOutput: { datasetId: "events", schema, process }
    }
  };
  const attempt: AutomationStudioFlowRunActionAttemptRecord = {
    attemptId: "read.1", nodeId: "read", definitionId: node.definitionId, order: 1, status: "succeeded", startedAt: START,
    metadata: { extraction: {
      recordCount: 1, pagesRead: 1, truncated: false, itemsSeen: 2,
      conditions: { applied: 2, kept: 1, rejected: [1], alone: [1], unfiltered: false, aloneRows: [[{ title: "Seminar", starts: "2026-10-31 12:00" }]] }
    } }
  };

  function summary(referenceNow: number, now?: number) {
    const made = processAutomationStudioRecordRows({ rows: rows.map((values) => ({ values, nodeId: "read", batchKey: "one" })), schema, process, now: START });
    return summarizeAutomationStudioRunResult({
      recordSets: [{ schema, rows, summary: datasetSummary({ datasetId: "events", recordCount: 1, processing: made.account }) }],
      flowNodes: [node], actionAttempts: [attempt], deniedEvidenceKeys: [], referenceNow, ...(now !== undefined ? { now } : {})
    });
  }

  it("rejudges a normal run against its persisted session start on a later day", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(LATER);
    const context = harness({ answer: ANSWER.yes, schema, rows,
      datasets: [datasetSummary({ datasetId: "events", recordCount: 1 })], instructions: [instruction("List the events.")] });
    const run = { session: session({ startedAt: START }), flow: { ...flow, nodes: [node] } };
    try {
      await verify(context, run);
      clock.mockReturnValue(LATER + 86_400_000);
      await verify(context, run);
      expect(context.requests.length).toBeGreaterThanOrEqual(2);
      expect(context.requests.every((request) => request.context.resultSummary?.referenceNow === START)).toBe(true);
      expect(context.requests[0]?.context.resultSummary?.recordSets[0]?.sortRead?.[0]?.said).toContain('"Today" as 2026-10-31');
    } finally { clock.mockRestore(); }
  });

  it("anchors read and saved-answer values and left-out settlement before a later midnight", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(LATER);
    try {
      const result = summary(START);
      expect(result.referenceNow).toBe(START);
      expect(result.reads?.[0]?.conditions?.[0]?.valuesRead).toContain('kept "Workshop": starts read as 2026-10-31 23:59 UTC from "Today"');
      // This absolute row meets the original bound: a later day must not make its exclusion seem justified.
      expect(result.reads?.[0]?.conditions?.[0]?.leftOutSettled).toBeUndefined();
      expect(result.recordSets[0]?.processing?.conditions?.[0]?.valuesRead).toContain('kept "Workshop": starts read as 2026-10-31 23:59 UTC from "Today"');
      expect(summary(LATER).reads?.[0]?.conditions?.[0]?.leftOutSettled).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });

  it("preserves an explicit numeric now override and ignores malformed reference metadata", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(LATER);
    try {
      expect(summary(START, LATER).referenceNow).toBe(LATER);
      for (const invalid of [NaN, Infinity, -1, 1.5, 8.64e15 + 1]) expect(summary(invalid).referenceNow).toBe(LATER);
    } finally {
      clock.mockRestore();
    }
  });

  it("uses the same reference for inferred date order and a judge's contradictory order claim", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(LATER);
    try {
      const result = summarizeAutomationStudioRunResult({
        recordSets: [{ schema, rows: [{ title: "Seminar", starts: "2026-11-01 00:00" }, { title: "Workshop", starts: "Today" }], summary: datasetSummary({ datasetId: "events", recordCount: 2 }) }],
        deniedEvidenceKeys: [], referenceNow: START
      });
      const requestText = "List the events, newest first.";
      expect(automationStudioResultOrderFact({ summary: result, requestText, instructions: [] })).toMatchObject([{ kind: "order", status: "holds" }]);
      expect(automationStudioResultOrderClaimContradicted("The events are not newest first.", result.recordSets, result.referenceNow)).toBe(true);
      expect(automationStudioResultOrderClaimContradicted("The events are not newest first.", result.recordSets, LATER)).toBe(false);
      const first = automationStudioResultVerdict({ summary: result, basis: "model", diagnosis: { answersRequest: "no", observed: "The events are not newest first." } });
      const record = automationStudioResultVerificationNoRecord({ summary: result, requestText, first });
      expect(record?.other?.("The events are not newest first.")?.refuted).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
});
