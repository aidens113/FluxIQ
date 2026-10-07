import { mkdirSync, readdirSync } from "node:fs";
import { open as openFile, stat } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import type { JsonObject } from "../../../core/index.ts";
import { recordSqlPerformance, withSqlPerformanceContext } from "../../_shared/performance-metrics.ts";
import type { RecordEnvelope, Repository, RepositoryListPage, RepositoryListPageOptions, RepositoryScope } from "../types.ts";

export type SQLiteRepositoryOptions = {
  rootDir: string;
  kind: string;
  layoutVersion?: 1 | 2;
};

export type SQLiteTransaction = {
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastID: number }>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
};

export type SQLiteListPageOptions = RepositoryListPageOptions;
export type SQLiteListPage<T extends JsonObject = JsonObject> = RepositoryListPage<T>;

export class SQLiteRepository<T extends JsonObject = JsonObject> implements Repository<T> {
  readonly rootDir: string;
  readonly kind: string;
  readonly tableName: string;
  readonly layoutVersion: 1 | 2;

  constructor(options: SQLiteRepositoryOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.kind = safeKind(options.kind);
    this.layoutVersion = options.layoutVersion ?? 1;
    if (!this.kind) throw new Error("Repository kind is required");
    this.tableName = quoteIdentifier(this.kind);
  }

  async list(scope: RepositoryScope = {}): Promise<Array<RecordEnvelope<T>>> {
    return this.withDatabase(scope, async (db, normalizedScope) => {
      const rows = await all<SQLiteRecordRow>(db, `select id, kind, data, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs from ${this.tableName} order by id`);
      return rows.map((row) => rowToRecord<T>(row, normalizedScope));
    });
  }

  async listPage(scope: RepositoryScope = {}, options: SQLiteListPageOptions = {}): Promise<SQLiteListPage<T>> {
    const limit = clampInteger(options.limit, 1, 100, 25);
    const offset = clampInteger(options.offset, 0, 1_000_000, 0);
    const orderBy = options.orderBy === "created_at_ms" ? "created_at_ms" : options.orderBy === "id" ? "id" : "updated_at_ms";
    const direction = options.direction === "asc" ? "asc" : "desc";
    const search = typeof options.search === "string" ? options.search.trim().slice(0, 500) : "";
    return this.withDatabase(scope, async (db, normalizedScope) => {
      const where = search ? " where id like ? escape '\\' or data like ? escape '\\'" : "";
      const searchParams = search ? [sqliteLikePattern(search), sqliteLikePattern(search)] : [];
      const totalRow = await get<{ total: number }>(db, `select count(*) as total from ${this.tableName}${where}`, searchParams);
      const rows = await all<SQLiteRecordRow>(db, `select id, kind, data, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs from ${this.tableName}${where} order by ${orderBy} ${direction}, id asc limit ? offset ?`, [...searchParams, limit, offset]);
      return {
        records: rows.map((row) => rowToRecord<T>(row, normalizedScope)),
        total: totalRow?.total ?? 0,
        limit,
        offset
      };
    });
  }

  async get(id: string, scope: RepositoryScope = {}): Promise<RecordEnvelope<T> | null> {
    return this.withDatabase(scope, async (db, normalizedScope) => {
      const row = await get<SQLiteRecordRow>(db, `select id, kind, data, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs from ${this.tableName} where id = ?`, [id]);
      return row ? rowToRecord<T>(row, normalizedScope) : null;
    });
  }

  /** Reads existing storage only. An absent database returns null; invalid schema refuses. */
  async getExistingReadOnly(id: string, scope: RepositoryScope = {}): Promise<RecordEnvelope<T> | null> {
    return (await this.getExistingReadOnlyMany([id], scope))[0]!;
  }

