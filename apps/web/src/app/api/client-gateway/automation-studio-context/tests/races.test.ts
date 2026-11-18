import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";
import { resetSnapshotRuntime, snapshotRuntime, waitForRouteEntry } from "../../snapshot/tests/snapshot-runtime";
import { POST } from "../route";
import { contextRequest } from "./request";

vi.mock("../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  const { snapshotRuntime } = await import("../../snapshot/tests/snapshot-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getWorkspaceWebPresentation: runtime.presenter, getFluxIQWebRuntimeStatus: () => { throw new Error("Unexpected primary presentation"); }, isCurrentFluxIQPrimary: (instance: unknown) => snapshotRuntime.primaryCurrent && instance === runtime.primary };
});
vi.mock("../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

beforeEach(resetSnapshotRuntime);
afterEach(() => vi.unstubAllEnvs());
const ownDefault = () => snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a" }).context();

describe("context commit authority and ordering", () => {
  it.each(["membership", "session", "user", "selection", "account", "abort"])("holds one lease and does not write after %s changes during body parsing", async change => {
    const entered = deferred();
    const resume = deferred();
    const controller = new AbortController();
    const request = contextRequest(null, { signal: controller.signal });
    vi.spyOn(request, "json").mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return { activeProjectId: null };
    });
    const pending = POST(request);
    await waitForRouteEntry(entered.promise, pending);
    expect(runtime.releases.a).not.toHaveBeenCalled();
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "user") await runtime.identity.updateUser({ id: "person-a", enabled: false });
    if (change === "selection") runtime.memberships.set("person-a", [{ userId: "person-a", workspaceId: "tenant-b", status: "active", createdAtMs: 1 }]);
    if (change === "account") runtime.accounts.set("person-a", { status: "disabled", deletion: null });
    if (change === "abort") controller.abort();
    resume.resolve();
    expect((await pending).status).toBe(401);
    expect(ownDefault()?.activeProjectId).toBe("same-project");
    expect(runtime.manager.acquire).toHaveBeenCalledTimes(1);
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).not.toHaveBeenCalled();
  });

  it.each(["membership", "iam", "policy-outage", "domain", "client-owner"])("does not commit after %s changes during Flow lookup", async change => {
    const entered = deferred();
    const resume = deferred();
    snapshotRuntime.flows.a.mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return { flowId: "same-flow", projectId: "same-project" };
    });
    const pending = POST(contextRequest({ activeProjectId: "same-project", activeFlowId: "same-flow", clientId: "browser-a" }));
    await waitForRouteEntry(entered.promise, pending);
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "iam") runtime.policies.set("tenant-a", "none");
    if (change === "policy-outage") runtime.policyError = true;
    if (change === "domain") snapshotRuntime.projects.get("a")![0]!.domainId = "domain-other";
    if (change === "client-owner") snapshotRuntime.views.get("a")!.trustedClients[0]!.approvedByUserId = "person-b";
    resume.resolve();
    const response = await pending;
    expect(response.status).toBe(change === "membership" ? 401 : change === "policy-outage" ? 503 : 403);
    expect(snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a", clientId: "browser-a" }).context()?.clientId).toBeUndefined();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("does not let a late older write restore context after a newer clear", async () => {
    const entered = deferred();
    const resume = deferred();
    snapshotRuntime.flows.a.mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return { flowId: "same-flow", projectId: "same-project" };
    });
    const old = POST(contextRequest({ activeProjectId: "same-project", activeFlowId: "same-flow" }));
    await waitForRouteEntry(entered.promise, old);
    const newer = await POST(contextRequest({ activeProjectId: null }));
    expect(newer.status).toBe(200);
    resume.resolve();
    expect((await old).status).toBe(409);
    expect(ownDefault()?.activeProjectId).toBeNull();
    expect(runtime.releases.a).toHaveBeenCalledTimes(2);
  });

  it("authorizes only the frozen actual project/Flow target", async () => {
    const authorize = vi.spyOn(runtime.tenantA.programs.api, "authorize");
    const response = await POST(contextRequest({ activeProjectId: "same-project", activeFlowId: "same-flow" }));
    expect(response.status).toBe(200);
    expect(authorize.mock.calls.length).toBeGreaterThan(0);
    for (const [input] of authorize.mock.calls) {
      expect(input.action).toBe("gateway:SetAutomationStudioContext");
      expect(input.resources).toEqual({ kind: "project-child", projectId: "same-project", child: "flow", childId: "same-flow" });
    }
  });

  it("refuses a queued write from an invalidated runtime", async () => {
    const entered = deferred();
    const resume = deferred();
    snapshotRuntime.flows.a.mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return { flowId: "same-flow", projectId: "same-project" };
    });
    const pending = POST(contextRequest({ activeProjectId: "same-project", activeFlowId: "same-flow" }));
    await waitForRouteEntry(entered.promise, pending);
    snapshotRuntime.owners.get("a")!.invalidate();
    resume.resolve();
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("runtime-a");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.primary).not.toHaveBeenCalled();
  });

  it("discards a committed response if its runtime retires during final validation", async () => {
    const present = runtime.presenter.getMockImplementation()!;
    let committed = false;
    runtime.presenter.mockImplementation((...args: unknown[]) => {
      const selected = present(...args);
      return { ...selected, beginContextWrite: () => {
        const write = selected.beginContextWrite();
        return { commit(selection: unknown) {
          write.commit(selection);
          committed = true;
        } };
      } };
    });
    const api = runtime.tenantA.programs.api;
    const authorize = api.authorize.bind(api);
    const entered = deferred();
    const resume = deferred();
    let waited = false;
    vi.spyOn(api, "authorize").mockImplementation(async input => {
      const decision = await authorize(input);
      if (committed && !waited) {
        waited = true;
        entered.resolve();
        await resume.promise;
      }
      return decision;
    });
    const pending = POST(contextRequest({ activeProjectId: null }));
    await waitForRouteEntry(entered.promise, pending);
    snapshotRuntime.owners.get("a")!.invalidate();
    resume.resolve();
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("runtime-a");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("refuses a stale primary at handoff while preserving the authorized tenant context commit", async () => {
    const present = runtime.presenter.getMockImplementation()!;
    runtime.presenter.mockImplementation((...args: unknown[]) => {
      const selected = present(...args);
      return { ...selected, context: () => {
        const context = selected.context();
        snapshotRuntime.primaryCurrent = false;
        return context;
      } };
    });
    const response = await POST(contextRequest({ activeProjectId: null }));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("runtime-a");
    expect(snapshotRuntime.owners.get("a")!.isCurrent()).toBe(true);
    expect(ownDefault()?.activeProjectId).toBeNull();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
