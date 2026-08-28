import { createHash, randomUUID } from "node:crypto";
import type { AutomationStudioProjectDatabase, AutomationStudioSqlExecutor } from "./project-database.ts";

export type AutomationStudioSchemaMigration = {
  id: string;
  statements: readonly string[];
};

export type AutomationStudioSchemaBackupContext = {
  projectId: string;
  databasePath: string;
  pendingMigrationIds: string[];
};

export type AutomationStudioSchemaMigrationRunnerOptions = {
  database: AutomationStudioProjectDatabase;
  migrations: readonly AutomationStudioSchemaMigration[];
  backup?: (context: AutomationStudioSchemaBackupContext) => Promise<void>;
  lockTimeoutMs?: number;
  now?: () => number;
  createLockToken?: () => string;
};

export type AutomationStudioSchemaMigrationResult = {
  applied: string[];
  skipped: string[];
  backupCreated: boolean;
  status: "ready";
};

export type AutomationStudioSchemaState = {
  status: "ready" | "migrating" | "failed";
  lockToken: string | null;
  lockAcquiredAt: number | null;
  failureMessage: string | null;
  updatedAt: number;
};

type MigrationRow = { migrationId: string; checksum: string };

const LIFECYCLE_SCHEMA = [
  `create table if not exists automation_schema_migrations (
    migration_id text primary key,
    checksum text not null,
    applied_at_ms integer not null
  )`,
  `create table if not exists automation_schema_state (
    singleton integer primary key check (singleton = 1),
    status text not null check (status in ('ready', 'migrating', 'failed')),
    lock_token text,
    lock_acquired_at_ms integer,
    failure_message text,
    updated_at_ms integer not null
  )`
] as const;

export class AutomationStudioSchemaMigrationRunner {
  private readonly database: AutomationStudioProjectDatabase;
  private readonly migrations: readonly AutomationStudioSchemaMigration[];
  private readonly backup?: AutomationStudioSchemaMigrationRunnerOptions["backup"];
  private readonly lockTimeoutMs: number;
  private readonly now: () => number;
  private readonly createLockToken: () => string;

  constructor(options: AutomationStudioSchemaMigrationRunnerOptions) {
    this.database = options.database;
    this.migrations = validateMigrations(options.migrations);
    this.backup = options.backup;
    this.lockTimeoutMs = Math.max(1_000, Math.trunc(options.lockTimeoutMs ?? 60_000));
    this.now = options.now ?? Date.now;
    this.createLockToken = options.createLockToken ?? randomUUID;
  }

  async migrate(): Promise<AutomationStudioSchemaMigrationResult> {
    await this.ensureLifecycleSchema();
    const appliedRows = await this.database.all<MigrationRow>("select migration_id as migrationId, checksum from automation_schema_migrations order by migration_id");
    const appliedById = new Map(appliedRows.map((row) => [row.migrationId, row.checksum]));
    const skipped: string[] = [];
    const pending: AutomationStudioSchemaMigration[] = [];
    for (const migration of this.migrations) {
      const checksum = automationStudioMigrationChecksum(migration);
      const existing = appliedById.get(migration.id);
      if (existing === undefined) pending.push(migration);
      else if (existing === checksum) skipped.push(migration.id);
      else {
        const error = new Error(`Automation Studio migration ${migration.id} checksum does not match its applied ledger entry.`);
        await this.recordFailure(error);
        throw error;
      }
    }
    if (!pending.length) {
      await this.markReady(null);
      return { applied: [], skipped, backupCreated: false, status: "ready" };
    }

    const lockToken = this.createLockToken();
    await this.acquireLock(lockToken);
    let backupCreated = false;
    const applied: string[] = [];
    try {
      if (this.backup) {
        await this.backup({ projectId: this.database.projectId, databasePath: this.database.filePath, pendingMigrationIds: pending.map((migration) => migration.id) });
        backupCreated = true;
      }
      for (const migration of pending) {
        await this.database.transaction(async (sql) => {
          for (const statement of migration.statements) await sql.run(statement);
          await sql.run(
            "insert into automation_schema_migrations (migration_id, checksum, applied_at_ms) values (?, ?, ?)",
            [migration.id, automationStudioMigrationChecksum(migration), this.now()]
          );
        });
        applied.push(migration.id);
      }
      await this.markReady(lockToken);
      return { applied, skipped, backupCreated, status: "ready" };
    } catch (error) {
      await this.recordFailure(error, lockToken);
      throw error;
    }
  }

