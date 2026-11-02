import path from "node:path";
import type { JsonObject } from "../../../core/index.ts";
import type { SQLiteTransaction } from "../sqlite/index.ts";
import { sqliteStateForPath } from "./sqlite-path.ts";

export class ProgramDocumentTransaction {
  constructor(
    private readonly rootDir: string,
    private readonly kind: string,
    private readonly transaction: SQLiteTransaction,
  ) {}

  async read<T extends JsonObject>(filePath: string, empty: () => T): Promise<T> {
    const state = this.state(filePath);
    const row = await this.transaction.get<{ data: string }>(`select data from ${state.repository.tableName} where id = ?`, [state.id]);
    return row ? (JSON.parse(row.data) as T) : empty();
  }

  async write<T extends JsonObject>(filePath: string, data: T): Promise<T> {
    const state = this.state(filePath);
    const now = Date.now();
    await this.transaction.run(
      `
      insert into ${state.repository.tableName} (id, kind, data, created_at_ms, updated_at_ms)
      values (?, ?, ?, ?, ?)
      on conflict(id) do update set data = excluded.data, updated_at_ms = excluded.updated_at_ms
    `,
      [state.id, this.kind, JSON.stringify(data), now, now],
    );
    return data;
  }

  async deletePath(targetPath: string): Promise<void> {
    const state = this.state(targetPath);
    if (path.extname(targetPath).toLowerCase() === ".json") {
      await this.transaction.run(`delete from ${state.repository.tableName} where id = ?`, [state.id]);
      return;
    }
    await this.transaction.run(`delete from ${state.repository.tableName} where id = ? or id like ?`, [state.id, `${state.id.replace(/\/$/, "")}/%`]);
  }

  private state(filePath: string): NonNullable<ReturnType<typeof sqliteStateForPath>> {
    const state = sqliteStateForPath(filePath);
    if (!state || state.rootDir !== this.rootDir || state.kind !== this.kind) {
      throw new Error(`Program document transaction cannot cross storage owners: ${filePath}`);
    }
    return state;
  }
}
