import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DeploymentSyncLive contract", () => {
  it("protects repository mutations and owns result detail", () => {
    const source = readFileSync(new URL("./deployment-sync.tsx", import.meta.url), "utf8");
    expect(source).toContain("Confirm Rollback");
    expect(source).toContain("Confirm Branch Checkout");
    expect(source).toContain("Deployment action in progress");
    expect(source).toContain("DeploymentResultDetail");
    expect(source).not.toContain("JSON.stringify(selectedRun");
  });

  it("distinguishes loading, request failure, repository unavailable, empty, and ready state", () => {
    const source = readFileSync(new URL("./deployment-sync.tsx", import.meta.url), "utf8");
    expect(source).toContain('label="Loading Deployment Sync"');
    expect(source).toContain('title="Deployment Sync unavailable"');
    expect(source).toContain('title="Git unavailable"');
    expect(source).toContain('title="No deployment targets"');
    expect(source).toContain("!activeTarget || !git?.available || busy");
  });
});
