// A no, or its advice, that blames a step Core measured as removing no row is
// refuted (t659, A8 frozen pair 6 candidate towels `run-mvac1av6-f7b0f9e2`):
// the page stated as many results after the step as before it, and the step
// only added a choice. Asked once more, a no still refuted is unsure, never a
// no. A step whose count changed, whose count is missing, or that may have
// switched one choice for another stays the judge's to weigh. A library's atlas
// search narrowed by two facets before its read. No task, site, item or answer
// of any realistic scenario. And (round 2) end to end: from the page's own
// option groups, through the narrowing record (`../../narrowed-before.ts`,
// `../../narrowing-group.ts`), to the weighed no -- an added choice refuted, a
// switch between options with the same count not.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultNarrowedBefore } from "../../narrowed-before.ts";
import {
  automationStudioResultAdviceSteps,
  automationStudioResultNarrowingStepsNamed,
  automationStudioResultNoRecord,
  automationStudioResultRefutedReading,
  type AutomationStudioResultNoNarrowingStep
} from "../index.ts";

const BODY = "List every atlas in the library catalogue available to borrow today and rated 4 or higher, going through every page, with columns title, rating and url.";
const REQUEST = `Goal\n${BODY}`;
const STORED = [
  { title: "Rivers of the Northern Plains Atlas, Hardcover", rating: "4.6", url: "/catalog/item/ATR4K2M9Q1" },
  { title: "Coastal Charts Atlas of the Western Isles, Hardcover", rating: "4.2", url: "/catalog/item/ATC8W2L4P6" }
];
/** Left out by the rating bound alone. */
const LOW = "Quiet Valleys Atlas, Hardcover";

const PREFIX = "node.bootstrap.7c2e.find_atlases";
/** The availability facet: the page stated 52 results before it and 40 after. */
const S4 = `${PREFIX}.s4`;
/** The format facet: 40 before it and 40 after. */
const S6 = `${PREFIX}.s6`;
const READ = `${PREFIX}.s8`;

type Step = AutomationStudioResultNoNarrowingStep;
const AVAILABLE: Step = { nodeId: S4, label: "Choose available today", control: "Available today (40)", effect: "same_page", group: "Availability", chose: "Available today", leftOptions: [{ words: "All copies", count: 52 }], resultCount: { before: 52, after: 40 }, addedChoice: true };
const FORMAT: Step = { nodeId: S6, label: "Choose Hardcover format", control: "Hardcover (40)", effect: "same_page", group: "Format", chose: "Hardcover", leftOptions: [{ words: "Paperback", count: 0 }], resultCount: { before: 40, after: 40 }, addedChoice: true };

/** A change to the format step: any field, `undefined` to leave it out. */
type FormatChange = { [K in keyof Step]?: Step[K] | undefined };

function summary(format: FormatChange = {}, narrowed?: Step[]): AutomationStudioRunResultSummary {
  const steps: Step[] = narrowed ?? [AVAILABLE, { ...FORMAT, ...format } as Step];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "atlases", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["title", "rating", "url"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: STORED.map((row) => ({ ...row })),
      processing: { collected: 2, duplicates: 0, filteredOut: 0, cut: 0, kept: 2, passes: [{ node: READ, pass: 1, rows: 2, newRows: 2 }] }
    }],
    reads: [{
      nodeId: READ, definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 3, kept: 2,
      conditions: [{ number: 1, condition: "rating atLeast 4", rejected: 1, alone: 1, leftOutOnlyByThis: [`${LOW} — rating: 3.7`], leftOutSettled: [`${LOW} — rating: 3.7`] }],
      narrowedBefore: steps
    }],
    flowShape: [
      { nodeId: `${PREFIX}.s2`, definitionId: "type_text" }, { nodeId: S4, definitionId: "click" }, { nodeId: S6, definitionId: "click" }, { nodeId: READ, definitionId: "extract_list" }
    ],
    withheld: false
  };
}

const record = (format: FormatChange = {}) => automationStudioResultNoRecord({ summary: summary(format), requestText: REQUEST });
const EXPECTED = "Every atlas available today and rated 4 or higher.";
/** The two runtime nos' shape: the step by its short id and its option quoted with the page's count. */
const BLAMES_FORMAT = `The read ran after s6 chose "Hardcover (40)", which keeps only hardcover atlases and is narrower than the request.`;
const REMOVE_FORMAT = `Remove or replace ${S6}, which is redundant and narrower than the request.`;
const FORMAT_FINDING = "Step \"Choose Hardcover format\" chose \"Hardcover\" in \"Format\": the page stated 40 results before it and 40 after, so it removed no row; no row the request asks for can be missing because of it.";

