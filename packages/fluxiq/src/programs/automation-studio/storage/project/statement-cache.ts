import sqlite3 from "sqlite3";
import { recordSqlPerformance } from "../../../_shared/performance-metrics.ts";

export type AutomationStudioCachedSqlRunResult = { changes: number; lastID: number };

// Statements one connection keeps prepared at most; the least recently used is
// finalized past it. Bounded because SQL built with a variable number of
// placeholders would otherwise grow the cache for as long as the connection is
// held open.
const MAX_CACHED_STATEMENTS = 128;

// A `run` is cached only when it can only step to completion: plain DML without
// RETURNING, and transaction control. Anything else (a pragma, a select or an
// `insert ... returning` sent through `run`) may stop on a row, and a statement
// left on a row stays active on the connection, holding its read snapshot until
// it is reset. Such statements take the uncached path, as before.
const CACHEABLE_RUN = /^\s*(insert|update|delete|replace|begin|commit|rollback|savepoint|release)\b/i;
const RETURNING = /\breturning\b/i;
// A statement with no bound values keeps the values of its previous call, where
// a fresh statement binds NULL; so a call with no values is cached only for SQL
// that has no parameter markers at all.
const PARAMETER_MARKER = /[?$:@]/;

/**
 * Every statement one project connection runs, in the order the callers issued
 * them, with `run` and `all` statements kept prepared for reuse.
 *
 * Preparing a statement is a round trip to the SQLite worker thread of its own,
 * so a statement the connection has already prepared is stepped again rather
 * than prepared again. `run` and `all` always step a statement to completion,
 * which leaves it holding nothing on the connection while it waits in the cache.
 * `get` is never cached: it stops on the first row and the binding leaves the
 * statement un-reset, which would hold a read snapshot open on the connection,
 * and the binding's reset bypasses the connection's queue.
 *
 * A prepared statement that has already been prepared is stepped by the binding
 * without waiting behind the connection's serialized queue, so every call here
 * waits for the previous one to finish: statements reach SQLite in the order
 * they were issued, as they did when each was prepared afresh. A statement that
 * fails is finalized and dropped, so the cache never reuses one in an error
 * state. `finalizeAll` must run before the connection is closed; SQLite refuses
 * to close a connection that still has prepared statements.
 */
