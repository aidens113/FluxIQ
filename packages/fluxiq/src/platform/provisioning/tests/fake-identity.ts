import type { PlatformIdentityPort } from "../types.ts";

type FakeUser = { id: string; username: string; displayName: string; roleId: string; enabled: boolean; password: string | null };

/** A structural identity-access double: users, a password per user, and a session count per user. */
export class FakeIdentity implements PlatformIdentityPort {
  readonly users = new Map<string, FakeUser>();
  readonly sessions = new Map<string, number>();

  async upsertUser(params: { id: string; username: string; displayName: string; roleId: string; enabled?: boolean; password?: string }): Promise<{ id: string }> {
    const existing = this.users.get(params.id);
    this.users.set(params.id, {
      id: params.id,
      username: params.username,
      displayName: params.displayName,
      roleId: params.roleId,
      enabled: params.enabled ?? existing?.enabled ?? true,
      password: params.password ?? existing?.password ?? null
    });
    return { id: params.id };
  }

  async updateUser(params: { id: string; displayName?: string; roleId?: string; enabled?: boolean }): Promise<{ id: string }> {
    const user = this.users.get(params.id);
    if (user === undefined) throw new Error("Unknown user");
    if (params.displayName !== undefined) user.displayName = params.displayName;
    if (params.roleId !== undefined) user.roleId = params.roleId;
    if (params.enabled !== undefined) user.enabled = params.enabled;
    return { id: user.id };
  }

  async resetPassword(userId: string, password: string): Promise<unknown> {
    const user = this.users.get(userId);
    if (user === undefined) throw new Error("Unknown user");
    user.password = password;
    return {};
  }

  async createSession(userId: string, ttlMs = 1000): Promise<{ id: string; userId: string; expiresAtMs: number }> {
    this.sessions.set(userId, (this.sessions.get(userId) ?? 0) + 1);
    return { id: `session-${userId}-${this.sessions.get(userId)}`, userId, expiresAtMs: ttlMs };
  }

  async revokeUserSessions(userId: string): Promise<number> {
    const count = this.sessions.get(userId) ?? 0;
    this.sessions.set(userId, 0);
    return count;
  }

  async deleteUser(userId: string): Promise<boolean> {
    this.sessions.delete(userId);
    return this.users.delete(userId);
  }
}
