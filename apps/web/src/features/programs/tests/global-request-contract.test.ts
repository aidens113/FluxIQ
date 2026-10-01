import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const views = ["background-tasks", "compute-control", "database-manager", "deployment-sync", "docs", "identity-access", "production-runner", "secret-keys"];

describe("global program request ownership", () => {
  it("cancels each initial snapshot request on unmount", () => {
    const operational = readFileSync(new URL("../operational-refresh/useOperationalSnapshot.ts", import.meta.url), "utf8");
    for (const view of views) {
      const source = readFileSync(new URL(`../live-views/${view}.tsx`, import.meta.url), "utf8");
      if (view === "compute-control") {
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
