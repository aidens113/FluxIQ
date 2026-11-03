import type sqlite3 from "sqlite3";
import { sqliteNativeDriver } from "./driver.ts";
import { executeSQLiteNative } from "./execute.ts";
import type { SQLiteNativeObservation } from "./observation.ts";
import type { SQLiteRunResult } from "./run-result.ts";

export function run(db: sqlite3.Database, sql: string, params: unknown[] = [], observation?: SQLiteNativeObservation): Promise<SQLiteRunResult> {
  return executeSQLiteNative(observation, "run", complete => {
    const startedAt = observation ? sqliteNativeDriver.monotonic.call(sqliteNativeDriver.clock) : performance.now();
    const method = observation ? sqliteNativeDriver.run : db.run;
    method.call(db, sql, params, function onRun(this: sqlite3.RunResult, error: Error | null) {
      complete(error, { changes: this.changes, lastID: this.lastID }, { operation: "run", sql, elapsedMs: (observation ? sqliteNativeDriver.monotonic.call(sqliteNativeDriver.clock) : performance.now()) - startedAt, rowsChanged: error ? 0 : this.changes, ok: !error });
    });
  });
}
