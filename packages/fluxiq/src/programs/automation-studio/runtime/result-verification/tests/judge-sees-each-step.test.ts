// What the post-run check reads of what each step changed in this run (run
// `run-muw5zv4m-52d83027`).
//
// A saved Flow's playback built the exact cart, and both post-run judges
// answered no: one read s9 as opening the "6 Double Rolls" link, ignoring the
// s10 that chose "12 Double Rolls", the other read one "+" press (s11) as a
// quantity of 1. They had status rows and an end view whose header badge is
// stale by design; the build-test judges of the same Flow, shown each step's
// own change, answered yes. Core held every change on the session's trace
// (`stateRefs.stateDiff`) and never showed it. The judge's instruction naming
// the field is pinned in `llm/tests/diagnosis-channel.test.ts`.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";
import { harness, session, verify } from "./run-outcome-harness.ts";
// After the modules under test: loaded first, the llm barrel is met mid-cycle and arrives without its screens.
import { automationStudioLlmRequestEvidenceRefusal } from "../../llm/index.ts";

const DENIED = ["html", "cookies", "selector"];

const nodes: AutomationStudioFlowNode[] = ["s9", "s10", "s11", "s12"].map((id) => ({ id, definitionId: `step.${id}` }));
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow-1", ownerKind: "task", ownerId: "task-1", name: "Pickup cart", nodes,
  edges: [
    { id: "e1", sourceNodeId: "s9", targetNodeId: "s10" },
    { id: "e2", sourceNodeId: "s10", targetNodeId: "s11" },
    { id: "e3", sourceNodeId: "s11", targetNodeId: "s12" }
  ],
  createdAt: 1, updatedAt: 1
};

/** The web domain's diff shape (`state-diff.ts` downstream), as the trace carries it. */
const diff = (fields: { added?: string; removed?: string; locationChanged?: boolean; documentChanged?: boolean; extra?: JsonObject }): JsonObject => ({
  schemaVersion: "web.state-diff.v1",
  beforeStateRef: "state-1",
  afterStateRef: "state-2",
  beforeLocation: "https://shop.example/search",
  afterLocation: fields.locationChanged ? "https://shop.example/item/12" : "https://shop.example/search",
  locationChanged: fields.locationChanged === true,
  ...(fields.documentChanged === undefined ? {} : { documentChanged: fields.documentChanged }),
  titleChanged: false,
  beforeLineCount: 40,
  afterLineCount: 40,
  addedCount: fields.added ? fields.added.split("\n").length : 0,
  removedCount: fields.removed ? fields.removed.split("\n").length : 0,
  added: fields.added ?? "",
  removed: fields.removed ?? "",
  ...(fields.extra ?? {})
});

let clock = 10;
const attempt = (nodeId: string, stateDiff?: JsonObject): AutomationStudioNodeAttemptTrace => ({
  attemptId: `a${clock}`, nodeId, definitionId: `step.${nodeId}`, startedAt: clock++, status: "succeeded",
  inputs: {}, outputs: {}, effects: [], ...(stateDiff ? { stateRefs: { stateDiff } } : {})
});

const S10 = { added: "t912 option \"12 Double Rolls$16.47\" (chosen)", removed: "t912 option \"12 Double Rolls$16.47\"" };
const S11_FIRST = { added: "t931 \"2\"", removed: "t931 \"1\"" };
const S11_SECOND = { added: "t931 \"3\"", removed: "t931 \"2\"" };

