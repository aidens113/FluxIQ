// Whether two read steps read one target: the half of "the same list" that
// Core decides from what the Flow authored, never from words (t692, t752).
//
// Both reads are of one node definition, and their authored read parameters
// (`./read-parameters.ts`) agree, member for member, on everything that says
// where the rows come from. The members that say what a read keeps and how it
// stores them are set aside first: its conditions (`where`), its columns
// (`fields`), `dedupe`, `paginate`, `recordOutput`, and any bound (`min…`,
// `max…`, `timeout…`). What remains is the domain's own target, compared as
// values and never read or said: a read whose target holds nothing to compare
// is never the same list.
//
// Shared by Core's flag on a read that kept every item it saw after an act over
// a narrower read (`./kept-every-row.ts`) and its flag on a read whose rows are
// working rows (`./working-rows.ts`); the other half, that a loop walks the
// earlier read's rows, each decides from the graph's edges.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioResultReadParameters } from "./read-parameters.ts";

/** The read parameters that say what a read keeps and how it stores it, never where its rows come from. */
const KEEPING_KEYS: ReadonlySet<string> = new Set(["where", "fields", "dedupe", "paginate", "recordOutput"]);
/** A bound on a read: how few, how many, how long. */
const BOUND_KEY = /^(min|max|timeout)/u;

/** One definition, and the same read target: the read parameters less what says what a read keeps (header). Never said. */
export function automationStudioResultReadSameTarget(first: AutomationStudioFlowNode, second: AutomationStudioFlowNode): boolean {
  if (first.definitionId !== second.definitionId) return false;
  const one = target(first);
  const two = target(second);
  return one !== undefined && one === two;
}

/** The read's target as a canonical string; undefined where nothing remains to compare. */
function target(node: AutomationStudioFlowNode): string | undefined {
  const parameters = automationStudioResultReadParameters(node.parameterValues);
  if (!parameters) return undefined;
  const kept = Object.entries(parameters).filter(([key]) => !KEEPING_KEYS.has(key) && !BOUND_KEY.test(key));
  return kept.length ? canonical(Object.fromEntries(kept)) : undefined;
}

/** A value as one string whatever order its members were written in. */
function canonical(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
