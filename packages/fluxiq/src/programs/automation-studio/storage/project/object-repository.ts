import type { AutomationStudioProjectDatabase, AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./database.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";
import { AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION, requestContentAddressScrub } from "./content-address/index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../schema-migrations.ts";

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
  /** The keyed address (64 lower hex) of a sealed object's plaintext; null until addressed (t745). */
  contentAddress: string | null;
  /** The content-address key `contentAddress` was made under; null exactly when it is. */
  contentAddressKeyId: string | null;
};

/** A content address and the key it was made under, both null for an unaddressed object. */
export type AutomationStudioProjectObjectContentAddress = { contentAddress: string | null; contentAddressKeyId: string | null };

export type AutomationStudioProjectObjectReferenceRecord = {
  referenceId: string;
  objectId: string;
  ownerKind: string;
  ownerId: string;
  purpose: string;
  createdAt: number;
};

/** An object whose row was released and whose file may still be on disk (t745 u5). */
export type AutomationStudioProjectObjectPendingRemoval = { objectId: string; relativePath: string; releasedAt: number };

export type AutomationStudioObjectCursorPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

export class AutomationStudioProjectObjectRepository {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; backup?: (databasePath: string, migrationIds: string[]) => Promise<void> }): Promise<AutomationStudioProjectObjectRepository> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({
        database: lease.database,
        migrations: [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION],
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

  /** The project database this repository holds, for the content-address keyring that shares it. */
  get database(): AutomationStudioProjectDatabase {
    return this.lease.database;
  }

  /** The media type exactly as `upsertObject` stores it: trimmed, lower case, or `application/octet-stream` when malformed. */
  static normalizeMediaType(value: string): string {
    return safeMediaType(value);
  }

  /**
   * Inserts an object, or returns the one already stored under its sha256
   * unchanged (its content address included).
   */
  async upsertObject(input: Omit<AutomationStudioProjectObjectRecord, "createdAt" | "verifiedAt" | "contentAddress" | "contentAddressKeyId"> & { createdAt?: number; verifiedAt?: number | null } & Partial<AutomationStudioProjectObjectContentAddress>): Promise<AutomationStudioProjectObjectRecord> {
    const sha256 = requiredSha256(input.sha256);
    const existing = await this.getBySha256(sha256);
    if (existing) return existing;
    const now = input.createdAt ?? Date.now();
    const address = contentAddressPair({ contentAddress: input.contentAddress ?? null, contentAddressKeyId: input.contentAddressKeyId ?? null });
    try {
      await this.lease.database.run(
        `insert into objects (object_id, sha256, media_type, byte_count, relative_path, compression, encryption, created_at_ms, verified_at_ms, content_address, content_address_key_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [requiredId(input.objectId, "object"), sha256, safeMediaType(input.mediaType), nonNegativeInteger(input.byteCount, "byte count"), requiredPath(input.relativePath), optionalText(input.compression), optionalText(input.encryption), now, input.verifiedAt ?? null, address.contentAddress, address.contentAddressKeyId]
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

  /** The oldest sealed object holding `contentAddress` under `keyId`; equal legacy copies may share one address. */
  async findSealedByContentAddress(contentAddress: string, keyId: string): Promise<AutomationStudioProjectObjectRecord | null> {
    const row = await this.lease.database.get<ObjectRow>(
      "select * from objects where content_address = ? and content_address_key_id = ? and encryption is not null order by created_at_ms, object_id limit 1",
      [requiredContentAddress(contentAddress), requiredKeyId(keyId)]
    );
    return row ? objectFromRow(row) : null;
  }

  /**
   * Sealed objects after `afterObjectId` (keyset order by object id) that have
   * no content address, or, with `includeOtherKeys`, one under a key other than
   * `currentKeyId`.
   */
  async listSealedObjectsNeedingContentAddress(input: { currentKeyId: string; afterObjectId: string | null; limit: number; includeOtherKeys: boolean }): Promise<AutomationStudioProjectObjectRecord[]> {
    // `< ? or > ?` rather than `<> ?`, so the partial index on the key id can serve the rows under another key.
    const stale = input.includeOtherKeys ? "(content_address is null or content_address_key_id < ? or content_address_key_id > ?)" : "content_address is null";
    const currentKeyId = requiredKeyId(input.currentKeyId);
    const params: unknown[] = input.includeOtherKeys ? [currentKeyId, currentKeyId] : [];
    const after = input.afterObjectId === null ? "" : " and object_id > ?";
    if (input.afterObjectId !== null) params.push(input.afterObjectId);
    const rows = await this.lease.database.all<ObjectRow>(
      `select * from objects where encryption is not null and ${stale}${after} order by object_id limit ?`,
      [...params, clampLimit(input.limit)]
    );
    return rows.map(objectFromRow);
  }

  /** Whether any content-address key has been retired, so rows may still sit under one. */
  async hasRetiredContentAddressKey(): Promise<boolean> {
    const row = await this.lease.database.get<{ found: number }>("select 1 as found from content_address_keys where retired_at_ms is not null limit 1");
    return row !== undefined;
  }

  /**
   * Sets each object's content address only while its stored address and key
   * id still equal `expected`, all in one transaction. Returns how many rows
   * were updated; a row another writer changed first is left as it is.
   */
  async updateContentAddresses(updates: readonly { objectId: string; expected: AutomationStudioProjectObjectContentAddress; next: AutomationStudioProjectObjectContentAddress }[]): Promise<number> {
    if (!updates.length) return 0;
    const checked = updates.map((update) => ({ objectId: requiredId(update.objectId, "object"), expected: contentAddressPair(update.expected), next: contentAddressPair(update.next) }));
    return this.lease.database.transaction(async (sql) => {
      let changed = 0;
      for (const update of checked) {
        const result = await sql.run(
          "update objects set content_address = ?, content_address_key_id = ? where object_id = ? and content_address is ? and content_address_key_id is ?",
          [update.next.contentAddress, update.next.contentAddressKeyId, update.objectId, update.expected.contentAddress, update.expected.contentAddressKeyId]
        );
        changed += result.changes;
      }
      return changed;
    });
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

  /**
   * Releases an object inside the caller's transaction (t745 u5): when no
   * object_references row names it, its row is deleted and a pending-removal
   * row naming its file is inserted, both in that transaction. The file is
   * removed after commit by the content store's drain, or by the next content
   * store open if the process stops first, so a crash never leaves a file that
   * nothing names. Returns the released record, or null when the object is
   * referenced or absent.
   */
  static async releaseObjectIfUnreferenced(sql: AutomationStudioSqlExecutor, objectId: string, now: number): Promise<AutomationStudioProjectObjectRecord | null> {
    const id = requiredId(objectId, "object");
    const referenced = await sql.get<{ found: number }>("select 1 as found from object_references where object_id = ? limit 1", [id]);
    if (referenced) return null;
    const row = await sql.get<ObjectRow>("select * from objects where object_id = ?", [id]);
    if (!row) return null;
    await sql.run("delete from objects where object_id = ?", [id]);
    await sql.run(
      `insert into object_pending_removals (object_id, relative_path, released_at_ms) values (?, ?, ?)
       on conflict(object_id) do update set relative_path = excluded.relative_path, released_at_ms = excluded.released_at_ms`,
      [id, row.relative_path, Math.trunc(now)]
    );
    return objectFromRow(row);
  }

  /**
   * Releases the object in its own transaction when no object_references row
   * names it (`releaseObjectIfUnreferenced`). Returns the released record, or
   * null when it is referenced or absent; its file is then pending removal.
   */
  async deleteObjectIfUnreferenced(objectId: string, now: number = Date.now()): Promise<AutomationStudioProjectObjectRecord | null> {
    return this.lease.database.transaction((sql) => AutomationStudioProjectObjectRepository.releaseObjectIfUnreferenced(sql, objectId, now));
  }

  /** Pending removals after `afterObjectId`, in object-id order. */
  async listPendingRemovals(input: { afterObjectId: string | null; limit: number }): Promise<AutomationStudioProjectObjectPendingRemoval[]> {
    const rows = await this.lease.database.all<{ object_id: string; relative_path: string; released_at_ms: number }>(
      "select object_id, relative_path, released_at_ms from object_pending_removals where object_id > ? order by object_id limit ?",
      [input.afterObjectId ?? "", clampLimit(input.limit)]
    );
    return rows.map((row) => ({ objectId: row.object_id, relativePath: row.relative_path, releasedAt: row.released_at_ms }));
  }

  /**
   * Drops a pending removal whose object was stored again since it was
   * released (an objects row holds its id once more), so its file, which now
   * belongs to that row, is kept. Returns whether it did.
   */
  async dropPendingRemovalIfHeld(objectId: string): Promise<boolean> {
    const id = requiredId(objectId, "object");
    const result = await this.lease.database.run(
      "delete from object_pending_removals where object_id = ? and exists (select 1 from objects where object_id = ?)",
      [id, id]
    );
    return result.changes > 0;
  }

  /** Deletes a pending-removal row once its file is gone; only the row released at `releasedAt`, not a later release. */
  async finishPendingRemoval(removal: AutomationStudioProjectObjectPendingRemoval): Promise<boolean> {
    const id = requiredId(removal.objectId, "object");
    return this.lease.database.transaction(async (sql) => {
      const result = await sql.run("delete from object_pending_removals where object_id = ? and released_at_ms = ?", [id, removal.releasedAt]);
      // The row's path names an unsealed object by its plain SHA-256: ask for a scrub with its deletion (t745).
      if (result.changes > 0) await requestContentAddressScrub(sql, Date.now());
      return result.changes > 0;
    });
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

type ObjectRow = { object_id: string; sha256: string; media_type: string; byte_count: number; relative_path: string; compression: string | null; encryption: string | null; created_at_ms: number; verified_at_ms: number | null; content_address: string | null; content_address_key_id: string | null };
type ObjectReferenceRow = { reference_id: string; object_id: string; owner_kind: string; owner_id: string; purpose: string; created_at_ms: number };

function objectFromRow(row: ObjectRow): AutomationStudioProjectObjectRecord { return { objectId: row.object_id, sha256: row.sha256, mediaType: row.media_type, byteCount: row.byte_count, relativePath: row.relative_path, compression: row.compression, encryption: row.encryption, createdAt: row.created_at_ms, verifiedAt: row.verified_at_ms, contentAddress: row.content_address ?? null, contentAddressKeyId: row.content_address_key_id ?? null }; }
function referenceFromRow(row: ObjectReferenceRow): AutomationStudioProjectObjectReferenceRecord { return { referenceId: row.reference_id, objectId: row.object_id, ownerKind: row.owner_kind, ownerId: row.owner_id, purpose: row.purpose, createdAt: row.created_at_ms }; }
function requiredId(value: string, kind: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`); return id; }
function requiredKind(value: string, kind: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) throw new Error(`Invalid ${kind}.`); return normalized; }
function requiredSha256(value: string): string { const sha256 = value.trim().toLowerCase(); if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Automation Studio object digest is invalid."); return sha256; }
function requiredPath(value: string): string { const normalized = value.trim().replaceAll(String.fromCharCode(92), "/"); if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes(String.fromCharCode(0))) throw new Error("Automation Studio object relative path is invalid."); return normalized; }
function requiredContentAddress(value: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Automation Studio object content address is invalid.");
  return value;
}
function requiredKeyId(value: string): string {
  if (typeof value !== "string" || !value || value.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error("Automation Studio content address key ID is invalid.");
  return value;
}
function contentAddressPair(value: AutomationStudioProjectObjectContentAddress): AutomationStudioProjectObjectContentAddress {
  if (value.contentAddress === null && value.contentAddressKeyId === null) return { contentAddress: null, contentAddressKeyId: null };
  if (value.contentAddress === null || value.contentAddressKeyId === null) throw new Error("Automation Studio object content address and key ID are set together.");
  return { contentAddress: requiredContentAddress(value.contentAddress), contentAddressKeyId: requiredKeyId(value.contentAddressKeyId) };
}
function safeMediaType(value: string): string { const trimmed = value.trim().toLowerCase(); return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(trimmed) ? trimmed : "application/octet-stream"; }
function optionalText(value: string | null | undefined): string | null { const normalized = value?.trim(); return normalized ? normalized : null; }
function nonNegativeInteger(value: number, label: string): number { const normalized = Math.trunc(value); if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be a non-negative integer.`); return normalized; }
function clampLimit(value?: number): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 100))); }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T>(value: string | null | undefined): T | null { if (!value) return null; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new Error("Invalid Automation Studio object cursor."); } }