const trace = (attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioGraphExecutionTrace => ({ status: "succeeded", startedAt: 1, attempts, values: {}, effects: [] });

/** s9 opens a search link (the page moves), s10 chooses an option, s11 presses "+" twice, s12 reports nothing. */
const runAttempts = (): AutomationStudioNodeAttemptTrace[] => [
  attempt("s9", diff({ locationChanged: true, added: "PAGE \"6 Double Rolls\"\nt901 link \"6 Double Rolls\"", removed: "PAGE \"Search\"" })),
  attempt("s10", diff(S10)),
  attempt("s11", diff(S11_FIRST)),
  attempt("s11", diff(S11_SECOND)),
  attempt("s12")
];

const changedOf = (summary: AutomationStudioRunResultSummary | undefined, nodeId: string): unknown =>
  summary?.flowShape.find((step) => step.nodeId === nodeId)?.changed;

describe("the post-run check is shown what each step changed in this run", () => {
  it("carries each step's change from the session's own trace, in run order, and nothing for a step that moved the page", async () => {
    const context = harness({ answer: "yes" });
    await verify(context, { flow, session: session({ flow, trace: trace(runAttempts()) }), ports: { ...context.ports, deniedEvidenceKeys: DENIED } });
    const sent = context.requests[0]?.context.resultSummary;
    expect(changedOf(sent, "s9")).toBeUndefined();
    expect(changedOf(sent, "s10")).toEqual([S10]);
    // A node run twice keeps each change, in the order it ran.
    expect(changedOf(sent, "s11")).toEqual([S11_FIRST, S11_SECOND]);
    expect(changedOf(sent, "s12")).toBeUndefined();
    expect(sent?.withheld).toBe(false);
    // And the request still leaves: the pre-send evidence check refuses nothing in it.
    expect(automationStudioLlmRequestEvidenceRefusal(context.requests[0]!)).toBeUndefined();
  });

  it("is refused before sending where a change line still carries a locator: the builder and the check drifted", async () => {
    const context = harness({ answer: "yes" });
    await verify(context, { flow, session: session({ flow, trace: trace(runAttempts()) }), ports: { ...context.ports, deniedEvidenceKeys: DENIED } });
    const sent = context.requests[0]!;
    const summary = sent.context.resultSummary!;
    const drifted = { ...sent, context: { ...sent.context, resultSummary: { ...summary, flowShape: summary.flowShape.map((step) => step.nodeId === "s10" ? { ...step, changed: [{ added: "t912 [data-testid=\"qty\"]" }] } : step) } } };
    expect(automationStudioLlmRequestEvidenceRefusal(drifted)).toBe("llm.provider_result_summary_invalid");
  });

  it("carries none without a declaration of denied keys, and says something was withheld", () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, sessionAttempts: runAttempts() });
    expect(summary.flowShape.some((step) => step.changed !== undefined)).toBe(false);
    expect(summary.withheld).toBe(true);
  });

  it("withholds a step whose change holds a denied key or a credential-shaped value, and keeps the others", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [],
      flowNodes: nodes,
      deniedEvidenceKeys: DENIED,
      sessionAttempts: [
        attempt("s10", diff({ ...S10, extra: { cookies: "session=1" } })),
        attempt("s11", diff({ added: "t990 \"sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c\"" })),
        attempt("s12", diff(S11_FIRST))
      ]
    });
    expect(changedOf(summary, "s10")).toBeUndefined();
    expect(changedOf(summary, "s11")).toBeUndefined();
    expect(changedOf(summary, "s12")).toEqual([S11_FIRST]);
    expect(summary.withheld).toBe(true);
  });

  it("redacts a locator-shaped run inside a line rather than sending it", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [],
      flowNodes: nodes,
      deniedEvidenceKeys: DENIED,
      sessionAttempts: [attempt("s10", diff({ added: "t912 [data-testid=\"qty\"] \"2\"" }))]
    });
    expect(changedOf(summary, "s10")).toEqual([{ added: "t912 [locator withheld] \"2\"" }]);
    expect(summary.withheld).toBe(true);
  });

  // The fixture's size buttons rewrite the address in place
  // (`history.replaceState`): the address differs, the document does not, so
  // the step's lines are carried. Only a new document is a page move. A diff
  // recorded before the domain said `documentChanged` keeps the old rule.
  it("carries a step that rewrote the address in the same document, and none for a new document", () => {
    const rewritten = { added: "t912 option \"12 Double Rolls\" (chosen)", removed: "t912 option \"12 Double Rolls\"" };
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [],
      flowNodes: nodes,
      deniedEvidenceKeys: DENIED,
      sessionAttempts: [
        attempt("s9", diff({ ...rewritten, locationChanged: true, documentChanged: false })),
        attempt("s10", diff({ ...S10, locationChanged: false, documentChanged: true })),
        attempt("s11", diff({ ...S11_FIRST, locationChanged: true })),
        attempt("s12", diff({ ...S11_SECOND, locationChanged: false }))
      ]
    });
    expect(changedOf(summary, "s9")).toEqual([rewritten]);
    expect(changedOf(summary, "s10")).toBeUndefined();
    expect(changedOf(summary, "s11")).toBeUndefined();
    expect(changedOf(summary, "s12")).toEqual([S11_SECOND]);
  });
});
