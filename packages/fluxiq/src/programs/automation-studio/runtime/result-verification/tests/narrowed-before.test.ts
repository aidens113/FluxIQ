// What a judge is shown of the steps that acted on the page before a read
// (t482, lane C rounds 10 and 12: `run-mv5uu9g1-9d80deea`, `run-mv62icw3-9118516f`).
//
// A Flow pressed a site filter whose band kept less than the request asked,
// then read the list. The press went to another page, so `flowShape[].changed`
// skipped it, and the rows it removed never reached the read, so no condition's
// `leftOutOnlyByThis` named them: every judge said yes over a short result.
// Each read now names those steps (`narrowedBefore`), and the judge's request
// carries them. The fixture is a library catalogue, not a Lab scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import { automationStudioResultNarrowedBefore } from "../narrowed-before.ts";
import { summarizeAutomationStudioRunResult } from "../result-summary.ts";
import { verifyAutomationStudioRunResult } from "../verify.ts";
import { datasetSummary, instruction, provider } from "./run-outcome-harness.ts";

const DENIED = ["html", "cookies", "selector"];
const READ = "s7";

const click = (id: string, label: string, words: string): AutomationStudioFlowNode =>
  ({ id, definitionId: "web.output.dom-click", label, parameterValues: { element: { tagName: "a", accessibleName: words, selector: `#facet-${id}` }, selector: `#facet-${id}` } });

const nodes: AutomationStudioFlowNode[] = [
  { id: "s1", definitionId: "web.output.browser-navigate", label: "open the catalogue search", parameterValues: { url: "https://library.test/search?q=astronomy" } },
  click("s2", "accept the notice", "Accept"),
  click("s3", "show books only", "Books"),
  click("s4", "choose the publication years", "2010 and later"),
  click("s5", "close the survey if it shows", "No thanks"),
  { id: "s6", definitionId: "web.output.dom-wait_for_text", label: "wait for the results", parameterValues: { text: "results" } },
  {
    id: READ, definitionId: "web.output.dom-extract_list", label: "read the results",
    parameterValues: { extractList: { fields: { title: { kind: "text" }, year: { kind: "text" } }, where: [{ field: "year", atLeast: 2000 }], paginate: { next: "a.next" } } }
  },
  click("s8", "go to the next page", "Next")
];

/** The domain's diff, as the trace carries it. */
const diff = (fields: { added?: string; removed?: string; documentChanged?: boolean }): JsonObject => ({
  schemaVersion: "web.state-diff.v1",
  locationChanged: fields.documentChanged === true,
  documentChanged: fields.documentChanged === true,
  added: fields.added ?? "",
  removed: fields.removed ?? ""
});

