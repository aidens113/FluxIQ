// What the Flow a build proposes would store, as the judge of its test is shown
// it (t274-c3; live run `run-muw60j7c-bb7c9a62`, Stage 6, cause C-3).
//
// That run's Flow held two list reads, draft steps 6 and 7, both appending to
// dataset `web.output.dom-extract_list`: 20 unfiltered page-1 rows, then 10
// filtered rows, so 30 rows were stored and 3 of them twice. The test replayed
// both reads, yet the summary carried no record set, both judges said yes, and
// one wrote "the test stored nothing ..., so the record set is empty".
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmRequestEvidenceRefusal, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioBuildTestResultSummary, type AutomationStudioBuildTestReportInput } from "../summary.ts";
import { DENIED, SITE, navigate, replayed, report, web } from "./draft-steps.ts";

const EARBUDS = "Find wireless Plus earbuds under $50 rated 4 stars or more, not sponsored; leave out accessories such as ear tips.";
const LIST = "web.output.dom-extract_list";
const DATASET = "web.output.dom-extract_list";

/** The three rows both reads returned (run Stage 5: B0PXHP88KT, B0R257NR7U, B0P8ZF57AC). */
const TWICE = ["Trevio T5 Wireless Earbuds, Ivory", "Soundcrest Air Lite Wireless Earbuds", "Kova Beat Mini Wireless Earbuds, Black"];
/** Step 6: one unfiltered page, sponsored rows and the ear tips among them. */
const PAGE_ONE = [
  "Pulsebud Neo Wireless Earbuds (Sponsored)", TWICE[0]!, "Silicone Ear Tips Replacement, 6 Pairs", "Brightaisle Basics Earbuds",
  "Lumo Audio Drift Wireless Earbuds", "Aurelle Pods Fit Wireless Earbuds", TWICE[1]!, "Charging Case Replacement for Pulsebud",
  "Nimbus Go Earbuds (Sponsored)", "Halo Sport Wireless Earbuds", "Vexa Pro Earbuds", TWICE[2]!, "Orbit Mini Earbuds",
  "Fennec ANC Earbuds", "Quill Buds 2", "Ravel Air Earbuds", "Sable Fit Earbuds", "Tidal One Earbuds", "Umbra Lite Earbuds", "Wren Pods"
];
/** Step 7: the filtered read over five pages. */
const FILTERED = [
  TWICE[0]!, "Calyx Air Earbuds", TWICE[1]!, "Delta Pods Max", "Echo Fit Earbuds", TWICE[2]!, "Gale Buds Lite", "Iris Pods", "Juno Air 2", "Kestrel Buds"
];

function read(position: number): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, actionId: LIST,
    input: { node: LIST, parameters: { extractList: { item: { handle: `e${position}` } } } },
    ranWith: { node: LIST, parameters: { extractList: { item: ".card" } } },
    effect: "observe", proposes: true, disposition: "kept", replay: { from: { location: SITE } }
  };
}

const click = (position: number, name: string, step: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep =>
  web(position, "web.output.dom-click", { selector: `button:nth-of-type(${position})`, accessibleName: name }, SITE, { step });

const STEPS = [
  navigate(1),
  click(2, "Decline", { routing: { kind: "optional" } }),
  click(3, "Not now"),
  web(4, "web.output.dom-type", { selector: "input#q", accessibleName: "Search" }, SITE, { parameters: { text: "wireless earbuds" } }),
  click(5, "Search"),
  read(6),
  read(7)
];

const recordOutput = (writeMode: string, datasetId = DATASET): JsonObject => ({
  datasetId, writeMode,
  schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] }
});

const node = (key: string, definitionId: string, parameterValues?: JsonObject): AutomationStudioFlowNode =>
  ({ id: key, definitionId, ...(parameterValues ? { parameterValues } : {}) });

