import type { JsonObject } from "../../../core/index.ts";
import type { SecretKeyKind, SecretKeyScope, SecretKeysSnapshot, SecretKeySummary } from "../types.ts";

export const SECRET_KEYS_ENDPOINTS = {
  snapshot: "snapshot",
  createKey: "create-key",
  updateKey: "update-key",
  rotateKey: "rotate-key",
  revealKey: "reveal-key",
  deleteKey: "delete-key"
} as const;

export type SecretKeyAuthorizationPayload = {
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationPin?: string;
  authorizationTotp?: string;
};

export type CreateSecretKeyRequest = SecretKeyAuthorizationPayload & {
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

export type UpdateSecretKeyRequest = SecretKeyAuthorizationPayload & {
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

export type RotateSecretKeyRequest = SecretKeyAuthorizationPayload & {
  id: string;
  value: string;
};

export type RevealSecretKeyRequest = SecretKeyAuthorizationPayload & {
  id: string;
};

export type DeleteSecretKeyRequest = SecretKeyAuthorizationPayload & {
  id: string;
};

export type SecretKeysSnapshotResponse = SecretKeysSnapshot;
export type SecretKeyMutationResponse = SecretKeySummary;
export type RevealSecretKeyResponse = {
  key: SecretKeySummary;
  value: string;
};