import type { AutomationStudioHierarchyEntry } from "./project-hierarchy-repository.ts";
import type { AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { AutomationStudioProjectUnitOfWork, type AutomationStudioIdempotentMutationResult } from "./project-unit-of-work.ts";

export const AUTOMATION_STUDIO_HIERARCHY_ROOT_PARENT_CACHE_ID = "__root__";

export class AutomationStudioProjectHierarchyMutations {
  private constructor(private readonly unit: AutomationStudioProjectUnitOfWork) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectHierarchyMutations> {
    return new AutomationStudioProjectHierarchyMutations(await AutomationStudioProjectUnitOfWork.open(input));
  }

  close(): Promise<void> {
    return this.unit.close();
  }

  createEntry(input: { mutationId: string; entryId: string; parentEntryId: string | null; kind: string; ownerId: string; displayName: string; sortKey: string; isSystem?: boolean; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<AutomationStudioHierarchyEntry>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: "hierarchy.create", ownerKind: "hierarchy_entry", ownerId: input.entryId, request: mutationRequest(input), ...optionalChangedAt(input.changedAt) }, async (context) => {
      const entry = await insertHierarchyEntry(context.sql, input, context.changedAt);
      await context.recordChange({ entityKind: "hierarchy_entry", entityId: entry.entryId, operation: "create", revision: entry.revision });
      await context.recordTouchedEntity({ entityKind: "hierarchy_children", entityId: parentCacheEntityId(entry.parentEntryId), operation: "touch" });
      return entry;
    });
  }

  renameEntry(input: { mutationId: string; entryId: string; displayName: string; expectedRevision: number; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<AutomationStudioHierarchyEntry>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: "hierarchy.rename", ownerKind: "hierarchy_entry", ownerId: input.entryId, request: mutationRequest(input), ...optionalChangedAt(input.changedAt) }, async (context) => {
      const current = await readEntry(context.sql, input.entryId);
      if (!current || current.isDeleted) throw new Error(`Unknown hierarchy entry: ${input.entryId}`);
      if (current.revision !== input.expectedRevision) throw new Error(`Hierarchy entry ${input.entryId} revision conflict.`);
      await context.sql.run("update hierarchy_entries set display_name = ?, sort_key = ?, revision = revision + 1, updated_at_ms = ? where entry_id = ?", [requiredName(input.displayName), input.displayName.toLowerCase(), context.changedAt, current.entryId]);
      await context.sql.run("delete from hierarchy_entries_fts where entry_id = ?", [current.entryId]);
      await context.sql.run("insert into hierarchy_entries_fts (entry_id, display_name) values (?, ?)", [current.entryId, input.displayName]);
      const saved = await readEntry(context.sql, current.entryId);
      if (!saved) throw new Error(`Hierarchy entry ${current.entryId} was not persisted.`);
      await context.recordChange({ entityKind: "hierarchy_entry", entityId: saved.entryId, operation: "update", revision: saved.revision });
      await context.recordTouchedEntity({ entityKind: "hierarchy_children", entityId: parentCacheEntityId(saved.parentEntryId), operation: "touch" });
      return saved;
    });
  }

  moveSubtree(input: { mutationId: string; entryId: string; newParentEntryId: string | null; expectedRevision: number; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<AutomationStudioHierarchyEntry>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: "hierarchy.move", ownerKind: "hierarchy_entry", ownerId: input.entryId, request: mutationRequest(input), ...optionalChangedAt(input.changedAt) }, async (context) => {
      const current = await readEntry(context.sql, input.entryId);
      if (!current || current.isDeleted) throw new Error(`Unknown hierarchy entry: ${input.entryId}`);
      if (current.revision !== input.expectedRevision) throw new Error(`Hierarchy entry ${input.entryId} revision conflict.`);
      const parent = input.newParentEntryId ? await readEntry(context.sql, input.newParentEntryId) : null;
      if (input.newParentEntryId && (!parent || parent.isDeleted)) throw new Error(`Unknown parent hierarchy entry: ${input.newParentEntryId}`);
      if (parent && (parent.pathKey === current.pathKey || parent.pathKey.startsWith(`${current.pathKey}/`))) throw new Error("Cannot move a hierarchy entry under its own subtree.");
      const previousParentEntryId = current.parentEntryId;
      const nextDepth = parent ? parent.depth + 1 : 0;
      const nextPath = parent ? `${parent.pathKey}/${current.entryId}` : current.entryId;
      const depthDelta = nextDepth - current.depth;
      await context.sql.run(
        `update hierarchy_entries set parent_entry_id = case when entry_id = ? then ? else parent_entry_id end,
          path_key = case when entry_id = ? then ? else ? || substr(path_key, ?) end,
          depth = depth + ?, revision = revision + 1, updated_at_ms = ?
         where path_key = ? or path_key like ? escape '\\'`,
        [current.entryId, input.newParentEntryId, current.entryId, nextPath, nextPath, current.pathKey.length + 1, depthDelta, context.changedAt, current.pathKey, `${escapeLike(current.pathKey)}/%`]
      );
      const saved = await readEntry(context.sql, current.entryId);
      if (!saved) throw new Error(`Hierarchy entry ${current.entryId} was not persisted.`);
      await context.recordChange({ entityKind: "hierarchy_entry", entityId: saved.entryId, operation: "update", revision: saved.revision });
      await context.recordTouchedEntity({ entityKind: "hierarchy_children", entityId: parentCacheEntityId(previousParentEntryId), operation: "touch" });
      await context.recordTouchedEntity({ entityKind: "hierarchy_children", entityId: parentCacheEntityId(saved.parentEntryId), operation: "touch" });
      await context.recordTouchedEntity({ entityKind: "hierarchy_subtree", entityId: saved.entryId, operation: "touch", revision: saved.revision });
      return saved;
    });
  }

  deleteSubtree(input: { mutationId: string; entryId: string; expectedRevision: number; changedAt?: number }): Promise<AutomationStudioIdempotentMutationResult<{ deletedEntryIds: string[] }>> {
    return this.unit.runIdempotent({ mutationId: input.mutationId, operationKind: "hierarchy.delete", ownerKind: "hierarchy_entry", ownerId: input.entryId, request: mutationRequest(input), ...optionalChangedAt(input.changedAt) }, async (context) => {
      const current = await readEntry(context.sql, input.entryId);
      if (!current || current.isDeleted) throw new Error(`Unknown hierarchy entry: ${input.entryId}`);
      if (current.revision !== input.expectedRevision) throw new Error(`Hierarchy entry ${input.entryId} revision conflict.`);
      const rows = await context.sql.all<{ entry_id: string }>("select entry_id from hierarchy_entries where is_deleted = 0 and (path_key = ? or path_key like ? escape '\\') order by depth desc, entry_id", [current.pathKey, `${escapeLike(current.pathKey)}/%`]);
      await context.sql.run("update hierarchy_entries set is_deleted = 1, revision = revision + 1, updated_at_ms = ? where path_key = ? or path_key like ? escape '\\'", [context.changedAt, current.pathKey, `${escapeLike(current.pathKey)}/%`]);
      for (const row of rows) await context.sql.run("delete from hierarchy_entries_fts where entry_id = ?", [row.entry_id]);
      for (const row of rows) await context.recordTouchedEntity({ entityKind: "hierarchy_entry", entityId: row.entry_id, operation: "delete" });
      await context.recordChange({ entityKind: "hierarchy_entry", entityId: current.entryId, operation: "delete", revision: current.revision + 1 });
      await context.recordTouchedEntity({ entityKind: "hierarchy_children", entityId: parentCacheEntityId(current.parentEntryId), operation: "touch" });
      await context.recordTouchedEntity({ entityKind: "hierarchy_subtree", entityId: current.entryId, operation: "delete", revision: current.revision + 1 });
      return { deletedEntryIds: rows.map((row) => row.entry_id) };
    });
  }
}

