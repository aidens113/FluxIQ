// What one earlier call read, as the state a fresh round is shown it (t1036, D10): how many rows, under which columns, and
// which held member of the call's result they were. Never a row: the rows are the attempt's result's, and the call is named
// by its id so they can be recalled.
//
// A held member is a view the domain declares under a holder (`observedStateKeys`, `holder.member`:
// `../../../../../runtime/llm/decision-context/view-groups.ts`); a call that returned none read nothing.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceViewGroups } from "../../../../../runtime/llm/decision-context/index.ts";
import type { AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";

/** The most rows whose keys name a read's columns: a read's rows share their columns, so a few say them all. */
const ROWS_SAMPLED = 5;

/** The rows `step` read (`rows`, the held member `member` they were under) and their `columns`; nothing where it read none. */
export function automationStudioAnswerFirstEarlierReadRows(step: AutomationStudioResultTrailStep, observedStateKeys: readonly string[]): { member: string; rows: number; columns: string[] } | undefined {
  const found = step.found;
  if (!isObject(found)) return undefined;
  for (const { holder, members } of automationStudioLlmEvidenceViewGroups(observedStateKeys)) {
    if (holder === undefined) continue;
    const held = found[holder];
    if (!isObject(held)) continue;
    for (const member of members) {
      const rows = held[member];
      if (!Array.isArray(rows)) continue;
      const columns = new Set<string>();
      for (const row of rows.slice(0, ROWS_SAMPLED)) if (isObject(row)) for (const key of Object.keys(row)) columns.add(key);
      return { member: `${holder}.${member}`, rows: rows.length, columns: [...columns] };
    }
  }
  return undefined;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
