import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { JsonValue } from "../../../core/index.ts";
import { AutomationStudioProjectDatabase, type AutomationStudioSqlExecutor } from "./project-database.ts";

export const AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES = 100;
export const AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES = 256 * 1024;
export const AUTOMATION_STUDIO_UI_CACHE_MAX_KEY_BYTES = 512;

export type AutomationStudioUiCacheValue = JsonValue;

export type AutomationStudioUiCacheEntry<TValue extends AutomationStudioUiCacheValue = AutomationStudioUiCacheValue> = {
  projectId: string;
  userId: string;
  cacheKey: string;
  value: TValue;
  sizeBytes: number;
  updatedAt: number;
  contentRevision?: number;
  expiresAt?: number | null;
  resourceKind?: string;
  resourceId?: string;
};

export type AutomationStudioUiCachePutEntry = {
  cacheKey: string;
  value: AutomationStudioUiCacheValue;
  sizeBytes?: number;
  updatedAt?: number;
  contentRevision?: number;
  expiresAt?: number | null;
  resourceKind?: string;
  resourceId?: string;
};

export type AutomationStudioUiCacheDeleteInput = {
  projectId: string;
  userId?: string;
  cacheKeys?: readonly string[];
  keyPrefix?: string;
  resourceKind?: string;
  resourceId?: string;
};

export type AutomationStudioUiCacheStats = {
  projectId: string;
  userId: string;
  entries: number;
  byteCount: number;
  expiredEntries: number;
  oldestUpdatedAt: number | null;
  newestUpdatedAt: number | null;
};

export type AutomationStudioUiCacheCompactResult = {
  expiredDeleted: number;
  lruDeleted: number;
  byteCount: number;
};

export type AutomationStudioUiCacheStoreOptions = {
  rootDir?: string;
  databasePath?: string;
  busyTimeoutMs?: number;
  maxEntryBytes?: number;
};

export interface AutomationStudioUiCacheStore {
  get(input: { projectId: string; userId: string; cacheKeys: readonly string[]; now?: number }): Promise<AutomationStudioUiCacheEntry[]>;
  putBatch(input: { projectId: string; userId: string; entries: readonly AutomationStudioUiCachePutEntry[]; now?: number }): Promise<AutomationStudioUiCacheEntry[]>;
  delete(input: AutomationStudioUiCacheDeleteInput): Promise<{ deleted: number }>;
  sweepExpired(input?: { now?: number; limit?: number }): Promise<{ deleted: number }>;
  stats(input: { userId: string; projectId?: string; now?: number }): Promise<AutomationStudioUiCacheStats[]>;
  compact(input: { projectId: string; userId: string; maxBytes: number; now?: number }): Promise<AutomationStudioUiCacheCompactResult>;
  checkpoint(): Promise<void>;
  close(): Promise<void>;
}

export class AutomationStudioLazySqliteUiCacheStore implements AutomationStudioUiCacheStore {
  private storePromise: Promise<AutomationStudioSqliteUiCacheStore> | null = null;

  constructor(private readonly options: AutomationStudioUiCacheStoreOptions) {}

  async get(input: { projectId: string; userId: string; cacheKeys: readonly string[]; now?: number }): Promise<AutomationStudioUiCacheEntry[]> {
    return (await this.store()).get(input);
  }

  async putBatch(input: { projectId: string; userId: string; entries: readonly AutomationStudioUiCachePutEntry[]; now?: number }): Promise<AutomationStudioUiCacheEntry[]> {
    return (await this.store()).putBatch(input);
  }

  async delete(input: AutomationStudioUiCacheDeleteInput): Promise<{ deleted: number }> {
    return (await this.store()).delete(input);
  }

  async sweepExpired(input?: { now?: number; limit?: number }): Promise<{ deleted: number }> {
    return (await this.store()).sweepExpired(input);
  }

  async stats(input: { userId: string; projectId?: string; now?: number }): Promise<AutomationStudioUiCacheStats[]> {
    return (await this.store()).stats(input);
  }