export class AutomationStudioStatementCache {
  private readonly statements = new Map<string, sqlite3.Statement>();
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly handle: sqlite3.Database) {}

  run(sql: string, params: readonly unknown[]): Promise<AutomationStudioCachedSqlRunResult> {
    const startedAt = performance.now();
    const cacheable = CACHEABLE_RUN.test(sql) && !RETURNING.test(sql) && canBind(sql, params);
    return this.inOrder(async () => {
      try {
        const result = cacheable ? await this.runCached(sql, params) : await runUncached(this.handle, sql, params);
        recordSqlPerformance({ operation: "run", sql, elapsedMs: performance.now() - startedAt, rowsChanged: result.changes, ok: true });
        return result;
      } catch (error) {
        recordSqlPerformance({ operation: "run", sql, elapsedMs: performance.now() - startedAt, rowsChanged: 0, ok: false });
        throw error;
      }
    });
  }

  all<T>(sql: string, params: readonly unknown[]): Promise<T[]> {
    const startedAt = performance.now();
    const cacheable = canBind(sql, params);
    return this.inOrder(async () => {
      try {
        const rows = cacheable ? await this.allCached<T>(sql, params) : await allUncached<T>(this.handle, sql, params);
        recordSqlPerformance({ operation: "all", sql, elapsedMs: performance.now() - startedAt, rowsReturned: rows.length, ok: true });
        return rows;
      } catch (error) {
        recordSqlPerformance({ operation: "all", sql, elapsedMs: performance.now() - startedAt, rowsReturned: 0, ok: false });
        throw error;
      }
    });
  }

  get<T>(sql: string, params: readonly unknown[]): Promise<T | undefined> {
    const startedAt = performance.now();
    return this.inOrder(() => new Promise<T | undefined>((resolve, reject) => {
      this.handle.get(sql, [...params], (error, row: T | undefined) => {
        recordSqlPerformance({ operation: "get", sql, elapsedMs: performance.now() - startedAt, rowsReturned: error || row === undefined ? 0 : 1, ok: !error });
        if (error) reject(error);
        else resolve(row);
      });
    }));
  }

  exec(script: string): Promise<void> {
    const startedAt = performance.now();
    return this.inOrder(() => new Promise<void>((resolve, reject) => {
      this.handle.exec(script, (error) => {
        recordSqlPerformance({ operation: "run", sql: script, elapsedMs: performance.now() - startedAt, rowsChanged: 0, ok: !error });
        if (error) reject(error);
        else resolve();
      });
    }));
  }

  /** Finalizes every cached statement once the calls already issued have finished. */
  finalizeAll(): Promise<void> {
    return this.inOrder(async () => {
      const statements = [...this.statements.values()];
      this.statements.clear();
      await Promise.all(statements.map(finalize));
    });
  }

  private inOrder<T>(call: () => Promise<T>): Promise<T> {
    const result = this.tail.then(call);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async runCached(sql: string, params: readonly unknown[]): Promise<AutomationStudioCachedSqlRunResult> {
    const statement = await this.statement(sql);
    try {
      return await new Promise((resolve, reject) => {
        statement.run([...params], function onRun(error) {
          if (error) reject(error);
          else resolve({ changes: this.changes, lastID: this.lastID });
        });
      });
    } catch (error) {
      await this.discard(sql, statement);
      throw error;
    }
  }

  private async allCached<T>(sql: string, params: readonly unknown[]): Promise<T[]> {
    const statement = await this.statement(sql);
    try {
      return await new Promise((resolve, reject) => {
        statement.all([...params], (error, rows: T[]) => {
          if (error) reject(error);
          else resolve(rows);
        });
      });
    } catch (error) {
      await this.discard(sql, statement);
      throw error;
    }
  }

  private async statement(sql: string): Promise<sqlite3.Statement> {
    const cached = this.statements.get(sql);
    if (cached) {
      // Re-inserted so that the map's order is least recently used first.
      this.statements.delete(sql);
      this.statements.set(sql, cached);
      return cached;
    }
    const statement = await prepare(this.handle, sql);
    this.statements.set(sql, statement);
    if (this.statements.size > MAX_CACHED_STATEMENTS) {
      const [oldestSql, oldest] = this.statements.entries().next().value as [string, sqlite3.Statement];
      this.statements.delete(oldestSql);
      await finalize(oldest);
    }
    return statement;
  }

  private async discard(sql: string, statement: sqlite3.Statement): Promise<void> {
    if (this.statements.get(sql) === statement) this.statements.delete(sql);
    await finalize(statement);
  }
}

function canBind(sql: string, params: readonly unknown[]): boolean {
  return params.length > 0 || !PARAMETER_MARKER.test(sql);
}

// The binding's Statement constructor calls back on success as well as on
// failure, which `Database#prepare` does not (it reports only an error); the
// typings omit the constructor's arguments.
const PreparedStatement = sqlite3.Statement as unknown as new (handle: sqlite3.Database, sql: string, callback: (error: Error | null) => void) => sqlite3.Statement;

function prepare(handle: sqlite3.Database, sql: string): Promise<sqlite3.Statement> {
  return new Promise((resolve, reject) => {
    const statement = new PreparedStatement(handle, sql, (error) => {
      if (error) reject(error);
      else resolve(statement);
    });
  });
}

function finalize(statement: sqlite3.Statement): Promise<void> {
  return new Promise((resolve) => statement.finalize(() => resolve()));
}

function runUncached(handle: sqlite3.Database, sql: string, params: readonly unknown[]): Promise<AutomationStudioCachedSqlRunResult> {
  return new Promise((resolve, reject) => {
    handle.run(sql, [...params], function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function allUncached<T>(handle: sqlite3.Database, sql: string, params: readonly unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    handle.all(sql, [...params], (error, rows: T[]) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}
