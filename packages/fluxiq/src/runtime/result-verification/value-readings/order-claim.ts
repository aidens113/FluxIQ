// Whether a judge's words say an answer is out of order where Core's own
// reading of its sort says the rows are in order (t511).
//
// **Why.** Live run `run-mv6qr7fk-77f30b49`: at four trials both judges said the
// answer, sorted by `posted` newest first, was "not newest-first". Core had read
// every posted value as a date and stored the rows in that order; the model took
// the claim as fact and added a column nobody asked for. A record set's
// `sortRead` (`./sort-reading.ts`) says, for its first key, whether the rows
// shown are in that order. A reading that denies the order of a sorted column
// every such record says is in order is contradicted, and `../agreement/`
// marks it so, as it marks a reading about pages the record says do not exist
// (t501).
//
// **Generic words about order only**, never about any site or task: a denial
// that rows are sorted, ordered, in order, or first by newest, oldest, highest
// or lowest, or a claim that a sort compared text. The reading must also name
// the sorted column, so a claim about a column the answer is not sorted by is
// never marked.

import type { AutomationStudioResultRecordSetSummary } from "../contracts/index.ts";
import { automationStudioResultKeptDateOrders } from "./kept-date-order.ts";

/** A denial of order: "not sorted", "isn't newest-first", "out of order", "sorted as strings". */
const DENIES_ORDER = new RegExp([
  String.raw`\b(?:not|isn't|aren't|wasn't|weren't|never|nor)\b[^.;:]{0,40}?\b(?:sorted|ordered|in\s+(?:\w+\s+){0,2}order|(?:newest|oldest|latest|earliest|most\s+recent|highest|lowest|largest|smallest)[\s-]+first|descending|ascending|chronological(?:ly)?)\b`,
  String.raw`\b(?:unsorted|out\s+of\s+order|wrong(?:ly)?\s+(?:sorted|ordered)|incorrectly\s+(?:sorted|ordered))\b`,
  String.raw`\b(?:sort|order|ordering|sorting)\s+(?:is|was)\s+(?:wrong|incorrect|broken|reversed)\b`,
  String.raw`\b(?:sorts?|sorted|sorting|orders?|ordered)\b[^.;:]{0,40}?\b(?:as|by)\s+(?:(?:a|the)\s+)?(?:text|strings?|lexicographic\w*|alphabetic\w*)\b`,
  String.raw`\b(?:sort|order)\w*\s+on\s+(?:\w+\s+){0,2}(?:text|strings?)\b`
].join("|"), "iu");


/** Newest, latest or most recent first, or descending. */
const NEWEST_FIRST = /\b(?:newest|latest|most\s+recent|recent)[\s-]+first\b|\bdescending\b/iu;
/** Oldest or earliest first, or ascending. */
const OLDEST_FIRST = /\b(?:oldest|earliest)[\s-]+first\b|\bascending\b/iu;

/**
 * Whether `text` denies the order of a column every record set sorted by it
 * says is in order (header), or of a date column the kept rows themselves run
 * one way in. Nothing is contradicted without a record set whose first sort key
 * Core checked, or a date column the rows run in.
 *
 * **By the rows' own dates (t795).** Where a set holds a column of dates every
 * kept row states, the rows run one way in it, and nothing was cut past a limit
 * (so no cut row can be the newer one), a denial is contradicted when it names
 * that way (newest first for dates running down, oldest first for dates running
 * up) or, naming no way, names the column. `now` anchors relative dates ("4d");
 * it defaults to the present.
 */
export function automationStudioResultOrderClaimContradicted(text: string | undefined, recordSets: readonly AutomationStudioResultRecordSetSummary[] | undefined, now: number = Date.now()): boolean {
  if (!text || !DENIES_ORDER.test(text)) return false;
  const checked = (recordSets ?? []).flatMap((set) => {
    const first = set.sortRead?.[0];
    return first?.inOrder === undefined ? [] : [first];
  });
  if (checked.length && checked.every((key) => key.inOrder === true) && checked.some((key) => namesColumn(text, key.field))) return true;
  return (recordSets ?? []).some((set) => automationStudioResultKeptDateOrders(set, now).some((kept) => {
    if (!kept.nothingCut) return false;
    const down = NEWEST_FIRST.test(text);
    const up = OLDEST_FIRST.test(text);
    if (down !== up) return down === (kept.order === "desc");
    return namesColumn(text, kept.field);
  }));
}

function namesColumn(text: string, field: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped(field)}(?![\\p{L}\\p{N}_])`, "iu").test(text);
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
