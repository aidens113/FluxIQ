import { PlatformStoreConflictError } from "../errors/index.ts";
import { isLinkTokenUsable, normalizeEmail, SerialQueue } from "../rules/index.ts";
import type {
  PlatformAccountRecord,
  PlatformIdempotencyRecord,
  PlatformLinkPurpose,
  PlatformLinkTokenRecord,
  PlatformMembershipRecord,
  PlatformStore,
  PlatformWorkspaceRecord
} from "../types.ts";
import type { PlatformRecordRepository } from "./platform-record-repository.ts";
import { PlatformRecords } from "./platform-records.ts";

type IndexRow = { userId: string };

const part = encodeURIComponent;

function membershipKey(workspaceId: string, userId: string): string {
  return `${part(workspaceId)}/${part(userId)}`;
}

/**
 * Platform store over a repository port. Accounts are indexed by email
 * (`email/<email>`) and externalId (`external/<externalId>`) so the `find`
 * methods are single gets. No state is cached between calls; consuming a link
 * token is serialized within this process, last writer wins across processes.
 */
export class RepositoryPlatformStore implements PlatformStore {
  private readonly records: PlatformRecords;
  private readonly consumeQueue = new SerialQueue();

  constructor(repository: PlatformRecordRepository, now: () => number = Date.now) {
    this.records = new PlatformRecords(repository, now);
  }

  getAccount(userId: string): Promise<PlatformAccountRecord | null> {
    return this.records.get<PlatformAccountRecord>("account", part(userId));
  }

  async findAccountByEmail(email: string): Promise<PlatformAccountRecord | null> {
    const wanted = normalizeEmail(email);
    const index = await this.records.get<IndexRow>("email", part(wanted));
    if (index === null) return null;
    const account = await this.getAccount(index.userId);
    return account !== null && account.email === wanted ? account : null;
  }

  async findAccountByExternalId(externalId: string): Promise<PlatformAccountRecord | null> {
    const index = await this.records.get<IndexRow>("external", part(externalId));
    if (index === null) return null;
    const account = await this.getAccount(index.userId);
    return account !== null && account.externalId === externalId ? account : null;
  }

  listAccounts(): Promise<PlatformAccountRecord[]> {
    return this.records.list<PlatformAccountRecord>("account");
  }

  async putAccount(record: PlatformAccountRecord): Promise<void> {
    const stored = { ...record, email: normalizeEmail(record.email) };
    await this.assertFree("email", "email", stored.email, stored.userId);
    if (stored.externalId !== null) await this.assertFree("external", "externalId", stored.externalId, stored.userId);
    const previous = await this.getAccount(stored.userId);
    await this.records.put("email", part(stored.email), { userId: stored.userId });
    if (stored.externalId !== null) await this.records.put("external", part(stored.externalId), { userId: stored.userId });
    await this.records.put("account", part(stored.userId), stored);
    if (previous === null) return;
    if (previous.email !== stored.email) await this.removeIndex("email", previous.email, stored.userId);
    if (previous.externalId !== null && previous.externalId !== stored.externalId) {
      await this.removeIndex("external", previous.externalId, stored.userId);
    }
  }

  async deleteAccount(userId: string): Promise<boolean> {
    const account = await this.getAccount(userId);
    if (account === null) return false;
    await this.removeIndex("email", account.email, userId);
    if (account.externalId !== null) await this.removeIndex("external", account.externalId, userId);
    for (const membership of await this.listMembershipsOfUser(userId)) await this.deleteMembership(membership.workspaceId, userId);
    for (const token of await this.records.list<PlatformLinkTokenRecord>("link-token")) {
      if (token.userId === userId) await this.records.remove("link-token", part(token.tokenDigest));
    }
    await this.records.remove("account", part(userId));
    return true;
  }

  getWorkspace(workspaceId: string): Promise<PlatformWorkspaceRecord | null> {
    return this.records.get<PlatformWorkspaceRecord>("workspace", part(workspaceId));
  }

  listWorkspaces(): Promise<PlatformWorkspaceRecord[]> {
    return this.records.list<PlatformWorkspaceRecord>("workspace");
  }

