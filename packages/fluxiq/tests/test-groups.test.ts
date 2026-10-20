import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findRealSqlTestFiles, hasRealSqlMarker, REAL_SQL_MARKER, REAL_SQL_MAX_WORKERS, testGroupOptions } from "./test-groups.ts";

// Guards the test groups `pnpm test` runs in turn (`test-groups.ts`): membership
// comes from the marker in a file's header and nothing else, and every file is
// in exactly one of the two groups.

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-test-groups-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function file(relative: string, source: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), source);
}

describe("the real-SQL marker", () => {
  it("counts only as a line of the file's leading comment block", () => {
    expect(hasRealSqlMarker(`${REAL_SQL_MARKER}\nimport x from "y";\n`)).toBe(true);
    expect(hasRealSqlMarker(`// Why this test exists.\n\r\n${REAL_SQL_MARKER}\r\nimport x from "y";\n`)).toBe(true);
    expect(hasRealSqlMarker(`import x from "y";\n${REAL_SQL_MARKER}\n`)).toBe(false);
    expect(hasRealSqlMarker(`const text = \`\n${REAL_SQL_MARKER}\n\`;\n`)).toBe(false);
    expect(hasRealSqlMarker(`// ${REAL_SQL_MARKER}\n`)).toBe(false);
  });
});

describe("findRealSqlTestFiles", () => {
  it("finds marked test files at any depth and skips unmarked files, support files and build output", async () => {
    await file("src/a/tests/one.test.ts", `${REAL_SQL_MARKER}\n`);
    await file("src/b/c/tests/two.test.ts", `// Header.\n${REAL_SQL_MARKER}\n`);
    await file("src/b/tests/plain.test.ts", "import x from \"y\";\n");
    await file("src/b/tests/fixture.ts", `${REAL_SQL_MARKER}\n`);
    await file("dist/tests/built.test.ts", `${REAL_SQL_MARKER}\n`);
    await file("node_modules/pkg/tests/dep.test.ts", `${REAL_SQL_MARKER}\n`);
    expect(findRealSqlTestFiles(root)).toEqual(["src/a/tests/one.test.ts", "src/b/c/tests/two.test.ts"]);
  });

  it("refuses a marked path vitest would read as a glob", async () => {
    await file("src/tests/odd[1].test.ts", `${REAL_SQL_MARKER}\n`);
    expect(() => findRealSqlTestFiles(root)).toThrow(/glob syntax/u);
  });
});

describe("testGroupOptions", () => {
  it("puts marked files in the real-SQL group with few workers and every other file in the parallel group", async () => {
    await file("src/tests/sql.test.ts", `${REAL_SQL_MARKER}\n`);
    await file("src/tests/plain.test.ts", "\n");
    expect(testGroupOptions("real-sql", root, ["**/node_modules/**"])).toEqual({ include: ["src/tests/sql.test.ts"], maxWorkers: REAL_SQL_MAX_WORKERS, minWorkers: 1 });
    expect(testGroupOptions("parallel", root, ["**/node_modules/**"])).toEqual({ exclude: ["**/node_modules/**", "src/tests/sql.test.ts"] });
  });

  it("leaves a run with no group (a plain `vitest run <path>`) untouched, and refuses an unknown group", () => {
    expect(testGroupOptions(undefined, root, [])).toEqual({});
    expect(testGroupOptions("", root, [])).toEqual({});
    expect(() => testGroupOptions("slow", root, [])).toThrow(/not a test group/u);
  });

  it("finds this package's own marked files", () => {
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));
    expect(findRealSqlTestFiles(packageRoot)).toContain("src/programs/database-manager/tests/index.test.ts");
  });
});
