import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioHierarchyNode, AutomationStudioProjectHierarchy } from "../api/contracts.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

export type AutomationStudioHierarchyEntry = {
  entryId: string;
  parentEntryId: string | null;
  kind: string;
  ownerId: string;
  displayName: string;
  sortKey: string;
  depth: number;
  pathKey: string;
  isSystem: boolean;
  isDeleted: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationStudioWorkspacePreference = { userId: string; preferenceKey: string; valueJson: string; revision: number; updatedAt: number };
export type AutomationStudioHierarchyCursorPage = { items: AutomationStudioHierarchyEntry[]; nextCursor: string | null; hasMore: boolean };

export class AutomationStudioProjectHierarchyRepository {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectHierarchyRepository> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      return new AutomationStudioProjectHierarchyRepository(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.lease.release();
  }

  async putEntry(input: Omit<AutomationStudioHierarchyEntry, "depth" | "pathKey" | "revision" | "createdAt" | "updatedAt"> & { depth?: number; pathKey?: string; revision?: number; createdAt?: number; updatedAt?: number }, expectedRevision?: number): Promise<AutomationStudioHierarchyEntry> {
    const now = input.updatedAt ?? Date.now();
    const entryId = requiredId(input.entryId, "hierarchy entry");
    const parentEntryId = optionalId(input.parentEntryId);
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<HierarchyRow>("select * from hierarchy_entries where entry_id = ?", [entryId]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Hierarchy entry ${entryId} revision conflict.`);
      const parent = parentEntryId ? await sql.get<HierarchyRow>("select * from hierarchy_entries where entry_id = ? and is_deleted = 0", [parentEntryId]) : null;
      if (parentEntryId && !parent) throw new Error(`Unknown parent hierarchy entry: ${parentEntryId}`);
      const depth = input.depth ?? (parent ? parent.depth + 1 : 0);
      const pathKey = input.pathKey ?? (parent ? `${parent.path_key}/${entryId}` : entryId);
      const revision = existing ? existing.revision + 1 : Math.max(1, Math.trunc(input.revision ?? 1));
      const createdAt = existing?.created_at_ms ?? input.createdAt ?? now;
      await sql.run(
        `insert into hierarchy_entries (entry_id, parent_entry_id, kind, owner_id, display_name, sort_key, depth, path_key, is_system, is_deleted, revision, created_at_ms, updated_at_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(entry_id) do update set parent_entry_id = excluded.parent_entry_id, kind = excluded.kind,
           owner_id = excluded.owner_id, display_name = excluded.display_name, sort_key = excluded.sort_key,
           depth = excluded.depth, path_key = excluded.path_key, is_system = excluded.is_system,
           is_deleted = excluded.is_deleted, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`,
        [entryId, parentEntryId, requiredKind(input.kind, "entry kind"), requiredId(input.ownerId, "owner"), requiredName(input.displayName, "Hierarchy entry"), input.sortKey, depth, pathKey, input.isSystem ? 1 : 0, input.isDeleted ? 1 : 0, revision, createdAt, now]
      );
      await sql.run("delete from hierarchy_entries_fts where entry_id = ?", [entryId]);
      if (!input.isDeleted) await sql.run("insert into hierarchy_entries_fts (entry_id, display_name) values (?, ?)", [entryId, input.displayName]);
      const saved = await sql.get<HierarchyRow>("select * from hierarchy_entries where entry_id = ?", [entryId]);
      if (!saved) throw new Error(`Hierarchy entry ${entryId} was not persisted.`);
      return hierarchyFromRow(saved);
    });
  }

  async getEntry(entryId: string): Promise<AutomationStudioHierarchyEntry | null> {
    const row = await this.lease.database.get<HierarchyRow>("select * from hierarchy_entries where entry_id = ?", [requiredId(entryId, "hierarchy entry")]);
    return row ? hierarchyFromRow(row) : null;
  }

  async hasEntries(): Promise<boolean> {
    return Boolean(await this.lease.database.get<{ present: number }>("select 1 as present from hierarchy_entries limit 1"));
  }

  async listChildren(parentEntryId: string | null): Promise<AutomationStudioHierarchyEntry[]> {
    const rows = parentEntryId === null
      ? await this.lease.database.all<HierarchyRow>("select * from hierarchy_entries where parent_entry_id is null and is_deleted = 0 order by sort_key, entry_id")
      : await this.lease.database.all<HierarchyRow>("select * from hierarchy_entries where parent_entry_id = ? and is_deleted = 0 order by sort_key, entry_id", [requiredId(parentEntryId, "parent hierarchy entry")]);
    return rows.map(hierarchyFromRow);
  }

  async listChildrenPage(input: { parentEntryId: string | null; limit?: number; cursor?: string | null }): Promise<AutomationStudioHierarchyCursorPage> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ sortKey: string; entryId: string }>(input.cursor);
    const where = ["is_deleted = 0"];
    const params: unknown[] = [];
    if (input.parentEntryId === null) where.push("parent_entry_id is null");
    else { where.push("parent_entry_id = ?"); params.push(requiredId(input.parentEntryId, "parent hierarchy entry")); }
    if (cursor) { where.push("(sort_key, entry_id) > (?, ?)"); params.push(cursor.sortKey, cursor.entryId); }
    const rows = await this.lease.database.all<HierarchyRow>(`select * from hierarchy_entries where ${where.join(" and ")} order by sort_key, entry_id limit ?`, [...params, limit + 1]);
    return pageFromRows(rows, limit, (last) => ({ sortKey: last.sort_key, entryId: last.entry_id }));
  }

  async listAncestors(entryId: string): Promise<AutomationStudioHierarchyEntry[]> {
    const ancestors: AutomationStudioHierarchyEntry[] = [];
    let current = await this.getEntry(entryId);
    while (current?.parentEntryId) {
      const parent = await this.getEntry(current.parentEntryId);
      if (!parent) break;
      ancestors.push(parent);
      current = parent;
    }
    return ancestors.reverse();
  }

  async listSubtreePage(input: { rootEntryId: string; limit?: number; cursor?: string | null }): Promise<AutomationStudioHierarchyCursorPage> {
    const root = await this.getEntry(input.rootEntryId);
    if (!root) throw new Error(`Unknown hierarchy entry: ${input.rootEntryId}`);
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ pathKey: string; entryId: string }>(input.cursor);
    const where = ["is_deleted = 0", "(path_key = ? or path_key like ? escape '\\')"];
    const params: unknown[] = [root.pathKey, `${escapeLike(root.pathKey)}/%`];
    if (cursor) { where.push("(path_key > ? or (path_key = ? and entry_id > ?))"); params.push(cursor.pathKey, cursor.pathKey, cursor.entryId); }
    const rows = await this.lease.database.all<HierarchyRow>(`select * from hierarchy_entries where ${where.join(" and ")} order by path_key, entry_id limit ?`, [...params, limit + 1]);
    return pageFromRows(rows, limit, (last) => ({ pathKey: last.path_key, entryId: last.entry_id }));
  }

  async search(input: { query: string; limit?: number }): Promise<AutomationStudioHierarchyEntry[]> {
    const query = input.query.trim();
    if (!query) return [];
    const rows = await this.lease.database.all<HierarchyRow>(
      `select hierarchy_entries.* from hierarchy_entries_fts
       join hierarchy_entries on hierarchy_entries.entry_id = hierarchy_entries_fts.entry_id
       where hierarchy_entries_fts match ? and hierarchy_entries.is_deleted = 0
       order by rank limit ?`,
      [query, clampLimit(input.limit)]
    );
    return rows.map(hierarchyFromRow);
  }

  async markDeleted(entryId: string, updatedAt = Date.now()): Promise<boolean> {
    const id = requiredId(entryId, "hierarchy entry");
    const result = await this.lease.database.transaction(async (sql) => {
      const update = await sql.run("update hierarchy_entries set is_deleted = 1, revision = revision + 1, updated_at_ms = ? where entry_id = ?", [updatedAt, id]);
      await sql.run("delete from hierarchy_entries_fts where entry_id = ?", [id]);
      return update;
    });
    return result.changes > 0;
  }

  async setPreference(input: { userId: string; preferenceKey: string; value: JsonObject; updatedAt?: number }, expectedRevision?: number): Promise<AutomationStudioWorkspacePreference> {
    const now = input.updatedAt ?? Date.now();
    const userId = requiredId(input.userId, "user");
    const preferenceKey = requiredKind(input.preferenceKey, "preference key");
    const valueJson = JSON.stringify(input.value);
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<PreferenceRow>("select * from workspace_preferences where user_id = ? and preference_key = ?", [userId, preferenceKey]);
      if (expectedRevision !== undefined && existing?.revision !== expectedRevision) throw new Error(`Workspace preference ${preferenceKey} revision conflict.`);
      const revision = existing ? existing.revision + 1 : 1;
      await sql.run(
        `insert into workspace_preferences (user_id, preference_key, value_json, revision, updated_at_ms) values (?, ?, ?, ?, ?)
         on conflict(user_id, preference_key) do update set value_json = excluded.value_json, revision = excluded.revision, updated_at_ms = excluded.updated_at_ms`,
        [userId, preferenceKey, valueJson, revision, now]
      );
      const saved = await sql.get<PreferenceRow>("select * from workspace_preferences where user_id = ? and preference_key = ?", [userId, preferenceKey]);
      if (!saved) throw new Error(`Workspace preference ${preferenceKey} was not persisted.`);
      return preferenceFromRow(saved);
    });
  }

  async getPreference(userId: string, preferenceKey: string): Promise<AutomationStudioWorkspacePreference | null> {
    const row = await this.lease.database.get<PreferenceRow>("select * from workspace_preferences where user_id = ? and preference_key = ?", [requiredId(userId, "user"), requiredKind(preferenceKey, "preference key")]);
    return row ? preferenceFromRow(row) : null;
  }

  async importLegacyHierarchy(hierarchy: AutomationStudioProjectHierarchy, input: { userId?: string; updatedAt?: number } = {}): Promise<{ importedEntries: number; tombstones: number; preferences: number }> {
    const now = input.updatedAt ?? Date.now();
    let importedEntries = 0;
    for (const node of hierarchy.customHierarchyNodes ?? []) {
      await this.putEntry(legacyEntry(node, now));
      importedEntries += 1;
    }
    let tombstones = 0;
    for (const id of hierarchy.deletedHierarchyIds ?? []) {
      const entryId = requiredId(id, "deleted hierarchy entry");
      const existing = await this.getEntry(entryId);
      if (existing) await this.markDeleted(entryId, now);
      else await this.putEntry({ entryId, parentEntryId: null, kind: "deleted", ownerId: entryId, displayName: entryId, sortKey: entryId, isSystem: false, isDeleted: true, createdAt: now, updatedAt: now });
      tombstones += 1;
    }
    const workspacePrefs = hierarchy.workspacePrefs && typeof hierarchy.workspacePrefs === "object" && !Array.isArray(hierarchy.workspacePrefs) ? hierarchy.workspacePrefs : {};
    await this.setPreference({ userId: input.userId ?? "default", preferenceKey: "workspace", value: workspacePrefs, updatedAt: now });
    return { importedEntries, tombstones, preferences: 1 };
  }
}

type HierarchyRow = { entry_id: string; parent_entry_id: string | null; kind: string; owner_id: string; display_name: string; sort_key: string; depth: number; path_key: string; is_system: number; is_deleted: number; revision: number; created_at_ms: number; updated_at_ms: number };
type PreferenceRow = { user_id: string; preference_key: string; value_json: string; revision: number; updated_at_ms: number };

function legacyEntry(node: AutomationStudioHierarchyNode, now: number): Omit<AutomationStudioHierarchyEntry, "depth" | "pathKey" | "revision"> { return { entryId: requiredId(node.id, "hierarchy entry"), parentEntryId: optionalId(node.parentId), kind: node.kind, ownerId: requiredId(node.sourceId ?? node.viewId ?? node.recordingId ?? node.id, "owner"), displayName: requiredName(node.label, "Hierarchy entry"), sortKey: node.label.toLowerCase(), isSystem: false, isDeleted: false, createdAt: now, updatedAt: now }; }
function hierarchyFromRow(row: HierarchyRow): AutomationStudioHierarchyEntry { return { entryId: row.entry_id, parentEntryId: row.parent_entry_id, kind: row.kind, ownerId: row.owner_id, displayName: row.display_name, sortKey: row.sort_key, depth: row.depth, pathKey: row.path_key, isSystem: row.is_system === 1, isDeleted: row.is_deleted === 1, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function preferenceFromRow(row: PreferenceRow): AutomationStudioWorkspacePreference { return { userId: row.user_id, preferenceKey: row.preference_key, valueJson: row.value_json, revision: row.revision, updatedAt: row.updated_at_ms }; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function optionalId(value: string | null | undefined): string | null { const id = value?.trim(); return id ? requiredId(id, "optional hierarchy entry") : null; }
function requiredKind(value: string, kind: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${kind}.`); return normalized; }
function requiredName(value: string, kind: string): string { const name = value.trim(); if (!name || name.length > 200) throw new Error(`${kind} name is required and must not exceed 200 characters.`); return name; }
function clampLimit(value?: number): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 100))); }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T>(value: string | null | undefined): T | null { if (!value) return null; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new Error("Invalid Automation Studio hierarchy cursor."); } }
function pageFromRows(rows: HierarchyRow[], limit: number, cursorForRow: (row: HierarchyRow) => unknown): AutomationStudioHierarchyCursorPage { const pageRows = rows.slice(0, limit); const last = pageRows.at(-1); return { items: pageRows.map(hierarchyFromRow), hasMore: rows.length > limit, nextCursor: rows.length > limit && last ? encodeCursor(cursorForRow(last)) : null }; }
function escapeLike(value: string): string { return value.replace(/([%_\\])/g, "\\$1"); }
