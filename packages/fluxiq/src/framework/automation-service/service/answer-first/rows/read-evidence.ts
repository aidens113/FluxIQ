// What Core already holds about which list a read read, and where in it. Used to tell a re-read
// from a next page (`./list-after-read.ts`) and to tell lists apart (`./dataset-of-read.ts`), and
// never a source of a row.
//
// - **The model's own words**, where its call carries a record output: the list's name
//   (`datasetId`), `writeMode` and `purpose`, the fields it already sets on any read it means to keep.
// - **The call's page words** (`{ page: 2 }`): where in the list it asked to read.
// - **The address it read**, as a domain's answer states it: the read's own `url`, the answer's
//   `location`, or the place the step says it found the page. A page word in that address says
//   where in the list, and the rest of it says which view of the site. A saved step's replay names
//   only where it was written, which says which view and not which page. No address is no evidence:
//   the rows decide.
//
// **And what its own conditions left out (`leftOut`), for the judge of the result its rows make**
// (`runtime/result-verification/flow-less/read-left-out.ts` says why: run-mwaknxf9-7549d126, where a site
// listing one product as an ad and again as not was judged by name, twice refusing the right rows and then
// passing a list that had lost the non-ad card). A read answers with the rows its conditions turned down,
// beside the rows it kept, in one of two shapes, and nothing else is read; none in either shape is none:
//
// - **A replayed read's `readRows`**, Core's own contract (`AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY`,
//   `runtime/result-verification/build-test/read-rows.ts`): `leftOutOnlyByThis`, per condition its 0-based
//   `conditionIndex` and the rows it removed by itself, each `{ label, tested? }`, with `observations`, what it
//   read on each; and `leftOutTogether`, rows several conditions left out, under their `conditionIndexes`. It
//   is read at the answer's top, where a replay puts it, or beside the kept rows.
// - **An exploring read's `rejectedRows`**, beside its kept rows under the declared rows key's holder, which the
//   web domain writes (`domain/src/runtime/llm-evidence/node-run/rejected-rows.ts`): `fields`, the column names
//   once; `conditions`, each with its 0-based `where` and `rowsAlone` (or `rows` from a page that did not say
//   which were alone); `rowsWithOthers`, per set of conditions it `failed`, its rows; each row its values in the
//   order of `fields`. What each condition read on the items it left out is the read's own account's
//   `extraction.rejectedObservations`, per condition, which `SVC/summaries/extraction-summary.ts` already reads.
//
// The conditions are worded from the call that asked for the read (its `where` and columns, found as a run's
// are, `runtime/result-verification/read-account/read-parameters.ts`), never from words in the answer. Nothing
// of it is screened here: the judge's copy screens every label and value it says (`flow-less/read-pages-shown.ts`).
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY, automationStudioResultReadParameters, type AutomationStudioFlowLessReadLeftOut } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstAddressSplit } from "./address-split.ts";
import { automationStudioAnswerFirstPageWord } from "./page-word.ts";
import type { AutomationStudioAnswerFirstReadEvidence } from "./read-evidence-type.ts";
import type { AutomationStudioAnswerFirstRowCall } from "./rows-call.ts";

/** The member of an exploring read that holds the rows its conditions turned down. The web domain writes the same word. */
const REJECTED_ROWS_KEY = "rejectedRows";

type LeftOutSet = AutomationStudioFlowLessReadLeftOut["sets"][number];

