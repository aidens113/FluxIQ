// Which DeepSeek models Core will send a request to, what each one carries, and
// the one a caller who names none gets.
//
// This used to be a single exported string and four `!==` checks against it:
// one in the provider, one in a key-compatibility check, one in the
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
// The file deliberately imports nothing but the model limits, a leaf that
// imports no value (`../model-limits/`), so a browser surface can list the permitted
// models without pulling the runtime in behind them.

/** Every model id Core will accept. DeepSeek's current line, newest first. */
export const AUTOMATION_STUDIO_DEEPSEEK_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;

export type AutomationStudioDeepSeekModel = (typeof AUTOMATION_STUDIO_DEEPSEEK_MODELS)[number];

/**
 * The default model when `FLUXIQ_LLM_DEFAULT_MODEL` is unset: `deepseek-flash`,
 * served by DeepSeek-V4.1-Flash. It is the cheaper of the two by roughly four
 * and a half times on every axis, and the one every measurement in this
 * repository was taken against once the retired alias was replaced. What a
 * caller who names no model actually gets is
 * {@link AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL}, at the end of this file.
 */
export const AUTOMATION_STUDIO_DEEPSEEK_BUILT_IN_DEFAULT_MODEL: AutomationStudioDeepSeekModel = "deepseek-flash";

// What each model can carry, and the largest window of them: a leaf of their
// own so the harness can read them at module evaluation (`../model-limits/`).
export { AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS, AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS } from "../model-limits/index.ts";

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

// The default model, as a developer and Lab knob, built as the run cost ceiling
// is (`../../../model/run-cost-ceiling/`). A new Flow names no model, so its
// builds -- the one the chat's `flow.createHere` starts among them, which makes
// its Flow inside Core -- run on whatever this resolves to, as does every other
// call whose caller names none. The Lab sets the variable for every Core it
// starts from the run's `--llm-model`, which is how a build started from the
// extension's chat is compared on another model (t233). It is not the
// product's model setting: a Flow's own `llmModel` still wins wherever it is
// set. It reads `process` through `globalThis`, so a browser surface listing
// the models (`fluxiq/automation-studio/llm-models`) never touches it. It is
// resolved once, when this module loads, and a value that is set and is not a
// configured model throws naming the variable rather than falling back, so a
// typo stops Core at start instead of silently building on the default. It
// sits last in the file because the refusal reads the retired-id table above.

/** The environment variable that sets Core's default DeepSeek model. */
export const AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV = "FLUXIQ_LLM_DEFAULT_MODEL";

type Environment = Readonly<Record<string, string | undefined>>;

function processEnvironment(): Environment {
  return (globalThis as { process?: { env?: Environment } }).process?.env ?? {};
}

/**
 * Core's default model: `FLUXIQ_LLM_DEFAULT_MODEL` when it is set, otherwise
 * {@link AUTOMATION_STUDIO_DEEPSEEK_BUILT_IN_DEFAULT_MODEL}. Throws, naming the
 * variable, when it is set to anything but one of
 * {@link AUTOMATION_STUDIO_DEEPSEEK_MODELS}; it never falls back on a bad value.
 */
export function resolveAutomationStudioLlmDefaultModel(env: Environment = processEnvironment()): AutomationStudioDeepSeekModel {
  const raw = env[AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV];
  if (raw === undefined || raw.trim() === "") return AUTOMATION_STUDIO_DEEPSEEK_BUILT_IN_DEFAULT_MODEL;
  const value = raw.trim();
  if (!isAutomationStudioDeepSeekModel(value)) {
    throw new Error(`${AUTOMATION_STUDIO_LLM_DEFAULT_MODEL_ENV} must name a DeepSeek model Core is configured for. ${automationStudioDeepSeekModelRefusal(value)} Unset it to use the default, ${AUTOMATION_STUDIO_DEEPSEEK_BUILT_IN_DEFAULT_MODEL}.`);
  }
  return value;
}

/**
 * What a caller who names no model gets, a new Flow's builds among them:
 * {@link resolveAutomationStudioLlmDefaultModel}, read once when this module
 * loads -- `deepseek-flash` unless `FLUXIQ_LLM_DEFAULT_MODEL` says otherwise.
 */
export const AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL: AutomationStudioDeepSeekModel = resolveAutomationStudioLlmDefaultModel();
