import { automationStudioRequestRowsStoredLine, type AutomationStudioRequestRowsUnquoted } from "../request-rows/index.ts";

/** A presence test as Core names it (`read-account/condition-name.ts`, `read-account/condition.ts`): its wording ends `is present` or `is absent`. */
const PRESENCE_CONDITION = / is (?:present|absent)\)$/u;

/**
 * Core's line for one condition's left-out rows a yes did not quote the
 * request's excluding words beside (`request-rows/unquoted-rows.ts`). Worded
 * "left out by condition", not "the condition": `request-rows/`
 * `checked-rows-named.ts` reads rows after "the condition" as rows the request
 * asks for, which a repair's rerun is then measured against; these rows are
 * only rows the yes did not account for, not rows Core says are wanted.
 *
 * Rows Core settled (`bound`, t574) are not asked to be quoted for: Core read
 * each as failing the condition's bound, and the line asks only for the one
 * quote of the request's words stating that bound -- or, for a presence test
 * (t599), asking for what it tests.
 */
export function unquotedLine(entry: AutomationStudioRequestRowsUnquoted): string {
  // Rows another read stored though this condition left them out of the act: rows the result keeps, said so (t691).
  if (entry.stored) return automationStudioRequestRowsStoredLine(entry);
  const where = entry.step !== undefined ? `Step ${entry.step}` : `Read ${entry.nodeId ?? "(unnamed)"}`;
  const one = entry.rows.length === 1;
  if (entry.bound && PRESENCE_CONDITION.test(entry.condition)) {
    // A presence test bounds nothing: its rows' witnesses found what the condition leaves out (`../value-readings/settled-rows.ts`, t599).
    return `The check answered yes without quoting, in a sentence that names ${entry.condition} (${where}), the request's words asking for what that condition tests. Core's read found, on ${one ? "the row" : `each of the ${entry.rows.length} rows`} it alone left out, what that condition leaves out, so no quote is needed beside ${one ? "it" : "them"}; one quote of the request asking for it is. If the request asks no such thing, ${one ? "that row is one" : "those rows are ones"} it asks for.`;
  }
  if (entry.bound) {
    return `The check answered yes without quoting, in a sentence that names ${entry.condition} (${where}), the request's words that state its bound. Core read ${one ? "the row" : `each of the ${entry.rows.length} rows`} it alone left out as failing that bound, so no quote is needed beside ${one ? "it" : "them"}; one quote of the request stating the bound is. If the request states no such bound, ${one ? "that row is one" : "those rows are ones"} it asks for.`;
  }
  return `The check answered yes without quoting, beside ${one ? "this row" : "each of these rows"}, words of the request that exclude ${one ? "it" : "each"}; ${one ? "it was" : "they were"} left out by ${entry.condition} alone (${where}) -- ${entry.rows.join(" | ")}. A row the request's own words do not exclude is one it asks for.`;
}