/** The assembled Flow: the optional Decline's merge sits between it and the next step, as `s3`. */
function nodes(six: JsonObject | null = recordOutput("append"), seven: JsonObject | null = recordOutput("append")): AutomationStudioFlowNode[] {
  return [
    node("s1", "web.output.browser-navigate"), node("s2", "web.output.dom-click"), node("s3", "builtin.control.merge"),
    node("s4", "web.output.dom-click"), node("s5", "web.output.dom-type"), node("s6", "web.output.dom-click"),
    node("s7", LIST, { extractList: { item: ".card", paginate: { maxPages: 1 } }, recordOutput: six }),
    node("s8", LIST, { extractList: { item: ".card", paginate: { maxPages: 5 } }, recordOutput: seven })
  ];
}

const rows = (labels: readonly string[]): JsonObject[] => labels.map((name) => ({ name }));

function judged(input: { nodes?: AutomationStudioFlowNode[]; six?: JsonObject; seven?: JsonObject } = {}): AutomationStudioRunResultSummary {
  const six: JsonValue = input.six ?? { ok: true, said: "the step ran again: kept 20 rows from 1 page, stopped on page_limit", readRows: { rows: rows(PAGE_ONE) } };
  const seven: JsonValue = input.seven ?? { ok: true, said: "the step ran again: kept 10 rows from 5 pages, stopped on control_disabled", readRows: { rows: rows(FILTERED) } };
  return automationStudioBuildTestResultSummary({
    steps: STEPS,
    report: report(STEPS.map(replayed), [[STEPS[5]!, six], [STEPS[6]!, seven]]),
    nodes: input.nodes ?? nodes(),
    instructionText: EARBUDS,
    startLocation: SITE,
    deniedEvidenceKeys: [...DENIED, "password"]
  });
}

