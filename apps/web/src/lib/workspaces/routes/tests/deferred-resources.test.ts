import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouteIamContract } from "../../../app-route-iam";
import { workspaceRouteContext } from "..";
import { deferred, resetRouteRuntime, routeRequest, runtime } from "./route-runtime";

vi.mock("../../../fluxiq", async () => {
  const { runtime } = await import("./route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter, isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.primary };
});
vi.mock("../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("./route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../server/browser-trust", async () => {
  const { runtime } = await import("./route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/automation-studio-context");
beforeEach(resetRouteRuntime);

describe("body-derived tenant route resources", () => {
  it("resolves under the held caller and authorizes only the frozen actual target", async () => {
    const authorize = vi.spyOn(runtime.tenantA.programs.api, "authorize");
    const body = { activeProjectId: "project-own", activeFlowId: "flow-own" };
    const selected = await workspaceRouteContext(routeRequest(), ROUTE, async selection => {
      expect(Object.isFrozen(selection)).toBe(true);
      expect(selection.workspaceId).toBe("tenant-a");
      expect(selection.fluxiq).toBe(runtime.tenantA);
      expect(selection.caller.binding.userId).toBe("person-a");
      expect(runtime.manager.acquire).toHaveBeenCalledTimes(1);
      expect(runtime.releases.a).not.toHaveBeenCalled();
      expect(authorize).not.toHaveBeenCalled();
      return body;
    });
    if (!selected.ok) throw new Error("Expected target admission");
    body.activeProjectId = "different-project";
    expect(await selected.context.revalidate()).toMatchObject({ ok: true });
    expect(authorize.mock.calls.length).toBeGreaterThan(0);
    for (const [input] of authorize.mock.calls) expect(input.resources).toEqual({ kind: "project-child", projectId: "project-own", child: "flow", childId: "flow-own" });
    selected.context.release();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["membership", "session", "abort"])("rejects %s changes while body resolution waits, without selecting another tenant", async change => {
    const entered = deferred();
    const gate = deferred();
    const controller = new AbortController();
    const pending = workspaceRouteContext(routeRequest({ signal: controller.signal }), ROUTE, async () => {
      entered.resolve();
      await gate.promise;
      return { activeProjectId: "project-own" };
    });
    await entered.promise;
    expect(runtime.releases.a).not.toHaveBeenCalled();
    if (change === "membership") runtime.memberships.set("person-a", [{ userId: "person-a", workspaceId: "tenant-b", status: "active", createdAtMs: 0 }]);
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "abort") controller.abort();
    gate.resolve();
    expect(await pending).toMatchObject({ ok: false, status: 401 });
    expect(runtime.manager.acquire).toHaveBeenCalledTimes(1);
    expect(runtime.manager.acquire).toHaveBeenCalledWith("tenant-a");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).not.toHaveBeenCalled();
  });

  it("never invokes a resolver for an invalid cookie, unsupported channel or absent identity", async () => {
    for (const request of [routeRequest({ cookie: "invalid", bearer: "browser-a-token" }), routeRequest({ cookie: null, bearer: "browser-a-token" }), routeRequest({ cookie: null })]) {
      const resolver = vi.fn(async () => ({}));
      expect(await workspaceRouteContext(request, ROUTE, resolver)).toMatchObject({ ok: false });
      expect(resolver).not.toHaveBeenCalled();
    }
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
  });

  it("releases once and sanitizes a resolver exception", async () => {
    const selected = await workspaceRouteContext(routeRequest(), ROUTE, () => { throw new Error("private body contents"); });
    expect(selected).toEqual({ ok: false, status: 503, error: "Request authority could not be verified." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("rejects non-data resources returned by a resolver and releases its lease", async () => {
    expect(await workspaceRouteContext(routeRequest(), ROUTE, () => ({ activeProjectId: () => "project-own" }))).toMatchObject({ ok: false, status: 403 });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
