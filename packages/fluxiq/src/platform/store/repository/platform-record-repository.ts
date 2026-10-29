import type { JsonObject } from "../../../core/index.ts";

/** The scope a platform row lives in: always `domainId: null` (platform level). */
export type PlatformRecordScope = {
  domainId?: string | null;
};

/** One stored row. Structurally the database manager's `RecordEnvelope`. */
export type PlatformRecordEnvelope = {
  id: string;
  scope: PlatformRecordScope;
  kind: string;
  data: JsonObject;
  createdAtMs: number;
  updatedAtMs: number;
};

/**
 * The persistence port the platform store needs. Structural, so the database
 * manager's `Repository` (and `SQLiteRepository`) is assignable to it without
 * this directory importing `programs/`.
 */
export type PlatformRecordRepository = {
  list(scope?: PlatformRecordScope): Promise<PlatformRecordEnvelope[]>;
  get(id: string, scope?: PlatformRecordScope): Promise<PlatformRecordEnvelope | null>;
  put(record: PlatformRecordEnvelope): Promise<PlatformRecordEnvelope>;
  delete(id: string, scope?: PlatformRecordScope): Promise<boolean>;
};
