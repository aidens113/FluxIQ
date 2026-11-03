import type { JsonObject } from "../../../core/index.ts";
import type { Repository } from "../../../framework/persistence/contracts/index.ts";
import { createRecord } from "../../../framework/persistence/sqlite/index.ts";
import type { SecretKeyRecord } from "../types.ts";
import { isSecretKeyRecord } from "./record-guard.ts";
import { RecordWriteQueue } from "./record-write-queue.ts";
import type { SecretValueSealer } from "./value-sealer.ts";
import type { RepositoryExecutionPorts } from "../../../framework/persistence/sqlite/execution/index.ts";
import type { SecretKeysExecutionInvocation } from "./execution/index.ts";
import { invokeSecretKeysRepository, SecretKeysRecordView } from "./execution/store/index.ts";

/**
 * The Secret Keys records, in memory and in their repository. Loads once, with
 * concurrent first callers sharing the read, skipping records the read guard
 * rejects. A repository write sends the record's in-memory state as it is when
 * the write runs, through a per-record queue, so writes land in the order memory
 * changed and a queued write cannot resurrect a deleted record. Assumes one
 * process writes the repository.
 */
export class SecretKeyStore {
  private readonly records = new Map<string, SecretKeyRecord>();
  private readonly writes = new RecordWriteQueue();
  private readonly repository: Repository | undefined;
  private readonly kind: string;
  private readonly sealer: SecretValueSealer;
  private loading: Promise<void> | undefined;
  private loadedVerified = false;
  private observedLoadFailed = false;
  private cacheGeneration: object = Object.freeze({});
  private verifiedView: SecretKeysRecordView | undefined;
  private readonly repositoryExecution: RepositoryExecutionPorts<JsonObject> | undefined;
  private readonly nativeList: RepositoryExecutionPorts<JsonObject>["list"] | undefined;
  private readonly nativePut: RepositoryExecutionPorts<JsonObject>["put"] | undefined;
  private readonly recordParameters: SecretValueSealer["parametersOf"];

  constructor(options: { repository: Repository | undefined; repositoryExecution?: RepositoryExecutionPorts<JsonObject> | undefined; kind: string; sealer: SecretValueSealer }) {
    this.repository = options.repository;
    this.kind = options.kind;
    this.sealer = options.sealer;
    this.recordParameters = options.sealer.parametersOf;
    this.repositoryExecution = options.repositoryExecution;
    if (this.repositoryExecution && this.repositoryExecution.original !== this.repository) throw new Error("secret.execution.repository_owner_mismatch");
    this.nativeList = this.repositoryExecution?.list;
    this.nativePut = this.repositoryExecution?.put;
  }

  /** Loads once; concurrent first callers share the read, and a failed read is retried by the next caller. */
  load(invocation?: SecretKeysExecutionInvocation): Promise<void> {
    if (invocation && this.observedLoadFailed) return Promise.reject(new Error("secret.execution.observed_load_unverified"));
    this.loading ??= this.readRecords(invocation).catch((error: unknown) => {
      this.loading = undefined;
      this.loadedVerified = false;
      if (invocation) this.observedLoadFailed = true;
      throw error;
    });
    if (!invocation) return this.loading;
    return this.loading.then(async () => {
      invocation.assert();
      if (this.loadedVerified && this.repository && !this.verifiedView?.matches(this.records)) this.loadedVerified = false;
      if (!this.loadedVerified) await this.revalidate(invocation);
    }).catch((error: unknown) => {
      this.observedLoadFailed = true;
      throw error;
    });
  }

  get(id: string): SecretKeyRecord | undefined {
    return this.records.get(id);
  }