  async compact(input: { projectId: string; userId: string; maxBytes: number; now?: number }): Promise<AutomationStudioUiCacheCompactResult> {
    return (await this.store()).compact(input);
  }

  async checkpoint(): Promise<void> {
    if (!this.storePromise) return;
    await (await this.storePromise).checkpoint();
  }

  async close(): Promise<void> {
    if (!this.storePromise) return;
    const store = await this.storePromise;
    this.storePromise = null;
    await store.close();
  }

  private store(): Promise<AutomationStudioSqliteUiCacheStore> {
    this.storePromise ??= AutomationStudioSqliteUiCacheStore.open(this.options);
    return this.storePromise;
  }
}
export class AutomationStudioMemoryUiCacheStore implements AutomationStudioUiCacheStore {
  private readonly values = new Map<string, AutomationStudioUiCacheEntry>();

  async get(input: { projectId: string; userId: string; cacheKeys: readonly string[]; now?: number }): Promise<AutomationStudioUiCacheEntry[]> {
    const now = normalizedNow(input.now);
    const projectId = normalizeIdentifier(input.projectId, "project ID");
    const userId = normalizeUserId(input.userId);
    const entries: AutomationStudioUiCacheEntry[] = [];
    for (const cacheKey of normalizeCacheKeyBatch(input.cacheKeys)) {
      const storageKey = memoryKey(projectId, userId, cacheKey);
      const entry = this.values.get(storageKey);
      if (!entry) continue;
      if (entry.expiresAt !== undefined && entry.expiresAt !== null && entry.expiresAt <= now) {
        this.values.delete(storageKey);
        continue;
      }
      entries.push(cloneEntry(entry));
    }
    return entries;
  }

  async putBatch(input: { projectId: string; userId: string; entries: readonly AutomationStudioUiCachePutEntry[]; now?: number }): Promise<AutomationStudioUiCacheEntry[]> {
    const now = normalizedNow(input.now);
    const projectId = normalizeIdentifier(input.projectId, "project ID");
    const userId = normalizeUserId(input.userId);
    const entries = normalizePutEntries(input.entries, now);
    for (const entry of entries) this.values.set(memoryKey(projectId, userId, entry.cacheKey), { ...entry, projectId, userId });
    return entries.map((entry) => cloneEntry({ ...entry, projectId, userId }));
  }

  async delete(input: AutomationStudioUiCacheDeleteInput): Promise<{ deleted: number }> {
    const projectId = normalizeIdentifier(input.projectId, "project ID");
    const userId = input.userId === undefined ? undefined : normalizeUserId(input.userId);
    const cacheKeys = input.cacheKeys === undefined ? undefined : normalizeCacheKeyBatch(input.cacheKeys);
    const keyPrefix = input.keyPrefix === undefined ? undefined : normalizeCacheKey(input.keyPrefix, "cache key prefix");
    const resourceKind = input.resourceKind === undefined ? undefined : normalizeIdentifier(input.resourceKind, "resource kind");
    const resourceId = input.resourceId === undefined ? undefined : normalizeIdentifier(input.resourceId, "resource ID");
    let deleted = 0;
    for (const [storageKey, entry] of [...this.values]) {
      if (entry.projectId !== projectId) continue;
      if (userId !== undefined && entry.userId !== userId) continue;
      if (cacheKeys && !cacheKeys.includes(entry.cacheKey)) continue;
      if (keyPrefix !== undefined && !entry.cacheKey.startsWith(keyPrefix)) continue;
      if (resourceKind !== undefined && entry.resourceKind !== resourceKind) continue;
      if (resourceId !== undefined && entry.resourceId !== resourceId) continue;
      this.values.delete(storageKey);
      deleted += 1;
    }
    return { deleted };
  }

