// A list read's own account of itself, projected out of a saved attempt's
// outputs so a finished run can still say what the read did.
//
// It is the same defect `host-target-resolution.ts` beside it was written for,
// on a different record. The downstream web domain's `web.dom.extract_list`
// answers with a summary of its read -- how many records, over how many pages,
// which declared fields some row did not yield, whether a cap cut it short,
// whether the list it waited for was ever on the page, and what its `where`
// conditions kept and rejected. That summary reaches Core inside the dispatched
// result payload, which `runtime/io-policy.ts` puts on the node's
// `outputs.result`, and nothing carried it any further: the run record kept
// `metadata.recordCount` and nothing else, so a read that stored no rows looked
// identical whether its selector had named nothing, the page had held nothing,
// or its conditions had rejected every row. Those three want different repairs,
// and a run that cannot tell them apart makes the repair guess.
//
// **The attempt's outputs do not survive.** `attemptOutputShape` in
// `conversions.ts` reduces them to names and lengths on purpose, because
// `attempt.outputs` is live data of unknown sensitivity. This projection is how
// the one part of them that is not page data travels: every member admitted
// here is a count, a boolean, a word from a closed set, or a record field key,
// which the same limits that govern a stored dataset's schema hold to letters,
// digits, `_` and `-`. No selector, no page text, no URL and no prose can be
// spelled in any of them.
//
// **A summary is admitted whole or not at all.** The producer's own copy
// (`domain/src/actions/extraction/summary.ts`) drops the whole summary rather
// than let one unreadable member through, on the reasoning that a half-read
// account is worse than none; re-checking it here more permissively would
// undo that. So a member that is not what the contract says it is -- a count
// that is not a count, a missing field that is not one of the read's own
// fields, a presence word this Core does not know -- leaves the attempt with no
// extraction record, exactly as an attempt that dispatched no read has.
//
// **The one exception, and the rule behind it: a stop word this Core does not
// know is renamed, not refused.** `listWait.stoppedOn` enumerates the
// *mechanisms* that can end a wait for the list, and mechanisms get added; the
// downstream domain and this Core ship separately and nothing sequences them,
// so a domain that names a fifth way a wait can end would, under the rule
// above, cost every run every read's account of itself -- which is exactly what
// t143 had to reconstruct by hand from `durationMs` arithmetic. So an
// unrecognised `stoppedOn` is published as `"unknown"` and the two durations
// beside it travel untouched. Nothing about redaction is relaxed by that: the
// foreign string is discarded rather than republished, so what lands in the run
// record is still a word from a closed set.
//
// `paginationStop` is the second such set and takes the same rule, for the same
// reason: it names the ways a paginated read can stop paging, and a newer
// producer that finds another way publishes here as `"unknown"` rather than
// costing the account.
//
// Tolerance goes to the closed word sets and no further, because version skew
// adds words and members -- it does not turn a count into a string. A count
// that is not a count, or a `stoppedOn` that is not even a string, is a
// producer defect rather than a newer producer, and still drops the summary.
// `listPresence` stays strict for a different reason: its two words answer a
// yes/no question about whether the selector ever named an element, so that set
// is closed by what it means and has nowhere to grow.
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../../core/index.ts";
import { isJsonRecord } from "../json-values.ts";

/** The two words the read uses for whether its `item` selector ever named an element (contract C2). */
const LIST_PRESENCE = new Set(["appeared", "never_appeared"]);

/**
 * The four things that can end a read's wait for its list (contract C2):
 * `list_present` the items arriving, `page_settled` the document holding still
 * with some of the list drawn and the rest missing, `window_elapsed` the read's
 * own render window running out, and `deadline_passed` the command's
 * `timeoutMs`.
 */
const WAIT_STOPS = new Set(["list_present", "page_settled", "window_elapsed", "deadline_passed"]);

/** What a stop word outside the set above is published as, so a fifth mechanism costs the word and not the account. */
const WAIT_STOP_UNKNOWN = "unknown";

