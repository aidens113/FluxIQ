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
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstPageWord } from "./page-word.ts";
import type { AutomationStudioAnswerFirstReadEvidence } from "./read-evidence-type.ts";
import type { AutomationStudioAnswerFirstRowCall } from "./rows-call.ts";

export function automationStudioAnswerFirstReadEvidenceOf(call: AutomationStudioAnswerFirstRowCall, answer: AutomationStudioLlmEvidenceToolExecutionResult, readRowsKey: string | undefined): AutomationStudioAnswerFirstReadEvidence {
  const output = recordOutputOf(call.value);
  const named = typeof output?.datasetId === "string" && output.datasetId ? output.datasetId : undefined;
  const says = output?.writeMode === "append" || output?.writeMode === "replace" ? output.writeMode : undefined;
  const live = addressIn(answer, readRowsKey);
  const address = live ?? (isObject(call.value.from) && typeof call.value.from.location === "string" ? call.value.from.location : undefined);
  const list = address === undefined ? undefined : split(address);
  const place = placeInCall(call.value) ?? (live === undefined ? undefined : list?.place);
  return { lookUp: output?.purpose === "intermediate", ...(named ? { named } : {}), ...(says ? { says } : {}), ...(list ? { list: list.view } : {}), ...(place !== undefined ? { place } : {}) };
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

/** An address as the view it shows and where in it, page words apart: the fragment and the order of its query say neither. */
function split(address: string): { view: string; place?: string } {
  if (!URL.canParse(address)) return { view: address };
  const url = new URL(address);
  const places: string[] = [];
  const kept: string[] = [];
  for (const [name, value] of [...url.searchParams].sort(([one], [other]) => one.localeCompare(other))) {
    const word = automationStudioAnswerFirstPageWord(name);
    if (word === "place") places.push(`${name.toLowerCase()}=${value}`);
    else if (!word) kept.push(`${name}=${value}`);
  }
  const inPath = /\/page\/(\d{1,9})(?=\/|$)/iu.exec(url.pathname);
  if (inPath) places.push(`page=${inPath[1]}`);
  const path = (inPath ? url.pathname.replace(inPath[0], "") : url.pathname).replace(/\/+$/u, "");
  return { view: `${url.protocol}//${url.host}${path}?${kept.join("&")}`, ...(places.length ? { place: places.join("&") } : {}) };
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

function isPlain(value: JsonValue): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
