import type { PlatformRecordEnvelope, PlatformRecordRepository, PlatformRecordScope } from "../repository/index.ts";

/** A tiny in-test repository: same contract as the database manager's, rows kept in a map. */
export class FakeRecordRepository implements PlatformRecordRepository {
  readonly rows = new Map<string, PlatformRecordEnvelope>();

  private key(id: string, scope?: PlatformRecordScope): string {
    return `${scope?.domainId ?? ""}|${id}`;
  }

  async list(scope?: PlatformRecordScope): Promise<PlatformRecordEnvelope[]> {
    return [...this.rows.values()].filter((row) => (row.scope.domainId ?? null) === (scope?.domainId ?? null)).map((row) => structuredClone(row));
  }

  async get(id: string, scope?: PlatformRecordScope): Promise<PlatformRecordEnvelope | null> {
    const row = this.rows.get(this.key(id, scope));
    return row === undefined ? null : structuredClone(row);
  }

  async put(record: PlatformRecordEnvelope): Promise<PlatformRecordEnvelope> {
    this.rows.set(this.key(record.id, record.scope), structuredClone(record));
    return structuredClone(record);
  }

  async delete(id: string, scope?: PlatformRecordScope): Promise<boolean> {
    return this.rows.delete(this.key(id, scope));
  }
}
