import type { AutomationStudioChangeFeedOperation } from "./project-administration.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AUTOMATION_STUDIO_HIERARCHY_ROOT_PARENT_CACHE_ID } from "./project-hierarchy-mutations.ts";
import type { AutomationStudioHierarchyEntry } from "./project-hierarchy-repository.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

export type AutomationStudioHierarchyCacheUpdate = {
  sequence: number;
  transactionId: string;
  operation: AutomationStudioChangeFeedOperation;
  entryId: string;
  revision: number;
  changedAt: number;
  entry: AutomationStudioHierarchyEntry | null;
  deletedEntryIds: string[];
  invalidateParentEntryIds: Array<string | null>;
  invalidateSubtreeEntryIds: string[];
};

export type AutomationStudioHierarchyCacheUpdatePage = {
  updates: AutomationStudioHierarchyCacheUpdate[];
  nextSequence: number;
  hasMore: boolean;
};

export class AutomationStudioProjectHierarchyFeed {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectHierarchyFeed> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      return new AutomationStudioProjectHierarchyFeed(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.lease.release();
  }

  async listUpdatesAfter(input: { afterSequence: number; limit?: number }): Promise<AutomationStudioHierarchyCacheUpdatePage> {
    const limit = clampLimit(input.limit);
    const afterSequence = Math.max(0, Math.trunc(input.afterSequence));
    const rows = await this.lease.database.all<ChangeFeedRow>(
      `select * from change_feed where sequence > ? and entity_kind = 'hierarchy_entry' order by sequence limit ?`,
      [afterSequence, limit + 1]
    );
    const pageRows = rows.slice(0, limit);
    const updates: AutomationStudioHierarchyCacheUpdate[] = [];
    for (const row of pageRows) updates.push(await this.updateFromRow(row));
    return { updates, nextSequence: pageRows.at(-1)?.sequence ?? afterSequence, hasMore: rows.length > limit };
  }

  private async updateFromRow(row: ChangeFeedRow): Promise<AutomationStudioHierarchyCacheUpdate> {
    const [entryRow, touchedRows] = await Promise.all([
      this.lease.database.get<HierarchyRow>("select * from hierarchy_entries where entry_id = ?", [row.entity_id]),
      this.lease.database.all<TouchedEntityRow>("select * from mutation_touched_entities where mutation_id = ? and entity_kind in ('hierarchy_entry', 'hierarchy_children', 'hierarchy_subtree') order by entity_kind, entity_id", [row.transaction_id])
    ]);
    const entry = entryRow ? hierarchyFromRow(entryRow) : null;
    const deletedEntryIds = unique(touchedRows.filter((touched) => touched.entity_kind === "hierarchy_entry" && touched.operation === "delete").map((touched) => touched.entity_id));
    if (row.operation === "delete" && !deletedEntryIds.includes(row.entity_id)) deletedEntryIds.push(row.entity_id);
    const invalidateParentEntryIds = uniqueNullable(touchedRows.filter((touched) => touched.entity_kind === "hierarchy_children").map((touched) => parentCacheEntryId(touched.entity_id)));
    if (invalidateParentEntryIds.length === 0 && entry) invalidateParentEntryIds.push(entry.parentEntryId);
    const invalidateSubtreeEntryIds = unique(touchedRows.filter((touched) => touched.entity_kind === "hierarchy_subtree").map((touched) => touched.entity_id));
    if (row.operation === "delete" && invalidateSubtreeEntryIds.length === 0) invalidateSubtreeEntryIds.push(row.entity_id);
    return {
      sequence: row.sequence,
      transactionId: row.transaction_id,
      operation: row.operation,
      entryId: row.entity_id,
      revision: row.revision,
      changedAt: row.changed_at_ms,
      entry: entry && !entry.isDeleted ? entry : null,
      deletedEntryIds,
      invalidateParentEntryIds,
      invalidateSubtreeEntryIds
    };
  }
}

type ChangeFeedRow = { sequence: number; transaction_id: string; entity_kind: string; entity_id: string; operation: AutomationStudioChangeFeedOperation; revision: number; changed_at_ms: number };
type TouchedEntityRow = { entity_kind: string; entity_id: string; operation: AutomationStudioChangeFeedOperation };
type HierarchyRow = { entry_id: string; parent_entry_id: string | null; kind: string; owner_id: string; display_name: string; sort_key: string; depth: number; path_key: string; is_system: number; is_deleted: number; revision: number; created_at_ms: number; updated_at_ms: number };

function hierarchyFromRow(row: HierarchyRow): AutomationStudioHierarchyEntry { return { entryId: row.entry_id, parentEntryId: row.parent_entry_id, kind: row.kind, ownerId: row.owner_id, displayName: row.display_name, sortKey: row.sort_key, depth: row.depth, pathKey: row.path_key, isSystem: row.is_system === 1, isDeleted: row.is_deleted === 1, revision: row.revision, createdAt: row.created_at_ms, updatedAt: row.updated_at_ms }; }
function clampLimit(value: number | undefined): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 100))); }
function parentCacheEntryId(value: string): string | null { return value === AUTOMATION_STUDIO_HIERARCHY_ROOT_PARENT_CACHE_ID ? null : value; }
function unique(values: string[]): string[] { return Array.from(new Set(values)); }
function uniqueNullable(values: Array<string | null>): Array<string | null> { return Array.from(new Set(values)); }
