import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { withSQLiteLockRetry } from "../../../framework/persistence/repository/locking/index.ts";
import { CONNECT_CODE_SCHEMA } from "./schema.ts";

export type ConnectCodeDatabase = {
  run(sql: string, params?: unknown[]): Promise<number>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
};

/** Unknown-code probes never create an empty store or directory. All other storage errors propagate. */
export async function connectCodeDatabaseExists(filePath: string): Promise<boolean> {
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("Connect authorization authority is not a database file.");
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

/** Short durable write transactions, each on an independent connection and with cross-process SQLite arbitration. */
export async function withConnectCodeDatabase<T>(filePath: string, create: boolean, operation: (database: ConnectCodeDatabase) => Promise<T>): Promise<T> {
  if (create) await mkdir(path.dirname(filePath), { recursive: true });
  const connection = await new Promise<sqlite3.Database>((resolve, reject) => {
    const flags = sqlite3.OPEN_READWRITE | sqlite3.OPEN_FULLMUTEX | (create ? sqlite3.OPEN_CREATE : 0);
    const opened = new sqlite3.Database(path.toNamespacedPath(filePath), flags, (error) => error ? reject(error) : resolve(opened));
    opened.configure("busyTimeout", 0);
  });
  const db: ConnectCodeDatabase = {
    run: (sql, params = []) => withSQLiteLockRetry(() => new Promise<number>((resolve, reject) => {
      connection.run(sql, params, function (error) {
        if (error) reject(error);
        else resolve(this.changes);
      });
    })),
    get: <Row>(sql: string, params: unknown[] = []) => withSQLiteLockRetry(() => new Promise<Row | undefined>((resolve, reject) => {
      connection.get(sql, params, (error, row: Row | undefined) => error ? reject(error) : resolve(row));
    }))
  };
  try {
    // Rollback journals avoid concurrent per-connection WAL initialization and last-connection cleanup races.
    await db.run("pragma journal_mode = DELETE");
    await db.run("pragma synchronous = FULL");
    await db.run("pragma secure_delete = ON");
    await db.run("begin immediate");
    try {
      if (create) await db.run(CONNECT_CODE_SCHEMA);
      const result = await operation(db);
      await db.run("commit");
      return result;
    } catch (error) {
      await db.run("rollback").catch(/* best-effort: preserve the original connect transaction failure */ () => undefined);
      throw error;
    }
  } finally {
    await new Promise<void>((resolve, reject) => connection.close((error) => error ? reject(error) : resolve()));
  }
}
