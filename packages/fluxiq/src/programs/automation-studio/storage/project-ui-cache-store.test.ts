import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioSqlExecutor } from "./project-database.ts";
import { AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES, AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES, AutomationStudioMemoryUiCacheStore, AutomationStudioSqliteUiCacheStore } from "./project-ui-cache-store.ts";
import { assertNoCriticalFullScan, assertPlanMentions, explainAutomationStudioQueryPlan } from "./query-plan.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-ui-cache-store-test");

describe("AutomationStudioSqliteUiCacheStore", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("stores, replaces, and returns exact project/user cache entries in request order", async () => {
    const store = await AutomationStudioSqliteUiCacheStore.open({ rootDir });
    await expect(store.putBatch({ projectId: "project.one", userId: "user.local", now: 100, entries: [
      { cacheKey: "workspace:active", value: { selected: "flow.1" }, contentRevision: 1, resourceKind: "flow", resourceId: "flow.1" },
      { cacheKey: "hierarchy:expanded", value: ["flow.1", "folder.1"], contentRevision: 2 }
    ] })).resolves.toMatchObject([
      { cacheKey: "workspace:active", value: { selected: "flow.1" }, contentRevision: 1, updatedAt: 100 },
      { cacheKey: "hierarchy:expanded", value: ["flow.1", "folder.1"], contentRevision: 2, updatedAt: 100 }
    ]);

    await store.putBatch({ projectId: "project.one", userId: "user.local", now: 150, entries: [{ cacheKey: "workspace:active", value: { selected: "flow.2" }, contentRevision: 3 }] });
    await expect(store.get({ projectId: "project.one", userId: "user.local", cacheKeys: ["hierarchy:expanded", "workspace:active"], now: 175 })).resolves.toMatchObject([
      { cacheKey: "hierarchy:expanded", value: ["flow.1", "folder.1"], contentRevision: 2 },
      { cacheKey: "workspace:active", value: { selected: "flow.2" }, contentRevision: 3, updatedAt: 150 }
    ]);
    await expect(store.stats({ projectId: "project.one", userId: "user.local", now: 200 })).resolves.toMatchObject([{ entries: 2, expiredEntries: 0 }]);
    await store.close();
  });

  it("keeps project and user values isolated", async () => {
    const store = await AutomationStudioSqliteUiCacheStore.open({ rootDir });
    await store.putBatch({ projectId: "project.one", userId: "user.a", now: 10, entries: [{ cacheKey: "workspace:active", value: "a" }] });
    await store.putBatch({ projectId: "project.one", userId: "user.b", now: 10, entries: [{ cacheKey: "workspace:active", value: "b" }] });
    await store.putBatch({ projectId: "project.two", userId: "user.a", now: 10, entries: [{ cacheKey: "workspace:active", value: "other-project" }] });

    await expect(store.get({ projectId: "project.one", userId: "user.a", cacheKeys: ["workspace:active"], now: 20 })).resolves.toMatchObject([{ value: "a" }]);
    await expect(store.get({ projectId: "project.one", userId: "user.b", cacheKeys: ["workspace:active"], now: 20 })).resolves.toMatchObject([{ value: "b" }]);
    await expect(store.get({ projectId: "project.two", userId: "user.a", cacheKeys: ["workspace:active"], now: 20 })).resolves.toMatchObject([{ value: "other-project" }]);
    await expect(store.stats({ userId: "user.a", now: 20 })).resolves.toMatchObject([{ projectId: "project.one", entries: 1 }, { projectId: "project.two", entries: 1 }]);
    await store.close();
  });

  it("deletes by exact key, key prefix, and resource without clearing unrelated entries", async () => {
    const store = await AutomationStudioSqliteUiCacheStore.open({ rootDir });
    await store.putBatch({ projectId: "project.one", userId: "user.local", now: 10, entries: [
      { cacheKey: "view:one", value: 1, resourceKind: "flow", resourceId: "flow.1" },
      { cacheKey: "view:two", value: 2, resourceKind: "flow", resourceId: "flow.2" },
      { cacheKey: "cursor:one", value: 3 }
    ] });
    await store.putBatch({ projectId: "project.one", userId: "other", now: 10, entries: [{ cacheKey: "view:one", value: 4, resourceKind: "flow", resourceId: "flow.1" }] });

    await expect(store.delete({ projectId: "project.one", userId: "user.local", cacheKeys: ["cursor:one"] })).resolves.toEqual({ deleted: 1 });
    await expect(store.delete({ projectId: "project.one", userId: "user.local", resourceKind: "flow", resourceId: "flow.2" })).resolves.toEqual({ deleted: 1 });
    await expect(store.delete({ projectId: "project.one", userId: "user.local", keyPrefix: "view:" })).resolves.toEqual({ deleted: 1 });
    await expect(store.stats({ projectId: "project.one", userId: "user.local", now: 20 })).resolves.toEqual([]);
    await expect(store.get({ projectId: "project.one", userId: "other", cacheKeys: ["view:one"], now: 20 })).resolves.toMatchObject([{ value: 4 }]);
    await store.close();
  });

  it("expires entries on read and through bounded sweeps", async () => {
    const store = await AutomationStudioSqliteUiCacheStore.open({ rootDir });
    await store.putBatch({ projectId: "project.one", userId: "user.local", now: 100, entries: [
      { cacheKey: "old", value: true, expiresAt: 110 },
      { cacheKey: "older", value: true, expiresAt: 110 },
      { cacheKey: "fresh", value: true, expiresAt: 1_100 }
    ] });

    await expect(store.get({ projectId: "project.one", userId: "user.local", cacheKeys: ["old"], now: 111 })).resolves.toEqual([]);
    await expect(store.stats({ projectId: "project.one", userId: "user.local", now: 111 })).resolves.toMatchObject([{ entries: 2, expiredEntries: 1 }]);
    await expect(store.sweepExpired({ now: 111, limit: 1 })).resolves.toEqual({ deleted: 1 });
    await expect(store.stats({ projectId: "project.one", userId: "user.local", now: 111 })).resolves.toMatchObject([{ entries: 1, expiredEntries: 0 }]);
    await store.close();
  });

  it("compacts least-recently-updated project entries to a byte budget", async () => {
    const store = await AutomationStudioSqliteUiCacheStore.open({ rootDir });
    await store.putBatch({ projectId: "project.one", userId: "user.local", entries: [
      { cacheKey: "old", value: "aaaa", updatedAt: 10 },
      { cacheKey: "middle", value: "bbbb", updatedAt: 20 },
      { cacheKey: "new", value: "cccc", updatedAt: 30 }
    ] });
    await store.putBatch({ projectId: "project.two", userId: "user.local", now: 10, entries: [{ cacheKey: "old", value: "dddd" }] });

    const before = (await store.stats({ projectId: "project.one", userId: "user.local", now: 100 }))[0]!;
    await expect(store.compact({ projectId: "project.one", userId: "user.local", maxBytes: Math.max(1, before.byteCount - 8), now: 100 })).resolves.toMatchObject({ lruDeleted: 2 });
    await expect(store.get({ projectId: "project.one", userId: "user.local", cacheKeys: ["old", "middle", "new"], now: 110 })).resolves.toMatchObject([{ cacheKey: "new", value: "cccc" }]);
    await expect(store.get({ projectId: "project.two", userId: "user.local", cacheKeys: ["old"], now: 110 })).resolves.toMatchObject([{ value: "dddd" }]);
    await store.close();
  });

  it("accepts the exact maximum cache batch and rejects unbounded requests", async () => {
    const store = await AutomationStudioSqliteUiCacheStore.open({ rootDir });
    const entries = Array.from({ length: AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES }, (_value, index) => ({
      cacheKey: `view:${String(index).padStart(3, "0")}`,
      value: { index, focused: index % 2 === 0 },
      updatedAt: 1_000 + index,
      resourceKind: "flow",
      resourceId: `flow.${index % 5}`
    }));

    await expect(store.putBatch({ projectId: "project.scale", userId: "user.local", entries, now: 1_000 })).resolves.toHaveLength(AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES);
    const cacheKeys = entries.map((entry) => entry.cacheKey);
    const reversedKeys = [...cacheKeys].reverse();
    const fetched = await store.get({ projectId: "project.scale", userId: "user.local", cacheKeys: reversedKeys, now: 2_000 });

    expect(fetched).toHaveLength(AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES);
    expect(fetched.map((entry) => entry.cacheKey)).toEqual(reversedKeys);
    await expect(store.stats({ projectId: "project.scale", userId: "user.local", now: 2_100 })).resolves.toMatchObject([{ entries: AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES }]);
    await expect(store.putBatch({ projectId: "project.scale", userId: "user.local", entries: entries.concat({ cacheKey: "view:overflow", value: { index: AUTOMATION_STUDIO_UI_CACHE_MAX_BATCH_ENTRIES, focused: false }, updatedAt: 2_000, resourceKind: "flow", resourceId: "flow.overflow" }) })).rejects.toThrow(/at most 100 entries/);
    await expect(store.get({ projectId: "project.scale", userId: "user.local", cacheKeys: cacheKeys.concat("view:overflow"), now: 2_200 })).rejects.toThrow(/at most 100 keys/);
    await store.close();
  });

  it("keeps UI cache hot paths on scoped indexes", async () => {
    const store = await AutomationStudioSqliteUiCacheStore.open({ rootDir });
    await store.putBatch({ projectId: "project.plan", userId: "user.local", now: 100, entries: [
      { cacheKey: "view:alpha", value: { open: true }, expiresAt: 1_000, resourceKind: "flow", resourceId: "flow.1" },
      { cacheKey: "view:beta", value: { open: false }, expiresAt: 1_100, resourceKind: "flow", resourceId: "flow.2" }
    ] });
    const database = uiCacheDatabase(store);
    const cases = [
      {
        sql: "select cache_key, value_json from automation_studio_ui_cache_entries where project_id = ? and user_id = ? and cache_key in (?, ?)",
        params: ["project.plan", "user.local", "view:alpha", "view:beta"],
        index: "sqlite_autoindex_automation_studio_ui_cache_entries"
      },
      {
        sql: "select cache_key from automation_studio_ui_cache_entries where project_id = ? and user_id = ? and cache_key >= ? and cache_key < ?",
        params: ["project.plan", "user.local", "view:", "view;"],
        index: "sqlite_autoindex_automation_studio_ui_cache_entries"
      },
      {
        sql: "select cache_key from automation_studio_ui_cache_entries where project_id = ? and user_id = ? and resource_kind = ? and resource_id = ?",
        params: ["project.plan", "user.local", "flow", "flow.1"],
        index: "automation_studio_ui_cache_resource_idx"
      },
      {
        sql: "select project_id, count(*) from automation_studio_ui_cache_entries where user_id = ? and project_id = ? group by project_id, user_id",
        params: ["user.local", "project.plan"],
        index: "automation_studio_ui_cache_stats_idx"
      },
      {
        sql: "select rowid from automation_studio_ui_cache_entries where expires_at_ms is not null and expires_at_ms <= ? order by expires_at_ms, project_id, user_id, cache_key limit ?",
        params: [1_000, 10],
        index: "automation_studio_ui_cache_expiry_idx"
      },
      {
        sql: "select rowid, size_bytes from automation_studio_ui_cache_entries where project_id = ? and user_id = ? order by last_accessed_at_ms, updated_at_ms, cache_key",
        params: ["project.plan", "user.local"],
        index: "automation_studio_ui_cache_lru_idx"
      }
    ] as const;

    for (const entry of cases) {
      const plan = await explainAutomationStudioQueryPlan(database, entry.sql, entry.params);
      expect(() => assertNoCriticalFullScan(plan, ["automation_studio_ui_cache_entries"])).not.toThrow();
      expect(() => assertPlanMentions(plan, entry.index)).not.toThrow();
    }
    await store.close();
  });

  it("rejects entries over the configured per-entry cache budget", async () => {
    const store = await AutomationStudioSqliteUiCacheStore.open({ rootDir, maxEntryBytes: 8 });
    await expect(store.putBatch({ projectId: "project.one", userId: "user.local", entries: [{ cacheKey: "too-large", value: "this is too large" }] })).rejects.toThrow(/exceeds 8 bytes/);
    await expect(store.stats({ userId: "user.local" })).resolves.toEqual([]);
    await store.close();
  });
});

