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
import { automationStudioBuildTestResultSummary } from "../summary.ts";
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
    expect(summary.buildTest?.stores).toEqual([{
      dataset: DATASET,
      writeMode: "append",
      steps: [6, 7],
      rows: 30,
      labels: [...PAGE_ONE, ...FILTERED],
      repeated: TWICE
    }]);
    // Still a test: nothing was stored, and Core's own counts say so.
    expect(summary).toMatchObject({ totalRecordCount: 0, recordSetCount: 0, recordSets: [] });
    expect(automationStudioLlmRequestEvidenceRefusal(verificationRequest(summary))).toBeUndefined();
  });

  it("leaves out a read whose node stores nothing, and says nothing would be stored when no read does", () => {
    expect(judged({ nodes: nodes(null) }).buildTest?.stores).toEqual([
      { dataset: DATASET, writeMode: "append", steps: [7], rows: 10, labels: FILTERED }
    ]);
    expect(judged({ nodes: nodes(null, null) }).buildTest?.stores).toEqual([]);
  });

  it("counts the rows a read did not list, beside the labels it did", () => {
    const summary = judged({ seven: { ok: true, readRows: { rows: rows(FILTERED.slice(0, 4)), rowsNotShown: 6 } } });
    expect(summary.buildTest?.stores?.[0]).toMatchObject({ rows: 30, labels: [...PAGE_ONE, ...FILTERED.slice(0, 4)], repeated: TWICE.slice(0, 2) });
  });

  it("keeps two datasets apart, in Flow order", () => {
    const summary = judged({ nodes: nodes(recordOutput("append", "earbuds_page_one"), recordOutput("append", "earbuds")) });
    expect(summary.buildTest?.stores).toEqual([
      { dataset: "earbuds_page_one", writeMode: "append", steps: [6], rows: 20, labels: PAGE_ONE },
      { dataset: "earbuds", writeMode: "append", steps: [7], rows: 10, labels: FILTERED }
    ]);
  });

  it("holds only what a replacing write leaves, and says each step's mode when they differ", () => {
    expect(judged({ nodes: nodes(recordOutput("append"), recordOutput("replace")) }).buildTest?.stores).toEqual([
      { dataset: DATASET, writeMode: "append at step 6, replace at step 7", steps: [6, 7], rows: 10, labels: FILTERED }
    ]);
  });

  it("says a label that may not be said as withheld, still counts it, and never calls it repeated", () => {
    const summary = judged({
      six: { ok: true, readRows: { rows: [{ password: "Trevio T5" }, { name: TWICE[0]! }] } },
      seven: { ok: true, readRows: { rows: [{ password: "Kova" }, { name: TWICE[0]! }] } }
    });
    expect(summary.buildTest?.stores).toEqual([{
      dataset: DATASET, writeMode: "append", steps: [6, 7], rows: 4, labels: ["(withheld)", TWICE[0], "(withheld)", TWICE[0]], repeated: [TWICE[0]]
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
