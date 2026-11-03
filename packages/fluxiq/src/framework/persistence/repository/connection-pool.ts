import { AsyncLocalStorage } from "node:async_hooks";
import { statSync } from "node:fs";
import type sqlite3 from "sqlite3";
import { enqueueDatabaseOperation } from "./operation-queue.ts";

/** How a repository opens, prepares and closes a connection to one database file. */
export type SQLiteConnector = {
  /** Opens a new connection; the file is created when absent. */
  open(): Promise<sqlite3.Database>;
  /** Readies a connection for this repository (pragmas, its table); run once per connection and `key`. */
  prepare(db: sqlite3.Database): Promise<void>;
  /** Names what `prepare` readies, so a connection shared by several tables readies each once. */
  key: string;
  close(db: sqlite3.Database): Promise<void>;
};

type Kept = { db: sqlite3.Database; identity: string; prepared: Set<string>; close(db: sqlite3.Database): Promise<void> };

/**
 * Keeps one connection per database file open between the operations of an
 * owner's unit of work, so a burst of reads and writes on one file opens it
 * once instead of once per operation (t435: a required run read its session 43
 * times, and each read opened, prepared and closed the database twice).
 *
 * - Connections are kept only inside `keepWhile`. Outside it every operation
 *   opens and closes its own connection, exactly as without a pool, so code
 *   that removes or rewrites a database file after an operation is never
 *   blocked by a handle it cannot see.
 * - When the last `keepWhile` in the process ends, every kept connection is
 *   closed before it returns; `closeAll` does the same for an owner that is
 *   disposed (FluxIQ's close).
 * - Every use runs inside the file's operation queue (`./operation-queue.ts`),
 *   so a kept connection serves one operation at a time, as a fresh one did.
 * - A kept connection is used again only while the file is the one it opened
 *   (same device and inode); a file removed or replaced since is opened anew.
 * - An operation that fails closes its connection rather than keeping it, so
 *   no half-finished transaction or broken handle is ever handed on.
 *
 * Nothing but the handle is kept: every operation still reads and writes the
 * database itself.
 */
export class SQLiteConnectionPool {
  private readonly kept = new Map<string, Kept>();
  private readonly scope = new AsyncLocalStorage<true>();
  private keeping = 0;

  /** Runs `operation` with connections kept between its storage operations, all closed once no such unit of work is left. */
  async keepWhile<T>(operation: () => Promise<T>): Promise<T> {
    this.keeping += 1;
    try {
      return await this.scope.run(true, operation);
    } finally {
      this.keeping -= 1;
      if (this.keeping === 0) await this.closeAll();
    }
  }

  /** Runs `operation` on the file's kept connection, or a new one; call it from inside the file's operation queue. */
  async use<T>(filePath: string, connector: SQLiteConnector, operation: (db: sqlite3.Database) => Promise<T>): Promise<T> {
    const entry = await this.take(filePath) ?? await this.connect(filePath, connector);
    let result: T;
    try {
      if (!entry.prepared.has(connector.key)) {
        await connector.prepare(entry.db);
        entry.prepared.add(connector.key);
      }
      result = await operation(entry.db);
    } catch (error) {
      await entry.close(entry.db).catch(/* best-effort: the operation's own failure is the one reported */ () => undefined);
      throw error;
    }
    if (this.keeping > 0 && this.scope.getStore()) this.kept.set(filePath, entry);
    else await entry.close(entry.db);
    return result;
  }

  /** Closes every kept connection, each through its file's queue. */
  async closeAll(): Promise<void> {
    const files = [...this.kept.keys()];
    await Promise.all(files.map((filePath) => enqueueDatabaseOperation(filePath, async () => {
      const entry = await this.take(filePath);
      if (entry) await entry.close(entry.db);
    })));
  }

  /** The file's kept connection, removed from the pool; one whose file was removed or replaced is closed instead. */
  private async take(filePath: string): Promise<Kept | undefined> {
    const entry = this.kept.get(filePath);
    if (!entry) return undefined;
    this.kept.delete(filePath);
    if (entry.identity === fileIdentity(filePath)) return entry;
    await entry.close(entry.db);
    return undefined;
  }

  private async connect(filePath: string, connector: SQLiteConnector): Promise<Kept> {
    const db = await connector.open();
    return { db, identity: fileIdentity(filePath), prepared: new Set(), close: connector.close };
  }
}

/** The file a connection was opened on: its device and inode, or `absent`. */
function fileIdentity(filePath: string): string {
  const info = statSync(filePath, { bigint: true, throwIfNoEntry: false });
  return info ? `${info.dev}:${info.ino}` : "absent";
}
