// A read's rows two or more conditions left out together, from the page's
// summary to Core's record (t655): the extraction account admits them as
// `conditions.togetherRows`, the read account names them, and a read whose
// counts then add up is complete, so t654's unseen-row refutation fires (A8
// frozen pair 5 `run-mva6mlm4-97fe42f9`: seen 23, kept 9, 12 alone, two named
// nowhere). One still short refutes nothing. A library catalogue: no task,
// site, item or answer of any realistic scenario.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../../result-verification/contracts/index.ts";
import { automationStudioResultReadAccounts } from "../../../result-verification/read-account/index.ts";
import { automationStudioResultNoRecord, automationStudioResultRefutedReading } from "../../../result-verification/refuted-no/index.ts";
import { extractionSummaryFromOutputs } from "../extraction-summary.ts";

const REQUEST = "Goal\nList every hardcover mystery novel in the library catalogue rated 4 or higher, with columns title, author, rating and url. Leave out box sets.";
const STORED = [
  { title: "Harbor Lights at Midnight, Hardcover", rating: "4.6" },
  { title: "Fog Over Penhallow Quay, Hardcover", rating: "4.2" },
  { title: "Silent Bells of Ashford, Hardcover", rating: "4.8" }
];
const LOW = { title: "Quiet Streets of Dunmore, Hardcover", rating: "3.8" };
const BOX = { title: "Ashford Mysteries Box Set, Hardcover", rating: "4.4" };
/** Rated low and a box set: both conditions left it out, neither alone. */
const BOTH = { title: "Penhallow Cases Box Set, Hardcover", rating: "3.1" };
const UNSEEN = "The Lantern Keeper's Daughter, Paperback";
const READ = "read";

/** The page's summary of a playback read: alone lead, then the row both conditions rejected, after each lead. */
function pageSummary(itemsSeen: number): JsonObject {
  return {
    recordCount: 3, pagesRead: 1, truncated: false, fieldNames: ["title", "rating"], missingFields: [], itemsSeen,
    conditions: { applied: itemsSeen, kept: 3, rejected: [2, 2], unfiltered: false, alone: [1, 1] },
    rejectedSamples: [[LOW, BOTH], [BOX, BOTH]],
    rejectedSamplesAlone: [1, 1],
    rejectedObservations: [[null, null], [null, null]]
  };
}

const node: AutomationStudioFlowNode = {
  id: READ, definitionId: "web.output.dom-extract_list",
  parameterValues: { extractList: { item: ".book", fields: { title: { kind: "text" }, rating: { kind: "text" } }, where: [{ field: "rating", atLeast: 4 }, { field: "title", contains: "Box Set", not: true }] } }
};

/** The read's account, from the attempt the run record holds with the page's summary admitted. */
function account(itemsSeen: number): AutomationStudioResultReadAccount {
  const extraction = extractionSummaryFromOutputs({ result: { extraction: pageSummary(itemsSeen) } });
  const attempt: AutomationStudioFlowRunActionAttemptRecord = { attemptId: "a.read", nodeId: READ, definitionId: node.definitionId, order: 2, status: "succeeded", startedAt: 2, ...(extraction ? { metadata: { extraction } } : {}) };
  return automationStudioResultReadAccounts({ actionAttempts: [attempt], flowNodes: [node], deniedEvidenceKeys: [] }).reads[0]!;
}

function summary(read: AutomationStudioResultReadAccount): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: STORED.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{
      datasetId: "mysteries", recordCount: STORED.length, refusedCount: 0, truncated: false, columns: ["title", "rating"], columnsWithheld: false,
      rowsChecked: STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: STORED.map((row) => ({ ...row })),
      processing: { collected: 3, duplicates: 0, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: READ, pass: 1, rows: 3, newRows: 3 }] }
    }],
    reads: [{ ...read, narrowedBefore: [{ nodeId: "format", label: "Choose Hardcover format", control: "Hardcover (40)", effect: "same_page" }] }],
    flowShape: [{ nodeId: "format", definitionId: "click" }, { nodeId: READ, definitionId: node.definitionId }],
    withheld: false
  };
}

const NO = { expected: "Every hardcover mystery rated 4 or higher, without box sets.", observed: `Condition 2 missed "${UNSEEN}", a mystery rated 4.7.`, advice: "Loosen condition 2." };

describe("rows two or more conditions left out together, from the page to Core's record", () => {
  it("are admitted once, under both conditions, beside the alone rows", () => {
    const admitted = extractionSummaryFromOutputs({ result: { extraction: pageSummary(6) } });
    const conditions = admitted?.conditions as JsonObject;
    expect(conditions.aloneRows).toEqual([[LOW], [BOX]]);
    expect(conditions.togetherRows).toEqual([{ failed: [0, 1], rows: [BOTH] }]);
    // A row after one list's lead only names no set.
    const single = extractionSummaryFromOutputs({ result: { extraction: { ...pageSummary(6), rejectedSamples: [[LOW, BOTH], [BOX]], rejectedObservations: [[null, null], [null]] } } });
    expect((single?.conditions as JsonObject).togetherRows).toBeUndefined();
  });

  it("make a read whose counts add up complete, and t654's unseen-row refutation fires", () => {
    const read = account(6);
    // With the row's own cells beside its label (t771).
    expect(read.leftOutTogether).toEqual([{ conditions: [1, 2], rows: [BOTH.title], cells: [BOTH] }]);
    const record = automationStudioResultNoRecord({ summary: summary(read), requestText: REQUEST });
    expect(record.seen?.[0]?.whole).toBe(true);
    const weighed = automationStudioResultRefutedReading(NO, record);
    expect(weighed.wholly).toBe(true);
    expect(weighed.findings.join(" ")).toContain(`No condition saw "${UNSEEN}"`);
  });

  it("refute nothing where the read is still short", () => {
    const record = automationStudioResultNoRecord({ summary: summary(account(7)), requestText: REQUEST });
    expect(record.seen?.[0]?.whole).toBe(false);
    expect(automationStudioResultRefutedReading(NO, record).wholly).toBe(false);
  });
});
