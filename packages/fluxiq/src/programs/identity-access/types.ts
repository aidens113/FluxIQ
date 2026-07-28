export type Permission =
  | "programs.read"
  | "programs.write"
  | "flows.write"
  | "runtime.control"
  | "compute.control"
  | "identity.manage"
  | "data.manage";

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
