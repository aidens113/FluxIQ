import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

export type AutomationStudioProjectObjectRecord = {
  objectId: string;
  sha256: string;
  mediaType: string;
  byteCount: number;
  relativePath: string;
  compression: string | null;
  encryption: string | null;
  createdAt: number;
  verifiedAt: number | null;
};

export type AutomationStudioProjectObjectReferenceRecord = {
  referenceId: string;
  objectId: string;
  ownerKind: string;
  ownerId: string;
  purpose: string;
  createdAt: number;
};

export type AutomationStudioObjectCursorPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

export class AutomationStudioProjectObjectRepository {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; backup?: (databasePath: string, migrationIds: string[]) => Promise<void> }): Promise<AutomationStudioProjectObjectRepository> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({
        database: lease.database,
        migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS,
        ...(input.backup ? { backup: (context) => input.backup!(context.databasePath, context.pendingMigrationIds) } : {})
      }).migrate();
      return new AutomationStudioProjectObjectRepository(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.lease.release();
  }

  async upsertObject(input: Omit<AutomationStudioProjectObjectRecord, "createdAt" | "verifiedAt"> & { createdAt?: number; verifiedAt?: number | null }): Promise<AutomationStudioProjectObjectRecord> {
    const sha256 = requiredSha256(input.sha256);
    const existing = await this.getBySha256(sha256);
    if (existing) return existing;
    const now = input.createdAt ?? Date.now();
    try {
      await this.lease.database.run(
        `insert into objects (object_id, sha256, media_type, byte_count, relative_path, compression, encryption, created_at_ms, verified_at_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [requiredId(input.objectId, "object"), sha256, safeMediaType(input.mediaType), nonNegativeInteger(input.byteCount, "byte count"), requiredPath(input.relativePath), optionalText(input.compression), optionalText(input.encryption), now, input.verifiedAt ?? null]
      );
    } catch (error) {
      if (!String(error).includes("SQLITE_CONSTRAINT")) throw error;
      const raced = await this.getBySha256(sha256);
      if (raced) return raced;
      throw error;
    }
    const saved = await this.getBySha256(sha256);
    if (!saved) throw new Error(`Object ${sha256} was not persisted.`);
    return saved;
  }

  async getById(objectId: string): Promise<AutomationStudioProjectObjectRecord | null> {
    const row = await this.lease.database.get<ObjectRow>("select * from objects where object_id = ?", [requiredId(objectId, "object")]);
    return row ? objectFromRow(row) : null;
  }

  async getBySha256(sha256: string): Promise<AutomationStudioProjectObjectRecord | null> {
    const row = await this.lease.database.get<ObjectRow>("select * from objects where sha256 = ?", [requiredSha256(sha256)]);
    return row ? objectFromRow(row) : null;
  }

  async listObjects(input: { limit?: number; cursor?: string | null; mediaType?: string } = {}): Promise<AutomationStudioObjectCursorPage<AutomationStudioProjectObjectRecord>> {
    const limit = clampLimit(input.limit);
    const cursor = decodeCursor<{ createdAt: number; objectId: string }>(input.cursor);
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.mediaType) { where.push("media_type = ?"); params.push(safeMediaType(input.mediaType)); }
    if (cursor) { where.push("(created_at_ms < ? or (created_at_ms = ? and object_id < ?))"); params.push(cursor.createdAt, cursor.createdAt, cursor.objectId); }
    const rows = await this.lease.database.all<ObjectRow>(
      `select * from objects${where.length ? ` where ${where.join(" and ")}` : ""} order by created_at_ms desc, object_id desc limit ?`,
      [...params, limit + 1]
    );
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return { items: pageRows.map(objectFromRow), hasMore: rows.length > limit, nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.created_at_ms, objectId: last.object_id }) : null };
  }

  async addReference(input: Omit<AutomationStudioProjectObjectReferenceRecord, "createdAt"> & { createdAt?: number }): Promise<AutomationStudioProjectObjectReferenceRecord> {
    await this.lease.database.run(
      `insert into object_references (reference_id, object_id, owner_kind, owner_id, purpose, created_at_ms)
       values (?, ?, ?, ?, ?, ?)
       on conflict(object_id, owner_kind, owner_id, purpose) do update set reference_id = excluded.reference_id, created_at_ms = excluded.created_at_ms`,
      [requiredId(input.referenceId, "object reference"), requiredId(input.objectId, "object"), requiredKind(input.ownerKind, "owner kind"), requiredId(input.ownerId, "owner"), requiredKind(input.purpose, "reference purpose"), input.createdAt ?? Date.now()]
    );
    const saved = await this.getReference(input.referenceId);
    if (!saved) throw new Error(`Object reference ${input.referenceId} was not persisted.`);
    return saved;
  }

  async getReference(referenceId: string): Promise<AutomationStudioProjectObjectReferenceRecord | null> {
    const row = await this.lease.database.get<ObjectReferenceRow>("select * from object_references where reference_id = ?", [requiredId(referenceId, "object reference")]);
    return row ? referenceFromRow(row) : null;
  }

  async listReferencesByOwner(input: { ownerKind: string; ownerId: string; purpose?: string; limit?: number }): Promise<AutomationStudioProjectObjectReferenceRecord[]> {
    const purposeClause = input.purpose ? " and purpose = ?" : "";
    const rows = await this.lease.database.all<ObjectReferenceRow>(
      `select * from object_references where owner_kind = ? and owner_id = ?${purposeClause} order by purpose, reference_id limit ?`,
      [requiredKind(input.ownerKind, "owner kind"), requiredId(input.ownerId, "owner"), ...(input.purpose ? [requiredKind(input.purpose, "reference purpose")] : []), clampLimit(input.limit)]
    );
    return rows.map(referenceFromRow);
  }

  async deleteReference(referenceId: string): Promise<boolean> {
    return (await this.lease.database.run("delete from object_references where reference_id = ?", [requiredId(referenceId, "object reference")])).changes > 0;
  }

  async deleteObject(objectId: string): Promise<boolean> {
    const references = await this.lease.database.get<{ count: number }>("select count(*) as count from object_references where object_id = ?", [requiredId(objectId, "object")]);
    if ((references?.count ?? 0) > 0) throw new Error(`Automation Studio object ${objectId} still has references.`);
    return (await this.lease.database.run("delete from objects where object_id = ?", [requiredId(objectId, "object")])).changes > 0;
  }

  async listUnreferencedObjects(limit = 100): Promise<AutomationStudioProjectObjectRecord[]> {
    const rows = await this.lease.database.all<ObjectRow>(
      `select objects.* from objects left join object_references on object_references.object_id = objects.object_id
       where object_references.object_id is null order by objects.created_at_ms, objects.object_id limit ?`,
      [clampLimit(limit)]
    );
    return rows.map(objectFromRow);
  }
}

type ObjectRow = { object_id: string; sha256: string; media_type: string; byte_count: number; relative_path: string; compression: string | null; encryption: string | null; created_at_ms: number; verified_at_ms: number | null };
type ObjectReferenceRow = { reference_id: string; object_id: string; owner_kind: string; owner_id: string; purpose: string; created_at_ms: number };

function objectFromRow(row: ObjectRow): AutomationStudioProjectObjectRecord { return { objectId: row.object_id, sha256: row.sha256, mediaType: row.media_type, byteCount: row.byte_count, relativePath: row.relative_path, compression: row.compression, encryption: row.encryption, createdAt: row.created_at_ms, verifiedAt: row.verified_at_ms }; }
function referenceFromRow(row: ObjectReferenceRow): AutomationStudioProjectObjectReferenceRecord { return { referenceId: row.reference_id, objectId: row.object_id, ownerKind: row.owner_kind, ownerId: row.owner_id, purpose: row.purpose, createdAt: row.created_at_ms }; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function requiredKind(value: string, kind: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${kind}.`); return normalized; }
function requiredSha256(value: string): string { const sha256 = value.trim().toLowerCase(); if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Automation Studio object digest is invalid."); return sha256; }
function requiredPath(value: string): string { const normalized = value.trim().replaceAll(String.fromCharCode(92), "/"); if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes(String.fromCharCode(0))) throw new Error("Automation Studio object relative path is invalid."); return normalized; }
function safeMediaType(value: string): string { const trimmed = value.trim().toLowerCase(); return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(trimmed) ? trimmed : "application/octet-stream"; }
function optionalText(value: string | null | undefined): string | null { const normalized = value?.trim(); return normalized ? normalized : null; }
function nonNegativeInteger(value: number, label: string): number { const normalized = Math.trunc(value); if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be a non-negative integer.`); return normalized; }
function clampLimit(value?: number): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 100))); }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T>(value: string | null | undefined): T | null { if (!value) return null; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new Error("Invalid Automation Studio object cursor."); } }