  async sweepExpired(input: { now?: number; limit?: number } = {}): Promise<{ deleted: number }> {
    const now = normalizedNow(input.now);
    const limit = positiveInteger(input.limit ?? 1_000, "expired sweep limit");
    let deleted = 0;
    for (const [storageKey, entry] of [...this.values].sort((left, right) => (left[1].expiresAt ?? Number.MAX_SAFE_INTEGER) - (right[1].expiresAt ?? Number.MAX_SAFE_INTEGER))) {
      if (deleted >= limit) break;
      if (entry.expiresAt === undefined || entry.expiresAt === null || entry.expiresAt > now) continue;
      this.values.delete(storageKey);
      deleted += 1;
    }
    return { deleted };
  }

  async stats(input: { userId: string; projectId?: string; now?: number }): Promise<AutomationStudioUiCacheStats[]> {
    const now = normalizedNow(input.now);
    const userId = normalizeUserId(input.userId);
    const projectId = input.projectId === undefined ? undefined : normalizeIdentifier(input.projectId, "project ID");
    const grouped = new Map<string, AutomationStudioUiCacheStats>();
    for (const entry of this.values.values()) {
      if (entry.userId !== userId) continue;
      if (projectId !== undefined && entry.projectId !== projectId) continue;
      const key = memoryKey(entry.projectId, entry.userId, "stats");
      const current = grouped.get(key) ?? { projectId: entry.projectId, userId: entry.userId, entries: 0, byteCount: 0, expiredEntries: 0, oldestUpdatedAt: null, newestUpdatedAt: null };
      current.entries += 1;
      current.byteCount += entry.sizeBytes;
      if (entry.expiresAt !== undefined && entry.expiresAt !== null && entry.expiresAt <= now) current.expiredEntries += 1;
      current.oldestUpdatedAt = current.oldestUpdatedAt === null ? entry.updatedAt : Math.min(current.oldestUpdatedAt, entry.updatedAt);
      current.newestUpdatedAt = current.newestUpdatedAt === null ? entry.updatedAt : Math.max(current.newestUpdatedAt, entry.updatedAt);
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((left, right) => left.projectId.localeCompare(right.projectId));
  }

  async compact(input: { projectId: string; userId: string; maxBytes: number; now?: number }): Promise<AutomationStudioUiCacheCompactResult> {
    const expired = await this.sweepExpired(input.now === undefined ? {} : { now: input.now });
    const projectId = normalizeIdentifier(input.projectId, "project ID");
    const userId = normalizeUserId(input.userId);
    const maxBytes = nonNegativeInteger(input.maxBytes, "cache max bytes");
    const entries = [...this.values.entries()]
      .filter(([, entry]) => entry.projectId === projectId && entry.userId === userId)
      .sort((left, right) => left[1].updatedAt - right[1].updatedAt || left[1].cacheKey.localeCompare(right[1].cacheKey));
    let byteCount = entries.reduce((total, [, entry]) => total + entry.sizeBytes, 0);
    let lruDeleted = 0;
    for (const [storageKey, entry] of entries) {
      if (byteCount <= maxBytes) break;
      this.values.delete(storageKey);
      byteCount -= entry.sizeBytes;
      lruDeleted += 1;
    }
    return { expiredDeleted: expired.deleted, lruDeleted, byteCount };
  }

  async checkpoint(): Promise<void> {}

  async close(): Promise<void> {}
}

export class AutomationStudioSqliteUiCacheStore implements AutomationStudioUiCacheStore {
  private readonly maxEntryBytes: number;

  private constructor(private readonly database: AutomationStudioProjectDatabase, options: { maxEntryBytes: number }) {
    this.maxEntryBytes = options.maxEntryBytes;
  }

  static async open(options: AutomationStudioUiCacheStoreOptions): Promise<AutomationStudioSqliteUiCacheStore> {
    const databasePath = resolveCacheDatabasePath(options);
    await mkdir(path.dirname(databasePath), { recursive: true });
    const database = await AutomationStudioProjectDatabase.open({
      projectId: "automation-studio-ui-cache",
      filePath: databasePath,
      busyTimeoutMs: options.busyTimeoutMs ?? 5_000
    });
    try {
      await database.transaction((sql) => migrateUiCacheSchema(sql));
      return new AutomationStudioSqliteUiCacheStore(database, { maxEntryBytes: Math.max(1, Math.trunc(options.maxEntryBytes ?? AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES)) });
    } catch (error) {
      await database.close().catch(() => undefined);
      throw error;
    }
  }