export function automationStudioAnswerFirstReadEvidenceOf(call: AutomationStudioAnswerFirstRowCall, answer: AutomationStudioLlmEvidenceToolExecutionResult, readRowsKey: string | undefined): AutomationStudioAnswerFirstReadEvidence {
  const output = recordOutputOf(call.value);
  const named = typeof output?.datasetId === "string" && output.datasetId ? output.datasetId : undefined;
  const says = output?.writeMode === "append" || output?.writeMode === "replace" ? output.writeMode : undefined;
  const live = addressIn(answer, readRowsKey);
  const address = live ?? (isObject(call.value.from) && typeof call.value.from.location === "string" ? call.value.from.location : undefined);
  const list = address === undefined ? undefined : automationStudioAnswerFirstAddressSplit(address);
  const place = placeInCall(call.value) ?? (live === undefined ? undefined : list?.place);
  const leftOut = leftOutOf(call, answer, readRowsKey);
  return { lookUp: output?.purpose === "intermediate", ...(output?.process !== undefined ? { process: output.process } : {}), ...(named ? { named } : {}), ...(says ? { says } : {}), ...(list ? { list: list.view } : {}), ...(place !== undefined ? { place } : {}), ...(leftOut ? { leftOut } : {}) };
}

function recordOutputOf(value: JsonObject): JsonObject | undefined {
  const parameters = value.parameters;
  const inner = isObject(parameters) ? parameters.recordOutput : undefined;
  if (isObject(inner)) return inner;
  return isObject(value.recordOutput) ? value.recordOutput : undefined;
}

function addressIn(answer: AutomationStudioLlmEvidenceToolExecutionResult, readRowsKey: string | undefined): string | undefined {
  const evidence = answer.evidence;
  if (!isObject(evidence)) return undefined;
  const holder = readRowsKey?.split(".")[0];
  const read = holder === undefined ? undefined : evidence[holder];
  const from = answer.draft?.replay?.from;
  for (const said of [isObject(read) ? read.url : undefined, evidence.location, from?.location]) if (typeof said === "string" && said) return said;
  return undefined;
}

/**
 * The call's own page words: a plain value on the call or its parameters. An object under such a
 * word (how to find a next-page control, say) describes how to turn the page and stays the same on
 * every page, so it says nothing of where the read is. None is `undefined`.
 */
function placeInCall(value: JsonObject): string | undefined {
  const places: string[] = [];
  for (const holder of [value, value.parameters]) {
    if (!isObject(holder)) continue;
    for (const [name, inner] of Object.entries(holder)) {
      if (automationStudioAnswerFirstPageWord(name) === "place" && isPlain(inner)) places.push(`${name.toLowerCase()}=${inner}`);
    }
  }
  return places.length ? places.sort().join("&") : undefined;
}

/** What the read's conditions left out, as its answer said it (header), or `undefined` when it said none. */
function leftOutOf(call: AutomationStudioAnswerFirstRowCall, answer: AutomationStudioLlmEvidenceToolExecutionResult, readRowsKey: string | undefined): AutomationStudioFlowLessReadLeftOut | undefined {
  const evidence = isObject(answer.evidence) ? answer.evidence : undefined;
  if (!evidence) return undefined;
  const holder = readRowsKey?.split(".")[0];
  const read = holder ? objectAt(evidence, holder) : undefined;
  const asked = automationStudioResultReadParameters(isObject(call.value.parameters) ? call.value.parameters : undefined);
  const where = Array.isArray(asked?.where) ? asked.where : undefined;
  const columns = isObject(asked?.fields) ? asked.fields : undefined;
  const replayed = objectAt(evidence, AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY) ?? (read ? objectAt(read, AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY) : undefined);
  const rejected = read ? objectAt(read, REJECTED_ROWS_KEY) : undefined;
  const said = replayed ? fromReadRows(replayed) : rejected ? fromRejectedRows(rejected, where, columns, read) : undefined;
  if (!said?.sets.length) return undefined;
  return { ...(where ? { where } : {}), ...(columns ? { columns } : {}), ...(said.found.some((values) => values !== undefined) ? { found: said.found } : {}), sets: said.sets };
}

