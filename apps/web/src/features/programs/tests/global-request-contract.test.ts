import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const views = ["background-tasks", "compute-control", "database-manager", "deployment-sync", "docs", "identity-access", "production-runner", "secret-keys"];
const operationalViews = new Set(["background-tasks", "compute-control", "production-runner"]);

describe("global program request ownership", () => {
  it("cancels each initial snapshot request on unmount", () => {
    const operational = readFileSync(new URL("../operational-refresh/useOperationalSnapshot.ts", import.meta.url), "utf8");
    const databaseReads = readFileSync(new URL("../database-records/useDatabaseRecords.ts", import.meta.url), "utf8");
    for (const view of views) {
      const source = readFileSync(new URL(`../live-views/${view}.tsx`, import.meta.url), "utf8");
      if (view === "database-manager") {
        expect(source, view).toContain("useDatabaseRecords({ api, owner: api");
        expect(databaseReads, view).toContain("new AbortController()");
        expect(databaseReads, view).toContain('"snapshot", { signal: controller.signal }');
        expect(databaseReads, view).toContain("job.controller?.abort()");
        expect(databaseReads, view).toContain('mounted.current = false; cancel("metadata")');
        expect(databaseReads, view).toContain("if (!current()) return;");
        continue;
      }
      if (operationalViews.has(view)) {
        expect(source, view).toContain("useOperationalSnapshot({ owner: api, read");
        expect(source, view).toContain('"snapshot", { signal }');
        expect(operational, view).toContain("new AbortController()");
        expect(operational, view).toContain("controller?.abort()");
        expect(operational, view).toContain("active = false; ++generation;");
        continue;
      }
      expect(source, view).toContain("new AbortController()");
      expect(source, view).toContain("controller.abort()");
      expect(source, view).toContain("signal ? { signal } : {}");
    }
  });

  it("routes all program API reads and mutations through the shared coordinator", () => {
    const source = readFileSync(new URL("../program-api.ts", import.meta.url), "utf8");
    expect(source.match(/coordinateProgramRequest\(/g)).toHaveLength(2);
    expect(source).toContain("programRequestPolicy");
  });
});