  /** A bounded record-only snapshot. No executable SQL or database creation is exposed. */
  async getExistingReadOnlyMany(ids: readonly string[], scope: RepositoryScope = {}): Promise<Array<RecordEnvelope<T> | null>> {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 256 || ids.some(id => typeof id !== "string" || !id || id.length > 1024)) throw new Error("repository.readonly_ids");
    const requested = [...ids], normalized = normalizeScope(scope), filePath = this.databasePath(normalized);
    let identity: string;
    try {
      const info = await stat(filePath, { bigint: true });
      if (!info.isFile()) throw new Error("repository.readonly_database");
      identity = `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}`;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return requested.map(() => null); throw error; }
    const handle = await openFile(filePath, "r");
    try {
      const header = Buffer.alloc(100); const { bytesRead } = await handle.read(header, 0, 100, 0);
      // WAL reads can create or modify sidecars despite OPEN_READONLY. Never open that layout.
      if (bytesRead !== 100 || header.subarray(0, 16).toString("binary") !== "SQLite format 3\0" || header[18] !== 1 || header[19] !== 1) throw new Error("repository.readonly_journal_unsupported");
    } finally { await handle.close(); }
    const db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const connection = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY | sqlite3.OPEN_FULLMUTEX, error => error ? reject(error) : resolve(connection));
      connection.configure("busyTimeout", 10_000);
    });
    try {
      await run(db, "begin");
      const records = []; let observedBytes = 0;
      for (const id of requested) {
        const remaining = Math.min(4 * 1024 * 1024, 8 * 1024 * 1024 - observedBytes);
        const row = await get<SQLiteRecordRow & { dataBytes: number }>(db, `select id,kind,case when length(cast(data as blob))<=? then data else null end as data,length(cast(data as blob)) as dataBytes,created_at_ms as createdAtMs,updated_at_ms as updatedAtMs from ${this.tableName} where id=?`, [remaining, id]);
        if (row && (!Number.isSafeInteger(row.dataBytes) || row.dataBytes < 0 || row.dataBytes > remaining || typeof row.data !== "string")) throw new Error("repository.observation_size");
        observedBytes += row?.dataBytes ?? 0;
        if (row && (row.kind !== this.kind || row.id !== id || !Number.isSafeInteger(row.createdAtMs) || row.createdAtMs < 0 || !Number.isSafeInteger(row.updatedAtMs) || row.updatedAtMs < 0)) throw new Error("repository.readonly_record");
        const record = row ? rowToRecord<T>(row, normalized) : null;
        if (record && (!record.data || typeof record.data !== "object" || Array.isArray(record.data))) throw new Error("repository.readonly_data");
        records.push(record);
      }
      await run(db, "commit");
      const after = await stat(filePath, { bigint: true });
      if (`${after.dev}:${after.ino}:${after.size}:${after.mtimeNs}` !== identity) throw new Error("repository.readonly_database_changed");
      return records;
    } catch (error) { await run(db, "rollback").catch(/* best-effort: retain the original readonly failure */ () => undefined); throw error; }
    finally { await close(db); }
  }

  async put(record: RecordEnvelope<T>): Promise<RecordEnvelope<T>> {
    return this.withDatabase(record.scope, async (db, scope) => {
      const existing = await get<SQLiteRecordRow>(db, `select id, kind, data, created_at_ms as createdAtMs, updated_at_ms as updatedAtMs from ${this.tableName} where id = ?`, [record.id]);
      const now = Date.now();
      const next: RecordEnvelope<T> = {
        ...record,
        kind: this.kind,
        scope,
        createdAtMs: existing?.createdAtMs ?? (record.createdAtMs || now),
        updatedAtMs: now
      };
      await run(db, `
        insert into ${this.tableName} (id, kind, data, created_at_ms, updated_at_ms)
        values (?, ?, ?, ?, ?)
        on conflict(id) do update set
          kind = excluded.kind,
          data = excluded.data,
          updated_at_ms = excluded.updated_at_ms
      `, [next.id, next.kind, JSON.stringify(next.data), next.createdAtMs, next.updatedAtMs]);
      return next;
    });
  }

  async delete(id: string, scope: RepositoryScope = {}): Promise<boolean> {
    return this.withDatabase(scope, async (db) => {
      const result = await run(db, `delete from ${this.tableName} where id = ?`, [id]);
      return result.changes > 0;
    });
  }

  databases(): string[] {
    const values = new Set<string>(["global"]);
    const domainRoot = path.join(this.rootDir, "domains");
    try {
      for (const entry of readdirSync(domainRoot, { withFileTypes: true })) {
        if (this.layoutVersion === 1 && entry.isFile() && entry.name.endsWith(".sqlite")) {
          values.add(entry.name.replace(/\.sqlite$/i, ""));
        } else if (this.layoutVersion === 2 && entry.isDirectory()) {
          try {
            if (readdirSync(path.join(domainRoot, entry.name)).includes("domain.sqlite")) values.add(entry.name);
          } catch {
            // Domain state has not been created yet.
          }
        }
      }
    } catch {
      // No domain database directory yet.
    }
    return [...values].sort((left, right) => left.localeCompare(right));
  }

  private async open(scope: RepositoryScope): Promise<sqlite3.Database> {
    const filePath = this.databasePath(scope);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const db = await openDatabase(filePath);
    // Every call opens its own connection, so this setup runs on every call.
    // One script, in the same order and stopping at the first error as the
    // separate statements did: one round trip per open instead of four.
    try {
      await exec(db, [
        "pragma foreign_keys = ON",
        "pragma journal_mode = WAL",
        `create table if not exists ${this.tableName} (
          id text primary key,
          kind text not null,
          data text not null,
          created_at_ms integer not null,
          updated_at_ms integer not null
        )`,
        `create index if not exists ${quoteIdentifier(`${this.kind}_updated_idx`)} on ${this.tableName} (updated_at_ms)`
      ].join(";\n"));
    } catch (error) {
      await close(db).catch(/* best-effort: the setup error is the one reported */ () => undefined);
      throw error;
    }
    return db;
  }

  private async withDatabase<TResult>(scope: RepositoryScope, operation: (db: sqlite3.Database, normalizedScope: RepositoryScope) => Promise<TResult>): Promise<TResult> {
    const normalizedScope = normalizeScope(scope);
    const filePath = this.databasePath(normalizedScope);
    return enqueueDatabaseOperation(filePath, async () => {
      return withSqlPerformanceContext({ repositoryKind: this.kind, databaseName: path.basename(filePath) }, async () => {
        const db = await this.open(normalizedScope);
        try {
          return await operation(db, normalizedScope);
        } finally {
          await close(db);
        }
      });
    });
  }

  private databasePath(scope: RepositoryScope): string {
    const normalized = normalizeScope(scope);
    if (normalized.domainId) {
      return this.layoutVersion === 2
        ? path.join(this.rootDir, "domains", safeKind(normalized.domainId), "domain.sqlite")
        : path.join(this.rootDir, "domains", `${safeKind(normalized.domainId)}.sqlite`);
    }
    return path.join(this.rootDir, "global.sqlite");
  }

  async transaction<TResult>(scope: RepositoryScope, operation: (transaction: SQLiteTransaction) => Promise<TResult>): Promise<TResult> {
    const filePath = this.databasePath(scope);
    return enqueueDatabaseOperation(filePath, async () => {
      return withSqlPerformanceContext({ repositoryKind: this.kind, databaseName: path.basename(filePath) }, async () => {
        const db = await this.open(scope);
        await run(db, "begin immediate");
        const transaction: SQLiteTransaction = {
          run: (sql, params = []) => run(db, sql, params),
          all: <T>(sql: string, params: unknown[] = []) => all<T>(db, sql, params),
          get: <T>(sql: string, params: unknown[] = []) => get<T>(db, sql, params)
        };
        try {
          const result = await operation(transaction);
          await run(db, "commit");
          return result;
        } catch (error) {
          await run(db, "rollback").catch(() => undefined);
          throw error;
        } finally {
          await close(db);
        }
      });
    });
  }
}

