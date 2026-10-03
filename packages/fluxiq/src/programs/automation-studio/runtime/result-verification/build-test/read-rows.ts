// The rows a replayed list read names, as the judge of a build's test is shown
// them (t194 w55).
//
// **Why.** Live run `run-muqk713g` (C3): the build-test judge answered yes to a
// read that kept 10 of the 13 earbuds asked for, because a replayed read told it
// counts only -- "per condition rejected (removed alone): ... name 20 (5)". The
// three pairs missing were rows the name condition removed by itself. The
// runtime judge is shown those rows by label (`leftOutOnlyByThis`,
// `../read-account/alone-rows.ts`); this gives the build-test judge the same.
//
// **What the domain sends.** A replayed list read's answer carries, beside its
// `said` line, `readRows`: `rows`, the labels of every row it returned (a
// domain that sends fewer says how many more in `rowsNotShown`; the web domain
// sends them all), and `leftOutOnlyByThis`, one
// entry per condition that removed rows by itself, naming the condition and its
// rows. Each label is a one-column record `{ column: label }`, as the playback's
// `conditions.aloneRows` are (`service/summaries/extraction-summary.ts`), so its
// column can still be screened.
//
// **What the judge is sent.** Each list becomes its labels, screened by the very
// function the runtime judge's are (`automationStudioResultReadAloneRows`): a
// label from a denied column, or shaped like a credential, is said as withheld
// and still counts as a row. That happens before the observation's own
// screening, which would otherwise drop a denied column's record silently, or
// withhold the whole observation -- its counts included -- for one label. A
// member that is not that shape is left out; the rest of the observation stays.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioResultReadAloneRows } from "../read-account/index.ts";

/** The member of a replayed read's answer that names its rows. The domain writes the same word. */
export const AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY = "readRows";

/** The longest condition name kept: a field key or `condition N`, never prose. */
const CONDITION_NAME_MAX = 64;

/**
 * One observation with its `readRows` made labels, and whether a label was
 * withheld. Anything that is not an object carrying `readRows` comes back as
 * it was.
 */
export function automationStudioBuildTestReadRows(value: JsonValue, deniedKeys: readonly string[]): { value: JsonValue; withheld: boolean } {
  if (!isObject(value) || !Object.hasOwn(value, AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY)) return { value, withheld: false };
  const { [AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY]: sent, ...rest } = value;
  const screened = isObject(sent) ? readRows(sent, deniedKeys) : undefined;
  if (!screened) return { value: rest, withheld: false };
  return { value: { ...rest, [AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY]: screened.value }, withheld: screened.withheld };
}

function readRows(sent: JsonObject, deniedKeys: readonly string[]): { value: JsonObject; withheld: boolean } | undefined {
  let withheld = false;
  const labels = (list: JsonValue | undefined): string[] | undefined => {
    const said = automationStudioResultReadAloneRows(list, deniedKeys);
    // A label the screen withheld reads differently from the one sent; both skip the same malformed records.
    const sentLabels = Array.isArray(list) ? list.flatMap((row) => labelSent(row) ?? []) : [];
    if (said?.some((label, index) => label !== sentLabels[index])) withheld = true;
    return said;
  };
  const rows = labels(sent.rows);
  const conditions = Array.isArray(sent.leftOutOnlyByThis) ? sent.leftOutOnlyByThis.flatMap((entry): JsonObject[] => {
    if (!isObject(entry) || typeof entry.condition !== "string" || !entry.condition.trim() || entry.condition.length > CONDITION_NAME_MAX) return [];
    const said = labels(entry.rows);
    return said ? [{ condition: entry.condition, rows: said, ...notShown(entry.rowsNotShown) }] : [];
  }) : [];
  if (!rows && !conditions.length) return undefined;
  return {
    value: { ...(rows ? { rows, ...notShown(sent.rowsNotShown) } : {}), ...(conditions.length ? { leftOutOnlyByThis: conditions } : {}) },
    withheld
  };
}

/** The label a one-column record carries, as sent. */
function labelSent(row: JsonValue | undefined): string | undefined {
  if (!isObject(row)) return undefined;
  const [cell] = Object.values(row);
  return typeof cell === "string" ? cell : undefined;
}

function notShown(value: JsonValue | undefined): { rowsNotShown?: number } {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? { rowsNotShown: value } : {};
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
