import { mkdirSync } from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { sqliteNativeDriver } from "./driver.ts";
import { executeSQLiteNative } from "./execute.ts";
import type { SQLiteNativeObservation } from "./observation.ts";

export function openDatabase(filePath: string, observation?: SQLiteNativeObservation): Promise<sqlite3.Database> {
  return executeSQLiteNative(observation, "open", complete => {
    // Native SQLite needs Windows' extended path form for nested workspace storage.
    // Keep the ordinary path as the repository/pool identity and on other platforms.
    if (observation) mkdirSync(path.dirname(filePath), { recursive: true });
    const Database = observation ? sqliteNativeDriver.Database : sqlite3.Database;
    const db = new Database(path.toNamespacedPath(filePath), sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX, error => { complete(error, db); });
    const configure: (this: sqlite3.Database, option: "busyTimeout", value: number) => void = observation ? sqliteNativeDriver.configure : db.configure;
    configure.call(db, "busyTimeout", 10_000);
  });
}