/**
 * Why a read that pages stopped paging (contract C2): the list ending
 * (`control_absent`, `control_disabled`, `no_following_page`,
 * `scrolled_to_end`, `list_vanished`), a bound (`page_limit`, `item_limit`,
 * `deadline`), or the page misbehaving (`list_unchanged`, `page_repeated`,
 * `control_not_clickable`, `page_fault`). Live run `run-mulwm2dc-0bd95f22` read
 * one page of fifty and its run record could not say which of these it was.
 */
const PAGINATION_STOPS = new Set([
  "control_absent",
  "control_disabled",
  "no_following_page",
  "scrolled_to_end",
  "list_vanished",
  "page_limit",
  "item_limit",
  "deadline",
  // A 429 or 503 the read waited out and was refused again (the extension's refused-page retry).
  "rate_limited",
  "list_unchanged",
  "page_repeated",
  "control_not_clickable",
  "page_fault"
]);

/** What a pagination stop word outside the set above is published as, on the rule `WAIT_STOP_UNKNOWN` states. */
const PAGINATION_STOP_UNKNOWN = "unknown";

/**
 * How many `where` conditions a read may report rejections for. A read carries
 * one count per condition it was given, and a list of more than this is not one
 * the product writes -- so an unbounded array arriving from a downstream host
 * is refused rather than republished at whatever length it came in.
 */
const MAXIMUM_CONDITIONS = 64;

/**
 * The read's summary, rebuilt member by member, or `undefined` when the attempt
 * dispatched no read, the host reported no summary, the result payload was
 * withheld (a dispatch that saves records keeps a marker in its place), or any
 * member is not one this contract knows -- with the two exceptions the header
 * states, an unrecognised `listWait.stoppedOn` or `paginationStop`, each
 * published as `"unknown"` rather than costing the summary.
 *
 * It is looked for at two depths for the reason its neighbour is: a
 * *runtime*-dispatched output puts the client's action-result payload straight
 * onto `outputs.result`, while an output dispatched through the IO registry --
 * the route a paired browser client takes -- is answered by the domain's
 * gateway dispatcher, which wraps the same payload as `{ status, message,
 * result }`. Reading only the first shape is how the target resolution beside
 * this was absent from every real run while its unit tests passed.
 */
export function extractionSummaryFromOutputs(outputs: unknown): JsonObject | undefined {
  if (!isJsonRecord(outputs) || !isJsonRecord(outputs.result)) return undefined;
  const dispatched = isJsonRecord(outputs.result.result) ? outputs.result.result : outputs.result;
  const summary = dispatched.extraction;
  if (!isJsonRecord(summary)) return undefined;
  const recordCount = count(summary.recordCount);
  const pagesRead = count(summary.pagesRead);
  const fieldNames = fieldKeys(summary.fieldNames);
  const missingFields = fieldKeys(summary.missingFields);
  if (recordCount === undefined || pagesRead === undefined || typeof summary.truncated !== "boolean") return undefined;
  if (fieldNames === undefined || missingFields === undefined) return undefined;
  // A field some row did not yield is one of the read's own declared fields.
  // Anything else is a producer naming something the request never asked for.
  if (!missingFields.every((key) => fieldNames.includes(key))) return undefined;
  const listPresence = summary.listPresence;
  if (listPresence !== undefined && !(typeof listPresence === "string" && LIST_PRESENCE.has(listPresence))) return undefined;
  const conditions = summary.conditions === undefined ? undefined : conditionReport(summary.conditions);
  if (summary.conditions !== undefined && conditions === undefined) return undefined;
  // The two counts a zero read is diagnosed by, absent from a producer that did
  // not count them and held to the same rule as every other count when sent.
  // They are deliberately not cross-checked against `recordCount` or against
  // each other: `itemsSeen` is the whole read's while a condition report is one
  // document's, and the surprising pairings are the diagnosis rather than a
  // malformed report -- `itemsSeen: 0` names the selector, `emptyRecords` equal
  // to `recordCount` names fields read off the wrong element.
  const itemsSeen = count(summary.itemsSeen);
  const emptyRecords = count(summary.emptyRecords);
  if (summary.itemsSeen !== undefined && itemsSeen === undefined) return undefined;
  if (summary.emptyRecords !== undefined && emptyRecords === undefined) return undefined;
  const listWait = summary.listWait === undefined ? undefined : waitReport(summary.listWait);
  if (summary.listWait !== undefined && listWait === undefined) return undefined;
  // Why paging stopped: absent from a read that did not page, a word from the
  // set or `"unknown"` for a newer one, and a summary dropped for anything that
  // is not a word at all.
  if (summary.paginationStop !== undefined && typeof summary.paginationStop !== "string") return undefined;
  const paginationStop = typeof summary.paginationStop === "string"
    ? (PAGINATION_STOPS.has(summary.paginationStop) ? summary.paginationStop : PAGINATION_STOP_UNKNOWN)
    : undefined;
  return {
    recordCount,
    pagesRead,
    truncated: summary.truncated,
    fieldNames,
    missingFields,
    ...(itemsSeen !== undefined ? { itemsSeen } : {}),
    ...(emptyRecords !== undefined ? { emptyRecords } : {}),
    ...(typeof listPresence === "string" ? { listPresence } : {}),
    ...(listWait ? { listWait } : {}),
    ...(conditions ? { conditions } : {}),
    ...(paginationStop !== undefined ? { paginationStop } : {})
  };
}

