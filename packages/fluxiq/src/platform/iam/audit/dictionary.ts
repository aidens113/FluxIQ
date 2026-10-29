import type { IamAuditDatabase } from "./database.ts";

/**
 * The audit's string dictionary: every distinct principal, action, resource
 * list, matched statement, origin and IP prefix is stored once and rows hold
 * its integer id. Loaded whole into memory at open (a deployment has
 * thousands of distinct values, not millions). New values are `pending` until
 * the transaction that uses them commits.
 */
export class IamAuditDictionary {
  private readonly byValue = new Map<string, number>();
  private readonly byId = new Map<number, string>();
  private pending: Array<[number, string]> = [];
  private next = 1;

  static async load(db: IamAuditDatabase): Promise<IamAuditDictionary> {
    await db.exec("CREATE TABLE IF NOT EXISTS dict (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE)");
    const dictionary = new IamAuditDictionary();
    const rows = await db.all<{ id: number; value: string }>("SELECT id, value FROM dict");
    for (const row of rows) {
      dictionary.remember(row.id, row.value);
      dictionary.next = Math.max(dictionary.next, row.id + 1);
    }
    return dictionary;
  }

  /** The id of `value`, allocating one (pending) when it is new. */
  idOf(value: string): number {
    const known = this.byValue.get(value);
    if (known !== undefined) return known;
    const id = this.next;
    this.next += 1;
    this.byValue.set(value, id);
    this.byId.set(id, value);
    this.pending.push([id, value]);
    return id;
  }

  /** The id of `value` if already stored, without allocating. */
  find(value: string): number | undefined {
    return this.byValue.get(value);
  }

  /** The string for `id`; an unknown id (a corrupt row) reads as the empty string. */
  valueOf(id: number): string {
    return this.byId.get(id) ?? "";
  }

  /** The values allocated since the last commit or rollback, for the caller to insert. */
  pendingEntries(): ReadonlyArray<[number, string]> {
    return this.pending;
  }

  commit(): void {
    this.pending = [];
  }

  /** Forgets the pending values after a failed transaction, so their ids are reused. */
  rollback(): void {
    for (const [id, value] of this.pending) {
      this.byValue.delete(value);
      this.byId.delete(id);
    }
    if (this.pending.length > 0) this.next = Math.min(...this.pending.map(([id]) => id));
    this.pending = [];
  }

  private remember(id: number, value: string): void {
    this.byValue.set(value, id);
    this.byId.set(id, value);
  }
}
