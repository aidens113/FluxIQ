import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { KEY_STORE_SCHEMA } from "./schema.ts";
import { withSQLiteLockRetry } from "../../../framework/persistence/repository/locking/index.ts";

export type KeyDatabase = {
  run(sql: string, params?: unknown[]): Promise<number>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
};

/** Owns operation lifetimes without serializing connections in memory. */
export function createKeyDatabase(filePath: string) {
  const pending = new Set<Promise<unknown>>();
  let closed = false;
  return {
    async transaction<T>(operation: (database: KeyDatabase) => Promise<T>): Promise<T> {
      if (closed) throw new Error("The key database is closed.");
      const result = withKeyDatabase(filePath, operation);
      pending.add(result);
      try {
        return await result;
      } finally {
        pending.delete(result);
      }
    },
    async close(): Promise<void> {
      closed = true;
      const results = await Promise.allSettled([...pending]);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Key database operations failed while closing.");
    }
  };
}

/** Each operation has its own connection. SQLite, not an in-process queue, serializes writers. */
async function withKeyDatabase<T>(filePath: string, operation: (database: KeyDatabase) => Promise<T>): Promise<T> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const connection = await new Promise<sqlite3.Database>((resolve, reject) => {
    const opened = new sqlite3.Database(path.toNamespacedPath(filePath), sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX, (error) => {
      if (error) reject(error);
      else resolve(opened);
    });
    opened.configure("busyTimeout", 0);
  });
  const db: KeyDatabase = {
    run: (sql, params = []) => withSQLiteLockRetry(() => new Promise<number>((resolve, reject) => {
      connection.run(sql, params, function (error) {
        if (error) reject(error);
        else resolve(this.changes);
      });
    })),
    get: <Row>(sql: string, params: unknown[] = []) => new Promise<Row | undefined>((resolve, reject) => {
      connection.get(sql, params, (error, row: Row | undefined) => {
        if (error) reject(error);
        else resolve(row);
      });
    }),
    all: <Row>(sql: string, params: unknown[] = []) => new Promise<Row[]>((resolve, reject) => {
      connection.all(sql, params, (error, rows: Row[]) => {
        if (error) reject(error);
        else resolve(rows);
      });
    })
  };
  try {
    await db.run("pragma foreign_keys = ON");
    // Every operation is a short write transaction. Rollback journals avoid WAL's
    // shared-memory initialization/last-connection cleanup races across processes.
    await db.run("pragma journal_mode = DELETE");
    await db.run("pragma synchronous = FULL");
    await db.run("pragma secure_delete = ON");
    await db.run("begin immediate");
    try {
      for (const statement of KEY_STORE_SCHEMA) await db.run(statement);
      const result = await operation(db);
      await db.run("commit");
      return result;
    } catch (error) {
      await db.run("rollback").catch(/* best-effort: preserve the original database failure */ () => undefined);
      throw error;
    }
  } finally {
    await new Promise<void>((resolve, reject) => connection.close((error) => error ? reject(error) : resolve()));
  }
}