describe("what the Flow a build proposes would store, as its test's reads filled it", () => {
  it("run-muw60j7c's two reads into one dataset: 30 rows, every label in order, the three stored twice", () => {
    const summary = judged();
    // Labels alone: the answer is the collected rows as they came, and nothing says what it removed.
    expect(summary.buildTest?.stores).toEqual([{
      dataset: DATASET,
      writeMode: "append",
      steps: [6, 7],
      passes: 2,
      collected: 30,
      answer: { rows: 30, labels: [...PAGE_ONE, ...FILTERED] },
      repeated: TWICE
    }]);
    // Still a test: nothing was stored, and Core's own counts say so.
    expect(summary).toMatchObject({ totalRecordCount: 0, recordSetCount: 0, recordSets: [] });
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("leaves out a read whose node stores nothing, and says nothing would be stored when no read does", () => {
    expect(judged({ nodes: nodes(null) }).buildTest?.stores).toEqual([
      { dataset: DATASET, writeMode: "append", steps: [7], passes: 1, collected: 10, answer: { rows: 10, labels: FILTERED } }
    ]);
    expect(judged({ nodes: nodes(null, null) }).buildTest?.stores).toEqual([]);
  });

  it("counts the rows a read did not list, beside the labels it did", () => {
    const summary = judged({ seven: { ok: true, readRows: { rows: rows(FILTERED.slice(0, 4)), rowsNotShown: 6 } } });
    expect(summary.buildTest?.stores?.[0]).toMatchObject({ collected: 30, answer: { rows: 30, labels: [...PAGE_ONE, ...FILTERED.slice(0, 4)] }, repeated: TWICE.slice(0, 2) });
  });

  it("keeps two datasets apart, in Flow order", () => {
    const summary = judged({ nodes: nodes(recordOutput("append", "earbuds_page_one"), recordOutput("append", "earbuds")) });
    expect(summary.buildTest?.stores).toEqual([
      { dataset: "earbuds_page_one", writeMode: "append", steps: [6], passes: 1, collected: 20, answer: { rows: 20, labels: PAGE_ONE } },
      { dataset: "earbuds", writeMode: "append", steps: [7], passes: 1, collected: 10, answer: { rows: 10, labels: FILTERED } }
    ]);
  });

  it("holds only what a replacing write leaves, and says each step's mode when they differ", () => {
    expect(judged({ nodes: nodes(recordOutput("append"), recordOutput("replace")) }).buildTest?.stores).toEqual([
      { dataset: DATASET, writeMode: "append at step 6, replace at step 7", steps: [6, 7], passes: 2, collected: 10, answer: { rows: 10, labels: FILTERED } }
    ]);
  });

  it("says a label that may not be said as withheld, still counts it, and never calls it repeated", () => {
    const summary = judged({
      six: { ok: true, readRows: { rows: [{ password: "Trevio T5" }, { name: TWICE[0]! }] } },
      seven: { ok: true, readRows: { rows: [{ password: "Kova" }, { name: TWICE[0]! }] } }
    });
    expect(summary.buildTest?.stores).toEqual([{
      dataset: DATASET, writeMode: "append", steps: [6, 7], passes: 2, collected: 4,
      answer: { rows: 4, labels: ["(withheld)", TWICE[0], "(withheld)", TWICE[0]] }, repeated: [TWICE[0]]
    }]);
    expect(summary.withheld).toBe(true);
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("says nothing of storing when the Flow's nodes are not known, or no test ran", () => {
    expect(judged({ nodes: [] }).buildTest?.stores).toBeUndefined();
    const untested = automationStudioBuildTestResultSummary({ steps: STEPS, nodes: nodes(), instructionText: EARBUDS, startLocation: SITE, deniedEvidenceKeys: DENIED });
    expect(untested.buildTest?.stores).toBeUndefined();
  });
});

// Read-list design 5.1: a list read reads one page, and a do-while (Merge ->
// Repeat -> read -> Next page) pages. Every pass appends to the read's dataset,
// and the run's end makes the dataset's answer (`processAutomationStudioRecordRows`):
// the whole row once, then the read's own `process`. The judge is shown that
// answer, not the raw appends, so page 2 opening with page 1's last row is no
// row stored twice.
describe("what a paging Flow would store: the answer its run's end makes", () => {
  const loopRead = (): AutomationStudioFlowDraftStep => ({ ...read(2), routing: { kind: "repeat", through: "d3", while: "d3" } });
  const LOOP = [navigate(1), loopRead(), click(3, "Next page")];
  const output = (writeMode: string, process?: JsonObject): JsonObject => ({
    datasetId: DATASET, writeMode, recordsPath: "records",
    schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }, { id: "url", label: "Link", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] },
    ...(process ? { process } : {})
  });
  /** The assembled do-while: the Merge the loop comes back to and the Repeat node sit between the navigate and the read. */
  const loopNodes = (writeMode = "append", process?: JsonObject): AutomationStudioFlowNode[] => [
    node("s1", "web.output.browser-navigate"), node("s2", "builtin.control.merge"), node("s3", "builtin.control.repeat"),
    node("s4", LIST, { extractList: { item: ".card" }, recordOutput: output(writeMode, process) }), node("s5", "web.output.dom-click")
  ];
  const item = (name: string, price: string, url = `https://shop.test/${name.toLowerCase().replace(/\W+/gu, "-")}`): JsonObject => ({ name, url, price });
  const PAGE_1 = [item("Trevio T5", "$39"), item("Soundcrest Air", "$29"), item("Kova Beat", "$45")];
  // Page 2 opens with page 1's last row: the site shifted its list between the two reads.
  const PAGE_2 = [item("Kova Beat", "$45"), item("Calyx Air", "$19"), item("Delta Pods", "$49")];
  /** One pass's observations: the read with its stored rows (and their labels unless `labels` is false), then Next page. */
  const pass = (n: number, records: JsonObject[], labels = true): AutomationStudioBuildTestReportInput["observations"] => [
    { step: 2, stepId: "d2", evidence: { ok: true, ...(labels ? { readRows: { rows: records.map((record) => ({ name: record.name! })) } } : {}) }, records, pass: n, of: 2 },
    { step: 3, stepId: "d3", evidence: { ok: true }, pass: n, of: 2 }
  ];
  const stores = (input: { nodes?: AutomationStudioFlowNode[]; observations?: AutomationStudioBuildTestReportInput["observations"] } = {}) =>
    automationStudioBuildTestResultSummary({
      steps: LOOP,
      report: { verdict: { outcomes: LOOP.map(replayed) }, observations: input.observations ?? [...pass(1, PAGE_1), ...pass(2, PAGE_2)], reused: false },
      nodes: input.nodes ?? loopNodes(),
      instructionText: EARBUDS,
      startLocation: SITE,
      deniedEvidenceKeys: DENIED
    }).buildTest?.stores;
  const names = (rows: readonly JsonObject[]): string[] => rows.map((row) => row.name as string);

  it("two pages with a boundary repeat: the answer holds every row once, and nothing is called stored twice", () => {
    expect(stores()).toEqual([{
      dataset: DATASET, writeMode: "append", steps: [2], passes: 2, collected: 6,
      answer: { rows: 5, labels: names([...PAGE_1, ...PAGE_2.slice(1)]) },
      removed: { duplicates: 1, filteredOut: 0, cut: 0 }
    }]);
  });

  it("applies the read's declared process across every pass: dedupe by link, sort, limit", () => {
    // Page 2 lists Soundcrest again under another name, at the same link.
    const page2 = [item("Soundcrest Air (2 pack)", "$29", PAGE_1[1]!.url as string), item("Calyx Air", "$19"), item("Delta Pods", "$49")];
    const process = { dedupe: { by: ["url"] }, sort: [{ field: "price", order: "asc", as: "number" }], limit: 3 };
    expect(stores({ nodes: loopNodes("append", process), observations: [...pass(1, PAGE_1), ...pass(2, page2)] })?.[0]).toEqual({
      dataset: DATASET, writeMode: "append", steps: [2], passes: 2, collected: 6,
      answer: { rows: 3, labels: ["Calyx Air", "Soundcrest Air", "Trevio T5"] },
      removed: { duplicates: 1, filteredOut: 0, cut: 2 }
    });
  });

  it("a replacing read keeps only the last pass's rows", () => {
    expect(stores({ nodes: loopNodes("replace") })?.[0]).toMatchObject({
      writeMode: "replace", passes: 2, collected: 3, answer: { rows: 3, labels: names(PAGE_2) }, removed: { duplicates: 0, filteredOut: 0, cut: 0 }
    });
  });

  it("says when the reads collected rows and the answer keeps none of them", () => {
    const process = { where: [{ field: "price", lessThan: 5 }] };
    expect(stores({ nodes: loopNodes("append", process) })?.[0]).toEqual({
      dataset: DATASET, writeMode: "append", steps: [2], passes: 2, collected: 6,
      answer: { rows: 0, labels: [] }, removed: { duplicates: 0, filteredOut: 6, cut: 0 }, keptNone: true
    });
  });

  it("an answer row the read did not name counts and has no label", () => {
    expect(stores({ observations: [...pass(1, PAGE_1, false), ...pass(2, PAGE_2)] })?.[0]).toMatchObject({
      collected: 6, answer: { rows: 5, labels: names(PAGE_2.slice(1)) }, removed: { duplicates: 1 }
    });
  });

  it("cannot make the answer from labels alone: it is the collected rows as they came, and says so by leaving out removed", () => {
    const labelsOnly = [...pass(1, PAGE_1), ...pass(2, PAGE_2)].map(({ records: _records, ...rest }) => rest);
    expect(stores({ observations: labelsOnly })).toEqual([{
      dataset: DATASET, writeMode: "append", steps: [2], passes: 2, collected: 6,
      answer: { rows: 6, labels: names([...PAGE_1, ...PAGE_2]) }, repeated: ["Kova Beat"]
    }]);
  });
});

function verificationRequest(summary: AutomationStudioRunResultSummary): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "request.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "loop_verification",
    promptVersion: "automation-studio.loop-verification.v1",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: [...DENIED, "password"],
    context: {
      schemaVersion: "0.1",
      taskKind: "loop_verification",
      promptVersion: "automation-studio.loop-verification.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 },
      resultSummary: summary
    }
  };
}
