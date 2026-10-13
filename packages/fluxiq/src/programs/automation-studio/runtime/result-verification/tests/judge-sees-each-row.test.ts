// What a check reads of a step that runs once per row (t475). Lane D round 10
// (`run-mv5tusge-1400ddf7`), trial 1: the check said the Confirm step pressed
// Confirm on all 8 rows, because the step's parameters carried the row it was
// written on -- the listing's first row, one its condition left out -- and
// nothing said which rows it acted on. Each such step now names only the rows
// it acted on, each by its own fields, and the written-on row is left out.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";
import { automationStudioResultStepRows } from "../step-rows.ts";

const DENIED = ["html", "cookies", "selector"];

const confirm: AutomationStudioFlowNode = {
  id: "s9", definitionId: "web.output.dom-click", label: "confirm the request",
  parameterValues: { element: { tagName: "div", accessibleName: "Confirm", context: { listPosition: { index: 1, total: 8 }, record: { text: "Tom Becker1 mutual friend2w" } } } }
};
const nodes: AutomationStudioFlowNode[] = [
  { id: "s7", definitionId: "web.output.extract-list", label: "read the requests" },
  { id: "s8", definitionId: "builtin.control.for-each", label: "each request" },
  confirm,
  { id: "s14", definitionId: "web.output.extract-list", label: "read the accepted requests" }
];
const edges: AutomationStudioFlowEdge[] = [
  { id: "e1", sourceNodeId: "s7", targetNodeId: "s8" },
  { id: "e2", sourceNodeId: "s8", targetNodeId: "s9", sourcePortId: "body" },
  { id: "e3", sourceNodeId: "s9", targetNodeId: "s8" },
  { id: "e4", sourceNodeId: "s8", targetNodeId: "s14", sourcePortId: "done" }
];

let next = 0;
const attempt = (nodeId: string, status: "succeeded" | "failed", extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace =>
  ({ attemptId: `a${++next}`, nodeId, definitionId: nodes.find((node) => node.id === nodeId)!.definitionId, startedAt: next, status, inputs: {}, outputs: {}, effects: [], ...extra });
const pass = (row: JsonObject) => attempt("s8", "succeeded", { route: "body", outputs: { item: row } });

const run: AutomationStudioNodeAttemptTrace[] = [
  attempt("s7", "succeeded"),
  pass({ name: "Amara Osei", mutualFriends: "23 mutual friends", $handle: "t868" }),
  attempt("s9", "succeeded"),
  pass({ name: "Jonas Weber", mutualFriends: "Aisha Khan and 4 other mutual friends" }),
  attempt("s9", "succeeded"),
  pass({ name: "Lin Zhao", mutualFriends: "11 mutual friends" }),
  attempt("s9", "failed"),
  attempt("s9", "succeeded"),
  pass({ name: "Freya Holm", mutualFriends: "5 mutual friends" }),
  attempt("s9", "succeeded", { skipped: { reason: "target_absent", code: "web.target.not_found" } }),
  attempt("s8", "succeeded", { route: "done" }),
  attempt("s14", "succeeded")
];

describe("a check of a step that runs per row", () => {
  it("names the rows the step acted on, each by its own fields, and leaves the written-on row out of its parameters", () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, flowEdges: edges, sessionAttempts: run, deniedEvidenceKeys: DENIED });
    const step = summary.flowShape.find((entry) => entry.nodeId === "s9")!;
    expect(step.rowsActedOn).toEqual([
      { name: "Amara Osei", mutualFriends: "23 mutual friends" },
      { name: "Jonas Weber", mutualFriends: "Aisha Khan and 4 other mutual friends" },
      { name: "Lin Zhao", mutualFriends: "11 mutual friends" }
    ]);
    expect(step.perRow).toContain("the row it was written on is left out");
    expect(step.parameters).toEqual({ element: { tagName: "div", accessibleName: "Confirm", context: {} } });
    expect(JSON.stringify(summary.flowShape)).not.toContain("Tom Becker");
    // Steps outside the loop say nothing of rows.
    expect(summary.flowShape.find((entry) => entry.nodeId === "s14")).not.toHaveProperty("rowsActedOn");
    expect(summary.flowShape.find((entry) => entry.nodeId === "s8")).not.toHaveProperty("rowsActedOn");
  });

  it("keeps the written-on row where no run is summarised, as the build's own shape has no rows to name", () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, flowEdges: edges, deniedEvidenceKeys: DENIED });
    const step = summary.flowShape.find((entry) => entry.nodeId === "s9")!;
    expect(step).not.toHaveProperty("rowsActedOn");
    expect(JSON.stringify(step.parameters)).toContain("Tom Becker");
  });

  it("withholds a row that carries a denied key or a credential shape, and every row without a declaration", () => {
    const secret = [pass({ name: "Amara Osei", cookies: "a=b" }), attempt("s9", "succeeded")];
    const screened = automationStudioResultStepRows({ flowNodes: nodes, flowEdges: edges, attempts: secret, deniedEvidenceKeys: DENIED });
    expect(screened.rows.get("s9")).toEqual(["[withheld]"]);
    expect(screened.withheld).toBe(true);
    const undeclared = automationStudioResultStepRows({ flowNodes: nodes, flowEdges: edges, attempts: run, deniedEvidenceKeys: undefined });
    expect(undeclared.rows.get("s9")).toEqual(["[withheld]", "[withheld]", "[withheld]"]);
  });
});

