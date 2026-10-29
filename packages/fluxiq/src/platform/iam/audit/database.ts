import path from "node:path";
import sqlite3 from "sqlite3";

/** The audit store's one SQLite connection, as promises. */
export class IamAuditDatabase {
  private constructor(private readonly db: sqlite3.Database) {}

  /** Opens (creating when absent) the file in WAL mode with `synchronous=NORMAL`. */
  static async open(filePath: string): Promise<IamAuditDatabase> {
    const db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const connection = new sqlite3.Database(
        path.toNamespacedPath(filePath),
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX,
        (error) => (error ? reject(error) : resolve(connection))
      );
    });
    const opened = new IamAuditDatabase(db);
    await opened.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
    return opened;
  }

  exec(script: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(script, (error) => (error ? reject(error) : resolve()));
    });
  }

  run(sql: string, params: readonly unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, [...params], (error: Error | null) => (error ? reject(error) : resolve()));
    });
  }

  all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, [...params], (error: Error | null, rows: unknown[]) => (error ? reject(error) : resolve(rows as T[])));
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
