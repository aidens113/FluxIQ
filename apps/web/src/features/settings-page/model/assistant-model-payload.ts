import type { SettingsCallPayload } from "./types";

/** The `set-assistant-model` payload: a field left out means the default key or the provider's normal model. */
export function assistantModelPayload(pick: { keyId: string; model: string }): SettingsCallPayload {
  return { ...(pick.keyId ? { keyId: pick.keyId } : {}), ...(pick.model ? { model: pick.model } : {}) };
}
