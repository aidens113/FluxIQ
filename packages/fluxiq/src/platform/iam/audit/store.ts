import type { FluxIQRequestOrigin } from "@fluxiq/contracts/iam";
import type { IamAuditRecord } from "../types.ts";
import { IamAuditDatabase } from "./database.ts";
import { IamAuditDictionary } from "./dictionary.ts";
import type { IamAuditQuery } from "./query.ts";
import type { IamAuditExpiry } from "./expiry.ts";
import type { IamAuditRetention } from "./retention.ts";

const DAY_SECONDS = 86_400;
const DEFAULT_LIMIT = 100;
const SID_SEPARATOR = "\u001f";
const MAX_DECIMAL_REQUEST_ID = 15;
const ALLOW_COLUMNS = "t INTEGER NOT NULL, req INTEGER NOT NULL, p INTEGER NOT NULL, a INTEGER NOT NULL, r INTEGER NOT NULL, m INTEGER NOT NULL, o INTEGER NOT NULL, ip INTEGER";
const LONG_COLUMNS = `cat INTEGER NOT NULL, dec INTEGER NOT NULL, ${ALLOW_COLUMNS}`;
const CATEGORY_CODES = { deny: 0, "iam-change": 1 } as const;
const CATEGORY_NAMES = ["deny", "iam-change"] as const;

type Row = { t: number; req: number; p: number; a: number; r: number; m: number; o: number; ip: number | null; cat?: number; dec?: number };
type Encoded = { values: Array<number | null>; day: number };

/**
 * The compact SQLite decision audit.
 *
 * Schema (all integers; strings live once in `dict`):
 * - `dict(id INTEGER PRIMARY KEY, value TEXT UNIQUE)`: principal, action,
 *   newline-joined resource list, matched statement (`policy` or
 *   `policy` + U+001F + `sid`, `""` for implicit), origin, IP prefix, and any
 *   request id that is not a plain decimal number.
 * - `allow_YYYYMMDD(t, req, p, a, r, m, o, ip)`: one table per UTC day for
 *   category `allow`; no secondary index (the principal read scans one day's
 *   rows; see the report for the measurement). Expiry drops a whole table.
 * - `long(cat, dec, t, req, p, a, r, m, o, ip)` with an index on `t`: `deny`
 *   (cat 0) and `iam-change` (cat 1) rows; `dec` is 1 for allow, 0 for deny.
 *
 * Request id encoding: a canonical decimal id (`0` or digits without a leading
 * zero, at most 15 digits) is stored as that integer; any other id is interned
 * in `dict` and stored as the negative dictionary id. A per-process counter
 * rendered in decimal therefore costs one to three bytes and loses nothing.
 *
 * An `allow`-category record is stored with decision `allow` whatever its
 * `decision` field says; callers record denials as `deny` or `iam-change`.
 */
