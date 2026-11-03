// A library catalog searched for one phrase, a request for every result less
// two stated exclusions, and a read whose two conditions each make one: each
// leaves a row out alone, which Core settles, and both leave one more row out
// together (t795 w1b). The shape of social runs `run-mvskodlp-9966d618` and
// `run-mvswewhy-e4e469d4`, on another kind of site: a yes that quoted the
// request for each condition was held for the rows they left out together,
// since a group was never settled. And, for a group with a member Core does
// not settle, a third condition the request never states.
import type { AutomationStudioRunResultSummary } from "../../../../contracts/index.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../../../request-wording.ts";

/** The request: one search, every result, two stated exclusions. */
export const SETTLED_TOGETHER_REQUEST = "Search the catalog for garden books and list every result on the first page, leaving out reference copies and anything whose format is not a printed book.";

/** The rows the read kept and the run stored. */
export const SETTLED_TOGETHER_KEPT = ["Garden Books for Small Spaces", "The Kitchen Garden Year", "Garden Birds of the North"];

/** The row condition 1 alone left out, its witness finding the reference mark. */
export const SETTLED_TOGETHER_REFERENCE = "Garden Design Handbook, Library Edition";

/** The row condition 2 alone left out, said with the format it failed on. */
export const SETTLED_TOGETHER_FORMAT_ROW = "Garden Planner 2027 — format: Calendar";

/** The row the two conditions left out together. */
export const SETTLED_TOGETHER_ROW = "Garden Atlas of Old Roses";

/** The three conditions as the read's account words them. */
export const SETTLED_TOGETHER_CONDITIONS = ["reference is absent", "format equals [\"Book\"]", "title not contains [\"Atlas\"]"] as const;

/** Each condition as every line names it. */
export const SETTLED_TOGETHER_NAMES = SETTLED_TOGETHER_CONDITIONS.map((wording, index) => `condition ${index + 1} (${wording})`);

/**
 * The run: three rows stored, one left out by condition 1 alone, one by
 * condition 2 alone, and one by the conditions `together` names (1 and 2 by
 * default, both settled; 1 and 3 puts an unsettled condition in the group).
 */
export function settledTogetherRunSummary(together: readonly number[] = [1, 2]): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 3,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "books", recordCount: 3, refusedCount: 0, truncated: false, columns: ["title", "author"], columnsWithheld: false,
      rowsChecked: 3, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: SETTLED_TOGETHER_KEPT.map((title, index) => ({ title, author: `Author ${index + 1}` })),
      processing: { collected: 3, duplicates: 0, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: "read", pass: 1, rows: 3, newRows: 3 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 6, kept: 3,
      conditions: [
        {
          number: 1, condition: SETTLED_TOGETHER_CONDITIONS[0], rejected: 2, alone: 1, leftOutOnlyByThis: [SETTLED_TOGETHER_REFERENCE],
          leftOutObservations: [{ source: "read", readKind: "text", page: 1, item: 2, state: "present", value: "Reference" }],
          leftOutSettled: [SETTLED_TOGETHER_REFERENCE], settledKind: "presence",
          settled: "On each row in leftOutSettled the read found reference, so each fails condition 1 (reference is absent) as written."
        },
        {
          number: 2, condition: SETTLED_TOGETHER_CONDITIONS[1], rejected: 2, alone: 1, leftOutOnlyByThis: [SETTLED_TOGETHER_FORMAT_ROW],
          leftOutObservations: [{ source: "read", readKind: "text", page: 1, item: 4, state: "present", value: "Calendar" }],
          leftOutSettled: [SETTLED_TOGETHER_FORMAT_ROW], settledKind: "text",
          settled: "On each row in leftOutSettled the read found a format that fails condition 2 (format equals [\"Book\"]) as written."
        },
        { number: 3, condition: SETTLED_TOGETHER_CONDITIONS[2], rejected: together.includes(3) ? 1 : 0, alone: 0 }
      ],
      leftOutTogether: [{ conditions: [...together], rows: [SETTLED_TOGETHER_ROW] }]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** The request as a judge's words are held to it, over the run above. */
export function settledTogetherWording(summary = settledTogetherRunSummary()): AutomationStudioRequestWording {
  return automationStudioRequestWording([{ title: "List the catalog", body: SETTLED_TOGETHER_REQUEST }], summary)!;
}
