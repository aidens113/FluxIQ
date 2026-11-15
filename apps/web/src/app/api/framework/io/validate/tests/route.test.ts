import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, registry, routeRequest, runtime } from "../../../../../../lib/workspaces/routes/tests/route-runtime";
import { io, localTenantIo, resetIoRuntime } from "../../tests/route-runtime";
import { POST } from "../route";

vi.mock("../../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter };
});
vi.mock("../../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

beforeEach(resetIoRuntime);
function request(payload: unknown = {}, options: Parameters<typeof routeRequest>[0] = {}) {
  return new Request(routeRequest({ url: "https://panel.example.test/api/framework/io/validate", ...options }), { method: "POST", body: JSON.stringify(payload) });
}

describe("selected tenant's framework IO validation", () => {
  it("uses the selected A/B validators and keeps camel-case/snake-case input precedence", async () => {
    localTenantIo();
    io.a.validateIoRequirements.mockReturnValue([{ severity: "error", message: "Tenant A issue" }]);
    const first = await POST(request({ domainId: "camel-domain", domain_id: "ignored", requiredInputs: ["camel-input"], required_inputs: ["ignored"], requiredOutputs: [], required_outputs: ["ignored"], source: "fixture" }, { bearer: "browser-b-token" }));
    const second = await POST(request({ domain_id: "snake-domain", required_inputs: ["snake-input"], required_outputs: ["snake-output"] }, { cookie: runtime.sessions.b }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: false, issues: [{ severity: "error", message: "Tenant A issue" }] });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, issues: [] });
    expect(io.a.validateIoRequirements).toHaveBeenCalledWith({ domainId: "camel-domain", requiredInputs: ["camel-input"], requiredOutputs: [], source: "fixture" });
    expect(io.b.validateIoRequirements).toHaveBeenCalledWith({ domainId: "snake-domain", requiredInputs: ["snake-input"], requiredOutputs: ["snake-output"] });
    expect(io.primary.validateIoRequirements).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it("keeps valid domain-only and empty-object validation", async () => {
    localTenantIo();
    expect((await POST(request({ domain_id: "domain-a" }))).status).toBe(200);
    expect(io.a.validateDomainIo).toHaveBeenCalledWith("domain-a");
    expect((await POST(request())).status).toBe(200);
    expect(io.a.validateIoRequirements).toHaveBeenCalledWith({});
    expect(runtime.releases.a).toHaveBeenCalledTimes(2);
  });

  it.each(["not-json", "null", "[]", "42", '{"domainId":42}', '{"source":false}', '{"requiredInputs":"input"}', '{"required_outputs":[1]}'])("refuses malformed JSON or invalid object fields before validation: %s", async payload => {
    localTenantIo();
    const malformed = new Request(routeRequest(), { method: "POST", body: payload });
    const response = await POST(malformed);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "Invalid validation request." });
    expect(io.a.validateDomainIo).not.toHaveBeenCalled();
    expect(io.a.validateIoRequirements).not.toHaveBeenCalled();
    expect(io.primary.validateIoRequirements).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["membership", "default", "session", "role", "abort"])("refuses %s changed during the body read before validation touches tenant IO", async change => {
    localTenantIo();
    const controller = new AbortController();
    const body = request({ domainId: "domain-a" }, { signal: controller.signal });
    const gate = deferred<unknown>();
    const entered = deferred();
    vi.spyOn(body, "json").mockImplementation(async () => {
      entered.resolve();
      return gate.promise;
    });
    const pending = POST(body);
    await entered.promise;
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "default") runtime.memberships.set("person-a", [{ userId: "person-a", workspaceId: "tenant-b", status: "active", createdAtMs: 0 }]);
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "role") await runtime.identity.upsertRole({ id: "operator", permissions: [] });
    if (change === "abort") controller.abort();
    gate.resolve({ domainId: "domain-a" });
    const response = await pending;
    expect(response.status).toBe(change === "role" ? 403 : 401);
    expect(io.a.validateDomainIo).not.toHaveBeenCalled();
    expect(io.a.validateIoRequirements).not.toHaveBeenCalled();
    expect(io.b.validateDomainIo).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["admin", "user"] as const)("retains service ops denial for %s before consuming a body", async policy => {
    runtime.policies.set("tenant-a", policy);
    const body = request();
    const json = vi.spyOn(body, "json");
    const response = await POST(body);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "Not authorized: ops:ValidateFrameworkIo" });
    expect(json).not.toHaveBeenCalled();
    expect(io.a.validateIoRequirements).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("refuses bearer-only callers before body, proof or acquisition", async () => {
    const body = request({}, { cookie: null, bearer: "browser-a-token" });
    const json = vi.spyOn(body, "json");
    expect((await POST(body)).status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
  });

  it.each(["local", "self-hosted"] as const)("keeps %s single-root validation", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    expect((await POST(request({ domainId: "domain-a" }))).status).toBe(200);
    expect(io.primary.validateDomainIo).toHaveBeenCalledWith("domain-a");
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    expect(runtime.releases.primary).toHaveBeenCalledOnce();
  });

  it("sanitizes validation exceptions and releases the lease", async () => {
    localTenantIo();
    io.a.validateIoRequirements.mockImplementation(() => { throw new Error("Private tenant IO content"); });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Request could not be completed." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