let clock = 1;
const attempt = (nodeId: string, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace => ({
  attemptId: `a${clock}`, nodeId, definitionId: nodes.find((node) => node.id === nodeId)!.definitionId, startedAt: clock++, status: "succeeded",
  inputs: {}, outputs: {}, effects: [], ...extra
});
const changed = (stateDiff: JsonObject): Partial<AutomationStudioNodeAttemptTrace> => ({ stateRefs: { stateDiff } } as unknown as Partial<AutomationStudioNodeAttemptTrace>);

const trace: AutomationStudioNodeAttemptTrace[] = [
  attempt("s1", changed(diff({ documentChanged: true }))),
  attempt("s2", changed(diff({ removed: "dialog \"We use cookies\"\nbutton \"Accept\"" }))),
  attempt("s3", { status: "failed" }),
  attempt("s3", changed(diff({ documentChanged: true }))),
  attempt("s4", changed(diff({ documentChanged: true }))),
  attempt("s5", { skipped: { reason: "target_absent", code: "web.target.not_found" } }),
  attempt("s6", changed(diff({}))),
  attempt(READ, changed(diff({}))),
  attempt("s8", changed(diff({ documentChanged: true }))),
  attempt(READ, changed(diff({})))
];

const readAttempt: AutomationStudioFlowRunActionAttemptRecord = {
  attemptId: "attempt.s7", nodeId: READ, definitionId: "web.output.dom-extract_list", order: 7, status: "succeeded", startedAt: 8,
  metadata: { extraction: { recordCount: 9, pagesRead: 2, truncated: false, itemsSeen: 9, paginationStop: "control_absent", conditions: { applied: 9, kept: 9, rejected: [0], unfiltered: false } } }
};

/** The steps the read is shown before it: the catalogue, the notice, both facets; never the failed try, the skipped survey, a wait that changed nothing, or the read's own next page. */
const EXPECTED = [
  { nodeId: "s1", label: "open the catalogue search", effect: "new_page" },
  { nodeId: "s2", label: "accept the notice", control: "Accept", effect: "same_page" },
  { nodeId: "s3", label: "show books only", control: "Books", effect: "new_page" },
  { nodeId: "s4", label: "choose the publication years", control: "2010 and later", effect: "new_page" }
];

const summary = (declared = true) => summarizeAutomationStudioRunResult({
  recordSets: [{ summary: datasetSummary({ datasetId: "books", recordCount: 9 }), rows: [] }],
  flowNodes: nodes, actionAttempts: [readAttempt], sessionAttempts: trace, ...(declared ? { deniedEvidenceKeys: DENIED } : {})
});

describe("a read names the steps that acted on the page before it", () => {
  it("names each by its label, its control's words and whether it went to another page, though a page move carries no change", () => {
    const shown = summary();
    expect(shown.reads?.[0]?.narrowedBefore).toEqual(EXPECTED);
    // The facet that kept less than the request asks went to another page, so its step says nothing changed: only the read's account names it.
    expect(shown.flowShape.find((step) => step.nodeId === "s4")).not.toHaveProperty("changed");
    expect(JSON.stringify(shown.reads)).not.toContain("#facet-");
  });

  it("says a step whose try found its state already shown, and a step whose page was not compared", () => {
    const held = automationStudioResultNarrowedBefore({
      readNodeIds: [READ], flowNodes: nodes, deniedEvidenceKeys: DENIED,
      attempts: [attempt("s3", { status: "failed", stateHeld: { rung: "skip_satisfied_node", route: "success" } }), attempt("s4", { stateRefs: {} } as unknown as Partial<AutomationStudioNodeAttemptTrace>), attempt(READ)]
    });
    expect(held.byRead.get(READ)).toEqual([
      { nodeId: "s3", label: "show books only", control: "Books", effect: "already_shown" },
      { nodeId: "s4", label: "choose the publication years", control: "2010 and later" }
    ]);
  });

  it("carries no control's words without a declaration of the domain's denied keys, and says one was withheld", () => {
    const shown = summary(false);
    expect(shown.reads?.[0]?.narrowedBefore?.map((step) => step.control)).toEqual([undefined, undefined, undefined, undefined]);
    expect(shown.withheld).toBe(true);
  });

  it("names no step for a read that is not this Flow's own node, nor for a summary of no trace", () => {
    const part = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, actionAttempts: [{ ...readAttempt, definitionId: "web.output.other-read" }], sessionAttempts: trace, deniedEvidenceKeys: DENIED });
    expect(part.reads?.[0]).not.toHaveProperty("narrowedBefore");
    const untraced = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, actionAttempts: [readAttempt], deniedEvidenceKeys: DENIED });
    expect(untraced.reads?.[0]).not.toHaveProperty("narrowedBefore");
  });

  it("reaches the judge's request under the read, beside its paging words, where a step that kept less than asked is the judge's to refuse", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const judge = provider("no", seen, undefined, { observed: "s4 keeps only 2010 and later.", changed: "Remove s4; keep year atLeast 2000 on the read." });
    const report = await verifyAutomationStudioRunResult({
      projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: summary(), instructions: [instruction("List the astronomy books published since 2000.")], deniedEvidenceKeys: DENIED, provider: judge
    });
    const read = seen[0]?.context.resultSummary?.reads?.[0] as (Record<string, unknown> | undefined);
    expect(read?.narrowedBefore).toEqual(EXPECTED);
    expect(typeof read?.paging).toBe("string");
    expect(report.outcome.performed && report.outcome.verdict).toBe("does_not_answer");
  });
});

