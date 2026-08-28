import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { recordSqlPerformance, withSqlPerformanceContext } from "../../_shared/performance-metrics.ts";

export type AutomationStudioSqlRunResult = { changes: number; lastID: number };
export type AutomationStudioWalCheckpointMode = "passive" | "full" | "restart" | "truncate";
export type AutomationStudioWalCheckpointResult = { busy: number; log: number; checkpointed: number };

export type AutomationStudioSqlExecutor = {
  run(sql: string, params?: readonly unknown[]): Promise<AutomationStudioSqlRunResult>;
  get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
};

export type AutomationStudioProjectDatabaseLease = {
  projectId: string;
  database: AutomationStudioProjectDatabase;
  release(): Promise<void>;
};

export type AutomationStudioProjectDatabasePoolOptions = {
  rootDir: string;
  busyTimeoutMs?: number;
};

type PoolEntry = { database: AutomationStudioProjectDatabase; leases: number };

export class AutomationStudioProjectDatabasePool {
  readonly rootDir: string;
  private readonly busyTimeoutMs: number;
  private readonly entries = new Map<string, Promise<PoolEntry>>();
  private closing = false;

  constructor(options: AutomationStudioProjectDatabasePoolOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.busyTimeoutMs = Math.max(100, Math.trunc(options.busyTimeoutMs ?? 10_000));
  }

  async acquire(projectId: string): Promise<AutomationStudioProjectDatabaseLease> {
    if (this.closing) throw new Error("Automation Studio project database pool is closing.");
    const normalizedProjectId = normalizeProjectId(projectId);
    let entryPromise = this.entries.get(normalizedProjectId);
    if (!entryPromise) {
      entryPromise = this.openEntry(normalizedProjectId);
      this.entries.set(normalizedProjectId, entryPromise);
      entryPromise.catch(() => {
        if (this.entries.get(normalizedProjectId) === entryPromise) this.entries.delete(normalizedProjectId);
      });
    }
    const entry = await entryPromise;
    entry.leases += 1;
    let released = false;
    return {
      projectId: normalizedProjectId,
      database: entry.database,
      release: async () => {
        if (released) return;
        released = true;
        entry.leases = Math.max(0, entry.leases - 1);
        if (entry.leases || this.entries.get(normalizedProjectId) !== entryPromise) return;
        this.entries.delete(normalizedProjectId);
        await entry.database.close();
      }
    };
  }

  stats(): { openProjects: number; projects: Array<{ projectId: string; leases: number; queuedOperations: number }> } {
    const projects: Array<{ projectId: string; leases: number; queuedOperations: number }> = [];
    for (const [projectId, entryPromise] of this.entries) {
      void entryPromise.then((entry) => projects.push({ projectId, leases: entry.leases, queuedOperations: entry.database.queuedOperations }));
    }
    return { openProjects: this.entries.size, projects };
  }

  async closeAll(): Promise<void> {
    this.closing = true;
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map(async (entryPromise) => (await entryPromise).database.close()));
  }

  private async openEntry(projectId: string): Promise<PoolEntry> {
    const projectDir = path.join(this.rootDir, "projects", projectId);
    await mkdir(projectDir, { recursive: true });
    const database = await AutomationStudioProjectDatabase.open({
      projectId,
      filePath: path.join(projectDir, "project.sqlite"),
      busyTimeoutMs: this.busyTimeoutMs
    });
    return { database, leases: 0 };
  }
}

export class AutomationStudioProjectDatabase implements AutomationStudioSqlExecutor {
  readonly projectId: string;
  readonly filePath: string;
  private operationTail: Promise<void> = Promise.resolve();
  private pendingOperations = 0;
  private closed = false;
  private closePromise: Promise<void> | null = null;

  private constructor(private readonly handle: sqlite3.Database, input: { projectId: string; filePath: string }) {
    this.projectId = input.projectId;
    this.filePath = input.filePath;
  }

  static async open(input: { projectId: string; filePath: string; busyTimeoutMs: number }): Promise<AutomationStudioProjectDatabase> {
    const handle = await openDatabase(input.filePath, input.busyTimeoutMs);
    const database = new AutomationStudioProjectDatabase(handle, input);
    try {
      await database.execute(async (sql) => {
        await sql.run("pragma foreign_keys = ON");
        await sql.run("pragma journal_mode = WAL");
        await sql.run("pragma synchronous = NORMAL");
        await sql.run("pragma temp_store = MEMORY");
        await sql.run(`pragma busy_timeout = ${Math.max(100, Math.trunc(input.busyTimeoutMs))}`);
      });
    } catch (error) {
      await database.close().catch(() => undefined);
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
        await executor.run("rollback").catch(() => undefined);
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
    this.closePromise = this.operationTail.catch(() => undefined).then(() => closeDatabase(this.handle));
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
      run: (sql, params = []) => run(this.handle, sql, params),
      get: <T>(sql: string, params: readonly unknown[] = []) => get<T>(this.handle, sql, params),
      all: <T>(sql: string, params: readonly unknown[] = []) => all<T>(this.handle, sql, params)
    };
  }
}

function normalizeProjectId(projectId: string): string {
  const value = projectId.trim();
  if (!value || value.length > 200 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error("Automation Studio project ID must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  return value;
}

function openDatabase(filePath: string, busyTimeoutMs: number): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const handle = new sqlite3.Database(filePath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX, (error) => {
      if (error) reject(error);
      else {
        handle.serialize();
        resolve(handle);
      }
    });
    handle.configure("busyTimeout", busyTimeoutMs);
  });
}

function run(handle: sqlite3.Database, sql: string, params: readonly unknown[]): Promise<AutomationStudioSqlRunResult> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    handle.run(sql, [...params], function onRun(error) {
      recordSqlPerformance({ operation: "run", sql, elapsedMs: performance.now() - startedAt, rowsChanged: error ? 0 : this.changes, ok: !error });
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function get<T>(handle: sqlite3.Database, sql: string, params: readonly unknown[]): Promise<T | undefined> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    handle.get(sql, [...params], (error, row: T | undefined) => {
      recordSqlPerformance({ operation: "get", sql, elapsedMs: performance.now() - startedAt, rowsReturned: error || row === undefined ? 0 : 1, ok: !error });
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function all<T>(handle: sqlite3.Database, sql: string, params: readonly unknown[]): Promise<T[]> {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    handle.all(sql, [...params], (error, rows: T[]) => {
      recordSqlPerformance({ operation: "all", sql, elapsedMs: performance.now() - startedAt, rowsReturned: error ? 0 : rows.length, ok: !error });
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function closeDatabase(handle: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => handle.close((error) => error ? reject(error) : resolve()));
}
