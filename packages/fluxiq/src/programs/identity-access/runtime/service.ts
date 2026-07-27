import { randomUUID } from "node:crypto";
import { defaultRoles } from "./roles";
import type { IdentityAccessSnapshot, Role, Session, User, VaultStatus } from "../types";

export class IdentityAccessService {
  private readonly users = new Map<string, User>();
  private readonly roles = new Map<string, Role>();
  private readonly sessions = new Map<string, Session>();
  private vault: VaultStatus = { initialized: false, unlocked: false };

  constructor(roles: Role[] = defaultRoles) {
    for (const role of roles) {
      this.roles.set(role.id, role);
    }
  }

  upsertRole(role: Role): Role {
    this.roles.set(role.id, role);
    return role;
  }

  upsertUser(params: {
    id?: string;
    username: string;
    displayName: string;
    roleId: string;
    enabled?: boolean;
    totpEnabled?: boolean;
    nowMs?: number;
  }): User {
    if (!this.roles.has(params.roleId)) {
      throw new Error(`Unknown role: ${params.roleId}`);
    }
    const now = params.nowMs ?? Date.now();
    const id = params.id ?? randomUUID();
    const existing = this.users.get(id);
    const user: User = {
      id,
      username: params.username,
      displayName: params.displayName,
      roleId: params.roleId,
      enabled: params.enabled ?? existing?.enabled ?? true,
      totpEnabled: params.totpEnabled ?? existing?.totpEnabled ?? false,
      createdAtMs: existing?.createdAtMs ?? now,
      updatedAtMs: now
    };
    this.users.set(user.id, user);
    return user;
  }

  createSession(userId: string, ttlMs = 3_600_000, nowMs = Date.now()): Session {
    const user = this.users.get(userId);
    if (!user || !user.enabled) {
      throw new Error(`Unknown or disabled user: ${userId}`);
    }
    const session: Session = {
      id: randomUUID(),
      userId,
      expiresAtMs: nowMs + ttlMs
    };
    this.sessions.set(session.id, session);
    return session;
  }

  revokeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  setVaultStatus(status: VaultStatus): VaultStatus {
    this.vault = status;
    return this.vault;
  }

  snapshot(nowMs = Date.now()): IdentityAccessSnapshot {
    const sessions = [...this.sessions.values()].filter((session) => session.expiresAtMs > nowMs);
    return {
      users: [...this.users.values()].sort((left, right) => left.username.localeCompare(right.username)),
      roles: [...this.roles.values()].sort((left, right) => left.id.localeCompare(right.id)),
      sessions,
      vault: this.vault
    };
  }
}