export class IamAuditStore {
  private readonly dayTables = new Set<number>();
  private tail: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly db: IamAuditDatabase,
    private readonly dictionary: IamAuditDictionary
  ) {}

  static async open(filePath: string): Promise<IamAuditStore> {
    const db = await IamAuditDatabase.open(filePath);
    const dictionary = await IamAuditDictionary.load(db);
    await db.exec(`CREATE TABLE IF NOT EXISTS long (${LONG_COLUMNS}); CREATE INDEX IF NOT EXISTS long_t ON long (t)`);
    const store = new IamAuditStore(db, dictionary);
    for (const day of await store.listDays()) store.dayTables.add(day);
    return store;
  }

  /** Writes `records` in one transaction; on failure nothing is written and the error is thrown. */
  write(records: readonly IamAuditRecord[]): Promise<void> {
    return this.serial(() => this.writeNow(records));
  }

  /** Reads records back in their JSON read/export form, newest first. */
  read(query: IamAuditQuery = {}): Promise<IamAuditRecord[]> {
    return this.serial(() => this.readNow(query));
  }

  /** Drops whole allow-day tables older than `allowDays` and deletes long rows older than `longDays`. */
  expire(nowSeconds: number, retention: IamAuditRetention): Promise<IamAuditExpiry> {
    return this.serial(() => this.expireNow(nowSeconds, retention));
  }

  /** The names of the allow-day tables that exist, oldest first. */
  allowTables(): readonly string[] {
    return [...this.dayTables].sort((a, b) => a - b).map(tableName);
  }

  close(): Promise<void> {
    return this.serial(() => this.db.close());
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async writeNow(records: readonly IamAuditRecord[]): Promise<void> {
    if (records.length === 0) return;
    const encoded = records.map((record) => this.encode(record));
    const newDays = [...new Set(encoded.filter((row) => row.day >= 0).map((row) => row.day))].filter((day) => !this.dayTables.has(day));
    try {
      await this.db.exec("BEGIN");
      for (const day of newDays) await this.db.exec(`CREATE TABLE IF NOT EXISTS ${tableName(day)} (${ALLOW_COLUMNS})`);
      for (const [id, value] of this.dictionary.pendingEntries()) await this.db.run("INSERT INTO dict (id, value) VALUES (?, ?)", [id, value]);
      for (const row of encoded) await this.insert(row);
      await this.db.exec("COMMIT");
    } catch (error) {
      await this.db.exec("ROLLBACK").catch(/* best-effort: no transaction is open when BEGIN itself failed */ () => undefined);
      this.dictionary.rollback();
      throw error;
    }
    this.dictionary.commit();
    for (const day of newDays) this.dayTables.add(day);
  }

  private insert(row: Encoded): Promise<void> {
    if (row.day >= 0) {
      return this.db.run(`INSERT INTO ${tableName(row.day)} (t, req, p, a, r, m, o, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, row.values);
    }
    return this.db.run("INSERT INTO long (cat, dec, t, req, p, a, r, m, o, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", row.values);
  }

  private encode(record: IamAuditRecord): Encoded {
    const dict = this.dictionary;
    const time = Math.floor(record.time);
    const shared = [
      time,
      this.encodeRequestId(record.requestId),
      dict.idOf(record.principal),
      dict.idOf(record.action),
      dict.idOf(record.resources.join("\n")),
      dict.idOf(encodeMatched(record.matched)),
      dict.idOf(record.origin),
      record.ipPrefix === null ? null : dict.idOf(record.ipPrefix)
    ];
    if (record.category === "allow") return { values: shared, day: Math.floor(time / DAY_SECONDS) };
    return { values: [CATEGORY_CODES[record.category], record.decision === "allow" ? 1 : 0, ...shared], day: -1 };
  }

  private encodeRequestId(requestId: string): number {
    const decimal = /^(0|[1-9]\d*)$/u.test(requestId) && requestId.length <= MAX_DECIMAL_REQUEST_ID;
    return decimal ? Number(requestId) : -this.dictionary.idOf(requestId);
  }

  private decodeRequestId(code: number): string {
    return code >= 0 ? String(code) : this.dictionary.valueOf(-code);
  }

  private async readNow(query: IamAuditQuery): Promise<IamAuditRecord[]> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const categories = query.categories ?? ["allow", "deny", "iam-change"];
    const principalId = query.principal === undefined ? undefined : this.dictionary.find(query.principal);
    if (query.principal !== undefined && principalId === undefined) return [];
    const since = query.since ?? Number.MIN_SAFE_INTEGER;
    const until = query.until ?? Number.MAX_SAFE_INTEGER;
    const filter = principalId === undefined ? "t >= ? AND t < ?" : "t >= ? AND t < ? AND p = ?";
    const params = principalId === undefined ? [since, until] : [since, until, principalId];
    const found: IamAuditRecord[] = [];
    if (categories.includes("allow")) {
      const days = [...this.dayTables].filter((day) => day * DAY_SECONDS < until && (day + 1) * DAY_SECONDS > since).sort((a, b) => b - a);
      for (const day of days) {
        const sql = `SELECT t, req, p, a, r, m, o, ip FROM ${tableName(day)} WHERE ${filter} ORDER BY t DESC, rowid DESC LIMIT ?`;
        const rows = await this.db.all<Row>(sql, [...params, limit]);
        for (const row of rows) found.push(this.decode(row, "allow", "allow"));
        if (found.length >= limit) break;
      }
    }
    const longCodes = categories.filter((category) => category !== "allow").map((category) => CATEGORY_CODES[category as "deny" | "iam-change"]);
    if (longCodes.length > 0) {
      const marks = longCodes.map(() => "?").join(",");
      const sql = `SELECT cat, dec, t, req, p, a, r, m, o, ip FROM long WHERE cat IN (${marks}) AND ${filter} ORDER BY t DESC, rowid DESC LIMIT ?`;
      const rows = await this.db.all<Row>(sql, [...longCodes, ...params, limit]);
      for (const row of rows) found.push(this.decode(row, CATEGORY_NAMES[row.cat ?? 0] ?? "deny", row.dec === 1 ? "allow" : "deny"));
    }
    found.sort((a, b) => b.time - a.time);
    return found.slice(0, limit);
  }

  private decode(row: Row, category: IamAuditRecord["category"], decision: "allow" | "deny"): IamAuditRecord {
    const dict = this.dictionary;
    const resources = dict.valueOf(row.r);
    return {
      category,
      time: row.t,
      requestId: this.decodeRequestId(row.req),
      principal: dict.valueOf(row.p),
      action: dict.valueOf(row.a),
      resources: resources === "" ? [] : resources.split("\n"),
      decision,
      matched: decodeMatched(dict.valueOf(row.m)),
      origin: dict.valueOf(row.o) as FluxIQRequestOrigin,
      ipPrefix: row.ip === null ? null : dict.valueOf(row.ip)
    };
  }

  private async expireNow(nowSeconds: number, retention: IamAuditRetention): Promise<IamAuditExpiry> {
    const oldestDay = Math.floor((nowSeconds - retention.allowDays * DAY_SECONDS) / DAY_SECONDS);
    const stale = [...this.dayTables].filter((day) => day < oldestDay);
    for (const day of stale) {
      await this.db.exec(`DROP TABLE IF EXISTS ${tableName(day)}`);
      this.dayTables.delete(day);
    }
    const before = await this.countLong();
    await this.db.run("DELETE FROM long WHERE t < ?", [nowSeconds - retention.longDays * DAY_SECONDS]);
    return { droppedTables: stale.length, deletedRows: before - (await this.countLong()) };
  }

  private async countLong(): Promise<number> {
    const rows = await this.db.all<{ n: number }>("SELECT COUNT(*) AS n FROM long");
    return rows[0]?.n ?? 0;
  }

  private async listDays(): Promise<number[]> {
    const rows = await this.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'allow_[0-9]*'");
    return rows.map((row) => dayOfTable(row.name));
  }
}

function encodeMatched(matched: IamAuditRecord["matched"]): string {
  if (matched === "implicit") return "";
  return matched.sid === null ? matched.policy : `${matched.policy}${SID_SEPARATOR}${matched.sid}`;
}

function decodeMatched(text: string): IamAuditRecord["matched"] {
  if (text === "") return "implicit";
  const separator = text.indexOf(SID_SEPARATOR);
  if (separator < 0) return { policy: text, sid: null };
  return { policy: text.slice(0, separator), sid: text.slice(separator + 1) };
}

function tableName(day: number): string {
  return `allow_${new Date(day * DAY_SECONDS * 1000).toISOString().slice(0, 10).replaceAll("-", "")}`;
}

function dayOfTable(name: string): number {
  const digits = name.slice("allow_".length);
  return Date.UTC(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)) - 1, Number(digits.slice(6, 8))) / (DAY_SECONDS * 1000);
}
