import type { AutomationStudioRequestRowsUnquoted } from "./types.ts";

/**
 * How Core's line for a yes's unexplained stored rows begins (below,
 * t691): what `../agreement/said.ts` reads a held yes's lines for, so the words
 * are said once.
 */
export const AUTOMATION_STUDIO_REQUEST_ROWS_STORED_LINE_OPENING = "The check answered yes without saying why the result keeps";

/**
 * Core's line for one condition's rows another read stored that a yes did not
 * name beside that read and the request's words asking for them in the answer
 * (`unquoted-rows.ts`, `stored`, t691). It names rows the result keeps, which
 * the exclusion-evidence recheck asks to be named beside the request's own
 * words for what it asks for (`../exclusion-evidence/recheck.ts`). Worded
 * "which condition N ... left out", never "the condition N": `checked-rows-named.ts`
 * reads rows after "the condition" as rows the request asks for.
 */
export function automationStudioRequestRowsStoredLine(entry: AutomationStudioRequestRowsUnquoted): string {
  const where = entry.step !== undefined ? `Step ${entry.step}` : `Read ${entry.nodeId ?? "(unnamed)"}`;
  const one = entry.rows.length === 1;
  const reads = (entry.stored ?? []).map((node) => `read ${node}`).join(" and ") || "another read";
  return `${AUTOMATION_STUDIO_REQUEST_ROWS_STORED_LINE_OPENING} ${one ? "this row" : `these ${entry.rows.length} rows`}, which ${entry.condition} left out of what the Flow acted on (${where}) and ${reads} stored -- ${entry.rows.join(" | ")}. `
    + `Name ${one ? "it" : "each"} in a sentence that names ${reads} and quotes, in double quotes, the request's own words asking for ${one ? "that row" : "each row"} in the answer. `
    + "A row the request does not ask for in its answer is one the result should not keep.";
}
