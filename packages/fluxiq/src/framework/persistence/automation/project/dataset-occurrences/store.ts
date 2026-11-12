import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "../database.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";

export type AutomationStudioDatasetSnapshotRow = { occurrenceId: string; row: JsonObject };
export type AutomationStudioDatasetSnapshot = { snapshotId: string; count: number };
export type AutomationStudioDatasetSnapshotPage = AutomationStudioDatasetSnapshot & { rows: AutomationStudioDatasetSnapshotRow[]; nextCursor?: string };

/** Project-local immutable occurrences with no run foreign key, overwrite or content digest. Callers supply secret-free rows and opaque secret references. */
export class AutomationStudioProjectDatasetSnapshotStore {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectDatasetSnapshotStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      return new AutomationStudioProjectDatasetSnapshotStore(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> { return this.lease.release(); }

  async create(rows: readonly AutomationStudioDatasetSnapshotRow[]): Promise<AutomationStudioDatasetSnapshot> {
    if (!Array.isArray(rows)) throw new TypeError("Snapshot rows must be an array.");
    const ids = new Set<string>();
    const serialized = rows.map((entry) => {
      if (typeof entry?.occurrenceId !== "string" || !entry.occurrenceId || entry.occurrenceId.trim() !== entry.occurrenceId || ids.has(entry.occurrenceId)) throw new TypeError("Snapshot occurrence IDs must be nonempty and unique.");
      ids.add(entry.occurrenceId);
      if (!isObject(entry.row)) throw new TypeError("A snapshot row must be an object.");
      assertJson(entry.row, new Set());
      return { occurrenceId: entry.occurrenceId, json: JSON.stringify(entry.row) };
    });
    const snapshotId = `snapshot.${randomUUID()}`;
    return this.lease.database.transaction(async (sql) => {
      await sql.run("insert into dataset_snapshots (snapshot_id, row_count, created_at_ms) values (?, ?, ?)", [snapshotId, serialized.length, Date.now()]);
      // One transaction keeps the metadata and every occurrence together. No input row is dropped or deduped.
      for (const [index, row] of serialized.entries()) await sql.run("insert into dataset_snapshot_rows (snapshot_id, ordinal, occurrence_id, row_json) values (?, ?, ?, ?)", [snapshotId, index + 1, row.occurrenceId, row.json]);
      return { snapshotId, count: serialized.length };
    });
  }

  async page(input: { snapshotId: string; cursor?: string; limit?: number }): Promise<AutomationStudioDatasetSnapshotPage | null> {
    if (typeof input.snapshotId !== "string" || !input.snapshotId) throw new TypeError("A snapshot ID is required.");
    const limit = input.limit ?? 200;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("Snapshot page size must be a positive whole number.");
    const after = input.cursor === undefined ? 0 : readCursor(input.cursor, input.snapshotId);
    const snapshot = await this.lease.database.get<{ row_count: number }>("select row_count from dataset_snapshots where snapshot_id = ?", [input.snapshotId]);
    if (!snapshot) return null;
    if (input.cursor !== undefined && after >= snapshot.row_count) throw new TypeError("Snapshot cursor is outside the snapshot.");
    const rows = await this.lease.database.all<{ ordinal: number; occurrence_id: string; row_json: string }>("select ordinal, occurrence_id, row_json from dataset_snapshot_rows where snapshot_id = ? and ordinal > ? order by ordinal limit ?", [input.snapshotId, after, limit]);
    const end = rows.at(-1)?.ordinal ?? after;
    return { snapshotId: input.snapshotId, count: snapshot.row_count, rows: rows.map((row) => ({ occurrenceId: row.occurrence_id, row: JSON.parse(row.row_json) as JsonObject })), ...(end < snapshot.row_count ? { nextCursor: Buffer.from(JSON.stringify({ snapshotId: input.snapshotId, after: end })).toString("base64url") } : {}) };
  }
}

function readCursor(cursor: string, snapshotId: string): number {
  if (typeof cursor !== "string" || !/^[A-Za-z0-9_-]+$/u.test(cursor)) throw new TypeError("Snapshot cursor is invalid.");
  const bytes = Buffer.from(cursor, "base64url");
  if (bytes.toString("base64url") !== cursor) throw new TypeError("Snapshot cursor is invalid.");
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new TypeError("Snapshot cursor is invalid."); }
  if (!isObject(value) || Object.keys(value).length !== 2 || value.snapshotId !== snapshotId || !Number.isSafeInteger(value.after) || (value.after as number) < 1) throw new TypeError("Snapshot cursor is invalid.");
  return value.after as number;
}

function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }

function assertJson(value: unknown, parents: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
  if (typeof value !== "object" || value === null || parents.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError("Snapshot rows must contain finite JSON values.");
  parents.add(value);
  for (const member of Object.values(value)) assertJson(member, parents);
  parents.delete(value);
}
