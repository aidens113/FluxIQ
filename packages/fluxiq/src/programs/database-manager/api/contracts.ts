import type { DatabaseManagerSnapshot, RepositoryScope } from "../types";

export const DATABASE_MANAGER_ENDPOINTS = {
  snapshot: "snapshot"
} as const;

export type DatabaseManagerSnapshotRequest = {
  scope?: RepositoryScope;
};

export type DatabaseManagerSnapshotResponse = DatabaseManagerSnapshot;
