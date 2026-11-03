// A library catalog searched for one phrase, a request for every result less
// one stated exclusion, and a read whose first condition makes that exclusion
// while two more, neither of which the request states, leave one row out
// together (t655): the shape of debug `run-mvtdoyf3-47ffaac1` (F1), on another
// kind of site. No condition names the row alone, so before F1 no check held a
// yes to the request's words for it.
import type { AutomationStudioRunResultSummary } from "../../../../contracts/index.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../../../request-wording.ts";

/** The request: one search, every result, one stated exclusion. */
export const WALL_CALENDAR_REQUEST = "Search the catalog for garden books and list every result on the first page, leaving out reference copies.";

/** The same request, stating the second exclusion too. */
export const WALL_CALENDAR_REQUEST_STATED = "Search the catalog for garden books and list every result on the first page, leaving out reference copies and wall calendars.";

/** A request for a kind of thing, not for every result (t628). */
export const WALL_CALENDAR_REQUEST_KIND = "Find garden gloves and list them with their titles.";

/** The rows the read kept and the run stored. */
export const WALL_CALENDAR_KEPT = ["Garden Books for Small Spaces", "The Kitchen Garden Year", "Garden Birds of the North"];

/** The row the stated exclusion left out alone, Core's read finding the value on it. */
export const WALL_CALENDAR_REFERENCE = "Garden Design Handbook, Library Edition";

/** The row conditions 2 and 3 left out together. */
export const WALL_CALENDAR_ROW = "Garden Wall Calendar 2027";

/** The three conditions as the read's account words them. */
export const WALL_CALENDAR_CONDITIONS = ["reference is absent", "title not contains [\"Calendar\"]", "title not contains [\"Wall\"]"] as const;

/** The together set, as every line names it. */
export const WALL_CALENDAR_TOGETHER = `conditions 2 and 3 (${WALL_CALENDAR_CONDITIONS[1]}; ${WALL_CALENDAR_CONDITIONS[2]})`;

/** The run: three rows stored, one left out by condition 1 alone, one by conditions 2 and 3 together. */
export function wallCalendarRunSummary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 3,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "books", recordCount: 3, refusedCount: 0, truncated: false, columns: ["title", "author"], columnsWithheld: false,
      rowsChecked: 3, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: WALL_CALENDAR_KEPT.map((title, index) => ({ title, author: `Author ${index + 1}` })),
      processing: { collected: 3, duplicates: 0, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: "read", pass: 1, rows: 3, newRows: 3 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 5, kept: 3,
      conditions: [
        {
          number: 1, condition: WALL_CALENDAR_CONDITIONS[0], rejected: 1, alone: 1, leftOutOnlyByThis: [WALL_CALENDAR_REFERENCE],
          leftOutObservations: [{ source: "read", readKind: "text", page: 1, item: 2, state: "present", value: "Reference" }],
          leftOutSettled: [WALL_CALENDAR_REFERENCE], settledKind: "presence",
          settled: "On each row in leftOutSettled the read found reference, so each fails condition 1 (reference is absent) as written."
        },
        { number: 2, condition: WALL_CALENDAR_CONDITIONS[1], rejected: 1, alone: 0 },
        { number: 3, condition: WALL_CALENDAR_CONDITIONS[2], rejected: 1, alone: 0 }
      ],
      leftOutTogether: [{ conditions: [2, 3], rows: [WALL_CALENDAR_ROW] }]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** The request as a judge's words are held to it, over the run above. */
export function wallCalendarWording(request = WALL_CALENDAR_REQUEST, summary = wallCalendarRunSummary()): AutomationStudioRequestWording {
  return automationStudioRequestWording([{ title: "List the catalog", body: request }], summary)!;
}