/** A replayed read's `readRows` (header). */
function fromReadRows(readRows: JsonObject): { sets: LeftOutSet[]; found: (string[] | undefined)[] } {
  const sets: LeftOutSet[] = [];
  const found: (string[] | undefined)[] = [];
  for (const entry of arrayAt(readRows, "leftOutOnlyByThis")) {
    if (!isObject(entry) || !isIndex(entry.conditionIndex)) continue;
    const rows = arrayAt(entry, "rows").filter(isObject);
    if (rows.length) sets.push({ kind: "alone", conditions: [entry.conditionIndex], rows });
    addFound(found, entry.conditionIndex, arrayAt(entry, "observations"));
  }
  for (const entry of arrayAt(readRows, "leftOutTogether")) {
    if (!isObject(entry)) continue;
    const conditions = arrayAt(entry, "conditionIndexes").filter(isIndex);
    const rows = arrayAt(entry, "rows").filter(isObject);
    if (conditions.length && rows.length) sets.push({ kind: "together", conditions, rows });
  }
  return { sets, found };
}

/** An exploring read's `rejectedRows`, its rows made `{ label, tested? }` as a replay sends them (header). */
function fromRejectedRows(rejected: JsonObject, where: readonly JsonValue[] | undefined, columns: JsonObject | undefined, read: JsonObject | undefined): { sets: LeftOutSet[]; found: (string[] | undefined)[] } {
  const fields = arrayAt(rejected, "fields").filter((field): field is string => typeof field === "string");
  const sets: LeftOutSet[] = [];
  if (!fields.length) return { sets, found: [] };
  const row = (values: JsonValue, tested?: string): JsonObject[] => {
    if (!Array.isArray(values)) return [];
    const label = values[0];
    if (typeof label !== "string") return [];
    const at = tested === undefined ? -1 : fields.indexOf(tested);
    const value = at > 0 ? values[at] : undefined;
    return [{ [fields[0]!]: label, ...(typeof value === "string" ? { [tested!]: value } : {}) }];
  };
  for (const entry of arrayAt(rejected, "conditions")) {
    if (!isObject(entry) || !isIndex(entry.where)) continue;
    const tested = testedColumn(where?.[entry.where], columns);
    const alone = arrayAt(entry, "rowsAlone").flatMap((values) => row(values, tested));
    if (alone.length) sets.push({ kind: "alone", conditions: [entry.where], rows: alone });
    const unsplit = arrayAt(entry, "rows").flatMap((values) => row(values, tested));
    if (unsplit.length) sets.push({ kind: "unsplit", conditions: [entry.where], rows: unsplit });
  }
  for (const entry of arrayAt(rejected, "rowsWithOthers")) {
    if (!isObject(entry)) continue;
    const conditions = arrayAt(entry, "failed").filter(isIndex);
    const rows = arrayAt(entry, "rows").flatMap((values) => row(values));
    if (conditions.length && rows.length) sets.push({ kind: "together", conditions, rows });
  }
  const found: (string[] | undefined)[] = [];
  const account = read ? objectAt(read, "extraction") : undefined;
  arrayAt(account, "rejectedObservations").forEach((observations, index) => addFound(found, index, Array.isArray(observations) ? observations : []));
  return { sets, found };
}

/** The column a condition tests: its `field` where that is a column, or the column whose read that field is. */
function testedColumn(condition: JsonValue | undefined, columns: JsonObject | undefined): string | undefined {
  if (!isObject(condition) || typeof condition.field !== "string") return undefined;
  const field = condition.field;
  return columns ? Object.entries(columns).find(([key, read]) => key === field || read === field)?.[0] : undefined;
}

/** The distinct values a condition read on the items it left out, in the order first read, added at its place. */
function addFound(found: (string[] | undefined)[], index: number, observations: readonly JsonValue[]): void {
  const values = observations.flatMap((observation) => (isObject(observation) && observation.state === "present" && typeof observation.value === "string" && observation.value.trim() ? [observation.value] : []));
  if (!values.length) return;
  while (found.length < index) found.push(undefined);
  found[index] = [...new Set([...(found[index] ?? []), ...values])];
}

function objectAt(holder: JsonObject | undefined, key: string): JsonObject | undefined {
  const value = holder?.[key];
  return isObject(value) ? value : undefined;
}

function arrayAt(holder: JsonObject | undefined, key: string): JsonValue[] {
  const value = holder?.[key];
  return Array.isArray(value) ? value : [];
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPlain(value: JsonValue): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
