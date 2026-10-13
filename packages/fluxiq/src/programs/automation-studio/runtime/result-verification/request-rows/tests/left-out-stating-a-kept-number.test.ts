// A text condition that kept a number on one row and left it out on another
// (t478, lane D round 11 `run-mv5yaapw-6d20d23d`): flagged by Core's own number
// reader, never by the request or a judge. Generic site: a shared-documents
// workspace whose rows say how many people edit each document.
import { describe, expect, it } from "vitest";
import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "../../contracts.ts";
import { automationStudioResultLeftOutStatingAKeptNumber } from "../index.ts";

const NODE = "node.docs.list";
const PATTERN = "editors matches [\"([4-9]|[1-9][0-9]+) editors\"]";

function set(rows: Array<{ title: string; editors: string }>, node = NODE): AutomationStudioResultRecordSetSummary {
  return {
    datasetId: "documents",
    recordCount: rows.length,
    refusedCount: 0,
    truncated: false,
    columns: ["title", "editors"],
    columnsWithheld: false,
    rowsChecked: rows.length,
    rowsMissingRequired: 0,
    missingRequiredColumns: [],
    sampleRows: rows,
    processing: { collected: rows.length, duplicates: 0, filteredOut: 0, cut: 0, kept: rows.length, passes: [{ node, pass: 1, rows: rows.length, newRows: rows.length }] }
  };
}

function read(condition: string, leftOut: string[], extra: Partial<AutomationStudioResultReadAccount> = {}): AutomationStudioResultReadAccount {
  return {
    nodeId: NODE,
    definitionId: "web.output.dom-extract_list",
    pagesRead: 1,
    truncated: false,
    kept: 2,
    conditions: [{ condition, rejected: leftOut.length, alone: leftOut.length, leftOutOnlyByThis: leftOut }],
    ...extra
  };
}

function summary(reads: AutomationStudioResultReadAccount[], recordSets: AutomationStudioResultRecordSetSummary[]): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: recordSets.reduce((total, entry) => total + entry.recordCount, 0),
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: recordSets.length,
    recordSets,
    reads,
    flowShape: [{ nodeId: NODE, definitionId: "web.output.dom-extract_list" }],
    withheld: false
  };
}

const KEPT = [{ title: "Quarterly plan", editors: "12 editors" }, { title: "Style guide", editors: "4 editors" }];
const LEFT_OUT = ["Budget sheet — editors: Ravi Menon and 3 others", "Meeting notes — editors: 2 editors", "Logo brief — editors: (no value)"];

describe("automationStudioResultLeftOutStatingAKeptNumber", () => {
  it("flags a left-out row whose stated number lies within the numbers the same text condition kept", () => {
    const found = automationStudioResultLeftOutStatingAKeptNumber(summary([read(PATTERN, LEFT_OUT)], [set(KEPT)]));
    expect(found).toEqual([{ nodeId: NODE, condition: PATTERN, low: 4, high: 12, rows: ["Budget sheet — editors: Ravi Menon and 3 others"], numbers: [4] }]);
  });

  it("reads the left-out value from the read's own witness when it sent one per row", () => {
    const witnessed = read(PATTERN, ["Budget sheet", "Meeting notes"]);
    witnessed.conditions![0]!.leftOutObservations = [
      { conditionIndex: 0, source: "field", page: 1, item: 2, readKind: "text", state: "present", value: "Ravi Menon and 7 others" },
      { conditionIndex: 0, source: "field", page: 1, item: 3, readKind: "text", state: "present", value: "2 editors" }
    ];
    expect(automationStudioResultLeftOutStatingAKeptNumber(summary([witnessed], [set(KEPT)]))[0]?.numbers).toEqual([8]);
  });

  it("takes the kept value the condition's wording says where the column is not stored", () => {
    const wording = "the item's text (read \"9 editors\" on a row it kept) matches [\"[5-9] editors\"]";
    const found = automationStudioResultLeftOutStatingAKeptNumber(summary([read(wording, ["Budget sheet — editors: Ravi Menon and 8 others"])], []));
    expect(found.map((entry) => [entry.low, entry.high, entry.numbers])).toEqual([[9, 9, [9]]]);
  });

  it("does not flag a text test whose comparison writes no digit: it is about text, not a quantity", () => {
    const wording = "title not contains [\"draft\", \"archived\"]";
    expect(automationStudioResultLeftOutStatingAKeptNumber(summary([read(wording, ["Plan draft 7 — title: Plan draft 7"])], [set(KEPT)]))).toEqual([]);
  });

  it("does not flag a bound, or a condition that also keeps a set of numbers by equals", () => {
    expect(automationStudioResultLeftOutStatingAKeptNumber(summary([read("editors atLeast 4", LEFT_OUT)], [set(KEPT)]))).toEqual([]);
    expect(automationStudioResultLeftOutStatingAKeptNumber(summary([read("editors equals [4, 12] and contains [\"4\"]", LEFT_OUT)], [set(KEPT)]))).toEqual([]);
  });

  it("does not take kept numbers from a record set another read collected", () => {
    const other = set(KEPT, "node.docs.everything");
    expect(automationStudioResultLeftOutStatingAKeptNumber(summary([read(PATTERN, LEFT_OUT)], [other]))).toEqual([]);
  });

  it("does not flag a row the result holds anyway, or a read that answered with its unfiltered rows", () => {
    const held = set([...KEPT, { title: "Budget sheet", editors: "Ravi Menon and 3 others" }]);
    expect(automationStudioResultLeftOutStatingAKeptNumber(summary([read(PATTERN, LEFT_OUT)], [held]))).toEqual([]);
    expect(automationStudioResultLeftOutStatingAKeptNumber(summary([read(PATTERN, LEFT_OUT, { unfiltered: true })], [set(KEPT)]))).toEqual([]);
  });

  it("does not flag a left-out number outside the kept range", () => {
    expect(automationStudioResultLeftOutStatingAKeptNumber(summary([read(PATTERN, ["Meeting notes — editors: 2 editors"])], [set(KEPT)]))).toEqual([]);
  });
});
