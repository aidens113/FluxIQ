import type { SQLiteTransaction } from "../../../framework/persistence/repository/sqlite-repository.ts";

/** Transaction-local access to the existing repository JSON table. Table name is host-owned. */
export class AppRecords {
  constructor(private readonly transaction: SQLiteTransaction, private readonly table: string) {}

  async get(id: string): Promise<unknown | null> {
    const row = await this.transaction.get<{ data: string }>(`SELECT data FROM ${this.table} WHERE id = ?`, [id]);
    return row === undefined ? null : JSON.parse(row.data) as unknown;
  }

  async list(prefix: string): Promise<unknown[]> {
    const rows = await this.transaction.all<{ data: string }>(`SELECT data FROM ${this.table} WHERE id >= ? AND id < ? ORDER BY id`, [prefix, `${prefix}\uffff`]);
    return rows.map((row) => JSON.parse(row.data) as unknown);
  }

  async insert(id: string, value: unknown, nowMs: number): Promise<void> {
    await this.transaction.run(`INSERT INTO ${this.table} (id, kind, data, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?)`, [id, "platform.apps", JSON.stringify(value), nowMs, nowMs]);
  }

  async replace(id: string, value: unknown, nowMs: number): Promise<void> {
    await this.transaction.run(`UPDATE ${this.table} SET data = ?, updated_at_ms = ? WHERE id = ?`, [JSON.stringify(value), nowMs, id]);
  }
}
