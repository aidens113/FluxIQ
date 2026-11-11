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
  lockVault: "lock-vault",
  getMyPreferences: "get-my-preferences",
  updateMyPreferences: "update-my-preferences"
} as const;

export type IdentityAccessSnapshotResponse = IdentityAccessSnapshot;

export type CreateIdentityUserRequest = {
  username: string;
  displayName: string;
  roleId: string;
  enabled?: boolean;
  password?: string;
  pin?: string;
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationPin?: string;
  authorizationTotp?: string;
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
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationPin?: string;
  authorizationTotp?: string;
};

export type SessionRequest = {
  userId: string;
  ttlMs?: number;
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationPin?: string;
  authorizationTotp?: string;
};

/**
 * Exactly one of the two: `sessionId`, a raw session id, or `sessionDigest`,
 * the digest the snapshot lists a session by, so an administrator can revoke
 * another user's session without any raw id leaving the server.
 */
export type RevokeSessionRequest = {
  sessionId?: string;
  sessionDigest?: string;
};

export type VaultUnlockRequest = {
  userId: string;
  password?: string;
  pin?: string;
  totp?: string;
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationPin?: string;
  authorizationTotp?: string;
};

/**
 * The calling person's own preferences. Both endpoints act only on the caller
 * (`request.actor.userId`): the request names no person, and one that carries
 * any field but `startingHumanness` is refused (`IDENTITY_PREFERENCES_ERRORS.selfOnly`).
 */
export type GetMyPreferencesRequest = Record<string, never>;

/** `startingHumanness`: an integer 0-100, or null to clear it. */
export type UpdateMyPreferencesRequest = {
  startingHumanness: number | null;
};

/** What both preference endpoints answer: the value now stored, null when none. */
export type MyPreferencesResponse = {
  startingHumanness: number | null;
};

/** The named refusals of the preference endpoints, sent as the response's `errorCode`. */
export const IDENTITY_PREFERENCES_ERRORS = {
  /** The request carried a field other than `startingHumanness`, such as a user id: preferences are only ever the caller's own. */
  selfOnly: "preferences.self_only",
  /** `startingHumanness` is missing, or not a whole number from 0 to 100 or null. */
  startingHumannessInvalid: "preferences.starting_humanness_invalid"
} as const;
