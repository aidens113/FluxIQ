import type { JsonObject } from "../../../core/index.ts";
import type { DatabaseManagerSnapshot, RecordEnvelope, RepositoryScope } from "../types.ts";

export const DATABASE_MANAGER_ENDPOINTS = {
  snapshot: "snapshot",
  authorizeStore: "authorize-store",
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
  grantId?: string;
  limit?: number;
  offset?: number;
  search?: string;
  sort?: "id" | "updated" | "created";
  direction?: "asc" | "desc";
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

export type DatabaseManagerRecordPageResponse = { records: Array<RecordEnvelope<JsonObject>>; total: number; limit: number; offset: number };
export type DatabaseManagerSensitiveGrantResponse = { grantId: string; expiresAtMs: number };
export type DatabaseManagerRecordResponse = RecordEnvelope<JsonObject> | null;
