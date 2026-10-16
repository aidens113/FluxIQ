// The words for missing count only for their own clause, and a stored row a
// clause says the result keeps, beside a row called missing, is a reason Core
// cannot refute (t659, A8 frozen pair 6 project towels `run-mvac0nmw-52ed30b2`
// step 0125). A library's atlas search: a bookmark stored beside the atlases,
// and an old atlas a year bound left out. No task, site, item or answer of any
// realistic scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../build-test/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading, automationStudioResultRowClauses } from "../index.ts";

const BODY = "List every atlas in the library catalogue published 2005 or later, going through every page, with columns title, year and url.";
const REQUEST = `Goal\n${BODY}`;
const STORED = [
  { title: "Rivers of the Northern Plains Atlas, 2nd Edition", year: "2011", url: "/catalog/item/ATR4K2M9Q1" },
  { title: "Coastal Charts Atlas of the Western Isles", year: "2016", url: "/catalog/item/ATC8W2L4P6" },
  { title: "Riverbend Atlas Bookmark, Brass", year: "2019", url: "/catalog/item/BMR9N3C6V4" }
];
/** A stored row that is no atlas: a bookmark. */
const BOOKMARK = STORED[2]!.title;
/** A stored atlas. */
const RIVERS = STORED[0]!.title;
/** Left out by the year bound alone, its year read by Core. */
const OLD = "Old Maps of the Delta Country, Hardcover";

function summary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "atlases", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["title", "year", "url"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: STORED.map((row) => ({ ...row })),
      processing: { collected: 3, duplicates: 0, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: "read", pass: 1, rows: 3, newRows: 3 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 4, kept: 3,
      conditions: [
        { number: 1, condition: "year atLeast 2005", rejected: 1, alone: 1, leftOutOnlyByThis: [`${OLD} — year: 1998`], leftOutSettled: [`${OLD} — year: 1998`] }
      ]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

const record = () => automationStudioResultNoRecord({ summary: summary(), requestText: REQUEST });
const EXPECTED = "Every atlas published 2005 or later.";
/** The step-0125 shape: a colon, then a stored row the clause before says is kept, and a left-out row with words of its own. */
const KIND_WITH_COLON = `The kept set includes non-atlas items: "${BOOKMARK}" (a bookmark, not a book) and "${OLD}" was left out only by year.`;
/** The same without the colon. */
const KIND = `The kept set includes "${BOOKMARK}" (a bookmark, not a book) and "${OLD}" was left out only by year.`;
const OLD_FINDING = `Core's read saw "${OLD} — year: 1998", and only condition 1 (year atLeast 2005) left it out`;

describe("a sentence calling a stored row the wrong kind beside a row called missing (t659)", () => {
  it("gives the stored row no \"is in the stored rows\" finding: the words for missing are the other clause's", () => {
    for (const observed of [KIND_WITH_COLON, KIND]) {
      const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed, advice: "Leave out bookmarks." }, record());
      expect(weighed.findings.join(" ")).not.toContain(`"${BOOKMARK}" is in the stored rows`);
      // What Core did measure, the left-out row's year, is still said.
      expect(weighed.findings.join(" ")).toContain(OLD_FINDING);
    }
  });

  it("is at most partly contradicted: the claim about what the stored row is stands", () => {
    for (const observed of [KIND_WITH_COLON, KIND]) {
      const weighed = automationStudioResultRefutedReading({ expected: EXPECTED, observed, advice: "Leave out bookmarks." }, record());
      expect(weighed.wholly).toBe(false);
      expect(weighed.findings.length).toBeGreaterThan(0);
    }
  });

  it("reads each clause's words as its own, and a list after a colon as the colon's", () => {
    expect(automationStudioResultRowClauses(KIND_WITH_COLON).map((clause) => clause.says)).toEqual(["kept", "kept", "missing"]);
    expect(automationStudioResultRowClauses(`Missing rows: "${RIVERS}"; "${OLD}".`).map((clause) => clause.says)).toEqual(["missing", "missing", "missing"]);
    expect(automationStudioResultRowClauses(`"${RIVERS}" and "${OLD}" were left out.`).map((clause) => clause.says)).toEqual(["missing", "missing"]);
  });

  it("still refutes a stored row called missing, alone or in a list after a colon", () => {
    expect(automationStudioResultRefutedReading({ observed: `"${RIVERS}" is missing from the result.` }, record())).toEqual({ wholly: true, findings: [`"${RIVERS}" is in the stored rows.`] });
    const listed = automationStudioResultRefutedReading({ observed: `Missing rows: "${RIVERS}"; "${OLD}".` }, record());
    expect(listed.wholly).toBe(true);
    expect(listed.findings.join(" ")).toContain(`"${RIVERS}" is in the stored rows.`);
    expect(listed.findings.join(" ")).toContain(OLD_FINDING);
  });
});

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const INSTRUCTION: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: BODY,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const KIND_NO = { answersRequest: "no", expected: EXPECTED, observed: KIND_WITH_COLON, changed: "Leave out bookmarks." };

function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    provider: { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: diagnoses[calls++] ?? {} }, usage: USAGE }) }
  };
}

describe("through the build-test judge (t659)", () => {
  it("two such nos stay a no, asked nothing more, each labelled as partly contradicted, never wholly", async () => {
    const { provider, calls } = answering(KIND_NO, KIND_NO, KIND_NO, KIND_NO);
    const verdict = await automationStudioBuildTestJudge({ instructions: [INSTRUCTION], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider })({ summary: summary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("no");
    expect(calls()).toBe(2);
    if (verdict.verdict !== "no") return;
    expect(String(verdict.observed)).toContain("Core's record contradicts part of this reading");
    expect(String(verdict.observed)).not.toContain("contradicted by Core's record");
  });
});