  require(id: string): SecretKeyRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown secret key: ${id}`);
    return record;
  }

  list(): SecretKeyRecord[] {
    return [...this.records.values()];
  }

  /** The records a user's password may open: version 1 seals, unstamped version 2 seals, and version 2 seals stamped for this user. */
  sealedFor(userId: string): SecretKeyRecord[] {
    return this.list().filter(({ sealed }) => sealed.version === 1 || sealed.sealedByUserId === undefined || sealed.sealedByUserId === userId);
  }

  /** Replaces a record in memory; `persist` writes it. */
  set(record: SecretKeyRecord): void {
    this.records.set(record.id, record);
    this.cacheGeneration = Object.freeze({});
    this.loadedVerified = this.repository === undefined;
  }

  /** Queues a write of the record's in-memory state; skipped if the record is gone when the write runs. */
  persist(id: string, invocation?: SecretKeysExecutionInvocation): Promise<void> {
    const repository = this.repository;
    if (!repository) return Promise.resolve();
    this.loadedVerified = false;
    // This operation's real native child was entered before the sole queue receives it.
    const put = invocation ? repository.put : undefined;
    const native = this.repositoryExecution;
    const nativePut = this.nativePut;
    invocation?.assert();
    const queued = this.writes.enqueue(id, async () => {
      const current = this.records.get(id);
      if (!current) return;
      const record = createRecord({ id: current.id, kind: this.kind, data: current as unknown as JsonObject });
      if (!invocation) await repository.put(record);
      else if (native && nativePut) await invokeSecretKeysRepository(invocation, { receiver: native, callback: nativePut, args: [record, invocation.observation] });
      else if (put) await invocation.invoke({ receiver: repository, callback: put, args: [record] });
      else throw new Error("secret.execution.repository_callback_missing");
    });
    if (!invocation) return queued;
    return queued.catch((error: unknown) => {
      this.observedLoadFailed = true;
      throw error;
    });
  }

  /** Removes a record from memory now, and from the repository after its queued writes. */
  delete(id: string): Promise<boolean> {
    const deleted = this.records.delete(id);
    if (deleted) this.cacheGeneration = Object.freeze({});
    if (deleted) this.loadedVerified = this.repository === undefined;
    const repository = this.repository;
    if (!repository) return Promise.resolve(deleted);
    return this.writes.enqueue(id, () => repository.delete(id, {}));
  }

  private async readRecords(invocation?: SecretKeysExecutionInvocation): Promise<void> {
    const repository = this.repository;
    if (!repository) {
      this.loadedVerified = true;
      return;
    }
    const records = await this.repositoryRecords(invocation);
    if (invocation && this.sealer.parametersOf !== this.recordParameters) throw new Error("secret.execution.sealer_unverified");
    this.records.clear();
    for (const item of records) if (isSecretKeyRecord(item.data, this.sealer)) this.records.set(item.id, item.data);
    this.cacheGeneration = Object.freeze({});
    this.loadedVerified = invocation !== undefined;
    this.verifiedView = invocation ? new SecretKeysRecordView(this.records) : undefined;
  }

  private async repositoryRecords(invocation?: SecretKeysExecutionInvocation) {
    const repository = this.repository;
    if (!repository) return [];
    const list = repository.list;
    const native = this.repositoryExecution;
    const nativeList = this.nativeList;
    const scope = {};
    return !invocation ? await list.call(repository, scope)
      : native && nativeList ? await invokeSecretKeysRepository(invocation, { receiver: native, callback: nativeList, args: [scope, invocation.observation] })
      : await invocation.invoke({ receiver: repository, callback: list, args: [scope] });
  }

  private async revalidate(invocation: SecretKeysExecutionInvocation): Promise<void> {
    if (this.observedLoadFailed || !this.repositoryExecution || !this.nativeList) throw new Error("secret.execution.cached_load_unverified");
    // Await only the original write prefix. Neither this barrier nor the old load is evidence.
    await this.writes.prefix();
    invocation.assert();
    const generation = this.cacheGeneration;
    const frontier = this.writes.frontier();
    const expected = new SecretKeysRecordView(this.records);
    const records = await this.repositoryRecords(invocation);
    invocation.assert();
    if (this.sealer.parametersOf !== this.recordParameters) throw new Error("secret.execution.sealer_unverified");
    const guarded = new Map<string, SecretKeyRecord>();
    for (const item of records) if (isSecretKeyRecord(item.data, this.sealer)) guarded.set(item.id, item.data);
    if (generation !== this.cacheGeneration || frontier !== this.writes.frontier() || !expected.matches(this.records) || !expected.matches(guarded)) throw new Error("secret.execution.cache_revalidation_changed");
    this.loadedVerified = true;
    this.verifiedView = expected;
  }
}
