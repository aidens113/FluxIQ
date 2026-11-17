import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";
import { resetSnapshotRuntime, snapshotRequest, snapshotRuntime } from "./snapshot-runtime";
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
const paired = () => snapshotRequest({ cookie: null, bearer: "browser-a-token" });

describe("held tenant gateway snapshot", () => {
  it("keeps colliding project/browser ids in two tenants and releases each lease once", async () => {
    const first = await GET(snapshotRequest());
    const second = await GET(snapshotRequest({ cookie: runtime.sessions.b, url: "https://panel.example.test/api/client-gateway/snapshot?domainId=domain-b" }));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await first.json()).payload.webRuntime).toMatchObject({ workspaceId: "tenant-a", runtimeId: "runtime-a", automationStudio: { activeProjectId: "same-project", activeFlowId: "same-flow", activeProjectName: "Project a" } });
    expect((await second.json()).payload.webRuntime).toMatchObject({ workspaceId: "tenant-b", runtimeId: "runtime-b", automationStudio: { activeProjectId: "same-project", activeProjectName: "Project b" } });
    expect(runtime.presenter.mock.calls.map(call => call.slice(0, 2))).toEqual([["tenant-a", runtime.tenantA], ["tenant-b", runtime.tenantB]]);
    expect(snapshotRuntime.snapshots.primary).not.toHaveBeenCalled();
    expect(snapshotRuntime.lists.primary).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
    expect(first.headers.get("cache-control")).toBe("private, no-store");
  });

  it("keeps the cookie ahead of bearer and refuses invalid cookies without fallback", async () => {
    expect((await GET(snapshotRequest({ bearer: "stale-token" }))).status).toBe(200);
    expect((await GET(snapshotRequest({ cookie: "invalid", bearer: "browser-a-token" }))).status).toBe(401);
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
    expect(snapshotRuntime.snapshots.a).toHaveBeenCalledOnce();
    expect((await GET(snapshotRequest({ cookie: null }))).status).toBe(401);
    expect((await GET(snapshotRequest({ cookie: null, bearer: "invalid" }))).status).toBe(401);
  });

  it("projects only owned service rows and required browser consumer fields", async () => {
    const response = await GET(snapshotRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.payload.sessions.map((session: { sessionId: string }) => session.sessionId)).toEqual(["gateway-a", "gateway-same-client", "gateway-other-client"]);
    expect(body.payload.trustedClients.map((client: { trustedClientId: string }) => client.trustedClientId)).toEqual(["trust-a", "trust-other"]);
    expect(body.payload.sessions[0]).toMatchObject({ sessionId: "gateway-a", clientId: "browser-a", clientType: "extension", name: "Browser a", status: "ready", lastSeenAt: 2, projectId: "same-project", activeRecordingId: "same-recording", capabilities: [{ id: "capture", label: "Capture", kind: "action", actionTypes: ["click"] }] });
    expect(body.payload.trustedClients[0]).toMatchObject({ trustedClientId: "trust-a", name: "Trusted a", status: "active", approvedAt: 1, expiresAt: 10000 });
    expect(body.payload.pairings).toEqual([]);
    expect(body.payload.auditLog).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("private-");
    expect(body.payload.webRuntime).not.toHaveProperty("hostModulePath");
    expect(body.payload.webRuntime).not.toHaveProperty("hostRoot");
  });

  it.each(["service", "local", "self-hosted"])("restricts a paired caller to its exact session/client/trust on %s", async profile => {
    vi.stubEnv("FLUXIQ_PROFILE", profile);
    const response = await GET(paired());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.payload.sessions.map((session: { sessionId: string }) => session.sessionId)).toEqual(["gateway-a"]);
    expect(body.payload.trustedClients.map((client: { trustedClientId: string }) => client.trustedClientId)).toEqual(["trust-a"]);
    expect(body.payload.webRuntime.automationStudio).toMatchObject({ activeProjectId: "same-project", activeProjectName: "Project a" });
    expect(runtime.presenter).toHaveBeenCalledWith("tenant-a", runtime.tenantA, { userId: "person-a", channel: "paired-client", clientId: "browser-a" });
    expect(body.payload.pairings).toEqual([]);
    expect(body.payload.auditLog).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("private-");
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it.each(["local", "self-hosted"])("deliberately preserves authorized %s panel operator visibility", async profile => {
    vi.stubEnv("FLUXIQ_PROFILE", profile);
    const response = await GET(snapshotRequest());
    expect(response.status).toBe(200);
    const payload = (await response.json()).payload;
    expect(payload.sessions).toHaveLength(5);
    expect(payload.trustedClients).toHaveLength(3);
    expect(payload.pairings[0].pairingCode).toBe("private-pairing-code");
    expect(payload.auditLog[0].metadata).toEqual({ private: "private-audit-metadata" });
  });

  it("uses the existing own latest-project helper without creating a project", async () => {
    if (!runtime.browserSession) throw new Error("Expected a browser");
    Object.assign(runtime.browserSession, { projectId: null });
    snapshotRuntime.owners.get("a")!.forCaller({ userId: "person-a" }).beginContextWrite().commit({ activeProjectId: null });
    snapshotRuntime.projects.get("a")!.push({ id: "foreign-newest", name: "Foreign project", domainId: "domain-a", ownerUserId: "person-foreign", updatedAt: 100 });
    const calls = vi.spyOn(runtime.tenantA.programs.api, "call");
    const response = await GET(paired());
    expect(response.status).toBe(200);
    expect((await response.json()).payload.webRuntime.automationStudio).toMatchObject({ activeProjectId: "same-project", activeProjectName: "Project a" });
    expect(calls.mock.calls.every(([input]) => input.endpoint === "projects")).toBe(true);
    expect(calls.mock.calls.some(([input]) => input.endpoint === "create-project")).toBe(false);
  });

  it("does not expose a stored project preference from another domain", async () => {
    snapshotRuntime.projects.get("a")![0]!.domainId = "domain-foreign";
    const response = await GET(snapshotRequest());
    expect(response.status).toBe(200);
    const payload = (await response.json()).payload;
    expect(payload.webRuntime.automationStudio).toMatchObject({ activeProjectId: null, activeFlowId: null, activeProjectName: null });
    expect(payload.sessions.every((session: object) => !("projectId" in session))).toBe(true);
    expect(snapshotRuntime.lists.a).not.toHaveBeenCalled();
  });

  it("keeps name-less visible projects usable", async () => {
    snapshotRuntime.projects.get("a")![0]!.name = "  ";
    const response = await GET(paired());
    expect(response.status).toBe(200);
    expect((await response.json()).payload.webRuntime.automationStudio).toMatchObject({ activeProjectId: "same-project", activeProjectName: null });
  });

  it("sanitizes selected gateway failure and still releases the held lease", async () => {
    snapshotRuntime.ready.a.mockRejectedValueOnce(new Error("/private/gateway secret-value"));
    const response = await GET(snapshotRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Client gateway snapshot could not be read." });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(snapshotRuntime.snapshots.primary).not.toHaveBeenCalled();
  });
});
