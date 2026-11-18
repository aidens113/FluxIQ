/**
 * Where a dedicated environment's resources live. `fake` is in-memory for
 * tests; `local-process` is a process on the engine's machine; `docker` is one
 * container per customer (the local simulation of production); `vm` is one
 * isolated virtual machine per customer (production).
 */
export type EnvironmentDriverKind = "fake" | "local-process" | "docker" | "vm";

/** What the latest accepted operation asked for. */
export type EnvironmentDesiredState = "running" | "stopped" | "deleted";

/**
 * What a driver reports for an environment's resources:
 * - `absent`: nothing is allocated;
 * - `partial`: an allocation failed part-way and left resources to release;
 * - `stopped`: allocated and not running;
 * - `running`: allocated and running;
 * - `crashed`: allocated, and it stopped without being asked to.
 */
export type EnvironmentDriverObservation = "absent" | "partial" | "stopped" | "running" | "crashed";

/** The last observation recorded; `deleted` once a delete released everything. */
export type EnvironmentObservedState = EnvironmentDriverObservation | "deleted";

/** Interface I3 of the hosted-cloud plan: one dedicated environment per record. */
export type EnvironmentRecord = {
  environmentId: string;
  accountId: string;
  workspaceId: string;
  driver: EnvironmentDriverKind;
  desired: EnvironmentDesiredState;
  observed: EnvironmentObservedState;
  /** The operation whose intent `desired` holds; observations are written only under it. */
  operationId: string;
};

export type EnvironmentOperationKind = "create" | "start" | "stop" | "delete";

/**
 * One accepted operation, keyed by environment and operation id. A repeat of
 * the same id with the same kind, account and workspace is a replay; any other
 * use of the id is a conflict.
 */
export type EnvironmentOperationRecord = {
  operationId: string;
  environmentId: string;
  kind: EnvironmentOperationKind;
  accountId: string;
  workspaceId: string;
};

/** An operation to record, after its caller was authorized for exactly this account and workspace. */
export type EnvironmentIntent = EnvironmentOperationRecord & { driver: EnvironmentDriverKind };

export type EnvironmentIntentResult = {
  record: EnvironmentRecord;
  /** True when this operation id was already recorded: nothing new was written. */
  replayed: boolean;
};

/**
 * Durable environment state. Each method is atomic across connections and
 * processes; the controller owns the driver calls between them.
 */
export interface EnvironmentStore {
  get(environmentId: string): Promise<EnvironmentRecord | null>;
  listAll(): Promise<EnvironmentRecord[]>;
  listByAccount(accountId: string): Promise<EnvironmentRecord[]>;
  listByWorkspace(workspaceId: string): Promise<EnvironmentRecord[]>;
  /** Records the operation and its intent together, or refuses with `EnvironmentRefusal`. */
  recordIntent(intent: EnvironmentIntent): Promise<EnvironmentIntentResult>;
  /**
   * Writes an observation only while `operationId` is still the record's
   * operation; answers the record as it now stands, or null when it is gone.
   */
  observe(environmentId: string, operationId: string, observed: EnvironmentObservedState): Promise<EnvironmentRecord | null>;
  /** Removes the record, its operations and its index rows; false when there was none. */
  purge(environmentId: string): Promise<boolean>;
}
