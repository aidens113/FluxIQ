import type sqlite3 from "sqlite3";
import { sqliteNativeDriver } from "./driver.ts";
import { executeSQLiteNative } from "./execute.ts";
import type { SQLiteNativeObservation } from "./observation.ts";

export function exec(db: sqlite3.Database, script: string, observation?: SQLiteNativeObservation): Promise<void> {
  return executeSQLiteNative(observation, "exec", complete => {
    const startedAt = observation ? sqliteNativeDriver.monotonic.call(sqliteNativeDriver.clock) : performance.now();
    const method = observation ? sqliteNativeDriver.exec : db.exec;
    method.call(db, script, (error: Error | null) => {
      complete(error, undefined, { operation: "run", sql: script, elapsedMs: (observation ? sqliteNativeDriver.monotonic.call(sqliteNativeDriver.clock) : performance.now()) - startedAt, rowsChanged: 0, ok: !error });
    });
  });
}
