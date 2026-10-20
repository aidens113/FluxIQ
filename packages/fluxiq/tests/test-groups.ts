import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// The test groups `pnpm test` runs one after another (`scripts/vitest-groups.mjs`,
// `FLUXIQ_TEST_GROUP`), and the marker that puts a file in the real-SQL group.
//
// A test that opens a real SQLite database spends its time in hundreds of
// sequential driver round trips (one Flow create-and-save is about 1,450). Alone
// such a file passes in a second or two; inside the whole package run, beside
// fourteen hundred files collecting the framework at full worker concurrency, it
// ran 8 to 15 times slower, and every daily sweep from 2026-10-18 to 2026-10-20
// timed out a different handful of them at 15 s (t731, t739, t740). So those
// files run after the rest, in their own vitest run, with few workers.
//
// Membership is the marker in the file's own header, never a list kept here, and
// `real-sql-guard.ts` fails any file that opens a real database without it, so a
// new test cannot land in the wrong group unnoticed.

export const REAL_SQL_MARKER = "// @fluxiq-test-group real-sql";

/** Workers the real-SQL group runs with. Low on purpose: see above. */
export const REAL_SQL_MAX_WORKERS = 3;

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/u;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "coverage"]);
const GLOB_SYNTAX = /[*?[\]{}()!+@]/u;

/** True when the marker is a line of the file's leading comment block. */
export function hasRealSqlMarker(source: string): boolean {
  for (const raw of source.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line === REAL_SQL_MARKER) return true;
    if (line !== "" && !line.startsWith("//")) return false;
  }
  return false;
}

/** Every test file under `root` that carries the marker, as root-relative POSIX paths. */
export function findRealSqlTestFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && TEST_FILE.test(entry.name) && hasRealSqlMarker(readFileSync(full, "utf8"))) {
        found.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  const unsafe = found.find((file) => GLOB_SYNTAX.test(file));
  if (unsafe) throw new Error(`${unsafe}: a real-SQL test path is used as a vitest glob, so it cannot contain glob syntax; rename the file.`);
  return found.sort();
}

export type TestGroupOptions = { include?: string[]; exclude?: string[]; maxWorkers?: number; minWorkers?: number };

/**
 * The vitest options for one group. No group (a plain `vitest run <path>`) runs
 * whatever it is pointed at, in either group; `parallel` is every file without the
 * marker, `real-sql` every file with it.
 */
export function testGroupOptions(group: string | undefined, root: string, defaultExclude: readonly string[]): TestGroupOptions {
  if (group === undefined || group === "") return {};
  if (group === "parallel") return { exclude: [...defaultExclude, ...findRealSqlTestFiles(root)] };
  if (group === "real-sql") return { include: findRealSqlTestFiles(root), maxWorkers: REAL_SQL_MAX_WORKERS, minWorkers: 1 };
  throw new Error(`FLUXIQ_TEST_GROUP="${group}" is not a test group; use "parallel" or "real-sql", or leave it unset to run everything selected.`);
}
