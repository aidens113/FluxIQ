import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY } from "../../../model/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";

// Clearing the token cap Core wrote into every Flow created before 2026-09-30.
//
// **What it was.** `defaultAutomationStudioFlowSettingsMetadata()` gave every new
// Flow `trainingModeSettings.budgets.maxTokensPerRun: 12000`. The recovery reads
// it as the whole run's token budget (`runtime/recovery/annotation/run-budget.ts`),
// so an unattended repair could spend 12,000 tokens in all and a request that
// described a whole page was refused before it was sent. The user's order on
// 2026-09-30 -- "Remove ANY AND ALL LIMITS ON THE NUMBER OF ELEMENTS PASSED TO
// MODEL. DO NOT HIDE INFORMATION" -- leaves the model's context window as the only
// bound on one request and the $0.25 per-build ceiling as the bound on spending,
// so the default no longer carries a cap. A default is only what gets written,
// though: every Flow created before then holds the 12,000 in its own metadata.
//
// **What this clears, and what it never clears.** Exactly the value 12,000, and
// only on a Flow that does not yet carry
// `AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY`. The web settings form
// saved this field only when it differed from 12,000, so no person ever stored
// 12,000 as their own choice: a stored 12,000 is the default. Any other value is a
// person's and is left exactly as it is. Once cleared, the Flow carries the key,
// and a new Flow is created with it, so a 12,000 a person sets later stays.
//
// Applied where a Flow is read (`service/flows/store.ts`, `getFlow`) and where its
// settings are resolved (`merged-metadata.ts`), as the locked-default clearing is
// (`locked-default-migration.ts`): nothing is rewritten in storage by itself, and
// the next ordinary save persists what this produced. It is idempotent.

/** The token cap every Flow was created with before 2026-09-30. */
const RETIRED_DEFAULT_TOKENS_PER_RUN = 12000;

/**
 * The same metadata with the retired 12,000-token default removed and the key
 * that says so added, or the metadata unchanged when it holds no such default.
 */
export function withoutAutomationStudioTokensPerRunDefault(metadata: JsonObject | undefined): JsonObject | undefined {
  if (!metadata || metadata[AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY] === true) return metadata;
  const training = jsonObjectFromUnknown(metadata.trainingModeSettings);
  const budgets = jsonObjectFromUnknown(training?.budgets);
  if (!training || !budgets || budgets.maxTokensPerRun !== RETIRED_DEFAULT_TOKENS_PER_RUN) return metadata;
  const { maxTokensPerRun: _retired, ...rest } = budgets;
  return { ...metadata, [AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY]: true, trainingModeSettings: { ...training, budgets: rest } };
}
