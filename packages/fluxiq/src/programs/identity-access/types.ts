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

export type IdentityAccessServiceOptions = {
  repository?: Repository | undefined;
  roles?: Role[] | undefined;
  /** Test-only KDF injection; `createGlobalProgramRuntime` passes none. */
  passwordKdf?: PasswordKdfOptions | undefined;
  credentialChangeSubscribers?: readonly IdentityCredentialChangeSubscriber[] | undefined;
};
