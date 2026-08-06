import type { JsonObject } from "../../../core/index.ts";
import type { DatabaseManagerSnapshot, RecordEnvelope, RepositoryScope } from "../types.ts";

export const DATABASE_MANAGER_ENDPOINTS = {
  snapshot: "snapshot",
  listRecords: "list-records",
  getRecord: "get-record",
  putRecord: "put-record",
  deleteRecord: "delete-record",
  runMigration: "run-migration"
} as const;

export type DatabaseManagerSnapshotRequest = {
  scope?: RepositoryScope;
};

export type DatabaseManagerSnapshotResponse = DatabaseManagerSnapshot;

export type DatabaseManagerStoreRequest = {
  kind: string;
  scope?: RepositoryScope;
  authSessionId?: string;
  authorizationPassword?: string;
  authorizationPin?: string;
  authorizationTotp?: string;
};

export type DatabaseManagerRecordRequest = DatabaseManagerStoreRequest & {
  id: string;
};

export type DatabaseManagerPutRecordRequest = DatabaseManagerRecordRequest & {
  data: JsonObject;
};

export type DatabaseManagerRunMigrationRequest = {
  id: string;
  direction?: "up" | "down";
};

export type DatabaseManagerRecordResponse = RecordEnvelope<JsonObject> | null;
