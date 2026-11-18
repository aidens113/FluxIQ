import { EnvironmentRefusal } from "./environment-refusal.ts";
import type { EnvironmentDesiredState, EnvironmentIntent, EnvironmentOperationRecord, EnvironmentRecord } from "./types.ts";

export type EnvironmentIntentPlan =
  | { replayed: true; record: EnvironmentRecord }
  | { replayed: false; record: EnvironmentRecord; operation: EnvironmentOperationRecord };

const DESIRED: Record<EnvironmentIntent["kind"], EnvironmentDesiredState> = {
  create: "running",
  start: "running",
  stop: "stopped",
  delete: "deleted"
};

/**
 * The state machine's intent step, as a pure decision over what is stored.
 *
 * - The same operation id with the same kind, account and workspace replays:
 *   nothing is written and the record is answered as it stands. Any other use
 *   of the id is `operation-reused`.
 * - An environment belongs to one account and workspace for its whole life,
 *   its deleted record included, until it is purged (`owned-elsewhere`).
 * - `create` needs no record or a deleted one (`environment-exists`); `start`
 *   and `stop` need a record not being deleted (`not-found`,
 *   `environment-deleted`); `delete` needs a record and repeats harmlessly.
 * - A live record is driven by the driver that allocated it (`driver-mismatch`);
 *   a fully deleted one may be created again on another.
 */
export function planEnvironmentIntent(existing: EnvironmentRecord | null, previous: EnvironmentOperationRecord | null, intent: EnvironmentIntent): EnvironmentIntentPlan {
  if (previous !== null) {
    const same = previous.kind === intent.kind && previous.accountId === intent.accountId && previous.workspaceId === intent.workspaceId
      && previous.environmentId === intent.environmentId;
    if (!same || existing === null) throw new EnvironmentRefusal("operation-reused");
    return { replayed: true, record: existing };
  }
  if (existing !== null && (existing.accountId !== intent.accountId || existing.workspaceId !== intent.workspaceId)) {
    throw new EnvironmentRefusal("owned-elsewhere");
  }
  const gone = existing !== null && existing.desired === "deleted" && existing.observed === "deleted";
  if (existing !== null && !gone && existing.driver !== intent.driver) throw new EnvironmentRefusal("driver-mismatch");
  if (intent.kind === "create") {
    if (existing !== null && !gone) throw new EnvironmentRefusal("environment-exists");
  } else if (existing === null) {
    throw new EnvironmentRefusal("not-found");
  } else if (intent.kind !== "delete" && existing.desired === "deleted") {
    throw new EnvironmentRefusal("environment-deleted");
  }
  const operation: EnvironmentOperationRecord = {
    operationId: intent.operationId,
    environmentId: intent.environmentId,
    kind: intent.kind,
    accountId: intent.accountId,
    workspaceId: intent.workspaceId
  };
  const fresh = existing === null || (gone && intent.kind === "create");
  const record: EnvironmentRecord = {
    environmentId: intent.environmentId,
    accountId: intent.accountId,
    workspaceId: intent.workspaceId,
    driver: fresh ? intent.driver : existing.driver,
    desired: DESIRED[intent.kind],
    observed: fresh ? "absent" : existing.observed,
    operationId: intent.operationId
  };
  return { replayed: false, record, operation };
}
