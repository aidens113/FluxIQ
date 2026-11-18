import { EnvironmentRefusal } from "../model/index.ts";
import type { EnvironmentDriverObservation, EnvironmentOperationKind, EnvironmentRecord, EnvironmentStore } from "../model/index.ts";
import { DEDICATED_ENVIRONMENT_CAPABILITY } from "./dedicated-environment-capability.ts";
import type {
  EnvironmentCommand,
  EnvironmentControllerOptions,
  EnvironmentDriver,
  EnvironmentDriverSpec,
  EnvironmentQuery
} from "./types.ts";

type Owner = { accountId: string; workspaceId: string };

/** An environment id names a container or virtual machine, so it is held to what both accept. */
const ENVIRONMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;

/**
 * The dedicated-environment state machine. Each operation is recorded first
 * (desired state under its operation id, atomically with the operation-id
 * ledger), then converged: the driver is asked what exists and acts until
 * what it observes matches what is desired, and the observation is written
 * under the same operation id. A crash between the two is finished by
 * `reconcile`, or by repeating the operation with the same id.
 *
 * Authority: `create` and `start` allocate, so they pass the commerce
 * admission (a dedicated target whose `targetId` is the environment id);
 * `stop`, `delete` and `get` ask the same IAM resolver without an entitlement.
 * `reconcile` and the purges are the engine's own and never allocate: an
 * environment whose resources are gone waits for an admitted `start`.
 *
 * Operations on one environment run one after another in this process; across
 * processes, an observation for a superseded operation is never written.
 */
export class EnvironmentController<Actor> {
  private readonly store: EnvironmentStore;
  private readonly driver: EnvironmentDriver;
  private readonly admission: EnvironmentControllerOptions<Actor>["admission"];
  private readonly authorizeTarget: EnvironmentControllerOptions<Actor>["authorize"];
  private readonly capability: string;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(options: EnvironmentControllerOptions<Actor>) {
    this.store = options.store;
    this.driver = options.driver;
    this.admission = options.admission;
    this.authorizeTarget = options.authorize;
    this.capability = options.capability ?? DEDICATED_ENVIRONMENT_CAPABILITY;
    if (!identifier(this.capability)) throw new TypeError("Invalid environment capability");
  }

  /** Allocates and starts a new environment; repeating the operation id replays it. */
  create(command: EnvironmentCommand<Actor>): Promise<EnvironmentRecord> {
    return this.command(command, "create");
  }

  /** Starts a stopped or crashed environment, allocating again if its resources are gone. */
  start(command: EnvironmentCommand<Actor>): Promise<EnvironmentRecord> {
    return this.command(command, "start");
  }

  stop(command: EnvironmentCommand<Actor>): Promise<EnvironmentRecord> {
    return this.command(command, "stop");
  }

  /** Releases every resource; the record stays, observed `deleted`, until its account or workspace is purged. */
  delete(command: EnvironmentCommand<Actor>): Promise<EnvironmentRecord> {
    return this.command(command, "delete");
  }

  async get(query: EnvironmentQuery<Actor>): Promise<EnvironmentRecord | null> {
    if (!validQuery(query)) throw new EnvironmentRefusal("invalid-request");
    const owner = await this.authorized(query);
    const record = await this.store.get(query.environmentId);
    if (record !== null && (record.accountId !== owner.accountId || record.workspaceId !== owner.workspaceId)) {
      throw new EnvironmentRefusal("owned-elsewhere");
    }
    return record;
  }

  /** Converges one environment toward its recorded intent: restarts a crash, finishes a stop or delete, releases partial resources. */
  reconcile(environmentId: string): Promise<EnvironmentRecord | null> {
    return this.exclusive(environmentId, async () => {
      const record = await this.store.get(environmentId);
      if (record === null || settled(record)) return record;
      return this.converge(record, false);
    });
  }

