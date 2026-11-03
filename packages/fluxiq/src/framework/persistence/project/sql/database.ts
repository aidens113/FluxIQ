import path from "node:path";
import sqlite3 from "sqlite3";
import { withSqlPerformanceContext } from "../../../observability/performance/sql/index.ts";
import { AutomationStudioStatementCache } from "./statement-cache.ts";
import type { AutomationStudioSqlExecutor, AutomationStudioSqlRunResult, AutomationStudioWalCheckpointMode, AutomationStudioWalCheckpointResult } from "./contracts/index.ts";

export class AutomationStudioProjectDatabase implements AutomationStudioSqlExecutor {
  readonly projectId: string;
  readonly filePath: string;
  private operationTail: Promise<void> = Promise.resolve();
  private pendingOperations = 0;
  private closed = false;
  private closePromise: Promise<void> | null = null;
  // Every statement this connection runs goes through here, in issue order,
  // with `run` and `all` statements kept prepared; see statement-cache.ts.
  private readonly statements: AutomationStudioStatementCache;

  private constructor(private readonly handle: sqlite3.Database, input: { projectId: string; filePath: string }) {
    this.projectId = input.projectId;
    this.filePath = input.filePath;
    this.statements = new AutomationStudioStatementCache(handle);
  }

  static async open(input: { projectId: string; filePath: string; busyTimeoutMs: number }): Promise<AutomationStudioProjectDatabase> {
    const handle = await openDatabase(input.filePath, input.busyTimeoutMs);
    const database = new AutomationStudioProjectDatabase(handle, input);
    try {
      // One script, in the same order: every open pays one round trip here, not six.
      // secure_delete (t745): a deleted or rewritten row's old bytes are zeroed,
      // not left in free pages, so a trace deleted, a chunk sealed in place or an
      // unkeyed digest replaced cannot be read back out of the file.
      await database.execute((sql) => sql.exec!([
        "pragma foreign_keys = ON",
        "pragma secure_delete = ON",
        "pragma journal_mode = WAL",
        "pragma synchronous = NORMAL",
        "pragma temp_store = MEMORY",
        `pragma busy_timeout = ${Math.max(100, Math.trunc(input.busyTimeoutMs))}`
      ].join(";\n")));
    } catch (error) {
      try {
        await database.close();
      } catch (closeError) {
        throw new AggregateError([error, closeError], "Project database setup and close failed.", { cause: error });
      }
      throw error;
    }
    return database;
  }

  get queuedOperations(): number {
    return this.pendingOperations;
  }

  run(sql: string, params: readonly unknown[] = []): Promise<AutomationStudioSqlRunResult> {
    return this.execute((executor) => executor.run(sql, params));
  }

  get<T>(sql: string, params: readonly unknown[] = []): Promise<T | undefined> {
    return this.execute((executor) => executor.get<T>(sql, params));
  }

  all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.execute((executor) => executor.all<T>(sql, params));
  }

  execute<TResult>(operation: (executor: AutomationStudioSqlExecutor) => Promise<TResult>): Promise<TResult> {
    return this.enqueue(() => operation(this.directExecutor()));
  }

  transaction<TResult>(operation: (transaction: AutomationStudioSqlExecutor) => Promise<TResult>): Promise<TResult> {
    return this.enqueue(async () => {
      const executor = this.directExecutor();
      await executor.run("begin immediate");
      try {
        const result = await operation(executor);
        await executor.run("commit");
        return result;
      } catch (error) {
        try {
          await executor.run("rollback");
        } catch (rollbackError) {
          throw new AggregateError([error, rollbackError], "Project database transaction and rollback failed.", { cause: error });
        }
        throw error;
      }
    });
  }

  async integrityCheck(): Promise<string[]> {
    const rows = await this.all<Record<string, string>>("pragma integrity_check");
    return rows.map((row) => Object.values(row)[0] ?? "");
  }

  async checkpoint(mode: AutomationStudioWalCheckpointMode = "passive"): Promise<AutomationStudioWalCheckpointResult> {
    const normalized = mode.toLowerCase() as AutomationStudioWalCheckpointMode;
    if (!["passive", "full", "restart", "truncate"].includes(normalized)) throw new Error("Invalid Automation Studio WAL checkpoint mode.");
    const row = await this.get<Record<string, number>>(`pragma wal_checkpoint(${normalized})`);
    if (!row) throw new Error("Automation Studio WAL checkpoint did not return a result.");
    const values = Object.values(row);
    return { busy: Number(values[0] ?? 0), log: Number(values[1] ?? 0), checkpointed: Number(values[2] ?? 0) };
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    // SQLite refuses to close a connection that still has prepared statements.
    this.closePromise = this.operationTail.catch(() => undefined)
      .then(() => this.statements.finalizeAll())
      .then(() => closeDatabase(this.handle));
    return this.closePromise;
  }

  private enqueue<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    if (this.closed) return Promise.reject(new Error(`Automation Studio project database ${this.projectId} is closed.`));
    this.pendingOperations += 1;
    const result = this.operationTail.catch(() => undefined).then(() =>
      withSqlPerformanceContext({ repositoryKind: "automation-studio-v2", databaseName: path.basename(this.filePath) }, operation)
    );
    this.operationTail = result.then(() => undefined, () => undefined).finally(() => {
      this.pendingOperations = Math.max(0, this.pendingOperations - 1);
    });
    return result;
  }

  private directExecutor(): AutomationStudioSqlExecutor {
    return {
      run: (sql, params = []) => this.statements.run(sql, params),
      get: <T>(sql: string, params: readonly unknown[] = []) => this.statements.get<T>(sql, params),
      all: <T>(sql: string, params: readonly unknown[] = []) => this.statements.all<T>(sql, params),
      exec: (script: string) => this.statements.exec(script)
    };
  }
}

function openDatabase(filePath: string, busyTimeoutMs: number): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    // SQLite's default Windows file layer refuses a file whose path, with its
    // `-journal` or `-wal` suffix, passes Windows' 260-character limit
    // (SQLITE_CANTOPEN; measured on 3.52.0: a 252-character `project.sqlite`
    // path already fails). A nested FluxIQ root reaches that (t568: every Lab
    // chat read failed). Windows' extended path form has no such limit, as the
    // global store already opens (`sqlite-repository.ts`). The ordinary path
    // stays the database's identity; on other platforms this is a no-op.
    const handle = new sqlite3.Database(path.toNamespacedPath(filePath), sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX, (error) => {
      if (error) reject(error);
      else {
        handle.serialize();
        resolve(handle);
      }
    });
    handle.configure("busyTimeout", busyTimeoutMs);
  });
}

function closeDatabase(handle: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => handle.close((error) => error ? reject(error) : resolve()));
}
