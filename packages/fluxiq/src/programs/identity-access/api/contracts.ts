import type { IdentityAccessListing } from "../types.ts";

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
  updateMyPreferences: "update-my-preferences",
  recaseMyUsername: "recase-my-username"
} as const;

/** Each person carries `authorityHeldElsewhere`: whether `update-user` refuses their sign-in name, role and on/off. */
export type IdentityAccessSnapshotResponse = IdentityAccessListing;

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

/**
 * The calling person's own sign-in name in another case (`recase-my-username`).
 * It acts only on the caller (`request.actor.userId`): the request names no
 * person, and one that carries any field but `username` is refused
 * (`IDENTITY_RECASE_ERRORS.selfOnly`). `username` must equal the caller's
 * current name ignoring case (`usernameKey`); it is written as sent and
 * answered as the written person, the same as `update-user` answers.
 */
export type RecaseMyUsernameRequest = {
  username: string;
};

/**
 * The named refusals of `recase-my-username`, sent as the response's
 * `errorCode`. A name another person has ignoring case is refused as
 * `identity.username_taken` (`IdentityUsernameTakenError`), as on every write.
 */
export const IDENTITY_RECASE_ERRORS = {
  /** The request carried a field other than `username`, such as a user id: only the caller's own name is re-cased. */
  selfOnly: "identity.recase_self_only",
  /** `username` is missing, not a string, or not the caller's current name ignoring case: a different name is not changed here. */
  notCaseOnly: "identity.recase_not_case_only"
} as const;
