import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouteIamContract, type AppRouteIamContract } from "../../../app-route-iam";
import { workspaceRouteContext } from "..";
import { deferred, resetRouteRuntime, routeRequest, runtime } from "./route-runtime";

vi.mock("../../../fluxiq", async () => {
  const { runtime } = await import("./route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter };
});
vi.mock("../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("./route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../server/browser-trust", async () => {
  const { runtime } = await import("./route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

const PANEL = appRouteIamContract("GET", "/api/programs");
const PAIRED: AppRouteIamContract = { ...PANEL, callers: { "paired-client": "programs.read" } };
beforeEach(resetRouteRuntime);

describe("trusted workspace route selection", () => {
  it.each([undefined, "other-token"])("refuses an absent or unsupported panel credential before proof lookup (%s)", async (bearer) => {
    const selected = await workspaceRouteContext(routeRequest({ cookie: null, ...(bearer ? { bearer } : {}) }), PANEL);
    expect(selected).toMatchObject({ ok: false, status: bearer ? 403 : 401 });
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
  });

  it("never substitutes a bearer for an invalid cookie or a cookie on a paired-only route", async () => {
    expect(await workspaceRouteContext(routeRequest({ cookie: "expired", bearer: "browser-a-token" }), PANEL)).toMatchObject({ ok: false, status: 401 });
    expect(await workspaceRouteContext(routeRequest({ bearer: "browser-a-token" }), PAIRED)).toMatchObject({ ok: false, status: 403 });
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
  });

  it("returns an immutable cookie caller and lease-owned workspace, with idempotent release", async () => {
    const selected = await workspaceRouteContext(routeRequest({ bearer: "browser-b-token" }), PANEL);
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error("Expected an admitted route");
    expect(selected.context.workspaceId).toBe("tenant-a");
    expect(selected.context.fluxiq).toBe(runtime.tenantA);
    expect(selected.context.binding).toEqual({ channel: "panel", workspaceId: "tenant-a", userId: "person-a", sessionId: runtime.sessions.a });
    expect(Object.isFrozen(selected.context)).toBe(true);
    expect(Object.isFrozen(selected.context.caller.actor.permissions)).toBe(true);
    expect(Object.isFrozen(selected.context.caller.actor)).toBe(true);
    expect(Object.isFrozen(selected.context.binding)).toBe(true);
    expect(runtime.tenantA.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(runtime.primary.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
    selected.context.release();
    selected.context.release();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(await selected.context.revalidate()).toMatchObject({ ok: false, status: 401 });
  });

  it("refreshes the current primary role without mutating its initial caller snapshot", async () => {
    const selected = await workspaceRouteContext(routeRequest(), PANEL);
    if (!selected.ok) throw new Error("Expected an admitted route");
    await runtime.identity.updateUser({ id: "person-a", roleId: "reader" });
    const current = await selected.context.revalidate();
    expect(current).toMatchObject({ ok: true, caller: { actor: { roleId: "reader", permissions: ["programs.read"] } } });
    expect(selected.context.caller.actor.roleId).toBe("operator");
    selected.context.release();
  });

  it.each(["membership", "default", "account", "session", "user", "identity", "iam"])("refuses a current %s change without selecting another tenant", async (change) => {
    const selected = await workspaceRouteContext(routeRequest(), PANEL);
    if (!selected.ok) throw new Error("Expected an admitted route");
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "default") runtime.memberships.set("person-a", [{ workspaceId: "tenant-b", userId: "person-a", status: "active", createdAtMs: 0 }]);
    if (change === "account") runtime.accounts.set("person-a", { status: "disabled", deletion: null });
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "user") await runtime.identity.updateUser({ id: "person-a", enabled: false });
    if (change === "identity") runtime.primary.programs.identityAccess.validateSession.mockImplementation(() => runtime.identity.validateSession(runtime.sessions.b));
    if (change === "iam") runtime.policies.set("tenant-a", "none");
    expect(await selected.context.revalidate()).toMatchObject({ ok: false, status: change === "iam" ? 403 : 401 });
    expect(runtime.manager.acquire).toHaveBeenCalledTimes(1);
    expect(runtime.manager.acquire).toHaveBeenCalledWith("tenant-a");
    selected.context.release();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).not.toHaveBeenCalled();
  });

  it("refuses a role change while an IAM decision is pending", async () => {
    const selected = await workspaceRouteContext(routeRequest(), PANEL);
    if (!selected.ok) throw new Error("Expected an admitted route");
    const gate = deferred();
    const entered = deferred();
    const authorize = runtime.tenantA.programs.api.authorize.bind(runtime.tenantA.programs.api);
    vi.spyOn(runtime.tenantA.programs.api, "authorize").mockImplementationOnce(async input => {
      const decision = await authorize(input);
      entered.resolve();
      await gate.promise;
      return decision;
    });
    const pending = selected.context.revalidate();
    await entered.promise;
    await runtime.identity.updateUser({ id: "person-a", roleId: "reader" });
    gate.resolve();
    expect(await pending).toMatchObject({ ok: false, status: 403 });
    selected.context.release();
  });

  it.each(["abort", "release"])("refuses %s while the last asynchronous authority guard is pending", async (change) => {
    const controller = new AbortController();
    const selected = await workspaceRouteContext(routeRequest({ signal: controller.signal }), PANEL);
    if (!selected.ok) throw new Error("Expected an admitted route");
    const gate = deferred();
    const entered = deferred();
    let guards = 0;
    runtime.store.getWorkspace.mockImplementation(async (workspaceId: string) => {
      guards += 1;
      if (guards === 3) {
        entered.resolve();
        await gate.promise;
      }
      return { workspaceId };
    });
    const pending = selected.context.revalidate();
    await entered.promise;
    if (change === "abort") controller.abort();
    if (change === "release") selected.context.release();
    gate.resolve();
    expect(await pending).toMatchObject({ ok: false, status: 401 });
    selected.context.release();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["selection", "identity", "iam"])("sanitizes %s storage failures as unavailable and releases any acquired lease", async (stage) => {
    if (stage === "selection") runtime.store.getWorkspace.mockRejectedValueOnce(new Error("Private tenant root"));
    if (stage === "identity") runtime.primary.programs.identityAccess.validateSession.mockRejectedValueOnce(new Error("Private identity path"));
    if (stage === "iam") runtime.policyError = true;
    const result = await workspaceRouteContext(routeRequest(), PANEL);
    expect(result).toEqual({ ok: false, status: 503, error: "Request authority could not be verified." });
    expect(runtime.releases.a).toHaveBeenCalledTimes(stage === "iam" ? 1 : 0);
    expect(runtime.primary.programDirectory).not.toHaveBeenCalled();
  });
});