  async get(input: { projectId: string; userId: string; cacheKeys: readonly string[]; now?: number }): Promise<AutomationStudioUiCacheEntry[]> {
    const now = normalizedNow(input.now);
    const projectId = normalizeIdentifier(input.projectId, "project ID");
    const userId = normalizeUserId(input.userId);
    const cacheKeys = normalizeCacheKeyBatch(input.cacheKeys);
    if (!cacheKeys.length) return [];
    const rows = await this.database.all<UiCacheRow>(
      `select * from automation_studio_ui_cache_entries
       where project_id = ? and user_id = ? and cache_key in (${cacheKeys.map(() => "?").join(", ")})`,
      [projectId, userId, ...cacheKeys]
    );
    const liveRows: UiCacheRow[] = [];
    const expiredKeys: string[] = [];
    for (const row of rows) {
      if (row.expires_at_ms !== null && row.expires_at_ms <= now) expiredKeys.push(row.cache_key);
      else liveRows.push(row);
    }
    if (expiredKeys.length) await this.delete({ projectId, userId, cacheKeys: expiredKeys });
    if (liveRows.length) {
      await this.database.run(
        `update automation_studio_ui_cache_entries
         set last_accessed_at_ms = ?
         where project_id = ? and user_id = ? and cache_key in (${liveRows.map(() => "?").join(", ")})`,
        [now, projectId, userId, ...liveRows.map((row) => row.cache_key)]
      );
    }
    const byKey = new Map(liveRows.map((row) => [row.cache_key, entryFromRow({ ...row, last_accessed_at_ms: now })]));
    return cacheKeys.flatMap((cacheKey) => {
      const entry = byKey.get(cacheKey);
      return entry ? [entry] : [];
    });
  }

  async putBatch(input: { projectId: string; userId: string; entries: readonly AutomationStudioUiCachePutEntry[]; now?: number }): Promise<AutomationStudioUiCacheEntry[]> {
    const now = normalizedNow(input.now);
    const projectId = normalizeIdentifier(input.projectId, "project ID");
    const userId = normalizeUserId(input.userId);
    const entries = normalizePutEntries(input.entries, now, this.maxEntryBytes);
    if (!entries.length) return [];
    await this.database.transaction(async (sql) => {
      for (const entry of entries) {
        await sql.run(
          `insert into automation_studio_ui_cache_entries (
             project_id, user_id, cache_key, value_json, size_bytes, content_revision,
             resource_kind, resource_id, expires_at_ms, created_at_ms, updated_at_ms, last_accessed_at_ms
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           on conflict(project_id, user_id, cache_key) do update set
             value_json = excluded.value_json,
             size_bytes = excluded.size_bytes,
             content_revision = excluded.content_revision,
             resource_kind = excluded.resource_kind,
             resource_id = excluded.resource_id,
             expires_at_ms = excluded.expires_at_ms,
             updated_at_ms = excluded.updated_at_ms,
             last_accessed_at_ms = excluded.last_accessed_at_ms`,
          [
            projectId,
            userId,
            entry.cacheKey,
            JSON.stringify(entry.value),
            entry.sizeBytes,
            entry.contentRevision ?? null,
            entry.resourceKind ?? null,
            entry.resourceId ?? null,
            entry.expiresAt ?? null,
            now,
            entry.updatedAt,
            entry.updatedAt
          ]
        );
      }
    });
    return entries.map((entry) => cloneEntry({ ...entry, projectId, userId }));
  }