// t482, lane D round 12 (`run-mv62icw0-070f88ad`, D3): the trace a run saves holds a
// `$datasetRow` marker where each captured row sat, so every pass's row was read as `{}`
// and the judges were shown four empty rows. A marker is read back as the stored row it
// stands for where the stored rows still stand in capture order, and named by its place
// where they do not.
describe("a check of a step that runs per row, over a saved trace's row markers", () => {
  const marker = (ordinal: number) => ({ $datasetRow: { datasetId: "requests", ordinal } });
  const saved: AutomationStudioNodeAttemptTrace[] = [
    attempt("s7", "succeeded"),
    pass(marker(2)), attempt("s9", "succeeded"),
    pass(marker(4)), attempt("s9", "succeeded"),
    attempt("s8", "succeeded", { route: "done" })
  ];
  const stored = ["Tom Becker", "Amara Osei", "Priya Nair", "Jonas Weber"].map((name, index) => ({ name, mutualFriends: `${index + 1} mutual friends` }));
  const recordSet = (processing?: { collected: number; kept: number }) => ({
    summary: { runId: "run-1", datasetId: "requests", nodeIds: ["s7"], schemaDigest: "d", recordCount: stored.length, truncated: false, invalidCount: 0, updatedAt: 1,
      ...(processing ? { processing: { ...processing, duplicates: 0, filteredOut: 0, cut: 0, passes: [] } } : {}) },
    rows: stored
  });
  const withRead = (readSorts: boolean): AutomationStudioFlowNode[] => nodes.map((node) => node.id === "s7"
    ? { ...node, parameterValues: { extractList: { fields: { name: { kind: "text" } }, ...(readSorts ? { sort: [{ field: "name", order: "asc" }] } : {}) } } }
    : node);
  const rowsOf = (sets: ReturnType<typeof recordSet>[], readSorts = false) =>
    summarizeAutomationStudioRunResult({ recordSets: sets, flowNodes: withRead(readSorts), flowEdges: edges, sessionAttempts: saved, deniedEvidenceKeys: DENIED }).flowShape.find((entry) => entry.nodeId === "s9")!.rowsActedOn;

  it("reads each marker back as the stored row it stands for, by its own fields", () => {
    expect(rowsOf([recordSet()])).toEqual([stored[1], stored[3]]);
    // Processed, keeping every row it collected, by a read that declares no sort: still in capture order.
    expect(rowsOf([recordSet({ collected: 4, kept: 4 })])).toEqual([stored[1], stored[3]]);
  });

  it("names the row by its place, never as an empty row or another row, where the stored rows may not stand in capture order", () => {
    const placed = ["row 2 collected into requests", "row 4 collected into requests"];
    expect(rowsOf([recordSet({ collected: 6, kept: 4 })])).toEqual(placed);
    expect(rowsOf([recordSet({ collected: 4, kept: 4 })], true)).toEqual(placed);
    expect(rowsOf([])).toEqual(placed);
  });
});
