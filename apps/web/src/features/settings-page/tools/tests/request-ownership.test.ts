import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Each engine tool owns its initial snapshot request and cancels it on unmount.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const operationalViews = ["../background-tasks/BackgroundTasksLive.tsx", "../compute-control/ComputeControlLive.tsx", "../production-runner/ProductionRunnerLive.tsx"];

describe("engine tool request ownership", () => {
  it("cancels each operational snapshot request on unmount", () => {
    const operational = read("../operational/refresh/useOperationalSnapshot.ts");
    expect(operational).toContain("new AbortController()");
    expect(operational).toContain("controller?.abort()");
    expect(operational).toMatch(/active = false;\s+\+\+generation;/u);
    for (const view of operationalViews) {
      const source = read(view);
      expect(source, view).toContain("useOperationalSnapshot({ owner: api, read");
      expect(source, view).toContain('"snapshot", { signal }');
    }
  });

  it("cancels the documentation snapshot request on unmount", () => {
    expect(read("../docs/DocsLive.tsx")).toContain("useDocumentationWorkspace({ api, isOwner, requestedPage })");
    const reads = read("../docs/workspace/useDocumentationWorkspace.ts");
    expect(reads).toContain("new AbortController()");
    expect(reads).toContain('"snapshot", { signal: request.controller.signal }');
    expect(reads).toMatch(/mounted\.current = false;\s+read\.current\?\.controller\.abort\(\)/u);
    expect(reads).toContain("if (!current() || read.current !== request || request.controller.signal.aborted) return;");
  });

  it("cancels the deployment snapshot request on unmount", () => {
    const source = read("../deployment-sync/DeploymentSyncLive.tsx");
    expect(source).toContain("new AbortController()");
    expect(source).toContain('"snapshot", { signal: controller.signal }');
    expect(source).toMatch(/mounted\.current = false;\s+readEpoch\.current\+\+;\s+read\.current\?\.controller\.abort\(\)/u);
    expect(source).toContain("if (!alive() || controller.signal.aborted || id !== readEpoch.current) return;");
  });

  it("cancels the database metadata request on unmount", () => {
    expect(read("../database-manager/DatabaseManagerLive.tsx")).toContain("useDatabaseRecords({ api, owner: api");
    const reads = read("../database-manager/records/useDatabaseRecords.ts");
    expect(reads).toContain("new AbortController()");
    expect(reads).toContain('"snapshot", { signal: controller.signal }');
    expect(reads).toContain("job.controller?.abort()");
    expect(reads).toMatch(/mounted\.current = false;\s+cancel\("metadata"\)/u);
    expect(reads).toContain("if (!current()) return;");
  });
});
