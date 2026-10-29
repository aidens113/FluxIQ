// The sort a listing hands a repeat over it (t796).
//
// A listing node that declares `answersRows: "page_order"` hands its rows on in
// the order the page shows them, and its own sort -- written where the node
// declares its author writes one, `recordProcessWrittenAt.sort` -- orders only
// the answer it saves (`./listing-order-in-repeat.ts`). Core orders the rows a
// For Each over it walks by that same sort instead
// (`./repeat-order.ts`, `nodes/control-flow/for-each.ts` `order`),
// and the listing rule admits the sort once every lasting For Each it feeds
// carries it. Both read the sort here, so the one the loop is given and the one
// the rule checks for cannot come apart.
//
// Only the listing's own sort counts. A sort written only in
// `recordOutput.process` is the saved answer's, as the script format says, and
// is not moved onto the loop; a node that declares no page order orders its rows
// itself, or not at all, and is left alone. An author's off values (`[]`,
// `false`, `""`) order nothing. One key written alone is a list of one.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";

/** The definition metadata a listing node declares its rows' order and its process keys' authored paths under. */
const ANSWERS_ROWS = "answersRows";
const PAGE_ORDER = "page_order";
const WRITTEN_AT = "recordProcessWrittenAt";
/** A declared authored path: dotted parameter keys. */
const PARAMETER_PATH = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/u;

/** The sort a page-order listing's own parameters hand a For Each over it, with the parameter path it was written at, or none (header). */
export function automationStudioListingRepeatSort(definition: AutomationStudioNodeDefinition, parameters: JsonObject | undefined): { path: string; keys: JsonValue[] } | undefined {
  if (definition.metadata?.[ANSWERS_ROWS] !== PAGE_ORDER) return undefined;
  const declared = definition.metadata?.[WRITTEN_AT];
  const path = isObject(declared) ? declared.sort : undefined;
  if (typeof path !== "string" || !PARAMETER_PATH.test(path)) return undefined;
  let at: JsonValue | undefined = parameters;
  for (const segment of path.split(".")) at = isObject(at) ? at[segment] : undefined;
  if (Array.isArray(at)) return at.length ? { path, keys: [...at] } : undefined;
  return isObject(at) ? { path, keys: [at] } : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
