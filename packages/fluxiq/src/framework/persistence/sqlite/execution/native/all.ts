import type sqlite3 from "sqlite3";
import { sqliteNativeDriver } from "./driver.ts";
import { executeSQLiteNative } from "./execute.ts";
import type { SQLiteNativeObservation } from "./observation.ts";

export function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = [], observation?: SQLiteNativeObservation): Promise<T[]> {
  return executeSQLiteNative(observation, "all", complete => {
    const startedAt = observation ? sqliteNativeDriver.monotonic.call(sqliteNativeDriver.clock) : performance.now();
    const method = observation ? sqliteNativeDriver.all : db.all;
    method.call(db, sql, params, (error: Error | null, rows: T[]) => {
      complete(error, rows, { operation: "all", sql, elapsedMs: (observation ? sqliteNativeDriver.monotonic.call(sqliteNativeDriver.clock) : performance.now()) - startedAt, rowsReturned: error ? 0 : rows.length, ok: !error });
    });
  });
}
