import type { JsonObject } from "../../../core/index.ts";
import { createRecord, type Repository } from "../../database-manager/index.ts";
import type { SecretKeyRecord } from "../types.ts";
import { isSecretKeyRecord } from "./record-guard.ts";
import { RecordWriteQueue } from "./record-write-queue.ts";
import type { SecretValueSealer } from "./value-sealer.ts";

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

  constructor(options: { repository: Repository | undefined; kind: string; sealer: SecretValueSealer }) {
    this.repository = options.repository;
    this.kind = options.kind;
    this.sealer = options.sealer;
  }

  /** Loads once; concurrent first callers share the read, and a failed read is retried by the next caller. */
  load(): Promise<void> {
    this.loading ??= this.readRecords().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
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
  }

  /** Queues a write of the record's in-memory state; skipped if the record is gone when the write runs. */
  persist(id: string): Promise<void> {
    const repository = this.repository;
    if (!repository) return Promise.resolve();
    return this.writes.enqueue(id, async () => {
      const current = this.records.get(id);
      if (current) await repository.put(createRecord({ id: current.id, kind: this.kind, data: current as unknown as JsonObject }));
    });
  }

  /** Removes a record from memory now, and from the repository after its queued writes. */
  delete(id: string): Promise<boolean> {
    const deleted = this.records.delete(id);
    const repository = this.repository;
    if (!repository) return Promise.resolve(deleted);
    return this.writes.enqueue(id, () => repository.delete(id, {}));
  }

  private async readRecords(): Promise<void> {
    if (!this.repository) return;
    const records = await this.repository.list({});
    this.records.clear();
    for (const item of records) {
      if (isSecretKeyRecord(item.data, this.sealer)) this.records.set(item.id, item.data);
    }
  }
}
