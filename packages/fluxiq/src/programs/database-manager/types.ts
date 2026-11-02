import type { RepositoryScope } from "../../framework/persistence/contracts/index.ts";
export type { RepositoryScope, RecordEnvelope, RepositoryListPageOptions, RepositoryListPage, Repository } from "../../framework/persistence/contracts/index.ts";

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
