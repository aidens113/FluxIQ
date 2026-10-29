import type { IamRecordEnvelope, IamRecordRepository, IamRecordScope } from "../../iam/index.ts";
import type { PlatformRecordRepository } from "../../store/index.ts";

/** An in-memory record repository keyed by scope and id; it keeps each envelope's kind, as the IAM store needs. */
export class MemoryRecordRepository implements PlatformRecordRepository, IamRecordRepository {
  private readonly rows = new Map<string, IamRecordEnvelope>();

  private key(id: string, scope: IamRecordScope = {}): string {
    return JSON.stringify([scope.domainId ?? null, id]);
  }

  async list(scope: IamRecordScope = {}): Promise<IamRecordEnvelope[]> {
    const domainId = scope.domainId ?? null;
    return [...this.rows.values()].filter((row) => (row.scope.domainId ?? null) === domainId).map((row) => structuredClone(row));
  }

  async get(id: string, scope: IamRecordScope = {}): Promise<IamRecordEnvelope | null> {
    const row = this.rows.get(this.key(id, scope));
    return row === undefined ? null : structuredClone(row);
  }

  async put(record: IamRecordEnvelope): Promise<IamRecordEnvelope> {
    this.rows.set(this.key(record.id, record.scope), structuredClone(record));
    return structuredClone(record);
  }

  async delete(id: string, scope: IamRecordScope = {}): Promise<boolean> {
    return this.rows.delete(this.key(id, scope));
  }

  /** Every row of every scope, in key order: what a test compares before and after a call. */
  snapshot(): [string, IamRecordEnvelope][] {
    return [...this.rows.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([key, row]) => [key, structuredClone(row)]);
  }
}