async function insertHierarchyEntry(sql: AutomationStudioSqlExecutor, input: { entryId: string; parentEntryId: string | null; kind: string; ownerId: string; displayName: string; sortKey: string; isSystem?: boolean }, changedAt: number): Promise<AutomationStudioHierarchyEntry> {
  const entryId = requiredId(input.entryId, "hierarchy entry");
  const parentEntryId = optionalId(input.parentEntryId);
  const parent = parentEntryId ? await readEntry(sql, parentEntryId) : null;
  if (parentEntryId && (!parent || parent.isDeleted)) throw new Error(`Unknown parent hierarchy entry: ${parentEntryId}`);
  const depth = parent ? parent.depth + 1 : 0;
  const pathKey = parent ? `${parent.pathKey}/${entryId}` : entryId;
  await sql.run(
    `insert into hierarchy_entries (entry_id, parent_entry_id, kind, owner_id, display_name, sort_key, depth, path_key, is_system, is_deleted, revision, created_at_ms, updated_at_ms)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
    [entryId, parentEntryId, requiredKind(input.kind, "entry kind"), requiredId(input.ownerId, "owner"), requiredName(input.displayName), input.sortKey, depth, pathKey, input.isSystem ? 1 : 0, changedAt, changedAt]
  );
  await sql.run("insert into hierarchy_entries_fts (entry_id, display_name) values (?, ?)", [entryId, input.displayName]);
  const saved = await readEntry(sql, entryId);
  if (!saved) throw new Error(`Hierarchy entry ${entryId} was not persisted.`);
  return saved;
}

async function readEntry(sql: AutomationStudioSqlExecutor, entryId: string): Promise<AutomationStudioHierarchyEntry | null> {
  const row = await sql.get<HierarchyRow>("select * from hierarchy_entries where entry_id = ?", [requiredId(entryId, "hierarchy entry")]);
  return row ? hierarchyFromRow(row) : null;
}

type HierarchyRow = { entry_id: string; parent_entry_id: string | null; kind: string; owner_id: string; display_name: string; sort_key: string; depth: number; path_key: string; is_system: number; is_deleted: number; revision: number; created_at_ms: number; updated_at_ms: number };

function hierarchyFromRow(row: HierarchyRow): AutomationStudioHierarchyEntry { return { entryId: row.entry_id, parentEntryId: row.parent_entry_id, kind: row.kind, ownerId: row.owner_id, displayName: row.display_name, sortKey: row.sort_key, depth: row.depth, pathKey: row.path_key, isSystem: row.is_system === 1, isDeleted: row.is_deleted === 1, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function optionalId(value: string | null | undefined): string | null { const id = value?.trim(); return id ? requiredId(id, "optional hierarchy entry") : null; }
function requiredKind(value: string, kind: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${kind}.`); return normalized; }
function requiredName(value: string): string { const name = value.trim(); if (!name || name.length > 200) throw new Error("Hierarchy entry name is required and must not exceed 200 characters."); return name; }
function escapeLike(value: string): string { return value.replace(/([%_\\])/g, "\\$1"); }
function optionalChangedAt(changedAt: number | undefined): { changedAt: number } | {} { return changedAt === undefined ? {} : { changedAt }; }
function mutationRequest<TInput extends { changedAt?: number }>(input: TInput): Omit<TInput, "changedAt"> { const request: Partial<TInput> = { ...input }; delete request.changedAt; return request as Omit<TInput, "changedAt">; }
function parentCacheEntityId(parentEntryId: string | null): string { return parentEntryId ?? AUTOMATION_STUDIO_HIERARCHY_ROOT_PARENT_CACHE_ID; }
