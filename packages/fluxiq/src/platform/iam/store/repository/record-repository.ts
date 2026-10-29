import type { JsonObject } from "../../../../core/index.ts";

/** The scope an IAM record lives in: `domainId` is the workspace id, or null at platform level. */
export type IamRecordScope = {
  domainId?: string | null;
};

/** One stored row. Structurally the database manager's `RecordEnvelope`. */
export type IamRecordEnvelope = {
  id: string;
  scope: IamRecordScope;
  kind: string;
  data: JsonObject;
  createdAtMs: number;
  updatedAtMs: number;
};

/**
 * The persistence port the IAM store needs. Structural, so the database
 * manager's `Repository` is assignable to it without this directory importing
 * `programs/`. `list(scope)` returns that scope's rows only. A repository may
 * store its own kind over the envelope's and normalise the scope it returns
 * (`SQLiteRepository` does both), so the store relies on neither.
 */
export type IamRecordRepository = {
  list(scope?: IamRecordScope): Promise<IamRecordEnvelope[]>;
  get(id: string, scope?: IamRecordScope): Promise<IamRecordEnvelope | null>;
  put(record: IamRecordEnvelope): Promise<IamRecordEnvelope>;
  delete(id: string, scope?: IamRecordScope): Promise<boolean>;
};
