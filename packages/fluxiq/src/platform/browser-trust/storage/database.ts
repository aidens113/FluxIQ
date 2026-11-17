import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { withSQLiteLockRetry } from "../../../framework/persistence/repository/locking/index.ts";
import { CLIENT_TRUST_SCHEMA } from "./schema.ts";

export type ClientTrustDatabase = {
  run(sql: string, params?: unknown[]): Promise<number>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

/** Every transaction owns a connection. SQLite locking and generation CAS provide cross-process isolation. */
export async function withClientTrustDatabase<T>(filePath: string, operation: (database: ClientTrustDatabase) => Promise<T>): Promise<T> {
  await mkdir(path.dirname(filePath), { recursive: true });
  return connected(filePath, "write", operation);
}

/** A missing authority is genuinely empty; permission, corruption and opening failures still propagate. */
export async function readClientTrustDatabase<T>(filePath: string, operation: (database: ClientTrustDatabase) => Promise<T>): Promise<T | null> {
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("Browser trust authority is not a database file.");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  return connected(filePath, "read", async (db) => {
    const tables = await db.all<{ name: string }>("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'");
    // A first failed write rolls schema creation back too. This valid empty database has never held authority.
    if (tables.length === 0) return null;
    return operation(db);
  });
}

async function connected<T>(filePath: string, mode: "read" | "write", operation: (database: ClientTrustDatabase) => Promise<T>): Promise<T> {
  const connection = await new Promise<sqlite3.Database>((resolve, reject) => {
    const flags = mode === "write" ? sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE : sqlite3.OPEN_READONLY;
    const opened = new sqlite3.Database(path.toNamespacedPath(filePath), flags | sqlite3.OPEN_FULLMUTEX, (error) => {
      if (error) reject(error);
      else resolve(opened);
    });
    opened.configure("busyTimeout", 0);
  });
  const db: ClientTrustDatabase = {
    run: (sql, params = []) => withSQLiteLockRetry(() => new Promise<number>((resolve, reject) => {
      connection.run(sql, params, function (error) {
        if (error) reject(error);
        else resolve(this.changes);
      });
    })),
    get: <Row>(sql: string, params: unknown[] = []) => withSQLiteLockRetry(() => new Promise<Row | undefined>((resolve, reject) => {
      connection.get(sql, params, (error, row: Row | undefined) => {
        if (error) reject(error);
        else resolve(row);
      });
    })),
    all: <Row>(sql: string, params: unknown[] = []) => withSQLiteLockRetry(() => new Promise<Row[]>((resolve, reject) => {
      connection.all(sql, params, (error, rows: Row[]) => {
        if (error) reject(error);
        else resolve(rows);
      });
    }))
  };
  try {
    await db.run("pragma foreign_keys = ON");
    if (mode === "write") {
      // Short transactions use rollback journaling, avoiding WAL initialization and cleanup races.
      await db.run("pragma journal_mode = DELETE");
      await db.run("pragma synchronous = FULL");
      await db.run("pragma secure_delete = ON");
    }
    await db.run(mode === "write" ? "begin immediate" : "begin");
    try {
      if (mode === "write") for (const statement of CLIENT_TRUST_SCHEMA) await db.run(statement);
      const result = await operation(db);
      await db.run("commit");
      return result;
    } catch (error) {
      await db.run("rollback").catch(/* best-effort: retain the original trust transaction failure */ () => undefined);
      throw error;
    }
  } finally {
    await new Promise<void>((resolve, reject) => connection.close((error) => error ? reject(error) : resolve()));
  }
}
