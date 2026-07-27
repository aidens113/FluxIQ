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
};

export const adminRole: Role = {
  id: "admin",
  permissions: [
    "programs.read",
    "programs.write",
    "flows.write",
    "runtime.control",
    "compute.control",
    "identity.manage",
    "data.manage"
  ]
};

export const viewerRole: Role = {
  id: "viewer",
  permissions: ["programs.read"]
};