  /** Reconciles every environment, as after an engine restart; every failure is reported together. */
  async reconcileAll(): Promise<EnvironmentRecord[]> {
    const records: EnvironmentRecord[] = [];
    const failures: unknown[] = [];
    for (const stored of await this.store.listAll()) {
      try {
        const record = await this.reconcile(stored.environmentId);
        if (record !== null) records.push(record);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, `${failures.length} environments could not be reconciled.`);
    return records;
  }

  /**
   * The account deletion cascade: releases and then erases every environment
   * of the account, its records and operations included. A failure part-way
   * leaves the failed environments marked deleted, and repeating the purge
   * with the same operation id finishes them. Answers the ids it erased.
   */
  async purgeAccount(accountId: string, operationId: string): Promise<string[]> {
    if (!identifier(accountId) || !identifier(operationId)) throw new EnvironmentRefusal("invalid-request");
    return this.purge(await this.store.listByAccount(accountId), operationId);
  }

  /** The workspace deletion cascade, as `purgeAccount` for one workspace. */
  async purgeWorkspace(workspaceId: string, operationId: string): Promise<string[]> {
    if (!identifier(workspaceId) || !identifier(operationId)) throw new EnvironmentRefusal("invalid-request");
    return this.purge(await this.store.listByWorkspace(workspaceId), operationId);
  }

  private async command(command: EnvironmentCommand<Actor>, kind: EnvironmentOperationKind): Promise<EnvironmentRecord> {
    if (!validQuery(command) || !identifier(command.operationId) || command.operationId.length > 200) {
      throw new EnvironmentRefusal("invalid-request");
    }
    const allocates = kind === "create" || kind === "start";
    const owner = allocates ? await this.admitted(command) : await this.authorized(command);
    return this.exclusive(command.environmentId, async () => {
      const { record, replayed } = await this.store.recordIntent({
        operationId: command.operationId,
        environmentId: command.environmentId,
        kind,
        accountId: owner.accountId,
        workspaceId: owner.workspaceId,
        driver: this.driver.kind
      });
      // A replay of an operation a later one superseded answers what stands now and changes nothing.
      if (replayed && record.operationId !== command.operationId) return record;
      if (settled(record)) return record;
      return this.converge(record, allocates);
    });
  }

  private async purge(records: EnvironmentRecord[], operationId: string): Promise<string[]> {
    const purged: string[] = [];
    const failures: unknown[] = [];
    for (const stored of records) {
      try {
        await this.exclusive(stored.environmentId, async () => {
          const { record } = await this.store.recordIntent({
            operationId,
            environmentId: stored.environmentId,
            kind: "delete",
            accountId: stored.accountId,
            workspaceId: stored.workspaceId,
            driver: this.driver.kind
          });
          if (!settled(record)) await this.converge(record, false);
          await this.store.purge(stored.environmentId);
        });
        purged.push(stored.environmentId);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, `${failures.length} of ${records.length} environments could not be deleted.`);
    return purged;
  }

  private async converge(record: EnvironmentRecord, mayAllocate: boolean): Promise<EnvironmentRecord> {
    if (record.driver !== this.driver.kind) throw new EnvironmentRefusal("driver-mismatch");
    const spec: EnvironmentDriverSpec = { environmentId: record.environmentId, accountId: record.accountId, workspaceId: record.workspaceId };
    try {
      let observed = await this.driver.inspect(spec);
      if (record.desired === "deleted") return await this.release(record, spec, observed);
      if (observed === "partial") {
        await this.driver.release(spec);
        observed = await this.driver.inspect(spec);
      }
      if (record.desired === "running") {
        if (observed === "absent") {
          if (!mayAllocate) return await this.observe(record, "absent");
          await this.allocate(spec);
          observed = await this.driver.inspect(spec);
        }
        if (observed === "stopped" || observed === "crashed") await this.driver.start(spec);
      } else if (observed === "running" || observed === "crashed") {
        await this.driver.stop(spec);
      }
      return await this.observe(record, await this.driver.inspect(spec));
    } catch (error) {
      return await this.recordFailure(record, spec, error);
    }
  }

  /** A failed allocation releases whatever it left before the failure is reported. */
  private async allocate(spec: EnvironmentDriverSpec): Promise<void> {
    try {
      await this.driver.allocate(spec);
    } catch (error) {
      try {
        await this.driver.release(spec);
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], `Environment ${spec.environmentId} failed to allocate and its partial resources were not released.`);
      }
      throw error;
    }
  }

