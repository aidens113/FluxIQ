import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, registry, runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";
import { resetSnapshotRuntime, snapshotRequest, snapshotRuntime, waitForRouteEntry } from "./snapshot-runtime";
import { GET } from "../route";

vi.mock("../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../lib/workspaces/routes/tests/route-runtime");
  const { snapshotRuntime } = await import("./snapshot-runtime");
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

describe("snapshot current authority", () => {
  it.each(["membership", "session", "user", "selection", "iam", "domain"])("discards names after %s changes during project lookup", async change => {
    const entered = deferred();
    const resume = deferred();
    snapshotRuntime.lists.a.mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return { ok: true, payload: { projects: [{ id: "same-project", name: "private-late-name", ownerUserId: "person-a", updatedAt: 1 }] } };
    });
    const response = GET(snapshotRequest());
    await waitForRouteEntry(entered.promise, response);
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "user") await runtime.identity.updateUser({ id: "person-a", enabled: false });
    if (change === "selection") {
      runtime.memberships.set("person-a", [{ userId: "person-a", workspaceId: "tenant-b", status: "active", createdAtMs: 1 }]);
    }
    if (change === "iam") runtime.policies.set("tenant-a", "none");
    if (change === "domain") snapshotRuntime.projects.get("a")![0]!.domainId = "domain-foreign";
    resume.resolve();
    const result = await response;
    expect(result.status).toBe(change === "iam" || change === "domain" ? 403 : 401);
    expect(await result.text()).not.toContain("private-late-name");
    expect(snapshotRuntime.snapshots.a).not.toHaveBeenCalled();
    expect(snapshotRuntime.snapshots.b).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["sessionId", "trustedClientId", "clientId", "clientType", "operatorUserId", "projectId", "activeRecordingId"] as const)("refuses a paired %s change during lookup", async field => {
    const entered = deferred();
    const resume = deferred();
    snapshotRuntime.lists.a.mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return { ok: true, payload: { projects: [] } };
    });
    const response = GET(snapshotRequest({ cookie: null, bearer: "browser-a-token" }));
    await waitForRouteEntry(entered.promise, response);
    if (!runtime.browserSession) throw new Error("Expected a browser");
    runtime.browserSession[field] = "changed";
    resume.resolve();
    const result = await response;
    expect(result.status).toBe(401);
    expect(snapshotRuntime.snapshots.a).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("discards a serialized payload when authority changes during final validation", async () => {
    snapshotRuntime.snapshots.a.mockImplementationOnce(() => {
      runtime.memberships.set("person-a", []);
      return snapshotRuntime.views.get("a")!;
    });
    const response = await GET(snapshotRequest());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Project a");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("reports authority storage failure safely rather than returning an empty successful snapshot", async () => {
    runtime.policyError = true;
    const response = await GET(snapshotRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("Synthetic private");
    expect(snapshotRuntime.snapshots.a).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("refuses selected runtime retirement during lookup without primary fallback", async () => {
    snapshotRuntime.lists.a.mockImplementationOnce(async () => {
      snapshotRuntime.owners.get("a")!.invalidate();
      return { ok: true, payload: { projects: [] } };
    });
    const response = await GET(snapshotRequest());
    expect(response.status).toBe(503);
    expect(snapshotRuntime.snapshots.primary).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["role permissions", "runtime retirement"])("discards serialized data after %s changes during final target authorization", async change => {
    const api = registry("tenant-a", "local");
    api.register({ programId: "automation-studio", endpoint: "projects", permission: "programs.read", classification: "read", action: "studio:Projects", accessLevel: "Read", resource: { types: ["*"], of: () => ({ kind: "workspace" }) }, handler: snapshotRuntime.lists.a });
    runtime.tenantA.programs.api = api;
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    const entered = deferred();
    const resume = deferred();
    const readFlow = snapshotRuntime.flows.a.getMockImplementation()!;
    let publicationFlowRead = false;
    snapshotRuntime.flows.a.mockImplementation(async (...args: unknown[]) => {
      const result = await readFlow(...args);
      if (snapshotRuntime.snapshots.a.mock.calls.length > 0) publicationFlowRead = true;
      return result;
    });
    const authorize = api.authorize.bind(api);
    let waited = false;
    vi.spyOn(api, "authorize").mockImplementation(async input => {
      const decision = await authorize(input);
      if (!waited && input.action === "studio:GetFlow" && publicationFlowRead) {
        waited = true;
        entered.resolve();
        await resume.promise;
      }
      return decision;
    });
    const pending = GET(snapshotRequest());
    await waitForRouteEntry(entered.promise, pending);
    if (change === "role permissions") await runtime.identity.upsertRole({ id: "operator", permissions: [] });
    else snapshotRuntime.owners.get("a")!.invalidate();
    resume.resolve();
    const response = await pending;
    expect(response.status).toBe(change === "role permissions" ? 403 : 503);
    expect(await response.text()).not.toContain("Project a");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("refuses a stale primary at synchronous handoff without retiring tenant presentation", async () => {
    const present = runtime.presenter.getMockImplementation()!;
    runtime.presenter.mockImplementation((...args: unknown[]) => {
      const selected = present(...args);
      return { ...selected, context: () => {
        const context = selected.context();
        snapshotRuntime.primaryCurrent = false;
        return context;
      } };
    });
    const response = await GET(snapshotRequest());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("Project a");
    const owner = snapshotRuntime.owners.get("a")!;
    expect(owner.isCurrent()).toBe(true);
    expect(owner.forCaller({ userId: "person-a" }).context()?.activeProjectId).toBe("same-project");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
