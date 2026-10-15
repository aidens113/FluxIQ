// A finished run with the shape of A8 bigbox `run-mv9dcztz-f16d6b5a` steps
// 0066-0080 (t629), on another kind of site: a library catalogue read over two
// pages, the exact rows stored, and a text condition that keeps only the
// titles whose availability says the request's own words, which alone left out
// three titles its read found saying otherwise. No task, site, item or answer
// of any realistic scenario.
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioResultReadCondition } from "../../read-condition.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../../request-rows/index.ts";

/** The request. */
export const LIBRARY_REQUEST = "List every mystery novel in the library catalogue's search results that is available to borrow today and rated 4 or higher, going through every page. Leave out audiobook editions, list each title once, with columns title, author, rating and url.";

/** The three stored titles: exactly the ones asked for. */
const BOOKS_STORED = [
  { title: "Harbor Lights at Midnight, Hardcover", author: "M. Ostrander", rating: "4.6", url: "/catalog/item/BKH4Q7M2X1" },
  { title: "The Glass Orchard Murders, Paperback", author: "E. Lindqvist", rating: "4.4", url: "/catalog/item/BKG2R8T5Z3" },
  { title: "Silent Bells of Ashford, Large Print", author: "C. Varga", rating: "4.8", url: "/catalog/item/BKS9N3C6V4" }
];

/** Left out by the availability condition alone, each read by Core with a value that fails it. */
export const BOOK_FOG = "Fog Over Penhallow Quay, Hardcover";
export const BOOK_LEDGER = "The Ninth Ledger Mystery, Paperback";
export const BOOK_ABBEY = "Murder at Wrenfield Abbey, Paperback";
/** Left out by the availability condition alone, its value unread: Core settled nothing for it. */
export const BOOK_LARKSPUR = "Echoes in Larkspur Lane, Hardcover";
/** Left out by the rating bound alone, which Core settled: its rating read as 3.8. */
const BOOK_LOW = "Quiet Streets of Dunmore, Paperback";

/** The availability condition, as its account words it: it reads its own value, and the text it tests is the request's. */
export const AVAILABLE_TODAY = "availability (read \"Available to borrow today\" on a row it kept) contains [\"Available to borrow today\"]";

/** The availability condition's account: three titles settled on what their read found, and one, where asked, whose value was not read. */
function availabilityCondition(options: { wording?: string; unread?: boolean } = {}): AutomationStudioResultReadCondition {
  const settled = [BOOK_FOG, BOOK_LEDGER, BOOK_ABBEY];
  return {
    number: 2, condition: options.wording ?? AVAILABLE_TODAY, rejected: 4, alone: options.unread ? 4 : 3,
    leftOutOnlyByThis: [...settled, ...(options.unread ? [BOOK_LARKSPUR] : [])],
    leftOutObservations: [
      { source: "read", page: 1, item: 3, readKind: "text", state: "present", value: "Available tomorrow" },
      { source: "read", page: 1, item: 7, readKind: "text", state: "present", value: "On hold until Monday" },
      { source: "read", page: 2, item: 2, readKind: "text", state: "present", value: "Available tomorrow" },
      ...(options.unread ? [{ source: "read" as const, page: 2, item: 5, readKind: "text" as const, state: "unavailable" as const }] : [])
    ],
    leftOutSettled: settled,
    settled: "On each row in leftOutSettled the read found availability, as that row's witness in leftOutObservations gives it, and Core tested that value against condition 2 as written: each fails it."
  };
}

/** The run (header): `kept` the rows the read kept, `wording` another wording for the availability condition. */
export function libraryRunSummary(options: { wording?: string; unread?: boolean; kept?: number } = {}): AutomationStudioRunResultSummary {
  const rows = BOOKS_STORED;
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: rows.length,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "mysteries", recordCount: rows.length, refusedCount: 0, truncated: false, columns: ["title", "author", "rating", "url"], columnsWithheld: false,
      rowsChecked: rows.length, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: rows.map((row) => ({ ...row })),
      processing: { collected: 3, duplicates: 0, filteredOut: 0, cut: 0, kept: 3, passes: [{ node: "read", pass: 1, rows: 2, newRows: 2 }, { node: "read", pass: 2, rows: 1, newRows: 1 }] }
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 2, stop: "ended", truncated: false, itemsSeen: 9, kept: options.kept ?? 3, paginates: true,
      conditions: [
        { number: 1, condition: "rating atLeast 4", rejected: 1, alone: 1, leftOutOnlyByThis: [`${BOOK_LOW} — rating: 3.8`], leftOutSettled: [`${BOOK_LOW} — rating: 3.8`] },
        availabilityCondition(options),
        { number: 3, condition: "edition not contains [\"Audiobook\"]", rejected: 1, alone: 0 }
      ]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** The request as a Flow instruction, for the checks that read one; `body` another request. */
export function libraryInstruction(body = LIBRARY_REQUEST): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body,
    scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
}

/** The request text as the verification reads it (`../../verify.ts`). */
export function libraryRequestText(body = LIBRARY_REQUEST): string {
  return `Goal\n${body}`;
}

/** The request as a judge's words are held to it, over a run. */
export function libraryWording(summary = libraryRunSummary(), body = LIBRARY_REQUEST): AutomationStudioRequestWording {
  return automationStudioRequestWording([libraryInstruction(body)], summary)!;
}
