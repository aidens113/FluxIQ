// What a recall gives back of one earlier result: its declared views, whole.
//
// A view is a member a domain declared (`../decision-context/view-groups.ts`):
// a key of the result itself -- the web domain's page -- or a held member,
// `holder.member` -- its read rows. Each is what a call returned, so nothing
// can show it again but the result that carried it, and the window shows it
// whole only until a newer one replaces it (`../context-window.ts`).
//
// **The page is given back too (run-mwc6ut8u-52e3c1b3, R6).** Until then a
// recall left out the result's own page, on the reasoning that the target is
// still there to look at. It is not, once the work has gone elsewhere: that
// run pressed between weeks to see slots a page it had left showed, the repeat
// guard refused the press back as `same_result`, and the page the press had
// ended on was gone from the window. The recall's answer sits in its own
// current-view group (`../decision-context/current-view.ts`), so a page given
// back here is told as the page that call ended on, and never replaces the
// current one.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioLlmEvidenceViewGroup } from "../decision-context/index.ts";

/**
 * Each declared view `value` carries, in the declared order: its own declared
 * members first, then every held view under its holder, whether or not a newer
 * result has replaced it yet. A top-level member that is itself a holder is
 * given back whole, so its held members are not given twice. Empty when the
 * value holds none.
 */
export function automationStudioLlmEvidenceRestored(value: JsonValue, groups: readonly AutomationStudioLlmEvidenceViewGroup[]): JsonObject {
  const restored: JsonObject = {};
  if (!isJsonObject(value)) return restored;
  for (const { holder, members } of groups) {
    if (holder !== undefined) continue;
    for (const member of members) if (value[member] !== undefined) restored[member] = value[member]!;
  }
  for (const { holder, members } of groups) {
    if (holder === undefined || restored[holder] !== undefined) continue;
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