  putWorkspace(record: PlatformWorkspaceRecord): Promise<void> {
    return this.records.put("workspace", part(record.workspaceId), record);
  }

  deleteWorkspace(workspaceId: string): Promise<boolean> {
    return this.records.remove("workspace", part(workspaceId));
  }

  getMembership(workspaceId: string, userId: string): Promise<PlatformMembershipRecord | null> {
    return this.records.get<PlatformMembershipRecord>("membership", membershipKey(workspaceId, userId));
  }

  async listMembershipsOfUser(userId: string): Promise<PlatformMembershipRecord[]> {
    return (await this.records.list<PlatformMembershipRecord>("membership")).filter((membership) => membership.userId === userId);
  }

  async listMembershipsOfWorkspace(workspaceId: string): Promise<PlatformMembershipRecord[]> {
    return (await this.records.list<PlatformMembershipRecord>("membership")).filter((membership) => membership.workspaceId === workspaceId);
  }

  putMembership(record: PlatformMembershipRecord): Promise<void> {
    return this.records.put("membership", membershipKey(record.workspaceId, record.userId), record);
  }

  deleteMembership(workspaceId: string, userId: string): Promise<boolean> {
    return this.records.remove("membership", membershipKey(workspaceId, userId));
  }

  putLinkToken(record: PlatformLinkTokenRecord): Promise<void> {
    return this.records.put("link-token", part(record.tokenDigest), record);
  }

  getLinkToken(tokenDigest: string): Promise<PlatformLinkTokenRecord | null> {
    return this.records.get<PlatformLinkTokenRecord>("link-token", part(tokenDigest));
  }

  consumeLinkToken(tokenDigest: string, purpose: PlatformLinkPurpose, nowMs: number): Promise<PlatformLinkTokenRecord | null> {
    return this.consumeQueue.run(async () => {
      const found = await this.getLinkToken(tokenDigest);
      if (found === null || !isLinkTokenUsable(found, purpose, nowMs)) return null;
      const used = { ...found, usedAtMs: nowMs };
      await this.putLinkToken(used);
      return used;
    });
  }

  releaseLinkToken(tokenDigest: string, usedAtMs: number): Promise<boolean> {
    return this.consumeQueue.run(async () => {
      const found = await this.getLinkToken(tokenDigest);
      if (found === null || found.usedAtMs !== usedAtMs) return false;
      await this.putLinkToken({ ...found, usedAtMs: null });
      return true;
    });
  }

  async deleteLinkTokensOf(userId: string, purpose: PlatformLinkPurpose): Promise<number> {
    let removed = 0;
    for (const token of await this.records.list<PlatformLinkTokenRecord>("link-token")) {
      if (token.userId !== userId || token.purpose !== purpose) continue;
      if (await this.records.remove("link-token", part(token.tokenDigest))) removed += 1;
    }
    return removed;
  }

  getIdempotency(operation: string, requestId: string): Promise<PlatformIdempotencyRecord | null> {
    return this.records.get<PlatformIdempotencyRecord>("idempotency", `${part(operation)}/${part(requestId)}`);
  }

  putIdempotency(record: PlatformIdempotencyRecord): Promise<void> {
    return this.records.put("idempotency", `${part(record.operation)}/${part(record.requestId)}`, record);
  }

  /** Throws when the index row names a different account that still holds the value (a stale row is ignored). */
  private async assertFree(kind: "email" | "external", field: "email" | "externalId", value: string, userId: string): Promise<void> {
    const index = await this.records.get<IndexRow>(kind, part(value));
    if (index === null || index.userId === userId) return;
    const owner = await this.getAccount(index.userId);
    const ownerValue = field === "email" ? owner?.email : owner?.externalId;
    if (owner !== null && ownerValue === value) throw new PlatformStoreConflictError(field);
  }

  private async removeIndex(kind: "email" | "external", value: string, userId: string): Promise<void> {
    const index = await this.records.get<IndexRow>(kind, part(value));
    if (index !== null && index.userId === userId) await this.records.remove(kind, part(value));
  }
}