  private async release(record: EnvironmentRecord, spec: EnvironmentDriverSpec, observed: EnvironmentDriverObservation): Promise<EnvironmentRecord> {
    if (observed !== "absent") {
      await this.driver.release(spec);
      const after = await this.driver.inspect(spec);
      if (after !== "absent") throw new Error(`Environment ${spec.environmentId} still has ${after} resources after release.`);
    }
    return this.observe(record, "deleted");
  }

  /** Records what the driver now observes, then reports the failure; never answers. */
  private async recordFailure(record: EnvironmentRecord, spec: EnvironmentDriverSpec, error: unknown): Promise<never> {
    try {
      await this.store.observe(record.environmentId, record.operationId, await this.driver.inspect(spec));
    } catch (observation) {
      throw new AggregateError([error, observation], `Environment ${spec.environmentId} failed and its state could not be recorded.`);
    }
    throw error;
  }

  private async observe(record: EnvironmentRecord, observed: EnvironmentRecord["observed"]): Promise<EnvironmentRecord> {
    const current = await this.store.observe(record.environmentId, record.operationId, observed);
    if (current === null) throw new Error(`Environment ${record.environmentId} was erased while it was being changed.`);
    return current;
  }

  private async admitted(command: EnvironmentQuery<Actor>): Promise<Owner> {
    const decision = await this.admission.admit({
      actor: command.actor,
      workspaceId: command.workspaceId,
      targetId: command.environmentId,
      capability: this.capability
    });
    if (!decision.allowed) throw new EnvironmentRefusal("admission-refused", decision.reason);
    if (decision.source !== "commerce" || decision.allocation !== "dedicated"
      || decision.targetId !== command.environmentId || decision.workspaceId !== command.workspaceId) {
      throw new EnvironmentRefusal("not-dedicated");
    }
    return { accountId: decision.accountId, workspaceId: decision.workspaceId };
  }

  private async authorized(query: EnvironmentQuery<Actor>): Promise<Owner> {
    const authority = await this.authorizeTarget({
      actor: query.actor,
      workspaceId: query.workspaceId,
      targetId: query.environmentId,
      capability: this.capability
    });
    if (authority === null || !identifier(authority.accountId) || authority.workspaceId !== query.workspaceId) {
      throw new EnvironmentRefusal("not-authorized");
    }
    const target = authority.target;
    if (target === null || typeof target !== "object" || target.targetId !== query.environmentId
      || target.ownerAccountId !== authority.accountId || target.ownerWorkspaceId !== query.workspaceId
      || !Array.isArray(target.capabilities) || !target.capabilities.includes(this.capability)) {
      throw new EnvironmentRefusal("not-authorized");
    }
    if (target.kind !== "managed-cloud" || target.allocation !== "dedicated") throw new EnvironmentRefusal("not-dedicated");
    return { accountId: authority.accountId, workspaceId: query.workspaceId };
  }

  private exclusive<T>(environmentId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(environmentId) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(() => undefined).catch(/* best-effort: the caller awaits this task's own outcome, the lock only orders the next */ () => undefined);
    this.locks.set(environmentId, tail);
    void tail.then(() => {
      if (this.locks.get(environmentId) === tail) this.locks.delete(environmentId);
    });
    return result;
  }
}

/** Deleted and released: nothing is left to converge. */
function settled(record: EnvironmentRecord): boolean {
  return record.desired === "deleted" && record.observed === "deleted";
}

function validQuery(query: { environmentId: unknown; workspaceId: unknown }): boolean {
  return typeof query.environmentId === "string" && ENVIRONMENT_ID.test(query.environmentId) && identifier(query.workspaceId);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
