// @fluxiq-test-group real-sql
// A marked file runs on the real-SQL timeout in a plain `vitest run <path>` as well
// as in its group: `real-sql-guard.ts` sets it before the file is collected. The
// unmarked side is in `test-groups.test.ts`.
import { describe, expect, it } from "vitest";
import { REAL_SQL_TEST_TIMEOUT_MS } from "./test-groups.ts";

describe("a file with the real-SQL marker", () => {
  it("runs on the real-SQL timeout", () => {
    const worker = (globalThis as { __vitest_worker__?: { config?: { testTimeout?: number; hookTimeout?: number } } }).__vitest_worker__;
    expect(REAL_SQL_TEST_TIMEOUT_MS).toBeGreaterThan(15_000);
    expect(worker?.config).toMatchObject({ testTimeout: REAL_SQL_TEST_TIMEOUT_MS, hookTimeout: REAL_SQL_TEST_TIMEOUT_MS });
  });
});
