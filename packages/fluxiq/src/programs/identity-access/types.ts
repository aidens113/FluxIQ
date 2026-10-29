import type { PasswordKdfOptions } from "../_shared/password-kdf/index.ts";
import type { Repository } from "../database-manager/index.ts";

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

export type IdentityAccessServiceOptions = {
  repository?: Repository | undefined;
  roles?: Role[] | undefined;
  /** Test-only KDF injection; `createGlobalProgramRuntime` passes none. */
  passwordKdf?: PasswordKdfOptions | undefined;
  credentialChangeSubscribers?: readonly IdentityCredentialChangeSubscriber[] | undefined;
  /** Listeners told of every session revoked; more can join later with `subscribeSessionRevocation`. */
  sessionRevocationSubscribers?: readonly IdentitySessionRevocationListener[] | undefined;
};
