// What a stale step's source answered when it was re-run, as candidates for
// the host to find the same item among (t786, design D3 step 3).

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioTargetLineage } from "./contracts.ts";

/**
 * The candidates in the source's fresh outputs:
 *
 * - `row`: every row of the fresh list. The whole list, never For Each's
 *   `first` or `stopAfter` slice of it: an item's position means nothing here.
 * - `output`: the fresh value at the step's binding (`field` below the
 *   output), each element of it when it is a list.
 *
 * Nothing when there is nothing to choose among -- the output is missing, not a
 * list where a list was read, or empty. An empty answer is no proof the item is
 * gone: the read may have met a half-drawn page.
 */
export function automationStudioReacquireCandidates(
  lineage: AutomationStudioTargetLineage,
  outputs: Readonly<Record<string, JsonValue>>,
  field: readonly string[]
): JsonValue[] | undefined {
  const fresh = outputs[lineage.outputKey];
  if (lineage.kind === "row") return Array.isArray(fresh) && fresh.length ? [...fresh] : undefined;
  let value: JsonValue | undefined = fresh;
  for (const segment of field) value = value && typeof value === "object" && !Array.isArray(value) ? value[segment] : undefined;
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return [value];
  return value.length ? [...value] : undefined;
}
