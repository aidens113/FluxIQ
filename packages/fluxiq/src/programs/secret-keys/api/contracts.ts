import type { JsonObject } from "../../../core/index.ts";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import type { ModelKeySettingsView, SecretKeyKind, SecretKeyScope, SecretKeysSnapshot, SecretKeySummary } from "../types.ts";

export const SECRET_KEYS_ENDPOINTS = {
  snapshot: "snapshot",
  createKey: "create-key",
  updateKey: "update-key",
  rotateKey: "rotate-key",
  revealKey: "reveal-key",
  deleteKey: "delete-key",
  setDefaultKey: "set-default-key",
  getAssistantModel: "get-assistant-model",
  setAssistantModel: "set-assistant-model",
  offerKey: "offer-key",
  saveModelKey: "save-model-key",
  replaceModelKey: "replace-model-key",
  removeModelKey: "remove-model-key"
} as const;

/**
 * What only `reveal-key` asks for: the caller's own session id and password, and
 * an authenticator code where one is set. Never a PIN. Saving, replacing and
 * removing a key ask for nothing beyond IAM.
 */
export type SecretKeyAuthorizationPayload = {
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationTotp?: string;
};

export type CreateSecretKeyRequest = {
  name: string;
  value: string;
  kind?: SecretKeyKind;
  provider?: string;
  scope?: SecretKeyScope;
  scopeRef?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
};

export type UpdateSecretKeyRequest = {
  id: string;
  name?: string;
  kind?: SecretKeyKind;
  provider?: string;
  scope?: SecretKeyScope;
  scopeRef?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
};

export type RotateSecretKeyRequest = {
  id: string;
  value: string;
};

export type RevealSecretKeyRequest = SecretKeyAuthorizationPayload & {
  id: string;
};

export type DeleteSecretKeyRequest = {
  id: string;
};

export type SecretKeysSnapshotResponse = SecretKeysSnapshot;
/** The reply of `create-key`, `update-key` and `rotate-key`; `create-key` and `rotate-key` add the caller's model access after the change when the host reads it. */
export type SecretKeyMutationResponse = SecretKeySummary & { modelAccess?: ModelAccessState };
export type RevealSecretKeyResponse = {
  key: SecretKeySummary;
  value: string;
};

export type SetDefaultKeyRequest = { id: string };
/** The holder offers their own key to the workspace (`offered` true) or withdraws it (false). */
export type OfferSecretKeyRequest = { id: string; offered: boolean };
/** The reply of `offer-key`. */
export type OfferSecretKeyResponse = { keyId: string; offered: boolean };
export type SetAssistantModelRequest = { keyId?: string; model?: string };
/** The reply of `set-default-key`, `get-assistant-model` and `set-assistant-model`. */
export type ModelKeySettingsResponse = ModelKeySettingsView;

/** A model provider a person saves a key for from a client. */
export type SaveModelKeyProvider = "anthropic" | "deepseek";
/** `save-model-key`: a new model key owned by the caller, which their chats then use. `name` defaults to "Anthropic key" or "DeepSeek key". */
export type SaveModelKeyRequest = { provider: SaveModelKeyProvider; value: string; name?: string };
/** `replace-model-key`: a new value for the key the caller's chats use, which must be the caller's own. */
export type ReplaceModelKeyRequest = { value: string };
/** `remove-model-key`: removes the key the caller's chats use, which must be the caller's own. */
export type RemoveModelKeyRequest = Record<string, never>;
/**
 * The reply of `save-model-key`, `replace-model-key` and `remove-model-key`: the
 * caller's model access read after the change. A paired client is never told a
 * key's id. Never a value.
 */
export type ModelKeyWriteResponse = { modelAccess: ModelAccessState };
