import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, registry, resetRouteRuntime, routeRequest, runtime } from "../../../../lib/workspaces/routes/tests/route-runtime";
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

const lists = { primary: vi.fn(), a: vi.fn(), b: vi.fn() };
const page = (label: string) => ({ items: [{ recordingId: "same-recording", projectId: "same-project", title: `Tenant ${label}` }], page: 1, pageSize: 10, total: 1 });
const request = (options: Parameters<typeof routeRequest>[0] = {}) => routeRequest({ url: "https://panel.example.test/api/recordings", ...options });
const pairedRequest = (query = "") => request({ cookie: null, bearer: "browser-a-token", url: `https://panel.example.test/api/recordings${query}` });

beforeEach(async () => {
  await resetRouteRuntime();
  for (const [instance, list, label] of [[runtime.primary, lists.primary, "primary"], [runtime.tenantA, lists.a, "A"], [runtime.tenantB, lists.b, "B"]] as const) {
    Object.assign(instance.programs, { automationStudio: { listRecordingSummaries: list } });
    list.mockResolvedValue(page(label));
  }
});

describe("selected tenant's recordings list", () => {
  it("keeps matching project/recording ids isolated between A and B and preserves pagination", async () => {
    const first = await GET(request({ url: "https://panel.example.test/api/recordings?page=2&pageSize=5", bearer: "browser-b-token" }));
    const second = await GET(request({ cookie: runtime.sessions.b }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(page("A"));
    expect(await second.json()).toEqual(page("B"));
    expect(lists.a).toHaveBeenCalledWith({ page: "2", pageSize: "5" });
    expect(lists.b).toHaveBeenCalledWith({ page: undefined, pageSize: undefined });
    expect(lists.primary).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it("lists a paired client's selected tenant and approved domain", async () => {
    const response = await GET(pairedRequest("?page=2&pageSize=5&domainId=domain-a"));
    expect(response.status).toBe(200);
    expect(lists.a).toHaveBeenCalledWith({ page: "2", pageSize: "5", domainId: "domain-a" });
    expect(await response.json()).toEqual(page("A"));
    expect(lists.primary).not.toHaveBeenCalled();
    expect(lists.b).not.toHaveBeenCalled();
    expect(runtime.tenantA.programs.identityAccess.snapshot).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("preserves a pairing's null-domain meaning", async () => {
    if (!runtime.browserSession) throw new Error("Expected a fixture browser");
    runtime.browserSession.metadata.domainId = "";
    expect((await GET(pairedRequest())).status).toBe(200);
    expect(lists.a).toHaveBeenCalledWith({ page: undefined, pageSize: undefined, domainId: null });
  });

  it("refuses a paired URL naming another domain before reading a recording", async () => {
    expect((await GET(pairedRequest("?domainId=domain-b"))).status).toBe(403);
    expect(lists.a).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("retains panel listing without a domain filter even when the URL names one", async () => {
    expect((await GET(request({ url: "https://panel.example.test/api/recordings?domainId=ignored&page=1" }))).status).toBe(200);
    expect(lists.a).toHaveBeenCalledWith({ page: "1", pageSize: undefined });
    expect(runtime.tenantA.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
  });

  it("keeps a valid cookie ahead of stale bearer but never falls back from an invalid cookie", async () => {
    expect((await GET(request({ bearer: "stale-token" }))).status).toBe(200);
    expect((await GET(request({ cookie: "invalid", bearer: "browser-a-token" }))).status).toBe(401);
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(lists.a).toHaveBeenCalledOnce();
    expect((await GET(request({ cookie: null, bearer: "stale-token" }))).status).toBe(401);
    expect(lists.primary).not.toHaveBeenCalled();
  });

  it.each(["panel", "paired"])("retains ordinary service user's list refusal via %s", async channel => {
    runtime.policies.set("tenant-a", "user");
    expect((await GET(channel === "panel" ? request() : pairedRequest())).status).toBe(403);
    expect(lists.a).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["membership", "session", "client-target", "domain", "iam"])("discards a result after %s changes during the list read", async change => {
    const gate = deferred();
    const entered = deferred();
    lists.a.mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      return page("private-discarded");
    });
    const paired = change === "client-target" || change === "domain";
    const pending = GET(paired ? pairedRequest("?domainId=domain-a") : request());
    await entered.promise;
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "client-target" && runtime.browserSession) runtime.browserSession.projectId = "changed-project";
    if (change === "domain" && runtime.browserSession) runtime.browserSession.metadata.domainId = "domain-b";
    if (change === "iam") runtime.policies.set("tenant-a", "none");
    gate.resolve();
    const response = await pending;
    expect(response.status).toBe(change === "iam" || change === "domain" ? 403 : 401);
    expect(await response.text()).not.toContain("private-discarded");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(lists.primary).not.toHaveBeenCalled();
  });

  it.each(["local", "self-hosted"] as const)("preserves %s single-root panel and paired lists", async profile => {
    runtime.manager.tenancy = "single";
    runtime.primary.programs.api = registry("workspace-main", profile);
    runtime.primary.programs.clientGateway.authorizeToken.mockResolvedValue(runtime.browserSession);
    expect((await GET(request())).status).toBe(200);
    expect((await GET(pairedRequest())).status).toBe(200);
    expect(lists.primary.mock.calls).toEqual([[{ page: undefined, pageSize: undefined }], [{ page: undefined, pageSize: undefined, domainId: "domain-a" }]]);
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    expect(runtime.releases.primary).toHaveBeenCalledTimes(2);
  });

  it("sanitizes list failures and releases the tenant lease", async () => {
    lists.a.mockRejectedValueOnce(new Error("Private recording path"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Request could not be completed." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
