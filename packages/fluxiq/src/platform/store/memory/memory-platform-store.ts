import { PlatformStoreConflictError } from "../errors/index.ts";
import { isLinkTokenUsable, normalizeEmail } from "../rules/index.ts";
import type {
  PlatformAccountRecord,
  PlatformIdempotencyRecord,
  PlatformLinkPurpose,
  PlatformLinkTokenRecord,
  PlatformMembershipRecord,
  PlatformStore,
  PlatformWorkspaceRecord
} from "../types.ts";

function copy<T>(value: T): T {
  return structuredClone(value);
}

function copyOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : copy(value);
}

function membershipKey(workspaceId: string, userId: string): string {
  return JSON.stringify([workspaceId, userId]);
}

/** In-memory platform store for tests and single-process use. Records are copied on the way in and out. */
export class MemoryPlatformStore implements PlatformStore {
  private readonly accounts = new Map<string, PlatformAccountRecord>();
  private readonly workspaces = new Map<string, PlatformWorkspaceRecord>();
  private readonly memberships = new Map<string, PlatformMembershipRecord>();
  private readonly linkTokens = new Map<string, PlatformLinkTokenRecord>();
  private readonly idempotency = new Map<string, PlatformIdempotencyRecord>();

  async getAccount(userId: string): Promise<PlatformAccountRecord | null> {
    return copyOrNull(this.accounts.get(userId));
  }

  async findAccountByEmail(email: string): Promise<PlatformAccountRecord | null> {
    const wanted = normalizeEmail(email);
    for (const account of this.accounts.values()) if (account.email === wanted) return copy(account);
    return null;
  }

  async findAccountByExternalId(externalId: string): Promise<PlatformAccountRecord | null> {
    for (const account of this.accounts.values()) if (account.externalId === externalId) return copy(account);
    return null;
  }

  async listAccounts(): Promise<PlatformAccountRecord[]> {
    return [...this.accounts.values()].map(copy);
  }

  async putAccount(record: PlatformAccountRecord): Promise<void> {
    const stored = copy({ ...record, email: normalizeEmail(record.email) });
    for (const other of this.accounts.values()) {
      if (other.userId === stored.userId) continue;
      if (other.email === stored.email) throw new PlatformStoreConflictError("email");
      if (stored.externalId !== null && other.externalId === stored.externalId) throw new PlatformStoreConflictError("externalId");
    }
    this.accounts.set(stored.userId, stored);
  }

  async deleteAccount(userId: string): Promise<boolean> {
    if (!this.accounts.delete(userId)) return false;
    for (const [key, membership] of this.memberships) if (membership.userId === userId) this.memberships.delete(key);
    for (const [digest, token] of this.linkTokens) if (token.userId === userId) this.linkTokens.delete(digest);
    return true;
  }

  async getWorkspace(workspaceId: string): Promise<PlatformWorkspaceRecord | null> {
    return copyOrNull(this.workspaces.get(workspaceId));
  }

  async listWorkspaces(): Promise<PlatformWorkspaceRecord[]> {
    return [...this.workspaces.values()].map(copy);
  }

  async putWorkspace(record: PlatformWorkspaceRecord): Promise<void> {
    this.workspaces.set(record.workspaceId, copy(record));
  }

  async deleteWorkspace(workspaceId: string): Promise<boolean> {
    return this.workspaces.delete(workspaceId);
  }

  async getMembership(workspaceId: string, userId: string): Promise<PlatformMembershipRecord | null> {
    return copyOrNull(this.memberships.get(membershipKey(workspaceId, userId)));
  }

  async listMembershipsOfUser(userId: string): Promise<PlatformMembershipRecord[]> {
    return [...this.memberships.values()].filter((membership) => membership.userId === userId).map(copy);
  }

  async listMembershipsOfWorkspace(workspaceId: string): Promise<PlatformMembershipRecord[]> {
    return [...this.memberships.values()].filter((membership) => membership.workspaceId === workspaceId).map(copy);
  }

  async putMembership(record: PlatformMembershipRecord): Promise<void> {
    this.memberships.set(membershipKey(record.workspaceId, record.userId), copy(record));
  }

  async deleteMembership(workspaceId: string, userId: string): Promise<boolean> {
    return this.memberships.delete(membershipKey(workspaceId, userId));
  }

  async putLinkToken(record: PlatformLinkTokenRecord): Promise<void> {
    this.linkTokens.set(record.tokenDigest, copy(record));
  }

  async getLinkToken(tokenDigest: string): Promise<PlatformLinkTokenRecord | null> {
    return copyOrNull(this.linkTokens.get(tokenDigest));
  }

  async consumeLinkToken(tokenDigest: string, purpose: PlatformLinkPurpose, nowMs: number): Promise<PlatformLinkTokenRecord | null> {
    const found = this.linkTokens.get(tokenDigest);
    if (found === undefined || !isLinkTokenUsable(found, purpose, nowMs)) return null;
    const used = { ...found, usedAtMs: nowMs };
    this.linkTokens.set(tokenDigest, used);
    return copy(used);
  }

  async releaseLinkToken(tokenDigest: string, usedAtMs: number): Promise<boolean> {
    const found = this.linkTokens.get(tokenDigest);
    if (found === undefined || found.usedAtMs !== usedAtMs) return false;
    this.linkTokens.set(tokenDigest, { ...found, usedAtMs: null });
    return true;
  }

  async deleteLinkTokensOf(userId: string, purpose: PlatformLinkPurpose): Promise<number> {
    let removed = 0;
    for (const [digest, token] of this.linkTokens) {
      if (token.userId !== userId || token.purpose !== purpose) continue;
      this.linkTokens.delete(digest);
      removed += 1;
    }
    return removed;
  }

  async getIdempotency(operation: string, requestId: string): Promise<PlatformIdempotencyRecord | null> {
    return copyOrNull(this.idempotency.get(JSON.stringify([operation, requestId])));
  }

  async putIdempotency(record: PlatformIdempotencyRecord): Promise<void> {
    this.idempotency.set(JSON.stringify([record.operation, record.requestId]), copy(record));
  }
}