/**
 * What the wait for the list did: how long it waited, how many items it was
 * waiting for, and which of the four mechanisms ended it -- or `"unknown"` for a
 * fifth this Core has not been told about, which is the header's one exception.
 *
 * `undefined` only for an account that is not well formed: a duration that is
 * not a count, or a `stoppedOn` that is not even a string. That keeps the
 * *absence* of this member meaning one thing, which is what the read's producer
 * relies on -- absent is "this read waited for no list of its own", a continued
 * read resuming on the page its predecessor's control reached.
 */
function waitReport(value: unknown): JsonObject | undefined {
  if (!isJsonRecord(value)) return undefined;
  const waitedMs = count(value.waitedMs);
  const waitedFor = count(value.waitedFor);
  if (waitedMs === undefined || waitedFor === undefined || typeof value.stoppedOn !== "string") return undefined;
  return { stoppedOn: WAIT_STOPS.has(value.stoppedOn) ? value.stoppedOn : WAIT_STOP_UNKNOWN, waitedMs, waitedFor };
}

/**
 * What the read's `where` did, in counts alone: the items it was asked about,
 * the items every condition held of, one rejection count per condition
 * positionally, and whether the read answered with the rows its conditions
 * rejected because keeping only the survivors would have answered with none.
 */
function conditionReport(value: unknown): JsonObject | undefined {
  if (!isJsonRecord(value)) return undefined;
  const applied = count(value.applied);
  const kept = count(value.kept);
  const rejected = Array.isArray(value.rejected) && value.rejected.length <= MAXIMUM_CONDITIONS && value.rejected.every((entry) => count(entry) !== undefined)
    ? value.rejected as number[]
    : undefined;
  if (applied === undefined || kept === undefined || rejected === undefined || typeof value.unfiltered !== "boolean") return undefined;
  // A read cannot have kept more items than it looked at.
  if (kept > applied) return undefined;
  return { applied, kept, rejected: [...rejected], unfiltered: value.unfiltered };
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/**
 * A list of record field keys, held to the limits a stored dataset's schema is
 * held to: Core's own field-id pattern, its reserved ids, and its field count.
 * They are the same rule the downstream domain derives a key by, restated here
 * because this is the side that checks rather than the side that produces.
 */
function fieldKeys(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.maxFields) return undefined;
  const reserved: readonly string[] = AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.reservedFieldIds;
  return value.every((key) => typeof key === "string" && AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(key) && !reserved.includes(key))
    ? value as string[]
    : undefined;
}
