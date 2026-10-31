// The stored order against the read's sort or its stored date fields.
//
// **Holds** where Core's own reading of a record set's sort (`sortRead`,
// `../value-readings/sort-reading.ts`) says the stored rows are in the sort's
// order for every set that has one; or, with no sort, where the request asks
// for newest or oldest first and a date column every kept row states runs
// that way with no row cut past a limit (`../value-readings/kept-date-order.ts`).
//
// **Fails** only where the Flow declared a sort and Core's reading says the
// stored rows are not in it: a Core no with no judge, so nothing short of a
// conclusive reading fails. A set whose sort Core could not read, or whose date
// column is partly unread, is no fact, and the judge is asked as before.

import type { AutomationStudioResultComputedFact, AutomationStudioResultComputedFactsInput } from "../contracts/index.ts";
import type { AutomationStudioResultRecordSetSummary } from "../record-set-summary.ts";
import { automationStudioResultKeptDateOrders } from "../value-readings/index.ts";
import { automationStudioReferenceNow } from "../../reference-now/index.ts";

/** A phrase of the request that asks for an order. */
const ORDER_WORDS = /\b(?:(?:newest|latest|most\s+recent|oldest|earliest|highest|lowest|largest|smallest|cheapest)[\s-]+first|(?:sorted|ordered|ranked)\s+by\s+[^.,;\n]{1,40}|in\s+(?:descending|ascending|alphabetical|chronological)\s+order|(?:descending|ascending)\b)/iu;
const NEWEST_FIRST = /\b(?:newest|latest|most\s+recent)[\s-]+first\b/iu;
const OLDEST_FIRST = /\b(?:oldest|earliest)[\s-]+first\b/iu;

/** The stored order against the read's sort or its stored date fields. None where Core cannot compute it. */
export function automationStudioResultOrderFact(input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  const sets = input.summary.recordSets;
  const sorted = sets.flatMap((set) => {
    const first = set.sortRead?.[0];
    return first?.inOrder === undefined ? [] : [{ set, field: first.field, inOrder: first.inOrder }];
  });
  const out = sorted.filter((entry) => !entry.inOrder);
  if (out.length) {
    const requestWords = requestOrderWords(input.requestText);
    return [{
      kind: "order",
      status: "fails",
      said: `The Flow sorts the answer, and Core's own reading of the stored rows says they are not in that order: ${out.map((entry) => `${labelOf(entry.set)} by ${entry.field}`).join("; ")}.`,
      defects: out.map((entry) => ({ kind: "other" as const, row: `${labelOf(entry.set)}: rows are not in ${entry.field} order`, column: entry.field, requestWords }))
    }];
  }
  if (sorted.length) {
    return [{ kind: "order", status: "holds", said: `Core's own reading of the stored rows says they are in the order the Flow sorts them: ${sorted.map((entry) => `${labelOf(entry.set)} by ${entry.field}`).join("; ")}.` }];
  }
  const down = NEWEST_FIRST.test(input.requestText);
  const up = OLDEST_FIRST.test(input.requestText);
  if (down === up) return [];
  const now = automationStudioReferenceNow(input.summary.referenceNow) ?? Date.now();
  const dated = sets.filter((set) => set.recordCount > 1).map((set) => ({ set, kept: automationStudioResultKeptDateOrders(set, now).find((order) => order.nothingCut && order.order === (down ? "desc" : "asc")) }));
  if (!dated.length || dated.some((entry) => entry.kept === undefined)) return [];
  return [{ kind: "order", status: "holds", said: `The request asks for ${down ? "newest" : "oldest"} first, and the dates in the stored rows run that way: ${dated.map((entry) => `${labelOf(entry.set)} by ${entry.kept!.field}`).join("; ")}.` }];
}

function labelOf(set: AutomationStudioResultRecordSetSummary): string {
  return set.label ?? set.datasetId;
}

/** The request's own words that ask for an order, else its first sentence. */
function requestOrderWords(requestText: string): string {
  const found = ORDER_WORDS.exec(requestText);
  if (found) return found[0].trim();
  const first = requestText.trim().split(/(?<=[.!?])\s+|\n/u)[0] ?? "";
  return first.slice(0, 200);
}
