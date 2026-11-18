import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, registry, runtime } from "../../../../../../../../lib/workspaces/routes/tests/route-runtime";
import { assetParams, assetRequest, assets, pairedAssetRequest, PNG_A, resetAssetRuntime, SHA_A } from "./asset-runtime";
import { PUT } from "../route";

vi.mock("../../../../../../../../lib/fluxiq", async () => {
  const { runtime } = await import("../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter, isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.primary };
});
vi.mock("../../../../../../../../server/provisioning-listener", async () => {
  const { runtime } = await import("../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { getPlatformServices: async () => ({ store: runtime.store }) };
});
vi.mock("../../../../../../../../server/browser-trust", async () => {
  const { runtime } = await import("../../../../../../../../lib/workspaces/routes/tests/route-runtime");
  return { resolveServiceClientHttpRoute: runtime.resolveBrowser };
});

beforeEach(resetAssetRuntime);
function delayedBody(request: Request) {
  const entered = deferred();
  const gate = deferred();
  vi.spyOn(request, "arrayBuffer").mockImplementation(async () => {
    entered.resolve();
    await gate.promise;
    return PNG_A.buffer;
  });
  return { entered: entered.promise, finish: () => gate.resolve() };
}

describe("state-asset recording/trace authority across awaits", () => {
  it("passes the initial recording and exact selected gateway session to Core", async () => {
    expect((await PUT(pairedAssetRequest(), assetParams())).status).toBe(201);
    expect(assets.a.write).toHaveBeenCalledWith(expect.objectContaining({ projectId: "same-project", recordingId: "same-recording", expectedSha256: SHA_A,
      traceIntake: { sessionId: "gateway-a", gateway: runtime.tenantA.programs.clientGateway } }));
    expect(assets.primary.write).not.toHaveBeenCalled();
    expect(assets.b.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("passes neither a recording nor trace intake for a panel upload", async () => {
    expect((await PUT(assetRequest(), assetParams())).status).toBe(201);
    expect(assets.a.write.mock.calls[0]?.[0]).not.toHaveProperty("recordingId");
    expect(assets.a.write.mock.calls[0]?.[0]).not.toHaveProperty("traceIntake");
  });

  it.each(["sessionId", "trustedClientId", "clientId", "clientType", "operatorUserId", "projectId", "activeRecordingId", "domain", "gateway-revoke", "proof-revoke", "managed-host"] as const)("refuses changed paired %s after body read without storing or tracing", async field => {
    const request = pairedAssetRequest();
    const body = delayedBody(request);
    const pending = PUT(request, assetParams());
    await body.entered;
    expect(runtime.releases.a).not.toHaveBeenCalled();
    const browser = assets.browser;
    if (!browser) throw new Error("Expected a fixture browser");
    if (field === "domain") browser.metadata.domainId = "domain-b";
    else if (field === "projectId") browser.projectId = null;
    else if (field === "operatorUserId") browser.operatorUserId = "person-b";
    else if (field === "gateway-revoke") assets.browser = null;
    else if (field === "proof-revoke") runtime.browserCurrent = false;
    else if (field === "managed-host") browser.managedHostId = "new-host";
    else browser[field] = "changed";
    body.finish();
    const response = await pending;
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "The upload's authorization is no longer current." });
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(assets.a.trace).not.toHaveBeenCalled();
    expect(assets.b.write).not.toHaveBeenCalled();
    expect(assets.primary.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["membership", "default", "session", "user", "role", "iam", "abort"])("refuses panel %s changes while consuming the body", async change => {
    if (change === "role") runtime.tenantA.programs.api = registry("tenant-a", "local");
    const controller = new AbortController();
    const request = assetRequest({ signal: controller.signal });
    const body = delayedBody(request);
    const pending = PUT(request, assetParams());
    await body.entered;
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "default") runtime.memberships.set("person-a", [{ userId: "person-a", workspaceId: "tenant-b", status: "active", createdAtMs: 0 }]);
    if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
    if (change === "user") await runtime.identity.updateUser({ id: "person-a", enabled: false });
    if (change === "role") await runtime.identity.upsertRole({ id: "operator", permissions: [] });
    if (change === "iam") runtime.policies.set("tenant-a", "none");
    if (change === "abort") controller.abort();
    body.finish();
    expect((await pending).status).toBe(403);
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(assets.a.trace).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).toHaveBeenCalledTimes(1);
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("rechecks the target project's current domain after the body and retains its refusal code", async () => {
    const request = pairedAssetRequest();
    const body = delayedBody(request);
    const pending = PUT(request, assetParams());
    await body.entered;
    assets.domains.set("same-project", "domain-b");
    body.finish();
    const response = await pending;
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, errorCode: "authorization.project_domain" });
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("preserves unavailable policy storage as503 after body consumption", async () => {
    const request = pairedAssetRequest();
    const body = delayedBody(request);
    const pending = PUT(request, assetParams());
    await body.entered;
    runtime.policyError = true;
    body.finish();
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Request authority could not be verified." });
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("rechecks the complete caller after a pending project-domain lookup before reading a body", async () => {
    const entered = deferred();
    const gate = deferred();
    assets.a.domain.mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
    });
    const request = pairedAssetRequest();
    const read = vi.spyOn(request, "arrayBuffer");
    const pending = PUT(request, assetParams());
    await entered.promise;
    if (!assets.browser) throw new Error("Expected a fixture browser");
    assets.browser.activeRecordingId = "new-recording";
    gate.resolve();
    expect((await pending).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    expect(assets.a.write).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("retains the lease during a write and withholds its response after current membership ends", async () => {
    const entered = deferred();
    const gate = deferred();
    assets.a.write.mockImplementationOnce(async () => {
      entered.resolve();
      await gate.promise;
      return { privatePayload: "must not be published" };
    });
    const pending = PUT(assetRequest(), assetParams());
    await entered.promise;
    expect(runtime.releases.a).not.toHaveBeenCalled();
    runtime.memberships.set("person-a", []);
    gate.resolve();
    const response = await pending;
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("privatePayload");
    expect(assets.a.write).toHaveBeenCalledOnce();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
