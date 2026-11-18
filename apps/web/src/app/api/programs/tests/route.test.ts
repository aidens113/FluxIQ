import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { directory, registry, resetRouteRuntime, routeRequest, runtime } from "../../../../lib/workspaces/routes/tests/route-runtime";
import { GET } from "../route";

vi.mock("../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../lib/workspaces/routes/tests/route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter, isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.primary };
});
vi.mock("../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

beforeEach(resetRouteRuntime);
const request = (options: Parameters<typeof routeRequest>[0] = {}) => new NextRequest(routeRequest(options));

describe("tenant-scoped GET /api/programs", () => {
  it("returns different directories for two real identity sessions with the same program id", async () => {
    const first = await GET(request());
    const second = await GET(request({ cookie: runtime.sessions.b }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(directory("A"));
    expect(await second.json()).toEqual(directory("B"));
    expect(runtime.manager.acquire.mock.calls).toEqual([["tenant-a"], ["tenant-b"]]);
    expect(runtime.primary.programDirectory).not.toHaveBeenCalled();
    expect(runtime.tenantA.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(runtime.tenantB.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it("keeps cookie A ahead of bearer B and preserves the directory's domain query", async () => {
    const response = await GET(request({ bearer: "browser-b-token", url: "https://panel.example.test/api/programs?domain=selected-domain" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(directory("A", "selected-domain"));
    expect(runtime.tenantA.programDirectory).toHaveBeenCalledWith("selected-domain");
    expect(runtime.tenantB.programDirectory).not.toHaveBeenCalled();
    expect(runtime.primary.programDirectory).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.tenantA.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
  });

  it.each(["invalid-cookie", "no-membership", "missing-workspace"])("refuses %s without a primary or bearer data fallback", async (state) => {
    if (state === "no-membership") runtime.memberships.set("person-a", []);
    if (state === "missing-workspace") runtime.workspaces.delete("tenant-a");
    const response = await GET(request({ cookie: state === "invalid-cookie" ? "invalid" : runtime.sessions.a, bearer: "browser-b-token" }));
    expect(response.status).toBe(401);
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.primary.programDirectory).not.toHaveBeenCalled();
    expect(runtime.tenantA.programDirectory).not.toHaveBeenCalled();
    expect(runtime.tenantB.programDirectory).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
  });

  it("refuses paired callers before proof lookup, identity validation or acquisition", async () => {
    const response = await GET(request({ cookie: null, bearer: "browser-a-token" }));
    expect(response.status).toBe(403);
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.primary.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.tenantA.programDirectory).not.toHaveBeenCalled();
  });

  it("retains service IAM's ordinary-user directory refusal", async () => {
    runtime.policies.set("tenant-a", "user");
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(runtime.tenantA.programDirectory).not.toHaveBeenCalled();
    expect(runtime.primary.programDirectory).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["local", "self-hosted"] as const)("preserves %s single-root authentication-only directory access", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    await runtime.identity.upsertRole({ id: "empty", permissions: [] });
    await runtime.identity.updateUser({ id: "person-a", roleId: "empty" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(directory("primary"));
    expect(runtime.manager.acquire).toHaveBeenCalledWith("workspace-main");
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });

  it("retains schema validation and releases the selected lease on invalid directory data", async () => {
    runtime.tenantA.programDirectory.mockReturnValue({ invalid: "private tenant path" });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Request could not be completed." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("discards a directory if its tenant membership ends before response publication", async () => {
    runtime.tenantA.programDirectory.mockImplementation(() => {
      runtime.memberships.set("person-a", []);
      return directory("A");
    });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Tenant A");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.primary.programDirectory).not.toHaveBeenCalled();
  });
});
