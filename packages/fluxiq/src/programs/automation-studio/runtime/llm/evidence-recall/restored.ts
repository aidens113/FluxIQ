// What a recall gives back of one earlier result: its held views, whole.
//
// A held view is a member a domain declared as `holder.member` -- the web
// domain's read rows (`../decision-context/view-groups.ts`). It is what a call
// returned, so nothing can show it again but the result that carried it, and
// the window shows it whole only until a newer one replaces it
// (`../context-window.ts`). A view of the result itself -- the page -- is not
// given back: the target is still there to look at, and an old page beside
// the current one would only say two things about the same place.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceViewGroup } from "../decision-context/index.ts";

/**
 * Each held view `value` carries, under its holder, in the declared order:
 * every declared member the holder holds, whether or not a newer result has
 * replaced it yet. Empty when the value holds none.
 */
export function automationStudioLlmEvidenceRestored(value: JsonValue, groups: readonly AutomationStudioLlmEvidenceViewGroup[]): JsonObject {
  const restored: JsonObject = {};
  if (!isJsonObject(value)) return restored;
  for (const { holder, members } of groups) {
    if (holder === undefined) continue;
    const held = value[holder];
    if (held === undefined || !isJsonObject(held)) continue;
    const kept: JsonObject = {};
    for (const member of members) if (held[member] !== undefined) kept[member] = held[member]!;
    if (Object.keys(kept).length) restored[holder] = kept;
  }
  return restored;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
