import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouteIamContract } from "../../../app-route-iam";
import { workspaceRouteContext } from "..";
import { resetRouteRuntime, routeRequest, runtime } from "./route-runtime";

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

const ROUTE = appRouteIamContract("GET", "/api/recordings");
const browserRequest = (domainId = "domain-a") => routeRequest({ cookie: null, bearer: "browser-a-token", url: `https://panel.example.test/api/recordings?domainId=${domainId}` });
beforeEach(resetRouteRuntime);

describe("paired caller's selected workspace authority", () => {
  it("uses only the proved gateway and current primary directory, with all session targets fixed", async () => {
    const selected = await workspaceRouteContext(browserRequest(), ROUTE);
    if (!selected.ok) throw new Error(`Expected a paired caller: ${selected.error}`);
    expect(selected.context.fluxiq).toBe(runtime.tenantA);
    expect(selected.context.binding).toEqual({ channel: "paired-client", workspaceId: "tenant-a", userId: "person-a", sessionId: "gateway-a", trustedClientId: "trust-a", clientId: "browser-a", clientType: "extension", domainId: "domain-a", projectId: "same-project", recordingId: "same-recording" });
    expect(selected.context.caller.actor).toMatchObject({ channel: "paired-client", sessionId: "client-gateway:gateway-a", userId: "person-a" });
    expect(runtime.resolveBrowser).toHaveBeenCalledWith("browser-a-token");
    expect(runtime.tenantA.programs.clientGateway.authorizeToken).toHaveBeenCalledWith("browser-a-token");
    expect(runtime.primary.programs.identityAccess.snapshot).toHaveBeenCalled();
    expect(runtime.primary.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
    expect(runtime.tenantB.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
    expect(runtime.tenantA.programs.identityAccess.snapshot).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    selected.context.release();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["sessionId", "trustedClientId", "clientId", "clientType", "operatorUserId", "projectId", "activeRecordingId"] as const)("refuses a gateway %s switch after selection", async (field) => {
    const selected = await workspaceRouteContext(browserRequest(), ROUTE);
    if (!selected.ok || !runtime.browserSession) throw new Error("Expected an admitted paired route");
    runtime.browserSession[field] = field === "operatorUserId" ? "person-b" : "changed";
    expect(await selected.context.revalidate()).toMatchObject({ ok: false, status: 401 });
    selected.context.release();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["domain", "disabled-user", "missing-role", "gateway-revoke", "proof-revoke", "managed-host"])("refuses current %s authority", async (change) => {
    const selected = await workspaceRouteContext(browserRequest(), ROUTE);
    if (!selected.ok || !runtime.browserSession) throw new Error("Expected an admitted paired route");
    if (change === "domain") runtime.browserSession.metadata.domainId = "domain-b";
    if (change === "disabled-user") await runtime.identity.updateUser({ id: "person-a", enabled: false });
    if (change === "missing-role") runtime.primary.programs.identityAccess.snapshot.mockResolvedValue({ users: [{ id: "person-a", roleId: "absent", enabled: true }], roles: [] });
    if (change === "gateway-revoke") runtime.browserSession = null;
    if (change === "proof-revoke") runtime.browserCurrent = false;
    if (change === "managed-host" && runtime.browserSession) runtime.browserSession.managedHostId = "host-a";
    expect(await selected.context.revalidate()).toMatchObject({ ok: false, status: change === "domain" ? 403 : 401 });
    selected.context.release();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("rejects a foreign URL domain and releases the selected proof lease", async () => {
    expect(await workspaceRouteContext(browserRequest("domain-b"), ROUTE)).toMatchObject({ ok: false, status: 403 });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.primary.programs.identityAccess.snapshot).not.toHaveBeenCalled();
  });
});