type SQLiteRecordRow = {
  id: string;
  kind: string;
  data: string;
  createdAtMs: number;
  updatedAtMs: number;
};

type RunResult = {
  changes: number;
  lastID: number;
};

const databaseOperationLocks = new Map<string, Promise<void>>();

export function createRecord<T extends JsonObject>(params: {
  id: string;
  kind: string;
  data: T;
  scope?: RepositoryScope;
  nowMs?: number;
}): RecordEnvelope<T> {
  const now = params.nowMs ?? Date.now();
  return {
    id: params.id,
    kind: safeKind(params.kind),
    scope: normalizeScope(params.scope ?? {}),
    data: params.data,
    createdAtMs: now,
    updatedAtMs: now
  };
}

function openDatabase(filePath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filePath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX, (error) => {
      if (error) reject(error);
      else resolve(db);
    });
    db.configure("busyTimeout", 10_000);
  });
}

async function enqueueDatabaseOperation<TResult>(filePath: string, operation: () => Promise<TResult>): Promise<TResult> {
  const previous = databaseOperationLocks.get(filePath) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = previous.catch(() => undefined).then(() => new Promise<void>((resolve) => {
    release = resolve;
  }));
  databaseOperationLocks.set(filePath, current);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (databaseOperationLocks.get(filePath) === current) {
      databaseOperationLocks.delete(filePath);
    }
  }
}

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<RunResult> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      recordSqlPerformance({ operation: "run", sql, elapsedMs: performance.now() - startedAt, rowsChanged: error ? 0 : this.changes, ok: !error });
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows: T[]) => {
      recordSqlPerformance({ operation: "all", sql, elapsedMs: performance.now() - startedAt, rowsReturned: error ? 0 : rows.length, ok: !error });
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function get<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row: T | undefined) => {
      recordSqlPerformance({ operation: "get", sql, elapsedMs: performance.now() - startedAt, rowsReturned: error || row === undefined ? 0 : 1, ok: !error });
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function exec(db: sqlite3.Database, script: string): Promise<void> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    db.exec(script, (error) => {
      recordSqlPerformance({ operation: "run", sql: script, elapsedMs: performance.now() - startedAt, rowsChanged: 0, ok: !error });
      if (error) reject(error);
      else resolve();
    });
  });
}

function close(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}


function sqliteLikePattern(value: string): string {
  return "%" + value.replace(/([%_\\])/g, "\\$1") + "%";
}function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function rowToRecord<T extends JsonObject>(row: SQLiteRecordRow, scope: RepositoryScope): RecordEnvelope<T> {
  return {
    id: row.id,
    kind: row.kind,
    scope,
    data: JSON.parse(row.data) as T,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs
  };
}

function normalizeScope(scope: RepositoryScope): RepositoryScope {
  const domainId = scope.domainId?.trim().toLowerCase();
  return domainId ? { domainId } : {};
}

function safeKind(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