  async delete(input: AutomationStudioUiCacheDeleteInput): Promise<{ deleted: number }> {
    const clauses = ["project_id = ?"];
    const params: unknown[] = [normalizeIdentifier(input.projectId, "project ID")];
    if (input.userId !== undefined) {
      clauses.push("user_id = ?");
      params.push(normalizeUserId(input.userId));
    }
    if (input.cacheKeys?.length) {
      const cacheKeys = normalizeCacheKeyBatch(input.cacheKeys);
      clauses.push(`cache_key in (${cacheKeys.map(() => "?").join(", ")})`);
      params.push(...cacheKeys);
    }
    if (input.keyPrefix !== undefined) {
      const prefix = normalizeCacheKey(input.keyPrefix, "cache key prefix");
      clauses.push("cache_key >= ? and cache_key < ?");
      params.push(prefix, `${prefix}${String.fromCharCode(0xffff)}`);
    }
    if (input.resourceKind !== undefined) {
      clauses.push("resource_kind = ?");
      params.push(normalizeIdentifier(input.resourceKind, "resource kind"));
    }
    if (input.resourceId !== undefined) {
      clauses.push("resource_id = ?");
      params.push(normalizeIdentifier(input.resourceId, "resource ID"));
    }
    const result = await this.database.run(`delete from automation_studio_ui_cache_entries where ${clauses.join(" and ")}`, params);
    return { deleted: result.changes };
  }

  async sweepExpired(input: { now?: number; limit?: number } = {}): Promise<{ deleted: number }> {
    const now = normalizedNow(input.now);
    const limit = positiveInteger(input.limit ?? 1_000, "expired sweep limit");
    const result = await this.database.run(
      `delete from automation_studio_ui_cache_entries
       where rowid in (
         select rowid from automation_studio_ui_cache_entries
         where expires_at_ms is not null and expires_at_ms <= ?
         order by expires_at_ms, project_id, user_id, cache_key
         limit ?
       )`,
      [now, limit]
    );
    return { deleted: result.changes };
  }

  async stats(input: { userId: string; projectId?: string; now?: number }): Promise<AutomationStudioUiCacheStats[]> {
    const now = normalizedNow(input.now);
    const userId = normalizeUserId(input.userId);
    const clauses = ["user_id = ?"];
    const params: unknown[] = [now, userId];
    if (input.projectId !== undefined) {
      clauses.push("project_id = ?");
      params.push(normalizeIdentifier(input.projectId, "project ID"));
    }
    const rows = await this.database.all<StatsRow>(
      `select
         project_id,
         user_id,
         count(*) as entries,
         coalesce(sum(size_bytes), 0) as byte_count,
         coalesce(sum(case when expires_at_ms is not null and expires_at_ms <= ? then 1 else 0 end), 0) as expired_entries,
         min(updated_at_ms) as oldest_updated_at_ms,
         max(updated_at_ms) as newest_updated_at_ms
       from automation_studio_ui_cache_entries
       where ${clauses.join(" and ")}
       group by project_id, user_id
       order by project_id, user_id`,
      params
    );
    return rows.map((row) => ({
      projectId: row.project_id,
      userId: row.user_id,
      entries: row.entries,
      byteCount: row.byte_count,
      expiredEntries: row.expired_entries,
      oldestUpdatedAt: row.oldest_updated_at_ms,
      newestUpdatedAt: row.newest_updated_at_ms
    }));
  }

