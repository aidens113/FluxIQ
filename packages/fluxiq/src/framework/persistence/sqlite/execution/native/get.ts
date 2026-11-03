import type sqlite3 from "sqlite3";
import { sqliteNativeDriver } from "./driver.ts";
import { executeSQLiteNative } from "./execute.ts";
import type { SQLiteNativeObservation } from "./observation.ts";

export function get<T>(db: sqlite3.Database, sql: string, params: unknown[] = [], observation?: SQLiteNativeObservation): Promise<T | undefined> {
  return executeSQLiteNative(observation, "get", complete => {
    const startedAt = observation ? sqliteNativeDriver.monotonic.call(sqliteNativeDriver.clock) : performance.now();
    const method = observation ? sqliteNativeDriver.get : db.get;
    method.call(db, sql, params, (error: Error | null, row: T | undefined) => {
      complete(error, row, { operation: "get", sql, elapsedMs: (observation ? sqliteNativeDriver.monotonic.call(sqliteNativeDriver.clock) : performance.now()) - startedAt, rowsReturned: error || row === undefined ? 0 : 1, ok: !error });
    });
  });
}