  async state(): Promise<AutomationStudioSchemaState> {
    await this.ensureLifecycleSchema();
    const row = await this.database.get<{
      status: AutomationStudioSchemaState["status"];
      lockToken: string | null;
      lockAcquiredAt: number | null;
      failureMessage: string | null;
      updatedAt: number;
    }>(`select status, lock_token as lockToken, lock_acquired_at_ms as lockAcquiredAt,
      failure_message as failureMessage, updated_at_ms as updatedAt
      from automation_schema_state where singleton = 1`);
    if (!row) throw new Error("Automation Studio schema state is unavailable.");
    return row;
  }

  private async ensureLifecycleSchema(): Promise<void> {
    await this.database.execute(async (sql) => {
      for (const statement of LIFECYCLE_SCHEMA) await sql.run(statement);
      await sql.run(
        "insert into automation_schema_state (singleton, status, lock_token, lock_acquired_at_ms, failure_message, updated_at_ms) values (1, 'ready', null, null, null, ?) on conflict(singleton) do nothing",
        [this.now()]
      );
    });
  }

  private async acquireLock(lockToken: string): Promise<void> {
    const now = this.now();
    const staleBefore = now - this.lockTimeoutMs;
    await this.database.transaction(async (sql) => {
      const state = await readState(sql);
      if (state.status === "migrating" && state.lockToken && (state.lockAcquiredAt ?? now) > staleBefore) {
        throw new Error(`Automation Studio schema migration is already running for project ${this.database.projectId}.`);
      }
      const result = await sql.run(
        `update automation_schema_state set status = 'migrating', lock_token = ?, lock_acquired_at_ms = ?, failure_message = null, updated_at_ms = ?
         where singleton = 1 and (status != 'migrating' or lock_acquired_at_ms is null or lock_acquired_at_ms <= ?)`,
        [lockToken, now, now, staleBefore]
      );
      if (result.changes !== 1) throw new Error(`Automation Studio schema migration lock could not be acquired for project ${this.database.projectId}.`);
    });
  }

  private async markReady(lockToken: string | null): Promise<void> {
    const params: unknown[] = [this.now()];
    const lockClause = lockToken ? " and lock_token = ?" : " and status != 'migrating'";
    if (lockToken) params.push(lockToken);
    const result = await this.database.run(
      `update automation_schema_state set status = 'ready', lock_token = null, lock_acquired_at_ms = null, failure_message = null, updated_at_ms = ? where singleton = 1${lockClause}`,
      params
    );
    if (result.changes !== 1) throw new Error(`Automation Studio schema migration lock was lost for project ${this.database.projectId}.`);
  }

  private async recordFailure(error: unknown, lockToken?: string): Promise<void> {
    await this.ensureLifecycleSchema();
    const message = error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
    const lockClause = lockToken ? " and lock_token = ?" : " and status != 'migrating'";
    const params: unknown[] = [message, this.now(), ...(lockToken ? [lockToken] : [])];
    await this.database.run(
      `update automation_schema_state set status = 'failed', lock_token = null, lock_acquired_at_ms = null, failure_message = ?, updated_at_ms = ? where singleton = 1${lockClause}`,
      params
    );
  }
}

export function automationStudioMigrationChecksum(migration: AutomationStudioSchemaMigration): string {
  return createHash("sha256").update(JSON.stringify({ id: migration.id, statements: migration.statements })).digest("hex");
}

async function readState(sql: AutomationStudioSqlExecutor): Promise<AutomationStudioSchemaState> {
  const row = await sql.get<{
    status: AutomationStudioSchemaState["status"];
    lockToken: string | null;
    lockAcquiredAt: number | null;
    failureMessage: string | null;
    updatedAt: number;
  }>(`select status, lock_token as lockToken, lock_acquired_at_ms as lockAcquiredAt,
    failure_message as failureMessage, updated_at_ms as updatedAt
    from automation_schema_state where singleton = 1`);
  if (!row) throw new Error("Automation Studio schema state is unavailable.");
  return row;
}

function validateMigrations(migrations: readonly AutomationStudioSchemaMigration[]): readonly AutomationStudioSchemaMigration[] {
  const ids = new Set<string>();
  let previous = "";
  for (const migration of migrations) {
    if (!/^[0-9]{4}_[a-z0-9_]+$/.test(migration.id)) throw new Error(`Invalid Automation Studio migration ID ${migration.id}.`);
    if (ids.has(migration.id) || migration.id <= previous) throw new Error("Automation Studio migrations must have unique, ascending IDs.");
    if (!migration.statements.length || migration.statements.some((statement) => !statement.trim())) throw new Error(`Automation Studio migration ${migration.id} has no executable statements.`);
    ids.add(migration.id);
    previous = migration.id;
  }
  return migrations;
}