  async compact(input: { projectId: string; userId: string; maxBytes: number; now?: number }): Promise<AutomationStudioUiCacheCompactResult> {
    const expired = await this.sweepExpired(input.now === undefined ? {} : { now: input.now });
    const projectId = normalizeIdentifier(input.projectId, "project ID");
    const userId = normalizeUserId(input.userId);
    const maxBytes = nonNegativeInteger(input.maxBytes, "cache max bytes");
    const stats = (await this.stats(input.now === undefined ? { projectId, userId } : { projectId, userId, now: input.now }))[0];
    const byteCount = stats?.byteCount ?? 0;
    if (byteCount <= maxBytes) return { expiredDeleted: expired.deleted, lruDeleted: 0, byteCount };
    const rows = await this.database.all<{ rowid: number; size_bytes: number }>(
      `select rowid, size_bytes from automation_studio_ui_cache_entries
       where project_id = ? and user_id = ?
       order by last_accessed_at_ms, updated_at_ms, cache_key`,
      [projectId, userId]
    );
    let currentBytes = byteCount;
    const deleteRowIds: number[] = [];
    for (const row of rows) {
      if (currentBytes <= maxBytes) break;
      deleteRowIds.push(row.rowid);
      currentBytes -= row.size_bytes;
    }
    for (let index = 0; index < deleteRowIds.length; index += 100) {
      const batch = deleteRowIds.slice(index, index + 100);
      await this.database.run(`delete from automation_studio_ui_cache_entries where rowid in (${batch.map(() => "?").join(", ")})`, batch);
    }
    const finalStats = (await this.stats(input.now === undefined ? { projectId, userId } : { projectId, userId, now: input.now }))[0];
    return { expiredDeleted: expired.deleted, lruDeleted: deleteRowIds.length, byteCount: finalStats?.byteCount ?? 0 };
  }

  async checkpoint(): Promise<void> {
    await this.database.checkpoint("passive");
  }

