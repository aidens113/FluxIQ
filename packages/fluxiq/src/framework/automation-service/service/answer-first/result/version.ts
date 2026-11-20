// Whether two read versions read the same way: the one comparison a version change (`./step-set.ts`) and a fold of
// a new step into an existing one (lead decision D2) are both made by.
//
// Conditions compare as a set of their stable forms, as `../rows/read-evidence.ts` reads them, so two calls that
// wrote one condition with its keys in another order are one condition. Fields compare whole, in a stable form.
// The list compares by the domain's `listKey` only, never by a handle or the call's text (I3):
//
// - **Within one step** an absent key on either side is "not said", never a different list: an amendment carries no
//   domain answer, and its step's first page then says the key.
// - **For a fold** both keys must be said and equal: two steps are the same list only where the site says so.
import { stableJson } from "../../stable-json.ts";
import type { AutomationStudioAnswerFirstResultVersion } from "./types.ts";

export function automationStudioAnswerFirstResultSameReading(
  one: AutomationStudioAnswerFirstResultVersion,
  other: AutomationStudioAnswerFirstResultVersion,
  list: "may be unsaid" | "must be said",
): boolean {
  const sameList = list === "must be said"
    ? one.listKey !== undefined && one.listKey === other.listKey
    : one.listKey === undefined || other.listKey === undefined || one.listKey === other.listKey;
  return sameList && conditionsKey(one) === conditionsKey(other) && stableJson(one.fields) === stableJson(other.fields);
}

function conditionsKey(version: AutomationStudioAnswerFirstResultVersion): string {
  return JSON.stringify([...new Set(version.conditions.map((condition) => stableJson(condition)))].sort());
}
