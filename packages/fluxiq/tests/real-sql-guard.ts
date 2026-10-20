import { readFileSync } from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { afterAll } from "vitest";
import { hasRealSqlMarker, REAL_SQL_MARKER } from "./test-groups.ts";

// A vitest setup file, run before every test file in every group: it counts the
// real SQLite databases the file opens and, after the file, fails it if it opened
// one without the real-SQL marker (`test-groups.ts`). The open itself always
// proceeds, so the file's own tests see exactly the driver they would without it.
//
// The driver is one CommonJS module object per worker process and every source
// opens through `new sqlite3.Database(...)`, so `Database` is wrapped once per
// process; each test file installs a fresh counter in the slot the wrapper reads.
// Databases opened in another process (a spawned server, a worker thread) are
// not seen.

export type Opened = { count: number; first?: string };

const SLOT = Symbol.for("fluxiq.tests.realSqlGuard");
const WRAPPED = Symbol.for("fluxiq.tests.realSqlGuard.wrapped");
const state = globalThis as typeof globalThis & { [SLOT]?: Opened };
const opened: Opened = { count: 0 };
state[SLOT] = opened;

const driver = sqlite3 as unknown as { Database: typeof sqlite3.Database & { [WRAPPED]?: true } };
if (!driver.Database[WRAPPED]) {
  driver.Database = new Proxy(driver.Database, {
    construct(target, args, newTarget) {
      const current = state[SLOT];
      if (current) {
        current.count += 1;
        current.first ??= String(args[0]);
      }
      return Reflect.construct(target, args, newTarget);
    },
    get(target, key, receiver) {
      return key === WRAPPED ? true : Reflect.get(target, key, receiver);
    }
  });
}

/** The error a file earns for opening a real database without the marker, if it did. */
export function unmarkedRealSqlError(file: string, source: string, opened: Readonly<Opened>): Error | undefined {
  if (opened.count === 0 || hasRealSqlMarker(source)) return undefined;
  return new Error(
    `${path.basename(file)} opened a real SQLite database ${opened.count} time(s) (first: ${opened.first}) without the real-SQL marker. ` +
      `Add the line "${REAL_SQL_MARKER}" to the top of the file, so \`pnpm test\` runs it in the low-concurrency real-SQL group ` +
      "(docs/architecture/code-structure.md, Test groups)."
  );
}

/** What the current test file has opened so far. */
export function realSqlOpened(): Readonly<Opened> {
  return state[SLOT] ?? opened;
}

afterAll((suite) => {
  const file = suite.file?.filepath;
  if (opened.count === 0 || !file) return;
  const error = unmarkedRealSqlError(file, readFileSync(file, "utf8"), opened);
  if (error) throw error;
});
