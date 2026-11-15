import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registry, routeRequest, runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";
import { io, localTenantIo, resetIoRuntime } from "./route-runtime";
import { GET } from "../route";

vi.mock("../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter };
});
vi.mock("../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

beforeEach(resetIoRuntime);
const request = (options: Parameters<typeof routeRequest>[0] = {}) => new NextRequest(routeRequest({ url: "https://panel.example.test/api/framework/io?domain=chosen-domain", ...options }));

describe("selected tenant's framework IO", () => {
  it("reads the selected instances with matching input ids and preserves the domain query", async () => {
    localTenantIo();
    const first = await GET(request({ bearer: "browser-b-token" }));
    const second = await GET(request({ cookie: runtime.sessions.b }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, domainId: "chosen-domain", io: { inputs: [{ id: "same-input", title: "Tenant A" }] } });
    expect(await second.json()).toMatchObject({ ok: true, io: { inputs: [{ id: "same-input", title: "Tenant B" }] } });
    expect(io.a.ioSnapshot).toHaveBeenCalledWith("chosen-domain");
    expect(io.b.ioSnapshot).toHaveBeenCalledWith("chosen-domain");
    expect(io.primary.ioSnapshot).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it.each(["admin", "user"] as const)("retains service operator denial for %s policies before reading IO", async policy => {
    runtime.policies.set("tenant-a", policy);
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "Not authorized: ops:InspectFrameworkIo" });
    expect(io.a.ioSnapshot).not.toHaveBeenCalled();
    expect(io.primary.ioSnapshot).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("refuses bearer-only callers before acquisition or proof lookup", async () => {
    expect((await GET(request({ cookie: null, bearer: "browser-a-token" }))).status).toBe(403);
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(io.a.ioSnapshot).not.toHaveBeenCalled();
  });

  it("never falls back to a bearer after an invalid service cookie", async () => {
    expect((await GET(request({ cookie: "invalid", bearer: "browser-a-token" }))).status).toBe(401);
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(io.primary.ioSnapshot).not.toHaveBeenCalled();
  });

  it.each(["local", "self-hosted"] as const)("keeps %s single-root inspection", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(io.primary.ioSnapshot).toHaveBeenCalledWith("chosen-domain");
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });

  it("sanitizes IO errors and releases the tenant lease", async () => {
    localTenantIo();
    io.a.ioSnapshot.mockImplementation(() => { throw new Error("Private tenant path"); });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Request could not be completed." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
