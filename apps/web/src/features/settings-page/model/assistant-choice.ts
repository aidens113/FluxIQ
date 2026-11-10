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
};

/** What the "The assistant uses [key] [model]" row shows. */
export function assistantChoice(keys: readonly SettingsKey[], choices: SettingsModelChoices): AssistantChoice {
  const usable = keys.filter((key) => key.kind === "llm" && key.enabled);
  const picked = usable.find((key) => key.id === choices.assistantKeyId);
  const standing = usable.find((key) => key.id === choices.defaultKeyId) ?? usable[0];
  const effectiveKey = picked ?? standing;
  const models = modelsOfProvider(effectiveKey?.provider);
  const model = choices.assistantModel && models.includes(choices.assistantModel) ? choices.assistantModel : "";
  return { keys: usable, keyId: picked?.id ?? "", effectiveKey, models, model };
}
