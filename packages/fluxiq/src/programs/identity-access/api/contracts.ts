import type { IdentityAccessSnapshot } from "../types.ts";

export const IDENTITY_ACCESS_ENDPOINTS = {
  snapshot: "snapshot",
  createUser: "create-user",
  updateUser: "update-user",
  setPassword: "set-password",
  setPin: "set-pin",
  beginTotp: "begin-totp",
  confirmTotp: "confirm-totp",
  disableTotp: "disable-totp",
  createSession: "create-session",
  revokeSession: "revoke-session",
  unlockVault: "unlock-vault",
  lockVault: "lock-vault"
} as const;

export type IdentityAccessSnapshotResponse = IdentityAccessSnapshot;

export type CreateIdentityUserRequest = {
  username: string;
  displayName: string;
  roleId: string;
  enabled?: boolean;
  password?: string;
  pin?: string;
};

export type UpdateIdentityUserRequest = {
  id: string;
  username?: string;
  displayName?: string;
  roleId?: string;
  enabled?: boolean;
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationPin?: string;
  authorizationTotp?: string;
};

export type SetIdentitySecretRequest = {
  userId: string;
  value: string;
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationPin?: string;
  authorizationTotp?: string;
};

export type TotpConfirmRequest = {
  userId: string;
  code: string;
};

export type SessionRequest = {
  userId: string;
  ttlMs?: number;
};

export type RevokeSessionRequest = {
  sessionId: string;
};

export type VaultUnlockRequest = {
  userId: string;
  password?: string;
  pin?: string;
  totp?: string;
};
