import type { JsonObject } from "../../../core";
import { ProgramJsonStore, programDataFile } from "../../_shared/storage";
import type {
  DatabaseManagerSnapshot,
  DatabaseManagerStoreSummary,
  Migration,
  MigrationRun,
  RecordEnvelope,
  Repository,
  RepositoryScope
} from "../types";

type DatabaseManagerState = {
  migrationRuns: MigrationRun[];
};

export class DatabaseManagerService {
  private readonly repositories = new Map<string, Repository>();
  private readonly migrations = new Map<string, Migration>();
  private readonly state?: ProgramJsonStore<DatabaseManagerState>;

  constructor(options: { dataDir?: string } = {}) {
    if (options.dataDir) {
      this.state = new ProgramJsonStore(programDataFile(options.dataDir, "database-manager", "state.json"), () => ({ migrationRuns: [] }));
    }
  }

  registerRepository<T extends JsonObject>(kind: string, repository: Repository<T>): this {
    const key = safeKind(kind);
    if (this.repositories.has(key)) {
      throw new Error(`Duplicate repository kind: ${key}`);
    }
    this.repositories.set(key, repository as Repository);
    return this;
  }

  repository<T extends JsonObject>(kind: string): Repository<T> {
    const repo = this.repositories.get(safeKind(kind));
    if (!repo) {
      throw new Error(`Unknown repository kind: ${kind}`);
    }
    return repo as Repository<T>;
  }

  registerMigration(migration: Migration): this {
    if (this.migrations.has(migration.id)) {
      throw new Error(`Duplicate migration: ${migration.id}`);
    }
    this.migrations.set(migration.id, migration);
    return this;
  }

  async snapshot(scope: RepositoryScope = {}): Promise<DatabaseManagerSnapshot> {
    const stores: DatabaseManagerStoreSummary[] = [];
    for (const [kind, repository] of this.repositories) {
      stores.push({
        kind,
        scope,
        recordCount: (await repository.list(scope)).length
      });
    }
    return {
      databases: this.databases(),
      stores: stores.sort((left, right) => left.kind.localeCompare(right.kind)),
      migrations: [...this.migrations.values()].map(({ id, description }) => ({ id, description })),
      migrationRuns: (await this.readState()).migrationRuns.sort((left, right) => right.startedAtMs - left.startedAtMs)
    };
  }

  async listRecords<T extends JsonObject>(kind: string, scope: RepositoryScope = {}): Promise<Array<RecordEnvelope<T>>> {
    return this.repository<T>(kind).list(scope);
  }

  async getRecord<T extends JsonObject>(kind: string, id: string, scope: RepositoryScope = {}): Promise<RecordEnvelope<T> | null> {
    return this.repository<T>(kind).get(id, scope);
  }

  async putRecord<T extends JsonObject>(kind: string, id: string, data: T, scope: RepositoryScope = {}): Promise<RecordEnvelope<T>> {
    const existing = await this.repository<T>(kind).get(id, scope);
    return this.repository<T>(kind).put({
      id,
      kind: safeKind(kind),
      scope,
      data,
      createdAtMs: existing?.createdAtMs ?? Date.now(),
      updatedAtMs: Date.now()
    });
  }

  async deleteRecord(kind: string, id: string, scope: RepositoryScope = {}): Promise<boolean> {
    return this.repository(kind).delete(id, scope);
  }

  databases(): string[] {
    const values = new Set<string>(["global"]);
    for (const repository of this.repositories.values()) {
      if (hasDatabaseList(repository)) {
        for (const database of repository.databases()) values.add(database);
      }
    }
    return [...values].sort((left, right) => left.localeCompare(right));
  }

  async runMigration(id: string, direction: "up" | "down" = "up"): Promise<MigrationRun> {
    const migration = this.migrations.get(id);
    if (!migration) {
      throw new Error(`Unknown migration: ${id}`);
    }
    if (direction === "down" && !migration.down) {
      throw new Error(`Migration does not support down: ${id}`);
    }
    const startedAtMs = Date.now();
    try {
      if (direction === "up") await migration.up();
      else await migration.down?.();
      return this.recordMigrationRun({ id: `${id}.${startedAtMs}`, migrationId: id, direction, status: "succeeded", startedAtMs, finishedAtMs: Date.now() });
    } catch (error) {
      return this.recordMigrationRun({
        id: `${id}.${startedAtMs}`,
        migrationId: id,
        direction,
        status: "failed",
        startedAtMs,
        finishedAtMs: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async readState(): Promise<DatabaseManagerState> {
    return this.state?.read() ?? { migrationRuns: [] };
  }

  private async recordMigrationRun(run: MigrationRun): Promise<MigrationRun> {
    if (!this.state) return run;
    await this.state.update((state) => {
      state.migrationRuns = [run, ...state.migrationRuns].slice(0, 500);
    });
    return run;
  }
}

function safeKind(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

function hasDatabaseList(value: Repository): value is Repository & { databases(): string[] } {
  return "databases" in value && typeof (value as { databases?: unknown }).databases === "function";
}
