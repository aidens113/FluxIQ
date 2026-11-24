// One call of an earlier round as a fresh round is shown it (t1014): what ran (`did`), on what (`on`), asked with what
// (`asked`), how it came back (`outcome`), where (`where`) and what it found (`found`), from the attempt's trail
// (`../trail/`, the same record its judge reads).
//
// **Never a raw page dump.** A result's view of the whole page -- each top-level key the domain declares as a view
// (`observedStateKeys` without a holder: the web domain's elements and page text) -- is replaced by a marker. The page
// stands where the last round left it and the round's own opening look shows it as it is now, so an old copy would only
// be a second, stale page beside it. Everything else is kept whole: what a search or a description found, a read's rows
// (a held view such as `read.extracted` is what the read found, not the page), an act's outcome, the place.
//
// **Screened as a judge's trail is** (`../../../../../runtime/result-verification/run-trail/screen.ts`): a member
// under a denied key or a credential-shaped string is withheld, locator text rewritten, and the times and minted ids
// that differ on every call left out.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceViewGroups } from "../../../../../runtime/llm/decision-context/index.ts";
import { automationStudioResultTrailScreened, type AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_VIEW_NOT_CARRIED } from "./view-not-carried.ts";

/** `step`, numbered `n` from 1 in the order it ran, as a fresh round is shown it; nothing where nothing of it may be shown. */
export function automationStudioAnswerFirstCarriedStep(step: AutomationStudioResultTrailStep, n: number, options: { observedStateKeys: readonly string[]; deniedEvidenceKeys: readonly string[] }): JsonObject | undefined {
  const pageKeys = new Set(automationStudioLlmEvidenceViewGroups(options.observedStateKeys).flatMap((group) => (group.holder === undefined ? group.members : [])));
  const found = step.found === undefined ? undefined : withoutPage(step.found, pageKeys);
  const carried: JsonObject = {
    n,
    did: step.did,
    ...(step.on === undefined ? {} : { on: step.on }),
    ...(step.asked === undefined ? {} : { asked: step.asked }),
    ...(step.outcome === undefined ? {} : { outcome: step.outcome }),
    ...(step.where === undefined ? {} : { where: step.where }),
    ...(found === undefined ? {} : { found })
  };
  const screened = automationStudioResultTrailScreened(carried, options.deniedEvidenceKeys).value;
  return isObject(screened) ? screened : undefined;
}

function withoutPage(found: JsonValue, pageKeys: ReadonlySet<string>): JsonValue {
  if (!isObject(found) || pageKeys.size === 0) return found;
  const kept: JsonObject = {};
  for (const [key, member] of Object.entries(found)) kept[key] = pageKeys.has(key) ? AUTOMATION_STUDIO_ANSWER_FIRST_VIEW_NOT_CARRIED : member;
  return kept;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
