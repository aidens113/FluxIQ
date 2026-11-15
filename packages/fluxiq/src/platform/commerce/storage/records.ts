import type { SQLiteTransaction } from "../../../framework/persistence/repository/sqlite-repository.ts";

/** Transaction-local records in the repository's existing JSON table. */
export class CommerceRecords {
  constructor(private readonly transaction: SQLiteTransaction, private readonly table: string) {}

  async get<T>(id: string): Promise<T | null> {
    const row = await this.transaction.get<{ data: string }>(`SELECT data FROM ${this.table} WHERE id = ?`, [id]);
    return row === undefined ? null : JSON.parse(row.data) as T;
  }

  async list<T>(prefix: string): Promise<T[]> {
    const rows = await this.transaction.all<{ data: string }>(
      `SELECT data FROM ${this.table} WHERE id >= ? AND id < ? ORDER BY id`,
      [prefix, `${prefix}\uffff`]
    );
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  async put(id: string, value: unknown, nowMs: number): Promise<void> {
    await this.transaction.run(
      `INSERT INTO ${this.table} (id, kind, data, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at_ms = excluded.updated_at_ms`,
      [id, "platform.commerce", JSON.stringify(value), nowMs, nowMs]
    );
  }
}

export function commerceRecordKey(kind: string, ...parts: string[]): string {
  if (parts.some((part) => typeof part !== "string" || part.length === 0 || part.trim() !== part)) {
    throw new TypeError("Commerce record identifiers must be nonempty strings");
  }
  return `${kind}/${parts.map(encodeURIComponent).join("/")}`;
}