// t655 (A8 frozen pair 5 towels, `run-mva6mlo8-f519063c`): a step that chose one
// option of a named group says the group, the option, the options it left
// unchosen with the counts the page showed, and the result counts before and
// after, from the `groups` and `resultCount` the domain puts beside each
// snapshot's view. A step with no group says none.
describe("what a narrowing step chose and left out", () => {
  const format = (chosen?: string): JsonObject => ({
    name: "Format",
    options: ([["Hardcover", 40], ["Paperback", 12], ["Audiobook", 3]] as const).map(([words, count]) => ({ words, count, chosen: words === chosen }))
  });
  const summary = (chosen: string | undefined, resultCount: number): JsonObject => ({ page: "(the view)", groups: [format(chosen)], resultCount });
  const formatNodes: AutomationStudioFlowNode[] = [click("f1", "Choose Hardcover format", "Hardcover (40)"), click("f2", "accept the notice", "Accept"), nodes.find((node) => node.id === READ)!];
  /** An attempt of a step of `formatNodes`, as the trace carries it. */
  const step = (nodeId: string, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace =>
    ({ attemptId: `a${clock}`, nodeId, definitionId: formatNodes.find((node) => node.id === nodeId)!.definitionId, startedAt: clock++, status: "succeeded", inputs: {}, outputs: {}, effects: [], ...extra });
  const pressed = (nodeId: string, before: JsonObject, after: JsonObject): AutomationStudioNodeAttemptTrace =>
    step(nodeId, { stateRefs: { stateDiff: diff({ added: "checkbox \"Hardcover (40)\" checked" }), beforeAction: { summary: before }, afterAction: { summary: after } } } as unknown as Partial<AutomationStudioNodeAttemptTrace>);

  it("carries the group, the option chosen, the other options with their counts, and the result counts", () => {
    const { byRead, withheld } = automationStudioResultNarrowedBefore({
      readNodeIds: [READ], flowNodes: formatNodes, deniedEvidenceKeys: DENIED,
      attempts: [pressed("f1", summary(undefined, 55), summary("Hardcover", 40)), step(READ, changed(diff({})))]
    });
    expect(withheld).toBe(false);
    expect(byRead.get(READ)).toEqual([{
      nodeId: "f1", label: "Choose Hardcover format", control: "Hardcover (40)", effect: "same_page",
      group: "Format", chose: "Hardcover", leftOptions: [{ words: "Paperback", count: 12 }, { words: "Audiobook", count: 3 }], resultCount: { before: 55, after: 40 }
    }]);
  });

  it("finds the option by the step's control words where no option is seen to change, and carries none for a step with no group", () => {
    const { byRead } = automationStudioResultNarrowedBefore({
      readNodeIds: [READ], flowNodes: formatNodes, deniedEvidenceKeys: DENIED,
      attempts: [
        step("f1", { stateRefs: { stateDiff: diff({ documentChanged: true }), afterAction: { summary: summary("Hardcover", 40) } } } as unknown as Partial<AutomationStudioNodeAttemptTrace>),
        step("f2", { stateRefs: { stateDiff: diff({ removed: "dialog \"Notice\"" }), beforeAction: { summary: { page: "(the view)" } }, afterAction: { summary: { page: "(the view)" } } } } as unknown as Partial<AutomationStudioNodeAttemptTrace>),
        step(READ, changed(diff({})))
      ]
    });
    const [chose, notice] = byRead.get(READ)!;
    expect(chose).toMatchObject({ group: "Format", chose: "Hardcover", leftOptions: [{ words: "Paperback", count: 12 }, { words: "Audiobook", count: 3 }], resultCount: { after: 40 } });
    expect(notice).toEqual({ nodeId: "f2", label: "accept the notice", control: "Accept", effect: "same_page" });
  });

  it("says no group without a denied-keys declaration, and marks it withheld", () => {
    const { byRead, withheld } = automationStudioResultNarrowedBefore({
      readNodeIds: [READ], flowNodes: formatNodes, deniedEvidenceKeys: undefined,
      attempts: [pressed("f1", summary(undefined, 55), summary("Hardcover", 40)), step(READ, changed(diff({})))]
    });
    expect(withheld).toBe(true);
    expect(byRead.get(READ)?.[0]).not.toHaveProperty("group");
    expect(byRead.get(READ)?.[0]?.resultCount).toEqual({ before: 55, after: 40 });
  });
});
