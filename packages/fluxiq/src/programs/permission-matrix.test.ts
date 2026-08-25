import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "./_shared/runtime.ts";
import type { Permission } from "./identity-access/index.ts";

const noPermissionActor = {
  sessionId: "session.viewer",
  userId: "viewer",
  roleId: "viewer",
  permissions: [] as Permission[],
};

describe("global program endpoint permission matrix", () => {
  const runtime = createGlobalProgramRuntime();
  const endpoints = runtime.api.endpoints();

  it("declares a permission for every registered endpoint", () => {
    expect(endpoints.length).toBeGreaterThan(30);
    expect(new Set(endpoints.map((endpoint) => endpoint.programId))).toEqual(
      new Set([
        "automation-studio",
        "identity-access",
        "secret-keys",
        "database-manager",
        "background-tasks",
        "compute-control",
        "deployment-sync",
        "runtime",
        "docs",
        "production-runner",
      ]),
    );
    expect(new Set(endpoints.map((endpoint) => endpoint.permission))).toEqual(
      new Set<Permission>(["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage"]),
    );
  });

  it("rejects anonymous and permission-less actors before any endpoint handler runs", async () => {
    for (const endpoint of endpoints) {
      const request = { programId: endpoint.programId, endpoint: endpoint.endpoint, scope: {} };
      await expect(runtime.api.call(request), `${endpoint.programId}/${endpoint.endpoint} anonymous`).resolves.toMatchObject({
        ok: false,
        errorCode: "authorization.required",
      });
      await expect(runtime.api.call({ ...request, actor: noPermissionActor }), `${endpoint.programId}/${endpoint.endpoint} forbidden`).resolves.toMatchObject({
        ok: false,
        errorCode: "authorization.forbidden",
      });
    }
  });
});
