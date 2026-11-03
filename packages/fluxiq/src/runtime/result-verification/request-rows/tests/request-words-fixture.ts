// A generic finished run for the checks that hold a judge's words to the
// request's own (t515, live run `run-mv6v2hx5-f448e662`), on another kind of
// site with the same shape: a catalogue searched for one phrase, a request
// that states one exclusion, a read whose first condition makes it and whose
// second leaves out one more row the request never excludes.
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultConditionName } from "../../read-account/index.ts";
import { automationStudioRequestWording, type AutomationStudioRequestWording } from "../request-wording.ts";

/** The request: one search, one stated exclusion. */
export const REQUEST_WORDS_REQUEST = "Search the catalogue for garden tools and collect every result on the first page, leaving out out-of-stock items.";

/** The same search, stating a second exclusion. */
export const REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS = "Search the catalogue for garden tools and collect every result on the first page, leaving out out-of-stock items and replacement parts.";

/** The rows the read kept and the run stored. */
export const REQUEST_WORDS_KEPT = [
  "Steel Garden Tools Set, 5 Pieces, Ash Handles",
  "Compact Garden Tools Kit with Canvas Bag",
  "Stainless Garden Tools Trio, Trowel, Fork and Weeder"
];

/** The row the stated exclusion left out. */
export const REQUEST_WORDS_OUT_OF_STOCK = "Copper Garden Tools Pair, Hand Forged";

/** The row the unstated condition left out. */
export const REQUEST_WORDS_HANDLE = "Replacement Handle for Garden Tools, Ash Wood, 2 Pack";

/** The stated condition and the unstated one, as the read names them. */
export const REQUEST_WORDS_CONDITIONS = { stock: "stock is present", handle: "name not contains [\"Replacement Handle\"]" };

/** Each condition as every line names it: by its number and wording (t574). */
export const REQUEST_WORDS_NAMES = { stock: automationStudioResultConditionName(1, REQUEST_WORDS_CONDITIONS.stock), handle: automationStudioResultConditionName(2, REQUEST_WORDS_CONDITIONS.handle) };

/** The run: three rows stored, one left out by each condition alone. */
export function requestWordsRunSummary(): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 3,
    totalRefusedCount: 0,
    totalRowsMissingRequired: 0,
    recordSetCount: 1,
    recordSets: [{
      datasetId: "tools", recordCount: 3, refusedCount: 0, truncated: false, columns: ["name", "price"], columnsWithheld: false,
      rowsChecked: 3, rowsMissingRequired: 0, missingRequiredColumns: [],
      sampleRows: REQUEST_WORDS_KEPT.map((name, index) => ({ name, price: `$${12 + index}.00` }))
    }],
    reads: [{
      nodeId: "read", definitionId: "extract_list", pagesRead: 1, truncated: false, itemsSeen: 5, kept: 3,
      conditions: [
        { condition: REQUEST_WORDS_CONDITIONS.stock, rejected: 1, leftOutOnlyByThis: [REQUEST_WORDS_OUT_OF_STOCK] },
        { condition: REQUEST_WORDS_CONDITIONS.handle, rejected: 1, leftOutOnlyByThis: [REQUEST_WORDS_HANDLE], testedLabel: true }
      ]
    }],
    flowShape: [{ nodeId: "search", definitionId: "type_text" }, { nodeId: "read", definitionId: "extract_list" }],
    withheld: false
  };
}

/** The request as a judge's words are held to it, over the run above. */
export function requestWordsWording(request = REQUEST_WORDS_REQUEST): AutomationStudioRequestWording {
  return automationStudioRequestWording([{ title: "Collect the catalogue", body: request }], requestWordsRunSummary())!;
}
