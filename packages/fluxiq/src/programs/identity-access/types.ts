import type { PasswordKdfOptions } from "../_shared/password-kdf/index.ts";
import type { Repository } from "../database-manager/index.ts";

/** A password change by someone proving themselves on a session of theirs: the person, or an administrator. */
export type IdentitySetPasswordAuthorized = {
  userId: string;
  password: string;
  sessionId: string | undefined;
  authorizationPassword: string | undefined;
  authorizationPin: string | undefined;
  authorizationTotp: string | undefined;
};

/** The fields of an account an administrator may change. */
export type IdentityUserUpdate = {
  id: string;
  username?: string;
  displayName?: string;
  roleId?: string;
  enabled?: boolean;
  nowMs?: number;
};

export type Permission =
  | "programs.read"
  | "programs.write"
  | "flows.write"
  | "runtime.control"
  | "compute.control"
  | "identity.manage"
  | "data.manage"
  | "secrets.manage";

export type Role = {
  id: string;
  permissions: Permission[];
};

export type User = {
  id: string;
  username: string;
  displayName: string;
  roleId: string;
  enabled: boolean;
  totpEnabled: boolean;
  passwordConfigured?: boolean;
  pinConfigured?: boolean;
  /**
   * The person's own starting humanness (an integer 0-100; absent = none): what a run of
   * theirs whose request carries no starting value uses. Read and set only by the person
   * (`get-my-preferences`, `update-my-preferences`); it comes back with their own session
   * (`validateSession`) and never with anyone else's view of them (`withoutPersonalPreferences`).
   */
  startingHumanness?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type UserCredential = {
  userId: string;
  passwordHash?: string;
  pinHash?: string;
  totpSecret?: string;
  pendingTotpSecret?: string;
  updatedAtMs: number;
};

export type Session = {
  id: string;
  userId: string;
  expiresAtMs: number;
};

export type VaultStatus = {
  initialized: boolean;
  unlocked: boolean;
  unlockedBy?: string;
  unlockedAtMs?: number;
  encryptedFieldCount?: number;
};

export type IdentityAccessSnapshot = {
  users: User[];
  roles: Role[];
  sessions: Session[];
  vault: VaultStatus;
};

/**
 * A person as the `snapshot` endpoint lists them. `authorityHeldElsewhere` is
 * true exactly when `update-user` would refuse to change their sign-in name,
 * role or on/off (`IdentityAuthorityDelegation`): an account holder, whose
 * three are provisioning's, or a person the owner could not answer for. A
 * client offers those changes only when it is false.
 */
export type IdentityAccessListedUser = User & { authorityHeldElsewhere: boolean };

/** The snapshot as the `snapshot` endpoint answers it: each person marked as an `IdentityAccessListedUser`. */
export type IdentityAccessListing = Omit<IdentityAccessSnapshot, "users"> & { users: IdentityAccessListedUser[] };

export type VaultRecord = {
  id: string;
  label: string;
  encryptedValue: string;
  updatedAtMs: number;
};

/**
 * A password change announced to credential-change subscribers, such as a
 * program that re-seals data under the new password. `currentPassword` is set
 * only for a self-service change, where the account's own current password was
 * proven for it; an administrator's reset of another account carries none, so
 * data sealed under the old password cannot be recovered.
 */
export type IdentityCredentialChange = {
  readonly changeId: string;
  readonly userId: string;
  readonly actorUserId: string | undefined;
  /** The session making the change, when one is: a proved change keeps only what goes through it. */
  readonly actorSessionId?: string | undefined;
  readonly currentPassword: string | undefined;
  readonly newPassword: string;
};

/**
 * The credential-change port. Every subscriber `prepare`s before the
 * credential is written, and a `prepare` that throws refuses the change. After
 * the write each subscriber is sent `commit`; when a `prepare` or the write
 * fails, each subscriber asked to prepare is sent `abort` instead.
 */
export type IdentityCredentialChangeSubscriber = {
  prepare(change: IdentityCredentialChange): Promise<void>;
  commit(change: IdentityCredentialChange): Promise<void>;
  abort(change: IdentityCredentialChange): Promise<void>;
};

/**
 * Who revokes a panel session. `userId` is the user asking, or for a revoke
 * with no named revoker (a sign-out presenting its own cookie,
 * `revokeUserSessions`, `deleteUser`) the session's own user, null when it is
 * unknown. `administrator` is true only for a caller whose permission check
 * admitted `identity.manage`.
 */
export type IdentitySessionRevoker = {
  userId: string | null;
  administrator: boolean;
  /** Ended because its person changed their password: what it started has no claim on anything of theirs. */
  passwordChanged?: boolean;
};

/** A session to revoke: its raw id, or (administrators only) the digest the panel lists it by. */
export type IdentitySessionTarget = string | { digest: string };

/**
 * Told the raw id of each panel session revoked -- by a sign-out, an
 * administrator's revoke, `revokeUserSessions` or `deleteUser` -- and who
 * revoked it, so a program holding state per session drops it: Secret Keys'
 * unlocks are keyed by that id, and it drops one only for that unlock's own
 * user or an administrator. The id is the cookie's bearer value; it is handed
 * over in memory only and must never be stored or logged. A listener that
 * fails is reported by the revoke after every other listener has run; the
 * session stays revoked.
 */
export type IdentitySessionRevocationListener = (sessionId: string, revoker: IdentitySessionRevoker) => void | Promise<void>;

/**
 * A session end by digest, for what is keyed by what is stored: it needs no raw
 * id, so it reaches a listener for a session this process never saw.
 * `wholeUserId` says every session of that person ended together, including any
 * `digests` does not list. Announced with the same rule as
 * `IdentitySessionRevocationListener`.
 */
export type IdentitySessionEnd = {
  digests: readonly string[];
  wholeUserId?: string | undefined;
  revoker: IdentitySessionRevoker;
};
export type IdentitySessionEndListener = (end: IdentitySessionEnd) => void | Promise<void>;

/**
 * Who holds a person's authority (their sign-in name, sign-in role and
 * whether they may sign in) when Identity Access does not: the host's account
 * provisioning, for a person with a platform account, whose role is derived
 * from their workspace memberships' policies and whose sign-in name is their
 * account email. `holdsAuthorityOf` is true for such a person; the
 * `update-user` endpoint then refuses to change their sign-in name, role or
 * on/off (`IdentityAuthorityManagedError`), while provisioning keeps writing
 * them through the service directly. An answer that cannot be had (a throw)
 * refuses the change too: it is never read as "no account".
 */
export type IdentityAuthorityOwner = {
  holdsAuthorityOf(userId: string): Promise<boolean>;
};

export type IdentityAccessServiceOptions = {
  repository?: Repository | undefined;
  roles?: Role[] | undefined;
  /** Test-only KDF injection; `createGlobalProgramRuntime` passes none. */
  passwordKdf?: PasswordKdfOptions | undefined;
  credentialChangeSubscribers?: readonly IdentityCredentialChangeSubscriber[] | undefined;
  /** Listeners told of every session revoked; more can join later with `subscribeSessionRevocation`. */
  sessionRevocationSubscribers?: readonly IdentitySessionRevocationListener[] | undefined;
  /** Listeners told each session end by digest (`IdentitySessionEnd`), which reaches a session this process never saw. */
  sessionEndSubscribers?: readonly IdentitySessionEndListener[] | undefined;
};
