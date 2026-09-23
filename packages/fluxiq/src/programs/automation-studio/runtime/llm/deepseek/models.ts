// Which DeepSeek models Core will send a request to, what each one carries, and
// the one a caller who names none gets.
//
// This used to be a single exported string and four `!==` checks against it:
// one in the provider, one in the grant's key-compatibility check, one in the
// API's Flow-settings validator and one in the panel's own form. DeepSeek
// retired the `deepseek-chat` and `deepseek-reasoner` compatibility aliases on
// 2026-07-24, and because every layer permitted exactly one string, moving off
// the retired name could not be done as a setting -- it had to be a source edit
// in Core and in the downstream web-extension repository at the same moment, or
// nothing ran at all. The model is a setting; this file is the closed set that
// setting may name, and the default it resolves to.
//
// What a model *is* lives here; what a call costs lives in `pricing.ts` beside
// it, keyed by the same ids. Both are dated, provider-owned facts read from
// DeepSeek's own price list, https://api-docs.deepseek.com/quick_start/pricing/,
// on 2026-09-23, and both must be re-read when DeepSeek changes its line-up.
//
// The file deliberately imports nothing, so a browser surface can list the
// permitted models without pulling the runtime in behind them.

/** Every model id Core will accept. DeepSeek's current line, newest first. */
export const AUTOMATION_STUDIO_DEEPSEEK_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;

export type AutomationStudioDeepSeekModel = (typeof AUTOMATION_STUDIO_DEEPSEEK_MODELS)[number];

/**
 * What a caller who names no model gets: `deepseek-flash`, served by
 * DeepSeek-V4.1-Flash. It is the cheaper of the two by roughly four and a half
 * times on every axis, and the one every measurement in this repository was
 * taken against once the retired alias was replaced.
 */
export const AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL: AutomationStudioDeepSeekModel = "deepseek-flash";

/**
 * What each model can actually carry, as DeepSeek publishes it.
 *
 * These are the provider's numbers, not Core's budget. Core holds a single
 * request to `AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`,
 * which is its own choice and is far below either figure here; see that
 * constant for why it is where it is and what moving it would cost.
 */
export const AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS: Readonly<Record<AutomationStudioDeepSeekModel, {
  /** The model's own context window, input and output together. */
  contextTokens: number;
  /** The most the model will generate in one reply. */
  maxOutputTokens: number;
}>> = Object.freeze({
  "deepseek-flash": Object.freeze({ contextTokens: 1_000_000, maxOutputTokens: 384_000 }),
  "deepseek-v4-pro": Object.freeze({ contextTokens: 1_000_000, maxOutputTokens: 384_000 })
});

/**
 * Ids DeepSeek has withdrawn or superseded, and what replaced each one.
 *
 * Nothing routes through this: it exists only so a refusal can say *why* a name
 * stopped working rather than listing the permitted set at someone who had no
 * reason to think theirs was gone. `deepseek-v4-flash` and
 * `deepseek-v4-flash-vision-exp` are still accepted by the endpoint and served
 * by DeepSeek-V4.1-Flash, but naming a retired id is how this problem happened
 * once already, so Core does not send one.
 */
const RETIRED_MODEL_REPLACEMENTS: Readonly<Record<string, AutomationStudioDeepSeekModel>> = Object.freeze({
  "deepseek-chat": "deepseek-flash",
  "deepseek-reasoner": "deepseek-flash",
  "deepseek-v4-flash": "deepseek-flash",
  "deepseek-v4-flash-vision-exp": "deepseek-flash"
});

export function isAutomationStudioDeepSeekModel(value: unknown): value is AutomationStudioDeepSeekModel {
  return typeof value === "string" && (AUTOMATION_STUDIO_DEEPSEEK_MODELS as readonly string[]).includes(value);
}

/**
 * Why a model was refused, naming what was asked for, what replaced it when
 * DeepSeek withdrew it, and every id that would have been accepted. Every layer
 * that checks a model uses this one sentence, so the answer does not depend on
 * which gate the request happened to reach first.
 */
export function automationStudioDeepSeekModelRefusal(value: unknown): string {
  const named = typeof value === "string" && value.trim().length > 0 ? JSON.stringify(value) : "An empty DeepSeek model";
  const permitted = AUTOMATION_STUDIO_DEEPSEEK_MODELS.join(", ");
  const replacement = typeof value === "string" ? RETIRED_MODEL_REPLACEMENTS[value] : undefined;
  return replacement === undefined
    ? `${named} is not a DeepSeek model Core is configured for. Configured models: ${permitted}.`
    : `${named} was withdrawn by DeepSeek; use ${JSON.stringify(replacement)} instead. Configured models: ${permitted}.`;
}

/**
 * The model a caller named, or the default when it named none. An id Core is
 * not configured for is refused here rather than sent, because the endpoint's
 * own answer to an unknown model is an opaque 400 that reads like a transport
 * fault.
 */
export function resolveAutomationStudioDeepSeekModel(value: unknown): AutomationStudioDeepSeekModel {
  if (value === undefined || value === null) return AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL;
  if (!isAutomationStudioDeepSeekModel(value)) throw new Error(automationStudioDeepSeekModelRefusal(value));
  return value;
}
