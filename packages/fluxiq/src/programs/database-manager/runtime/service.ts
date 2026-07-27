import type { JsonObject } from "../../../core";
import type {
  DatabaseManagerSnapshot,
  DatabaseManagerStoreSummary,
  Migration,
  Repository,
  RepositoryScope
} from "../types";

export class DatabaseManagerService {
  private readonly repositories = new Map<string, Repository>();
  private readonly migrations = new Map<string, Migration>();

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
      stores: stores.sort((left, right) => left.kind.localeCompare(right.kind)),
      migrations: [...this.migrations.values()].map(({ id, description }) => ({ id, description }))
    };
  }
}

function safeKind(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}
