import type { SecretKeySummary } from "fluxiq/secret-keys";
import { applyFlowAdaptationMode, normalizedProviderLabel, type FlowSettingsDraft } from "./flow-settings-model";

/**
 * The AI provider controls: whether a usable bring-your-own DeepSeek key
 * exists, and the plain on/off adaptation switch.
 *
 * DeepSeek is the only provider for the MVP. The switch is a view over the
 * existing adaptation mode rather than a second setting: on is
 * `fully_adaptive`, off is `no_llm_intervention`, and both go through
 * `applyFlowAdaptationMode` so every permission it sets moves with it.
 */

/** Only what the section reads from a key. Values are never part of it. */
export type AiProviderKeySummary = Pick<SecretKeySummary, "id" | "name" | "kind" | "provider" | "scope" | "scopeRef" | "enabled">;

export type DeepSeekKeyAvailability = {
  /**
   * `ready`: at least one key can be used. `missing`: no DeepSeek key exists.
   * `unusable`: DeepSeek keys exist but are disabled or scoped elsewhere.
   * `loading`: the key list is being read. `unknown`: it could not be read, or
   * was never requested -- which is not the same as having no key.
   */
  status: "ready" | "missing" | "unusable" | "loading" | "unknown";
  usableKeys: AiProviderKeySummary[];
  summary: string;
};

/** Where keys are added and managed: the existing Secret Keys program, the only secret store. */
export const AI_PROVIDER_SECRET_KEYS_HREF = "/programs/secret-keys";
export const AI_PROVIDER_ADAPTATION_OFF_EXPLANATION = "Off: runs use only the steps FluxIQ has already learned and never call DeepSeek; if a page has changed, the run stops instead of adapting.";
export const AI_PROVIDER_ADAPTATION_ON_EXPLANATION = "On: when a page changes, FluxIQ asks DeepSeek to repair the step, then reuses the fix so later runs do not need AI.";

const DEEPSEEK_LABEL = normalizedProviderLabel("DeepSeek");

export function deepSeekKeyAvailability(input: {
  keys: readonly AiProviderKeySummary[] | null;
  loading: boolean;
  error: string;
  /** A Flow-scoped key counts only for this Flow; without one, only global keys count. */
  flowId?: string | null;
}): DeepSeekKeyAvailability {
  if (input.loading) return { status: "loading", usableKeys: [], summary: "Checking for a DeepSeek API key..." };
  if (input.error) return { status: "unknown", usableKeys: [], summary: `Your API keys could not be read: ${input.error}` };
  if (!input.keys) return { status: "unknown", usableKeys: [], summary: "Your API keys have not been checked yet." };
  const deepSeekKeys = input.keys.filter((key) => key.kind === "llm" && normalizedProviderLabel(key.provider) === DEEPSEEK_LABEL);
  const usableKeys = deepSeekKeys.filter((key) => key.enabled === true && (key.scope === "global" || (Boolean(input.flowId) && key.scope === "flow" && key.scopeRef === input.flowId)));
  if (usableKeys.length) {
    return { status: "ready", usableKeys, summary: usableKeys.length === 1 ? `DeepSeek key "${usableKeys[0]!.name}" is ready.` : `${usableKeys.length} DeepSeek keys are ready.` };
  }
  if (deepSeekKeys.length) {
    const disabled = deepSeekKeys.every((key) => key.enabled !== true);
    return { status: "unusable", usableKeys: [], summary: disabled ? "Your DeepSeek key is disabled. Enable it or add a new one." : "Your DeepSeek key is limited to another scope. Add a global DeepSeek key so every automation can use it." };
  }
  return { status: "missing", usableKeys: [], summary: "No DeepSeek API key has been added yet." };
}

export function aiProviderAdaptationIsOn(draft: Pick<FlowSettingsDraft, "adaptationMode">): boolean {
  return draft.adaptationMode !== "no_llm_intervention";
}

export function applyAiProviderAdaptationSwitch(draft: FlowSettingsDraft, on: boolean): FlowSettingsDraft {
  return applyFlowAdaptationMode(draft, on ? "fully_adaptive" : "no_llm_intervention");
}
