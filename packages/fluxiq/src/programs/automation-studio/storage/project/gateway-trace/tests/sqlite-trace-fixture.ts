// Test support: a persisted gateway trace store over a fresh per-project
// SQLite pool in its own temporary directory, with the helpers the tests use
// to reopen it, reach its rows directly (to damage them on purpose), and
// remove the directory afterwards. A fixture may open its store with a
// project content protection, and reopen it with another or none.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AutomationStudioProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectGatewayTraceStore } from "../index.ts";

const SQLITE_TRACE_PROJECT_ID = "project.gateway-trace";

/** One project's store; `reopen` closes the pool and opens a new one over the same files. */
export class SqliteTraceFixture {
  static readonly projectId = SQLITE_TRACE_PROJECT_ID;

  private constructor(
    readonly rootDir: string,
    private pool: AutomationStudioProjectDatabasePool,
    private current: AutomationStudioProjectGatewayTraceStore
  ) {}

  /** Whether `closeAll` closed the store and the pool, so nothing is open to close again. */
  private closed = false;

  static async create(input: { protection?: AutomationStudioProjectContentProtection } = {}): Promise<SqliteTraceFixture> {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-gateway-trace-test-"));
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectGatewayTraceStore.open({ pool, projectId: SQLITE_TRACE_PROJECT_ID, ...protectionField(input.protection) });
    return new SqliteTraceFixture(rootDir, pool, store);
  }

  get store(): AutomationStudioProjectGatewayTraceStore {
    return this.current;
  }

  get databasePool(): AutomationStudioProjectDatabasePool {
    return this.pool;
  }

  /** Reopens with no protection unless one is given. */
  async reopen(input: { protection?: AutomationStudioProjectContentProtection } = {}): Promise<AutomationStudioProjectGatewayTraceStore> {
    if (!this.closed) await this.current.close();
    await this.pool.closeAll();
    this.pool = new AutomationStudioProjectDatabasePool({ rootDir: this.rootDir });
    this.current = await AutomationStudioProjectGatewayTraceStore.open({ pool: this.pool, projectId: SQLITE_TRACE_PROJECT_ID, ...protectionField(input.protection) });
    this.closed = false;
    return this.current;
  }

  /** Closes the store and the pool, so the project's database files are whole on disk and can be read or removed. */
  async closeAll(): Promise<void> {
    if (!this.closed) await this.current.close();
    await this.pool.closeAll();
    this.closed = true;
  }

  /** The project's directory under the pool root, where its database and content objects live. */
  get projectDirectory(): string {
    return path.join(this.rootDir, "projects", SQLITE_TRACE_PROJECT_ID);
  }

  /** Runs one statement against the project database, beside the store. */
  async sql(statement: string, params: readonly unknown[] = []): Promise<void> {
    const lease = await this.pool.acquire(SQLITE_TRACE_PROJECT_ID);
    try {
      await lease.database.run(statement, params);
    } finally {
      await lease.release();
    }
  }

  async rows<T>(statement: string, params: readonly unknown[] = []): Promise<T[]> {
    const lease = await this.pool.acquire(SQLITE_TRACE_PROJECT_ID);
    try {
      return await lease.database.all<T>(statement, params);
    } finally {
      await lease.release();
    }
  }

  async dispose(): Promise<void> {
    if (!this.closed) await this.current.close();
    await this.pool.closeAll();
    await rm(this.rootDir, { recursive: true, force: true });
  }
}

function protectionField(protection: AutomationStudioProjectContentProtection | undefined): { protection?: AutomationStudioProjectContentProtection } {
  return protection === undefined ? {} : { protection };
}