describe("AutomationStudioMemoryUiCacheStore", () => {
  it("provides the no-storage fallback with the same cache contract", async () => {
    const store = new AutomationStudioMemoryUiCacheStore();
    await store.putBatch({ projectId: "project.one", userId: "user.local", now: 10, entries: [{ cacheKey: "workspace:active", value: { selected: "flow.1" }, sizeBytes: 24 }] });
    await expect(store.get({ projectId: "project.one", userId: "user.local", cacheKeys: ["workspace:active"], now: 20 })).resolves.toMatchObject([{ value: { selected: "flow.1" }, sizeBytes: 24 }]);
    await expect(store.delete({ projectId: "project.one", userId: "user.local" })).resolves.toEqual({ deleted: 1 });
    await expect(store.get({ projectId: "project.one", userId: "user.local", cacheKeys: ["workspace:active"], now: 20 })).resolves.toEqual([]);
  });

  it("uses the shared default maximum entry size", async () => {
    const store = new AutomationStudioMemoryUiCacheStore();
    await expect(store.putBatch({ projectId: "project.one", userId: "user.local", entries: [{ cacheKey: "max-ok", value: "x".repeat(AUTOMATION_STUDIO_UI_CACHE_MAX_ENTRY_BYTES - 2) }] })).resolves.toHaveLength(1);
  });
});

function uiCacheDatabase(store: AutomationStudioSqliteUiCacheStore): AutomationStudioSqlExecutor {
  return (store as unknown as { database: AutomationStudioSqlExecutor }).database;
}