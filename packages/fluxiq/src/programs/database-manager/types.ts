import type { JsonObject } from "../../core/index.ts";

export type RepositoryScope = {
  domainId?: string | null;
};

export type RecordEnvelope<T extends JsonObject = JsonObject> = {
  id: string;
  scope: RepositoryScope;
  kind: string;
  data: T;
  createdAtMs: number;
  updatedAtMs: number;
};

export type RepositoryListPageOptions = {
  limit?: number;
  offset?: number;
  search?: string;
  orderBy?: "id" | "updated_at_ms" | "created_at_ms";
  direction?: "asc" | "desc";
};

export type RepositoryListPage<T extends JsonObject = JsonObject> = {
  records: Array<RecordEnvelope<T>>;
  total: number;
  limit: number;
  offset: number;
};

export type Repository<T extends JsonObject = JsonObject> = {
  list(scope?: RepositoryScope): Promise<Array<RecordEnvelope<T>>>;
  listPage?(scope?: RepositoryScope, options?: RepositoryListPageOptions): Promise<RepositoryListPage<T>>;
  get(id: string, scope?: RepositoryScope): Promise<RecordEnvelope<T> | null>;
  put(record: RecordEnvelope<T>): Promise<RecordEnvelope<T>>;
  delete(id: string, scope?: RepositoryScope): Promise<boolean>;
};

export type Migration = {
  id: string;
  description: string;
  up(): Promise<void>;
  down?(): Promise<void>;
};

export type MigrationRun = {
  id: string;
  migrationId: string;
  direction: "up" | "down";
  status: "succeeded" | "failed";
  startedAtMs: number;
  finishedAtMs: number;
  error?: string;
};

export type DatabaseManagerStoreSummary = {
  kind: string;
  scope: RepositoryScope;
  recordCount: number | null;
};

export type DatabaseManagerSnapshot = {
  databases: string[];
  stores: DatabaseManagerStoreSummary[];
  migrations: Array<Pick<Migration, "id" | "description">>;
  migrationRuns: MigrationRun[];
};
