// The runtime that wires every global program together.

import { describe, expect, it } from "vitest";

import { createGlobalProgramRuntime } from "../index.ts";

describe("global program services", () => {
  it("registers global program API endpoints", () => {
    const runtime = createGlobalProgramRuntime();
    const endpoints = runtime.api.endpoints().map((endpoint) => `${endpoint.programId}/${endpoint.endpoint}`);

    expect(endpoints).toContain("automation-studio/snapshot");
    expect(endpoints).toContain("identity-access/snapshot");
    expect(endpoints).toContain("secret-keys/snapshot");
    expect(endpoints).toContain("secret-keys/create-key");
    expect(endpoints).toContain("database-manager/snapshot");
    expect(endpoints).toContain("background-tasks/snapshot");
    expect(endpoints).toContain("compute-control/snapshot");
    expect(endpoints).toContain("deployment-sync/snapshot");
    expect(endpoints).toContain("docs/snapshot");
    expect(endpoints).toContain("production-runner/snapshot");
  });

});
