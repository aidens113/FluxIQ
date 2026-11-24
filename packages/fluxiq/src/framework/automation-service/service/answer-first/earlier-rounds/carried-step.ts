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
// **No denied key, not even as a marker** (t1018). The carried steps travel in the loop's evidence, which the request
// refuses whole, unsent, if any key the domain denies appears anywhere in it, whatever its value
// (`../../../../../runtime/llm/harness/context-packet.ts`). The judge's trail screen keeps such a key with a
// `[withheld]` value, so a carried Flow replay, whose node input holds the domain's saved list binding under its denied
// key, had every fresh round's first request refused before the model was called, round after round
// (run-mwus396e-5447c6f6, 2026-11-24). So every member under a denied key is removed, key and all, at any depth, as the
// draft's are (`../../../../../runtime/llm/harness/draft-screen.ts`), and the step says something was left out.
//
// **Then screened as a judge's trail is** (`../../../../../runtime/result-verification/run-trail/screen.ts`): a
// credential-shaped string is withheld, locator text rewritten, and the times and minted ids that differ on every call
// left out.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceViewGroups } from "../../../../../runtime/llm/decision-context/index.ts";
import { automationStudioLlmValueWithoutDeniedKeys } from "../../../../../runtime/llm/harness/index.ts";
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
  const { value: allowed, withheld } = automationStudioLlmValueWithoutDeniedKeys(carried, options.deniedEvidenceKeys);
  const screened = automationStudioResultTrailScreened(withheld > 0 ? { ...allowed, withheld: WITHHELD_WORDS } : allowed, options.deniedEvidenceKeys).value;
  return isObject(screened) ? screened : undefined;
}

/** What a carried step says where members under keys the domain denies were removed from it. */
const WITHHELD_WORDS = "Values under keys the domain does not show to a model are left out of this call.";

function withoutPage(found: JsonValue, pageKeys: ReadonlySet<string>): JsonValue {
  if (!isObject(found) || pageKeys.size === 0) return found;
  const kept: JsonObject = {};
  for (const [key, member] of Object.entries(found)) kept[key] = pageKeys.has(key) ? AUTOMATION_STUDIO_ANSWER_FIRST_VIEW_NOT_CARRIED : member;
  return kept;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
