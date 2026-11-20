// The providers a key can be for, first one default, and where a person gets a key from each.

/** One provider in the form's list. `name` is how sentences say it, `label` how the list says it. */
export type ModelKeyProvider = { id: string; name: string; label: string; keyUrl: string };

/** Anthropic (Claude) first and the default, then DeepSeek. */
export const defaultModelKeyProviders: readonly ModelKeyProvider[] = [
  { id: "anthropic", name: "Anthropic", label: "Anthropic (Claude)", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "deepseek", name: "DeepSeek", label: "DeepSeek", keyUrl: "https://platform.deepseek.com/api_keys" }
];
