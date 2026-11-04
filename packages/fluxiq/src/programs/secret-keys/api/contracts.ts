import type { JsonObject } from "../../../core/index.ts";
import type { SecretKeyKind, SecretKeyScope, SecretKeysSnapshot, SecretKeySummary } from "../types.ts";

export const SECRET_KEYS_ENDPOINTS = {
  snapshot: "snapshot",
  createKey: "create-key",
  updateKey: "update-key",
  rotateKey: "rotate-key",
  revealKey: "reveal-key",
  deleteKey: "delete-key",
  unlock: "unlock"
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

/** The person's own unlock, with their password: this session, and any paired client of theirs that is locked. */
export type UnlockSecretKeysRequest = SecretKeyAuthorizationPayload;

export type UnlockSecretKeysResponse = { unlockedKeyCount: number };

export type SecretKeysSnapshotResponse = SecretKeysSnapshot & {
  /** The names of the caller's paired clients that are locked. */
  lockedClients?: string[];
};
export type SecretKeyMutationResponse = SecretKeySummary;
export type RevealSecretKeyResponse = {
  key: SecretKeySummary;
  value: string;
};