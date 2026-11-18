import type { SettingsCallPayload } from "./types";

export type NewKeyForm = { name: string; provider: string; value: string; password: string };

export const EMPTY_NEW_KEY: NewKeyForm = { name: "", provider: "Anthropic", value: "", password: "" };

/** The providers FluxIQ can run a model with. */
export const NEW_KEY_PROVIDERS = ["Anthropic", "DeepSeek"] as const;

export function canSaveNewKey(form: NewKeyForm): boolean {
  return Boolean(form.name.trim() && form.value && form.password && form.provider);
}

/** The `create-key` call for a model key: the person's password goes in the same call. The value is typed once and goes only into this payload. */
export function newKeyPayload(form: NewKeyForm): SettingsCallPayload {
  return {
    name: form.name.trim(),
    value: form.value,
    kind: "llm",
    provider: form.provider,
    scope: "global",
    scopeRef: "",
    description: "",
    metadata: {},
    enabled: true,
    authorizationPassword: form.password
  };
}
