import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouteIamContract, type AppRouteIamContract, type AppRouteResourceInput } from "../../../app-route-iam";
import { withWorkspaceRouteJson } from "..";
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

const ROUTE = appRouteIamContract("GET", "/api/programs");
beforeEach(resetRouteRuntime);

describe("buffered workspace JSON ownership", () => {
  it("holds the selected lease through awaited work and serialization", async () => {
    const gate = deferred();
    const entered = deferred();
    const pending = withWorkspaceRouteJson(routeRequest(), ROUTE, {}, async (context, caller) => {
      expect(context.fluxiq).toBe(runtime.tenantA);
      expect(caller.binding.userId).toBe("person-a");
      expect(runtime.releases.a).not.toHaveBeenCalled();
      entered.resolve();
      await gate.promise;
      const current = await context.revalidate();
      if (!current.ok) throw new Error("Expected current authority before tenant IO");
      return { toJSON: () => {
        expect(runtime.releases.a).not.toHaveBeenCalled();
        return { tenant: context.workspaceId, user: current.caller.actor.userId };
      } };
    });
    await entered.promise;
    expect(runtime.releases.a).not.toHaveBeenCalled();
    gate.resolve();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tenant: "tenant-a", user: "person-a" });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["session", "iam", "membership", "abort"])("discards buffered tenant data after %s authority ends during awaited work", async (change) => {
    const controller = new AbortController();
    const gate = deferred();
    const entered = deferred();
    const pending = withWorkspaceRouteJson(routeRequest({ signal: controller.signal }), ROUTE, {}, async () => {
      entered.resolve();
      await gate.promise;
      return { privateTenantPayload: "must never be returned" };
    });
    await entered.promise;
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "iam") runtime.policies.set("tenant-a", "none");
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "abort") controller.abort();
    gate.resolve();
    const response = await pending;
    expect(response.status).toBe(change === "iam" ? 403 : 401);
    expect(await response.text()).not.toContain("privateTenantPayload");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("rechecks authority after JSON serialization itself", async () => {
    const response = await withWorkspaceRouteJson(routeRequest(), ROUTE, {}, () => ({ toJSON: () => {
      runtime.memberships.set("person-a", []);
      return { privateTenantPayload: "must never be returned" };
    } }));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("privateTenantPayload");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["callback", "serialization", "response", "stream"])("returns a sanitized failure and releases on unsupported/failed %s", async (failure) => {
    const response = await withWorkspaceRouteJson(routeRequest(), ROUTE, {}, () => {
      if (failure === "callback") throw new Error("Private tenant storage content");
      if (failure === "response") return new Response("private payload");
      if (failure === "stream") return new ReadableStream();
      return { toJSON: () => { throw new Error("Private serialization content"); } };
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Request could not be completed." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("releases an acquisition that finishes after request cancellation without invoking the handler", async () => {
    const controller = new AbortController();
    const gate = deferred();
    const entered = deferred();
    const answer = vi.fn();
    runtime.manager.acquire.mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      return { workspaceId: "tenant-a", fluxiq: runtime.tenantA, release: runtime.releases.a };
    });
    const pending = withWorkspaceRouteJson(routeRequest({ signal: controller.signal }), ROUTE, {}, answer);
    await entered.promise;
    controller.abort();
    gate.resolve();
    expect((await pending).status).toBe(401);
    expect(answer).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("does not acquire or authenticate an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const answer = vi.fn();
    expect((await withWorkspaceRouteJson(routeRequest({ signal: controller.signal }), ROUTE, {}, answer)).status).toBe(401);
    expect(runtime.primary.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });

  it("uses a detached immutable resource snapshot on every IAM decision", async () => {
    const seen: AppRouteResourceInput[] = [];
    const contract: AppRouteIamContract = { ...ROUTE, resource: { from: "test resource", of: input => {
      seen.push(input);
      return { kind: "workspace" };
    } } };
    const input = { nested: { ids: ["original-target"] } };
    const response = await withWorkspaceRouteJson(routeRequest(), contract, input, async context => {
      input.nested.ids[0] = "forged-target";
      const current = await context.revalidate();
      expect(current.ok).toBe(true);
      return { ok: true };
    });
    expect(response.status).toBe(200);
    expect(seen.length).toBeGreaterThan(2);
    for (const item of seen) {
      expect(item).toEqual({ nested: { ids: ["original-target"] } });
      expect(Object.isFrozen(item.nested)).toBe(true);
    }
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("returns unavailable if final policy storage fails instead of releasing a buffered payload", async () => {
    const response = await withWorkspaceRouteJson(routeRequest(), ROUTE, {}, () => {
      runtime.policyError = true;
      return { privateTenantPayload: "discard" };
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Request authority could not be verified." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
