import { modelsOfProvider } from "./provider-models";
import type { SettingsKey, SettingsModelChoices } from "./types";

export type AssistantChoice = {
  /** Enabled model keys the assistant may use. */
  keys: SettingsKey[];
  /** "" means "the default key". */
  keyId: string;
  /** The key the assistant really uses now: the pick, else the default. */
  effectiveKey: SettingsKey | undefined;
  /** Models of the effective key's provider; empty when the provider is not one the engine runs. */
  models: readonly string[];
  /** "" means the provider's normal model. */
  model: string;
  /**
   * When the assistant uses a key that is not among this person's own (the
   * workspace's key, someone else's), or the person may not change the
   * workspace's choices (`choices.mayChoose` false, even for their own key):
   * its provider and model, which the page shows and does not offer to change.
   * Null when the person may change it, or there is no key.
   */
  workspace: { provider: string; model: string } | null;
};

/** What the "The assistant uses [key] [model]" row shows. */
export function assistantChoice(keys: readonly SettingsKey[], choices: SettingsModelChoices): AssistantChoice {
  const usable = keys.filter((key) => key.kind === "llm" && key.enabled);
  const picked = usable.find((key) => key.id === choices.assistantKeyId);
  const standing = usable.find((key) => key.id === choices.defaultKeyId) ?? usable[0];
  const effectiveKey = picked ?? standing;
  const models = modelsOfProvider(effectiveKey?.provider);
  const model = choices.assistantModel && models.includes(choices.assistantModel) ? choices.assistantModel : "";
  return { keys: usable, keyId: picked?.id ?? "", effectiveKey, models, model, workspace: workspaceKey(keys, choices) };
}

/** The key the assistant uses, by the server's answer, when this person does not choose it: not in their own list, or not theirs to choose. */
function workspaceKey(keys: readonly SettingsKey[], choices: SettingsModelChoices): AssistantChoice["workspace"] {
  const usedId = choices.assistantKeyId ?? choices.defaultKeyId;
  // With no stored choice the engine uses the first enabled model key.
  const own = usedId ? keys.find((key) => key.id === usedId) : keys.find((key) => key.kind === "llm" && key.enabled);
  if (own) return choices.mayChoose === false ? { provider: choices.assistantProvider?.trim() || own.provider?.trim() || "", model: choices.assistantModel ?? "" } : null;
  if (!usedId) return null;
  return { provider: choices.assistantProvider?.trim() ?? "", model: choices.assistantModel ?? "" };
}
