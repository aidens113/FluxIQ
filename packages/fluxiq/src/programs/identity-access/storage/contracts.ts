import type { Role, Session, User, VaultStatus } from "../types.ts";

export type IdentityAccessStore = {
  listUsers(): Promise<User[]>;
  saveUser(user: User): Promise<User>;
  listRoles(): Promise<Role[]>;
  saveRole(role: Role): Promise<Role>;
  listSessions(): Promise<Session[]>;
  saveSession(session: Session): Promise<Session>;
  readVaultStatus(): Promise<VaultStatus>;
  writeVaultStatus(status: VaultStatus): Promise<VaultStatus>;
};