describe("a no blaming a step Core measured as removing no row (t659)", () => {
  it("is refuted, the sentence and the advice to remove the step, with the counts the page stated", () => {
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: BLAMES_FORMAT, advice: REMOVE_FORMAT }, record());
    expect(weighed).toEqual({ wholly: true, findings: [FORMAT_FINDING] });
  });

  it("finds the step by its node id, its short id, its label, its control's words or its option, never by its group alone", () => {
    const rec = record();
    const named = (sentence: string) => automationStudioResultNarrowingStepsNamed(sentence, rec).steps.map((step) => step.nodeId);
    expect(named(`${S6} is wrong.`)).toEqual([S6]);
    expect(named("s6 is wrong.")).toEqual([S6]);
    expect(named("The step Choose Hardcover format is wrong.")).toEqual([S6]);
    expect(named("Hardcover (40) is wrong.")).toEqual([S6]);
    expect(named("The format group is wrong.")).toEqual([]);
    // The read named beside it is no other step.
    expect(automationStudioResultNarrowingStepsNamed(`${READ} read after ${S6}.`, rec)).toEqual({ steps: [FORMAT], others: [] });
    expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed: `The step Choose Hardcover format should not be there: it drops paperback atlases.` }, rec)).toEqual({ wholly: true, findings: [FORMAT_FINDING] });
  });

  it("stands where the step's count changed: whether that narrowing was right is the judge's", () => {
    const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: `${S4} chose "Available today (40)", which drops atlases the request asks for.`, advice: `Remove ${S4}.` }, record());
    expect(weighed).toEqual({ wholly: false, findings: [] });
  });

  it("stands where Core cannot say the step only added a choice, or a count is missing", () => {
    const changes: FormatChange[] = [{ addedChoice: undefined }, { addedChoice: false }, { resultCount: { before: 40 } }, { group: undefined, chose: undefined }];
    for (const format of changes) {
      const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed: `${S6} chose "Hardcover (40)", which is narrower than the request.`, advice: REMOVE_FORMAT }, record(format));
      expect(weighed.wholly).toBe(false);
      expect(weighed.findings.join(" ")).not.toContain("removed no row");
    }
  });

  it("stands where the sentence also names a row Core has no record of, a condition, or a step that removed rows", () => {
    for (const observed of [
      `s6 removed "Harbor Lights Pocket Atlas, Paperback", which the request asks for.`,
      "s6 and condition 1 are narrower than the request.",
      `s4 and s6 are narrower than the request.`
    ]) expect(automationStudioResultRefutedReading({ expected: EXPECTED, observed }, record()).wholly).toBe(false);
  });

  it("weighs advice only where it removes or replaces such steps and asks nothing more", () => {
    const rec = record();
    expect(automationStudioResultAdviceSteps(REMOVE_FORMAT, rec)).toEqual({ nodeIds: [S6], findings: [FORMAT_FINDING] });
    expect(automationStudioResultAdviceSteps("Uncheck s6. Keep the search step.", rec)).toEqual({ nodeIds: [S6], findings: [FORMAT_FINDING] });
    expect(automationStudioResultAdviceSteps("Replace s6 with the Paperback option.", rec)).toBeUndefined();
    expect(automationStudioResultAdviceSteps("Remove s6 and add a rating condition.", rec)).toBeUndefined();
    expect(automationStudioResultAdviceSteps(`Remove s6. Remove ${S4}.`, rec)).toBeUndefined();
    expect(automationStudioResultAdviceSteps("Remove s6 and loosen condition 1.", rec)).toBeUndefined();
  });
});

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: BODY,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const STEP_NO = { answersRequest: "no", expected: EXPECTED, observed: BLAMES_FORMAT, changed: REMOVE_FORMAT };

function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request) => {
        const diagnosis = diagnoses[seen.length] ?? {};
        seen.push(JSON.stringify(request));
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE };
      }
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider) =>
  automationStudioBuildTestJudge({ instructions: [INSTRUCTION], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });

describe("through the judge both build trials and the runtime check ask (t659)", () => {
  it("two such nos are asked again with Core's finding, and still refuted they are unsure, never a no", async () => {
    const { provider, seen } = answering(STEP_NO, STEP_NO, STEP_NO, STEP_NO);
    const verdict = await judge(provider)({ summary: summary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).not.toBe("no");
    expect(verdict).toMatchObject({ verdict: "unknown" });
    expect(seen).toHaveLength(4);
    expect(seen[2]).toContain("so it removed no row");
    expect(seen[0]).not.toContain("so it removed no row");
  });

  it("two nos blaming a step that removed rows stay a no, asked nothing more", async () => {
    const changed = { ...STEP_NO, observed: `${S4} chose "Available today (40)", which drops atlases the request asks for.`, changed: `Remove ${S4}.` };
    const { provider, seen } = answering(changed, changed);
    const verdict = await judge(provider)({ summary: summary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("no");
    expect(seen).toHaveLength(2);
  });
});

describe("from the page's own option groups to the weighed no (t659 round 2)", () => {
  const format = (chosen?: string): JsonObject => ({
    name: "Format",
    options: ([["Hardcover", 40], ["Paperback", 40]] as const).map(([words, count]) => ({ words, count, chosen: words === chosen }))
  });
  const snapshot = (chosen: string | undefined, resultCount: number): JsonObject => ({ page: "(the view)", groups: [format(chosen)], resultCount });
  const nodes: AutomationStudioFlowNode[] = [
    { id: S6, definitionId: "web.output.dom-click", label: "Choose Hardcover format", parameterValues: { element: { tagName: "a", accessibleName: "Hardcover (40)" } } },
    { id: READ, definitionId: "web.output.dom-extract_list", label: "read the results", parameterValues: { extractList: { fields: { title: { kind: "text" } } } } }
  ];
  const diff = (added: string): JsonObject => ({ schemaVersion: "web.state-diff.v1", locationChanged: false, documentChanged: false, added, removed: "" });
  /** The format step's attempt, its page before and after, then the read's. */
  const attempts = (before: JsonObject, after: JsonObject): AutomationStudioNodeAttemptTrace[] => [
    { attemptId: "a1", nodeId: S6, definitionId: "web.output.dom-click", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [], stateRefs: { stateDiff: diff("radio \"Hardcover (40)\" checked"), beforeAction: { summary: before }, afterAction: { summary: after } } },
    { attemptId: "a2", nodeId: READ, definitionId: "web.output.dom-extract_list", startedAt: 2, status: "succeeded", inputs: {}, outputs: {}, effects: [], stateRefs: { stateDiff: diff("") } }
  ] as unknown as AutomationStudioNodeAttemptTrace[];
  const recorded = (before: JsonObject, after: JsonObject): Step[] =>
    automationStudioResultNarrowedBefore({ readNodeIds: [READ], flowNodes: nodes, attempts: attempts(before, after), deniedEvidenceKeys: [] }).byRead.get(READ)!;
  const weighed = (steps: Step[]) =>
    automationStudioResultRefutedReading({ expected: EXPECTED, observed: BLAMES_FORMAT, advice: REMOVE_FORMAT }, automationStudioResultNoRecord({ summary: summary({}, steps), requestText: REQUEST }));

  it("a choice added to a group with none chosen, the count the same, is recorded so, and the no blaming it is refuted", () => {
    const steps = recorded(snapshot(undefined, 40), snapshot("Hardcover", 40));
    expect(steps).toEqual([expect.objectContaining({ nodeId: S6, group: "Format", chose: "Hardcover", resultCount: { before: 40, after: 40 }, addedChoice: true })]);
    expect(weighed(steps)).toEqual({ wholly: true, findings: [FORMAT_FINDING] });
  });

  it("a switch from one option to another, the count the same, is not an added choice, and the no stands", () => {
    const steps = recorded(snapshot("Paperback", 40), snapshot("Hardcover", 40));
    expect(steps[0]).toMatchObject({ group: "Format", chose: "Hardcover", resultCount: { before: 40, after: 40 } });
    expect(steps[0]).not.toHaveProperty("addedChoice");
    const result = weighed(steps);
    expect(result.wholly).toBe(false);
    expect(result.findings.join(" ")).not.toContain("removed no row");
  });

  it("a choice added beside one already chosen is not an added choice either", () => {
    const both = (chosen: readonly string[]): JsonObject => ({ page: "(the view)", resultCount: 40, groups: [{ name: "Format", options: ["Hardcover", "Paperback"].map((words) => ({ words, count: 40, chosen: chosen.includes(words) })) }] });
    expect(recorded(both(["Paperback"]), both(["Paperback", "Hardcover"]))[0]).not.toHaveProperty("addedChoice");
  });
});
