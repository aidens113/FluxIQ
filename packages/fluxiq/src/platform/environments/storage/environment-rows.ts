import type { SQLiteTransaction } from "../../../framework/persistence/repository/sqlite-repository.ts";
import type { EnvironmentOperationRecord, EnvironmentRecord } from "../model/index.ts";

type IndexRow = { environmentId: string };

const KIND = "platform.environments";

/**
 * Transaction-local rows in the repository's JSON table:
 * `environment/<id>` holds the record, `operation/<id>/<operation>` each
 * accepted operation, and `account/<account>/<id>` and
 * `workspace/<workspace>/<id>` index the record for the deletion cascades.
 * Every key part is URI-encoded, so no identifier can reach another's prefix.
 */
export class EnvironmentRows {
  constructor(private readonly transaction: SQLiteTransaction, private readonly table: string) {}

  getRecord(environmentId: string): Promise<EnvironmentRecord | null> {
    return this.get<EnvironmentRecord>(key("environment", environmentId));
  }

  getOperation(environmentId: string, operationId: string): Promise<EnvironmentOperationRecord | null> {
    return this.get<EnvironmentOperationRecord>(key("operation", environmentId, operationId));
  }

  async putRecord(record: EnvironmentRecord, nowMs: number): Promise<void> {
    await this.put(key("environment", record.environmentId), record, nowMs);
    await this.put(key("account", record.accountId, record.environmentId), { environmentId: record.environmentId }, nowMs);
    await this.put(key("workspace", record.workspaceId, record.environmentId), { environmentId: record.environmentId }, nowMs);
  }

  async putOperation(operation: EnvironmentOperationRecord, nowMs: number): Promise<void> {
    await this.put(key("operation", operation.environmentId, operation.operationId), operation, nowMs);
  }

  async listRecords(): Promise<EnvironmentRecord[]> {
    return this.list<EnvironmentRecord>(`${key("environment")}/`);
  }

  async listIndexed(index: "account" | "workspace", ownerId: string): Promise<EnvironmentRecord[]> {
    const rows = await this.list<IndexRow>(`${key(index, ownerId)}/`);
    const records: EnvironmentRecord[] = [];
    for (const row of rows) {
      const record = await this.getRecord(row.environmentId);
      const owner = record === null ? null : index === "account" ? record.accountId : record.workspaceId;
      if (record === null || owner !== ownerId) throw new Error(`Environment ${index} index is inconsistent`);
      records.push(record);
    }
    return records;
  }

  /** Deletes the record, its operations and its index rows; false when there was no record. */
  async purge(environmentId: string): Promise<boolean> {
    const record = await this.getRecord(environmentId);
    if (record === null) return false;
    const operations = `${key("operation", environmentId)}/`;
    await this.transaction.run(`DELETE FROM ${this.table} WHERE id >= ? AND id < ?`, [operations, `${operations}￿`]);
    const ids = [key("environment", environmentId), key("account", record.accountId, environmentId), key("workspace", record.workspaceId, environmentId)];
    await this.transaction.run(`DELETE FROM ${this.table} WHERE id IN (?, ?, ?)`, ids);
    return true;
  }

  private async get<T>(id: string): Promise<T | null> {
    const row = await this.transaction.get<{ data: string }>(`SELECT data FROM ${this.table} WHERE id = ?`, [id]);
    return row === undefined ? null : JSON.parse(row.data) as T;
  }

  private async list<T>(prefix: string): Promise<T[]> {
    const rows = await this.transaction.all<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE id >= ? AND id < ? ORDER BY id`,
      [prefix, `${prefix}￿`]
    );
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  private async put(id: string, value: unknown, nowMs: number): Promise<void> {
    await this.transaction.run(
      `INSERT INTO ${this.table} (id, kind, data, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at_ms = excluded.updated_at_ms`,
      [id, KIND, JSON.stringify(value), nowMs, nowMs]
    );
  }
}

function key(kind: string, ...parts: string[]): string {
  if (parts.some((part) => typeof part !== "string" || part.length === 0 || part.trim() !== part)) {
    throw new TypeError("Environment record identifiers must be nonempty strings");
  }
  return parts.length === 0 ? kind : `${kind}/${parts.map(encodeURIComponent).join("/")}`;
}
