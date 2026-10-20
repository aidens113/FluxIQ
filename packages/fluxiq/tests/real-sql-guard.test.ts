// @fluxiq-test-group real-sql
// Guards `real-sql-guard.ts`, the setup file that fails a test file for opening a
// real SQLite database without the real-SQL marker. This file opens one itself,
// so it carries the marker and runs in the real-SQL group.

import sqlite3 from "sqlite3";
import { describe, expect, it } from "vitest";
import { realSqlOpened, unmarkedRealSqlError } from "./real-sql-guard.ts";
import { REAL_SQL_MARKER } from "./test-groups.ts";

function close(database: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => database.close((error) => (error ? reject(error) : resolve())));
}

describe("the real-SQL guard", () => {
  it("counts every database the test file opens through the driver, and leaves the database working", async () => {
    const before = realSqlOpened().count;
    const database = await new Promise<sqlite3.Database>((resolve, reject) => {
      const opened = new sqlite3.Database(":memory:", (error) => (error ? reject(error) : resolve(opened)));
    });
    expect(database).toBeInstanceOf(sqlite3.Database);
    const row = await new Promise<{ one: number }>((resolve, reject) => database.get("select 1 as one", (error, value: { one: number }) => (error ? reject(error) : resolve(value))));
    expect(row.one).toBe(1);
    await close(database);
    expect(realSqlOpened().count).toBe(before + 1);
    expect(realSqlOpened().first).toBeDefined();
  });

  it("fails a file that opened a real database without the marker, naming the file and the marker to add", () => {
    const error = unmarkedRealSqlError("/repo/src/tests/store.test.ts", "import x from \"y\";\n", { count: 3, first: "/tmp/project.sqlite" });
    expect(error?.message).toContain("store.test.ts opened a real SQLite database 3 time(s) (first: /tmp/project.sqlite)");
    expect(error?.message).toContain(REAL_SQL_MARKER);
  });

  it("passes a marked file, and a file that opened nothing", () => {
    expect(unmarkedRealSqlError("/repo/a.test.ts", `${REAL_SQL_MARKER}\n`, { count: 2, first: ":memory:" })).toBeUndefined();
    expect(unmarkedRealSqlError("/repo/a.test.ts", "", { count: 0 })).toBeUndefined();
  });
});
