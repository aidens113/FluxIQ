// What a run owes by the build's declaration, and when an empty answer is
// shown honest (t757). Pure functions over a summary; no model is called.
import { describe, expect, it } from "vitest";
import type { AutomationStudioBuildTestStore, AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultHonestlyEmpty, automationStudioResultRequestedOutputHeld, automationStudioResultRequestedOutputMissing, automationStudioResultRequestedOutputOwed } from "../index.ts";

const OWED = { parts: [{ part: "p1", columns: ["name", "date"] }] };
const ENDED: AutomationStudioResultReadAccount = { nodeId: "read", definitionId: "web.output.dom-extract_list", pagesRead: 2, stop: "no_following_page", truncated: false, paginates: true, itemsSeen: 12, kept: 0 };

function summary(change: Partial<AutomationStudioRunResultSummary> = {}): AutomationStudioRunResultSummary {
  return { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [], flowShape: [], withheld: false, ...change };
}

const emptySet = (processing?: AutomationStudioResultRecordSetSummary["processing"]): AutomationStudioResultRecordSetSummary => ({
  datasetId: "events", recordCount: 0, refusedCount: 0, truncated: false, columns: ["name", "date"], columnsWithheld: false, rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [], ...(processing ? { processing } : {})
});

const store = (rows: number, keptNone?: true): AutomationStudioBuildTestStore => ({ dataset: "events", writeMode: "replace", steps: [2], passes: 1, collected: 5, answer: { rows, labels: [] }, ...(keptNone ? { keptNone } : {}) });

describe("what a run owes", () => {
  it("is the caller's declaration where given, else each checklist part declaring records, and nothing otherwise", () => {
    const asked = { supplementary: "", notAsked: [], asked: [
      { part: "p1", words: "w", goalFacts: [], lastingActs: [], answer: { kind: "records" as const, columns: ["name"] } },
      { part: "p2", words: "w", goalFacts: [], lastingActs: ["create_new"] }
    ] };
    expect(automationStudioResultRequestedOutputOwed(summary({ taskChecklist: asked }))).toEqual({ parts: [{ part: "p1", columns: ["name"] }] });
    expect(automationStudioResultRequestedOutputOwed(summary({ taskChecklist: asked }), OWED)).toEqual(OWED);
    expect(automationStudioResultRequestedOutputOwed(summary())).toBeUndefined();
    expect(automationStudioResultRequestedOutputOwed(summary({ taskChecklist: { ...asked, asked: [asked.asked[1]!] } }))).toBeUndefined();
  });
});

describe("an honestly empty answer", () => {
  it("is a read that saw its list end and kept nothing", () => {
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [ENDED] }))).toBe(true);
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [{ ...ENDED, itemsSeen: 0 }] }))).toBe(true);
  });

  it("is not a read that stopped short, said no end, answered unfiltered rows, or saw one page with no next control", () => {
    expect(automationStudioResultHonestlyEmpty(summary())).toBe(false);
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [{ ...ENDED, truncated: true }] }))).toBe(false);
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [{ ...ENDED, stop: "page_limit", pageLimit: 2 }] }))).toBe(false);
    const { stop: _stop, ...silent } = ENDED;
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [silent] }))).toBe(false);
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [{ ...ENDED, unfiltered: true }] }))).toBe(false);
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [{ ...ENDED, stop: "control_absent", pagesRead: 1 }] }))).toBe(false);
  });

  it("is an answer that kept none of the rows reads collected, every one of which saw its list end", () => {
    const kept = { ...ENDED, kept: 5 };
    const keptNone = { collected: 5, duplicates: 0, filteredOut: 5, cut: 0, kept: 0, keptNone: true as const, passes: [] };
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [kept], recordSetCount: 1, recordSets: [emptySet(keptNone)] }))).toBe(true);
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [kept, { ...kept, nodeId: "other", truncated: true }], recordSetCount: 1, recordSets: [emptySet(keptNone)] }))).toBe(false);
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [kept], buildTest: { kind: "build_test", test: "ran", steps: [], stores: [store(0, true)] } }))).toBe(true);
    expect(automationStudioResultHonestlyEmpty(summary({ reads: [kept], recordSetCount: 1, recordSets: [emptySet()] }))).toBe(false);
  });
});

describe("the records owed and missing", () => {
  it("names each part and its columns where nothing was stored, and nothing where records were", () => {
    const missing = automationStudioResultRequestedOutputMissing(summary(), { parts: [...OWED.parts, { part: "p3", columns: [] }] });
    expect(missing?.parts).toEqual([{ part: "p1", columns: ["name", "date"] }, { part: "p3", columns: [] }]);
    expect(missing?.said).toMatch(/^The build's task spec declares that parts p1 \(columns: name, date\) and p3 ask for records, and this run stored none\./u);
    expect(automationStudioResultRequestedOutputMissing(summary({ totalRecordCount: 2, recordSetCount: 1 }), OWED)).toBeUndefined();
    expect(automationStudioResultRequestedOutputMissing(summary(), undefined)).toBeUndefined();
  });

  it("holds a build test to what its Flow would keep, and says nothing where that was not worked out", () => {
    const test = (stores?: AutomationStudioBuildTestStore[]) => summary({ buildTest: { kind: "build_test", test: "ran", steps: [], ...(stores ? { stores } : {}) } });
    expect(automationStudioResultRequestedOutputMissing(test([]), OWED)).toMatchObject({ parts: OWED.parts });
    expect(automationStudioResultRequestedOutputMissing(test([store(3)]), OWED)).toBeUndefined();
    expect(automationStudioResultRequestedOutputMissing(test(), OWED)).toBeUndefined();
  });

  it("leaves every verdict but a yes as it stands", () => {
    const unsure = { schemaVersion: "automation-studio.result-verification.v1" as const, verdict: "unsure" as const, basis: "model" as const, code: "core.result.verdict_unsure", reason: "r", observation: "o" };
    expect(automationStudioResultRequestedOutputHeld(unsure, summary(), OWED)).toBe(unsure);
    const yes = { ...unsure, verdict: "answers" as const, code: "core.result.answers_request" };
    expect(automationStudioResultRequestedOutputHeld(yes, summary({ totalRecordCount: 1, recordSetCount: 1 }), OWED)).toBe(yes);
    expect(automationStudioResultRequestedOutputHeld(yes, summary(), OWED)).toMatchObject({ verdict: "unsure", code: "core.result.requested_output_missing" });
  });
});
