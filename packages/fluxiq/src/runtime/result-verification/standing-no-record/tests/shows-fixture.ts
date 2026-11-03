// A venue's show listings, read with a condition that leaves out the shows the
// page marks with something (t687): Core's record of one judged trial, as the
// gate that keeps a build's trials is handed it. No task, site, item or answer
// of any realistic scenario.
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultNoRecord } from "../../refuted-no/index.ts";
import { automationStudioRequestWording } from "../../request-rows/index.ts";
import type { AutomationStudioResultConditionPlan } from "../../standing-no/index.ts";
import { automationStudioResultStandingNoRecord } from "../index.ts";

export const SHOWS_READ = "node.bootstrap.9c1d.find_shows.s4";
export const LEAVE_OUT = "List this month's shows at the venue rated 4 or higher, leave out sold out shows, going through every page, with columns title and rating.";
export const INCLUDING = "List this month's shows at the venue rated 4 or higher, including sold out shows, going through every page, with columns title and rating.";

export const SHOWS_STORED = ["Harbour Quartet Evening", "Brass on the Pier", "Late Set at the Mill"];
/** Left out by condition 1 alone, its mark read by Core (the witness), and no copy of it stored. */
export const MARKED = "Folk Night in the Long Room";
/** Left out by condition 1 alone, its value never read: Core cannot account for them. */
export const UNREAD = ["Organ Recital at Noon", "Choir and Strings"];

export const NOT_SOLD_OUT = { field: "soldOut", is: "absent" };
export const RATED = { field: "rating", atLeast: 4 };

/**
 * One judged trial's summary: condition 1 (`wording`) alone left out the
 * marked show, whose witness Core read as `witness`, and `unread` shows on
 * which it read nothing.
 */
export function showsSummary(options: { witness?: string; wording?: string; unread?: readonly string[] } = {}): AutomationStudioRunResultSummary {
  const unread = options.unread ?? UNREAD;
  const leftOut = [MARKED, ...unread];
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: SHOWS_STORED.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "shows", recordCount: SHOWS_STORED.length, refusedCount: 0, truncated: false, columns: ["title", "rating"], columnsWithheld: false,
      rowsChecked: SHOWS_STORED.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: SHOWS_STORED.map((title) => ({ title, rating: "4.5" })),
      processing: { collected: 3, duplicates: 0, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: SHOWS_READ, pass: 1, rows: 3, newRows: 3 }] }
    }],
    reads: [{
      nodeId: SHOWS_READ, definitionId: "extract_list", pagesRead: 1, stop: "ended", truncated: false, itemsSeen: 3 + leftOut.length, kept: 3,
      conditions: [
        {
          number: 1, condition: options.wording ?? "soldOut is absent", rejected: leftOut.length, alone: leftOut.length, leftOutOnlyByThis: leftOut,
          // Only the marked show's value was read: the others' are unknown.
          leftOutObservations: [{ source: "read" as const, page: 1, item: 4, readKind: "text" as const, state: "present" as const, value: options.witness ?? "Sold out" }],
          leftOutSettled: [MARKED],
          settled: "On each row in leftOutSettled the read found soldOut, as that row's witness in leftOutObservations gives it, and Core tested that value against condition 1 as written: each fails it."
        },
        { number: 2, condition: "rating atLeast 4", rejected: 0, alone: 0 }
      ]
    }],
    flowShape: [{ nodeId: "node.bootstrap.9c1d.find_shows.s1", definitionId: "type_text" }, { nodeId: SHOWS_READ, definitionId: "extract_list" }],
    withheld: false
  };
}

/** Core's record of a judged trial over the summary, the request said as `body` (no call's no stands). */
export function showsStandingNo(body = LEAVE_OUT, options: Parameters<typeof showsSummary>[0] = {}) {
  const run = showsSummary(options);
  const wording = automationStudioRequestWording([{ title: "Goal", body }], run)!;
  const record = automationStudioResultNoRecord({ summary: run, requestText: `Goal\n${body}`, wording });
  return automationStudioResultStandingNoRecord({ calls: [], record, summary: run, wording });
}

/** A plan of the read step whose conditions are `where`. */
export function showsPlan(where: readonly object[]): AutomationStudioResultConditionPlan {
  return { subflows: [{ key: "find_shows", nodes: [
    { key: "s1", parameters: { url: "https://venue.test/shows" } },
    { key: "s4", parameters: { extract: { where, fields: { title: "title", rating: "rating" } } } }
  ] }] };
}
