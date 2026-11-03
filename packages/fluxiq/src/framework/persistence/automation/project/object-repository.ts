import type { AutomationStudioProjectDatabase, AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./database.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";
import { AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION, AUTOMATION_STUDIO_PENDING_REMOVAL_PATH_MIGRATION, requestContentAddressScrub } from "./content-address/index.ts";
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

/**
 * A file released and possibly still on disk (t745 u5), keyed by its path
 * (t747): `objectId` names the object it was released from, for reporting.
 */
export type AutomationStudioProjectObjectPendingRemoval = { relativePath: string; objectId: string; releasedAt: number };

/** One sealed object moving to its re-sealed file (t747 b): the stored form it must still hold, and the one it takes. */
export type AutomationStudioProjectObjectResealMove = {
  objectId: string;
  expected: { sha256: string; relativePath: string; encryption: string };
  next: { sha256: string; byteCount: number; relativePath: string; encryption: string };
};

type ObjectInput = Omit<AutomationStudioProjectObjectRecord, "createdAt" | "verifiedAt" | "contentAddress" | "contentAddressKeyId"> & { createdAt?: number; verifiedAt?: number | null } & Partial<AutomationStudioProjectObjectContentAddress>;
type ReferenceInput = Omit<AutomationStudioProjectObjectReferenceRecord, "createdAt"> & { createdAt?: number };

/** What the drain's removal of one pending file did; `gone` when another drain settled it first. */
type PendingFileRemoval =
  | { outcome: "removed" | "reheld"; objectId: string }
  | { outcome: "failed"; objectId: string; reason: string }
  | { outcome: "gone" };

export type AutomationStudioObjectCursorPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

export class AutomationStudioProjectObjectRepository {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string; backup?: (databasePath: string, migrationIds: string[]) => Promise<void> }): Promise<AutomationStudioProjectObjectRepository> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({
        database: lease.database,
        migrations: [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION, AUTOMATION_STUDIO_PENDING_REMOVAL_PATH_MIGRATION],
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
  async upsertObject(input: ObjectInput): Promise<AutomationStudioProjectObjectRecord> {
    return insertOrGetObject(this.lease.database, input);
  }

  /**
   * A writer's commit (t747): inserts the object or gets the one stored under
   * its sha256, and records `reference` to it, in one transaction. A release
   * (itself one transaction that checks references) lands wholly before, and
   * the object is inserted again, or wholly after, and sees the reference; a
   * reference never names a released row. The caller checks the object's
   * file after this commits.
   */
  async holdObject(input: { object: ObjectInput; reference?: Omit<ReferenceInput, "objectId"> }): Promise<{ object: AutomationStudioProjectObjectRecord; reference: AutomationStudioProjectObjectReferenceRecord | null }> {
    return this.lease.database.transaction(async (sql) => {
      const object = await insertOrGetObject(sql, input.object);
      const reference = input.reference ? await upsertReference(sql, { ...input.reference, objectId: object.objectId }) : null;
      return { object, reference };
    });
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

  async addReference(input: ReferenceInput): Promise<AutomationStudioProjectObjectReferenceRecord> {
    return upsertReference(this.lease.database, input);
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
    await AutomationStudioProjectObjectRepository.releaseObjectFile(sql, { objectId: id, relativePath: row.relative_path }, now);
    return objectFromRow(row);
  }

  /**
   * Records, inside the caller's transaction, that a file may be removed: a
   * released object's file, or the old file of an object whose row now names
   * another (t747). The drain removes it only while no objects row names its
   * path.
   */
  static async releaseObjectFile(sql: AutomationStudioSqlExecutor, file: { objectId: string; relativePath: string }, now: number): Promise<void> {
    await sql.run(
      `insert into object_pending_removals (relative_path, object_id, released_at_ms) values (?, ?, ?)
       on conflict(relative_path) do update set object_id = excluded.object_id, released_at_ms = excluded.released_at_ms`,
      [requiredPath(file.relativePath), requiredId(file.objectId, "object"), Math.trunc(now)]
    );
  }

  /**
   * Releases the object in its own transaction when no object_references row
   * names it (`releaseObjectIfUnreferenced`). Returns the released record, or
   * null when it is referenced or absent; its file is then pending removal.
   */
  async deleteObjectIfUnreferenced(objectId: string, now: number = Date.now()): Promise<AutomationStudioProjectObjectRecord | null> {
    return this.lease.database.transaction((sql) => AutomationStudioProjectObjectRepository.releaseObjectIfUnreferenced(sql, objectId, now));
  }

  /**
   * Records each file as pending removal in one transaction (t747 b): the
   * re-seal job names a batch's new files before it writes them, so a run
   * stopped before its rows move to them leaves files the next drain removes.
   * A file a row names by then keeps its file and loses only the pending row.
   */
  async releaseObjectFiles(files: readonly { objectId: string; relativePath: string }[], now: number): Promise<void> {
    if (!files.length) return;
    await this.lease.database.transaction(async (sql) => {
      for (const file of files) await AutomationStudioProjectObjectRepository.releaseObjectFile(sql, file, now);
    });
  }

  /**
   * Moves sealed objects to their re-sealed files in one transaction (t747 b):
   * each row's sha256, byte count, path and envelope change while the row
   * still holds the `expected` sealed form (compare-and-swap) and `fileHeld`
   * confirms the new file is on disk at its size; the object id, references
   * and content address stay. The old file is released in the same
   * transaction, and a scrub is requested when any row moved. `fileHeld` runs
   * while this transaction holds the write lock, so no drain removes the file
   * between the check and the commit. Returns the ids moved; a row another
   * writer changed, or one whose new file is gone, is left as it is.
   */
  async moveObjectsToResealedFiles(moves: readonly AutomationStudioProjectObjectResealMove[], fileHeld: (relativePath: string, byteCount: number) => Promise<boolean>, now: number): Promise<string[]> {
    if (!moves.length) return [];
    return this.lease.database.transaction(async (sql) => {
      const moved: string[] = [];
      for (const move of moves) {
        const objectId = requiredId(move.objectId, "object");
        const next = { sha256: requiredSha256(move.next.sha256), byteCount: nonNegativeInteger(move.next.byteCount, "byte count"), relativePath: requiredPath(move.next.relativePath), encryption: requiredEncryption(move.next.encryption) };
        if (!(await fileHeld(next.relativePath, next.byteCount))) continue;
        const result = await sql.run(
          `update objects set sha256 = ?, byte_count = ?, relative_path = ?, encryption = ?, verified_at_ms = ?
           where object_id = ? and sha256 = ? and relative_path = ? and encryption = ?`,
          [next.sha256, next.byteCount, next.relativePath, next.encryption, Math.trunc(now), objectId, move.expected.sha256, move.expected.relativePath, move.expected.encryption]
        );
        if (result.changes !== 1) continue;
        await AutomationStudioProjectObjectRepository.releaseObjectFile(sql, { objectId, relativePath: move.expected.relativePath }, now);
        moved.push(objectId);
      }
      if (moved.length > 0) await requestContentAddressScrub(sql, now);
      return moved;
    });
  }

  /** Pending removals after `afterRelativePath`, in path order. */
  async listPendingRemovals(input: { afterRelativePath: string | null; limit: number }): Promise<AutomationStudioProjectObjectPendingRemoval[]> {
    const rows = await this.lease.database.all<PendingRemovalRow>(
      "select relative_path, object_id, released_at_ms from object_pending_removals where relative_path > ? order by relative_path limit ?",
      [input.afterRelativePath ?? "", clampLimit(input.limit)]
    );
    return rows.map(pendingRemovalFromRow);
  }

  /**
   * Settles one pending file in one transaction (t747). While an objects row
   * names its path the file belongs to that row: the pending row goes and the
   * file stays (`reheld`). Otherwise `remove` deletes the file while this
   * transaction still holds the database's write lock, and then the pending
   * row goes with a scrub request (its path names an unsealed object by its
   * plain SHA-256). No writer in any process can commit a row naming the path
   * between the check and the removal, and a writer that commits after it
   * finds the file gone and rewrites it. A `remove` that fails returns the
   * error's code and keeps the pending row for a later drain.
   */
  async removePendingFileIfUnheld(relativePath: string, remove: () => Promise<string | undefined>): Promise<PendingFileRemoval> {
    return this.lease.database.transaction(async (sql): Promise<PendingFileRemoval> => {
      const row = await sql.get<PendingRemovalRow>("select relative_path, object_id, released_at_ms from object_pending_removals where relative_path = ?", [relativePath]);
      if (!row) return { outcome: "gone" };
      const held = await sql.get<{ found: number }>("select 1 as found from objects where relative_path = ? limit 1", [relativePath]);
      if (!held) {
        const reason = await remove();
        if (reason !== undefined) return { outcome: "failed", objectId: row.object_id, reason };
      }
      await sql.run("delete from object_pending_removals where relative_path = ?", [relativePath]);
      if (held) return { outcome: "reheld", objectId: row.object_id };
      await requestContentAddressScrub(sql, Date.now());
      return { outcome: "removed", objectId: row.object_id };
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

/**
 * Inserts `input`, or leaves the row already stored under its sha256 as it is;
 * returns the stored row. A row under `input`'s object id that a re-seal moved
 * to another sha256 in the meantime (t747 b) is that object, and is returned.
 */
async function insertOrGetObject(sql: AutomationStudioSqlExecutor, input: ObjectInput): Promise<AutomationStudioProjectObjectRecord> {
  const sha256 = requiredSha256(input.sha256);
  const address = contentAddressPair({ contentAddress: input.contentAddress ?? null, contentAddressKeyId: input.contentAddressKeyId ?? null });
  // `do nothing` covers only uniqueness conflicts (the sha256, the object id); a failed check still throws.
  await sql.run(
    `insert into objects (object_id, sha256, media_type, byte_count, relative_path, compression, encryption, created_at_ms, verified_at_ms, content_address, content_address_key_id)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict do nothing`,
    [requiredId(input.objectId, "object"), sha256, safeMediaType(input.mediaType), nonNegativeInteger(input.byteCount, "byte count"), requiredPath(input.relativePath), optionalText(input.compression), optionalText(input.encryption), input.createdAt ?? Date.now(), input.verifiedAt ?? null, address.contentAddress, address.contentAddressKeyId]
  );
  const saved = await sql.get<ObjectRow>("select * from objects where sha256 = ?", [sha256])
    ?? await sql.get<ObjectRow>("select * from objects where object_id = ? and encryption is not null", [requiredId(input.objectId, "object")]);
  if (!saved) throw new Error(`Automation Studio object ${input.objectId} was not persisted.`);
  return objectFromRow(saved);
}

async function upsertReference(sql: AutomationStudioSqlExecutor, input: ReferenceInput): Promise<AutomationStudioProjectObjectReferenceRecord> {
  const referenceId = requiredId(input.referenceId, "object reference");
  await sql.run(
    `insert into object_references (reference_id, object_id, owner_kind, owner_id, purpose, created_at_ms)
     values (?, ?, ?, ?, ?, ?)
     on conflict(object_id, owner_kind, owner_id, purpose) do update set reference_id = excluded.reference_id, created_at_ms = excluded.created_at_ms`,
    [referenceId, requiredId(input.objectId, "object"), requiredKind(input.ownerKind, "owner kind"), requiredId(input.ownerId, "owner"), requiredKind(input.purpose, "reference purpose"), input.createdAt ?? Date.now()]
  );
  const saved = await sql.get<ObjectReferenceRow>("select * from object_references where reference_id = ?", [referenceId]);
  if (!saved) throw new Error(`Object reference ${referenceId} was not persisted.`);
  return referenceFromRow(saved);
}

type PendingRemovalRow = { relative_path: string; object_id: string; released_at_ms: number };
type ObjectRow = { object_id: string; sha256: string; media_type: string; byte_count: number; relative_path: string; compression: string | null; encryption: string | null; created_at_ms: number; verified_at_ms: number | null; content_address: string | null; content_address_key_id: string | null };
type ObjectReferenceRow = { reference_id: string; object_id: string; owner_kind: string; owner_id: string; purpose: string; created_at_ms: number };

function objectFromRow(row: ObjectRow): AutomationStudioProjectObjectRecord { return { objectId: row.object_id, sha256: row.sha256, mediaType: row.media_type, byteCount: row.byte_count, relativePath: row.relative_path, compression: row.compression, encryption: row.encryption, createdAt: row.created_at_ms, verifiedAt: row.verified_at_ms, contentAddress: row.content_address ?? null, contentAddressKeyId: row.content_address_key_id ?? null }; }
function pendingRemovalFromRow(row: PendingRemovalRow): AutomationStudioProjectObjectPendingRemoval { return { relativePath: row.relative_path, objectId: row.object_id, releasedAt: row.released_at_ms }; }
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
function requiredEncryption(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Automation Studio sealed object envelope is missing.");
  return value;
}
function optionalText(value: string | null | undefined): string | null { const normalized = value?.trim(); return normalized ? normalized : null; }
function nonNegativeInteger(value: number, label: string): number { const normalized = Math.trunc(value); if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be a non-negative integer.`); return normalized; }
function clampLimit(value?: number): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 100))); }
function encodeCursor(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decodeCursor<T>(value: string | null | undefined): T | null { if (!value) return null; try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new Error("Invalid Automation Studio object cursor."); } }