  async close(): Promise<void> {
    await this.database.close();
  }
}

type UiCacheRow = {
  project_id: string;
  user_id: string;
  cache_key: string;
  value_json: string;
  size_bytes: number;
  content_revision: number | null;
  resource_kind: string | null;
  resource_id: string | null;
  expires_at_ms: number | null;
  created_at_ms: number;
  updated_at_ms: number;
  last_accessed_at_ms: number;
};

type StatsRow = {
  project_id: string;
  user_id: string;
  entries: number;
  byte_count: number;
  expired_entries: number;
  oldest_updated_at_ms: number | null;
  newest_updated_at_ms: number | null;
};

async function migrateUiCacheSchema(sql: AutomationStudioSqlExecutor): Promise<void> {
  await sql.run(
    `create table if not exists automation_studio_ui_cache_entries (
       project_id text not null,
       user_id text not null,
       cache_key text not null,
       value_json text not null,
       size_bytes integer not null check (size_bytes >= 0),
       content_revision integer,
       resource_kind text,
       resource_id text,
       expires_at_ms integer,
       created_at_ms integer not null,
       updated_at_ms integer not null,
       last_accessed_at_ms integer not null,
       primary key (project_id, user_id, cache_key)
     )`
  );
  await sql.run("create index if not exists automation_studio_ui_cache_expiry_idx on automation_studio_ui_cache_entries (expires_at_ms, project_id, user_id, cache_key) where expires_at_ms is not null");
  await sql.run("create index if not exists automation_studio_ui_cache_resource_idx on automation_studio_ui_cache_entries (project_id, user_id, resource_kind, resource_id) where resource_kind is not null and resource_id is not null");
  await sql.run("create index if not exists automation_studio_ui_cache_stats_idx on automation_studio_ui_cache_entries (user_id, project_id, updated_at_ms)");
  await sql.run("create index if not exists automation_studio_ui_cache_lru_idx on automation_studio_ui_cache_entries (project_id, user_id, last_accessed_at_ms, updated_at_ms)");
}

function resolveCacheDatabasePath(options: AutomationStudioUiCacheStoreOptions): string {
  if (options.databasePath) return path.resolve(options.databasePath);
  if (!options.rootDir) throw new Error("Automation Studio UI cache store requires rootDir or databasePath.");
  return path.join(path.resolve(options.rootDir), "cache", "automation-studio", "ui-cache.sqlite");
}

function entryFromRow(row: UiCacheRow): AutomationStudioUiCacheEntry {
  const base: AutomationStudioUiCacheEntry = {
    projectId: row.project_id,
    userId: row.user_id,
    cacheKey: row.cache_key,
    value: JSON.parse(row.value_json) as JsonValue,
    sizeBytes: row.size_bytes,
    updatedAt: row.updated_at_ms
  };
  if (row.content_revision !== null) base.contentRevision = row.content_revision;
  if (row.expires_at_ms !== null) base.expiresAt = row.expires_at_ms;
  if (row.resource_kind !== null) base.resourceKind = row.resource_kind;
  if (row.resource_id !== null) base.resourceId = row.resource_id;
  return base;
}

function normalizePutEntries(entries: readonly AutomationStudioUiCachePutEntry[], now: number, maxEntryBytes = AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES): AutomationStudioUiCacheEntry[] {
  if (entries.length > AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES) throw new Error(`Automation Studio UI cache accepts at most ${AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES} entries per request.`);
  return entries.map((entry) => {
    const cacheKey = normalizeCacheKey(entry.cacheKey, "cache key");
    const value = cloneJsonValue(entry.value);
    const sizeBytes = entry.sizeBytes ?? Buffer.byteLength(JSON.stringify(value), "utf8");
    if (sizeBytes > maxEntryBytes) throw new Error(`Automation Studio UI cache entry exceeds ${maxEntryBytes} bytes.`);
    const output: AutomationStudioUiCacheEntry = {
      projectId: "",
      userId: "",
      cacheKey,
      value,
      sizeBytes,
      updatedAt: normalizedNow(entry.updatedAt ?? now)
    };
    if (entry.contentRevision !== undefined) output.contentRevision = nonNegativeInteger(entry.contentRevision, "content revision");
    if (entry.expiresAt !== undefined) output.expiresAt = entry.expiresAt === null ? null : nonNegativeInteger(entry.expiresAt, "cache expiration");
    if (entry.resourceKind !== undefined) output.resourceKind = normalizeIdentifier(entry.resourceKind, "resource kind");
    if (entry.resourceId !== undefined) output.resourceId = normalizeIdentifier(entry.resourceId, "resource ID");
    return output;
  });
}

function cloneEntry(entry: AutomationStudioUiCacheEntry): AutomationStudioUiCacheEntry {
  const output: AutomationStudioUiCacheEntry = {
    projectId: entry.projectId,
    userId: entry.userId,
    cacheKey: entry.cacheKey,
    value: cloneJsonValue(entry.value),
    sizeBytes: entry.sizeBytes,
    updatedAt: entry.updatedAt
  };
  if (entry.contentRevision !== undefined) output.contentRevision = entry.contentRevision;
  if (entry.expiresAt !== undefined) output.expiresAt = entry.expiresAt;
  if (entry.resourceKind !== undefined) output.resourceKind = entry.resourceKind;
  if (entry.resourceId !== undefined) output.resourceId = entry.resourceId;
  return output;
}

function cloneJsonValue(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function memoryKey(projectId: string, userId: string, cacheKey: string): string {
  return `${projectId}\u0000${userId}\u0000${cacheKey}`;
}

function normalizeUserId(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Automation Studio UI cache requires an authenticated user.");
  if (normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("Invalid user ID.");
  return normalized;
}

function normalizeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${label}.`);
  return normalized;
}

function normalizeCacheKeyBatch(values: readonly string[]): string[] {
  if (values.length > AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES) throw new Error(`Automation Studio UI cache accepts at most ${AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES} keys per request.`);
  return values.map((value) => normalizeCacheKey(value, "cache key"));
}

function normalizeCacheKey(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Automation Studio UI cache ${label} is required.`);
  if (Buffer.byteLength(normalized, "utf8") > AUTOMATION_STUDIO_UI_CACHE_MAX_KEY_BYTES || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`Automation Studio UI cache ${label} exceeds ${AUTOMATION_STUDIO_UI_CACHE_MAX_KEY_BYTES} bytes or contains control characters.`);
  return normalized;
}

function normalizedNow(value: number | undefined): number {
  const normalized = Math.trunc(value ?? Date.now());
  if (!Number.isFinite(normalized) || normalized < 0) throw new Error("Timestamp must be non-negative.");
  return normalized;
}

function positiveInteger(value: number, label: string): number {
  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized) || normalized < 1) throw new Error(`${label} must be positive.`);
  return normalized;
}

function nonNegativeInteger(value: number, label: string): number {
  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be non-negative.`);
  return normalized;
}
