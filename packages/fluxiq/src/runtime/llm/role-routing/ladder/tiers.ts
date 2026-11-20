// The model ladder's rungs (user, 2026-11-19: "it should be a lower tier model with no thinking that
// tries solving, and ONLY escalates to another model if it CANT figure out the task"). Cheapest
// first: an attempt starts on its base rung and climbs one rung at a time, only when it shows it
// cannot get the task done (`./climb.ts`). A model not on it is never climbed from.

import type { AutomationStudioAnthropicModel } from "../../../models/catalog/index.ts";

/** The rungs, cheapest first. The base when a run names no model is the first. */
export const AUTOMATION_STUDIO_LLM_MODEL_LADDER: readonly AutomationStudioAnthropicModel[] = Object.freeze(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);

/** Where `model` stands on the ladder, or nothing for a model that is not on it. */
export function automationStudioLlmModelLadderRung(model: string | undefined): number | undefined {
  const at = (AUTOMATION_STUDIO_LLM_MODEL_LADDER as readonly string[]).indexOf(model ?? "");
  return at < 0 ? undefined : at;
}
