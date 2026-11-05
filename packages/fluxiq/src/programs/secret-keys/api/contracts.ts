import type { JsonObject } from "../../../core/index.ts";
import type { SecretKeyKind, SecretKeyLockedClient, SecretKeyScope, SecretKeysSnapshot, SecretKeySummary } from "../types.ts";

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

/** The person's own unlock, with their password: this session, and the locked paired clients they chose, by `holderId`. Named or not lifted: never one they did not choose. */
export type UnlockSecretKeysRequest = SecretKeyAuthorizationPayload & {
  /** The paired clients the person chose. */
  clientIds?: string[];
  /** From a browser nobody has unlocked yet, starting its own unlock (`CredentialUnlocks.unlockTicketFor`). */
  unlockTicket?: string;
};

/** `stillLocked`: those named that this did not lift. */
export type UnlockSecretKeysResponse = { unlockedKeyCount: number; stillLocked: string[] };

export type SecretKeysSnapshotResponse = SecretKeysSnapshot & {
  /** For a paired client only: what starts its own unlock, when nobody has unlocked it yet. */
  unlockTicket?: string;
  /** The caller's paired clients that are locked, to choose among. */
  lockedClients?: SecretKeyLockedClient[];
};
export type SecretKeyMutationResponse = SecretKeySummary;
export type RevealSecretKeyResponse = {
  key: SecretKeySummary;
  value: string;
};