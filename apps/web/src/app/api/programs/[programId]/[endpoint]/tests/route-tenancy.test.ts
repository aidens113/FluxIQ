import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
  const release = vi.fn();
  const validateSession = vi.fn();
  const primary = { programs: { identityAccess: { validateSession, snapshot: vi.fn() }, api: { call: vi.fn() }, clientGateway: { authorizeToken: vi.fn() } } };
  const tenant = {
    programs: {
      identityAccess: { validateSession: vi.fn(), snapshot: vi.fn() },
      api: { call: vi.fn(), endpoints: vi.fn() },
      clientGateway: { authorizeToken: vi.fn() },
      secretKeys: { credentialUnlocks: { presentPanelSession: vi.fn() } }
    }
  };
  return {
    cookie: "person-a-cookie" as string | undefined,
    release,
    primary,
    tenant,
    presenter: vi.fn(),
    manager: { tenancy: "multi", primaryWorkspaceId: "workspace-main", primary: () => ({ fluxiq: primary }), acquire: vi.fn() },
    store: { listMembershipsOfUser: vi.fn(), getWorkspace: vi.fn() }
  };
});

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => runtime.cookie ? { value: runtime.cookie } : undefined }) }));
vi.mock("../../../../../../lib/fluxiq", () => ({ getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter }));
vi.mock("../../../../../../server/provisioning-listener", () => ({ getPlatformServices: async () => ({ store: runtime.store }) }));

import { GET, POST } from "../route";

const params = { params: Promise.resolve({ programId: "automation-studio", endpoint: "client-gateway-snapshot" }) };
const request = () => new Request("https://panel.example.test/api/programs/automation-studio/client-gateway-snapshot", { headers: { authorization: "Bearer another-tenant-token" } });

beforeEach(() => {
  vi.clearAllMocks();
  runtime.cookie = "person-a-cookie";
  runtime.primary.programs.identityAccess.validateSession.mockResolvedValue({ user: { id: "person-a" }, role: { id: "member", permissions: ["programs.read"] }, session: { expiresAtMs: Date.now() + 60_000 } });
  runtime.store.listMembershipsOfUser.mockResolvedValue([{ workspaceId: "tenant-a", userId: "person-a", status: "active", createdAtMs: 0 }]);
  runtime.store.getWorkspace.mockResolvedValue({ workspaceId: "tenant-a" });
  runtime.tenant.programs.api.call.mockResolvedValue({ ok: true, payload: { sessions: [] } });
  runtime.manager.acquire.mockResolvedValue({ workspaceId: "tenant-a", fluxiq: runtime.tenant, release: runtime.release });
});

describe("web program routing to a held tenant", () => {
  it("dispatches a valid cookie to A despite B's bearer and omits primary context from the answer", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, payload: { sessions: [] } });
    expect(runtime.manager.acquire).toHaveBeenCalledTimes(1);
    expect(runtime.manager.acquire).toHaveBeenCalledWith("tenant-a");
    expect(runtime.tenant.programs.api.call).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: "person-a", sessionId: "person-a-cookie", channel: "panel" }) }));
    expect(runtime.primary.programs.api.call).not.toHaveBeenCalled();
    expect(runtime.primary.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
    expect(runtime.tenant.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
    expect(runtime.tenant.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(runtime.presenter).not.toHaveBeenCalled();
    expect(runtime.release).toHaveBeenCalledOnce();
  });

  it.each(["absent-cookie", "invalid-cookie", "no-membership", "missing-workspace"])("refuses service %s without dispatching or acquiring primary", async (state) => {
    if (state === "absent-cookie") runtime.cookie = undefined;
    if (state === "invalid-cookie") runtime.primary.programs.identityAccess.validateSession.mockResolvedValue(null);
    if (state === "no-membership") runtime.store.listMembershipsOfUser.mockResolvedValue([]);
    if (state === "missing-workspace") runtime.store.getWorkspace.mockResolvedValue(null);
    const response = await GET(request(), params);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Authentication required" });
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.primary.programs.api.call).not.toHaveBeenCalled();
    expect(runtime.tenant.programs.api.call).not.toHaveBeenCalled();
    expect(runtime.release).not.toHaveBeenCalled();
  });

  it("propagates platform lookup failures before acquiring or dispatching", async () => {
    runtime.store.getWorkspace.mockRejectedValueOnce(new Error("Workspace lookup failed"));
    await expect(GET(request(), params)).rejects.toThrow("Workspace lookup failed");
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.primary.programs.api.call).not.toHaveBeenCalled();
    expect(runtime.tenant.programs.api.call).not.toHaveBeenCalled();
  });

  it("releases its tenant lease when a handler throws", async () => {
    runtime.tenant.programs.api.call.mockRejectedValueOnce(new Error("Handler failed"));
    await expect(GET(request(), params)).rejects.toThrow("Handler failed");
    expect(runtime.release).toHaveBeenCalledOnce();
  });

  it("releases its tenant lease when platform session revalidation fails", async () => {
    runtime.primary.programs.identityAccess.validateSession.mockResolvedValueOnce({ user: { id: "person-a" } }).mockRejectedValueOnce(new Error("Identity lookup failed"));
    await expect(GET(request(), params)).rejects.toThrow("Identity lookup failed");
    expect(runtime.release).toHaveBeenCalledOnce();
    expect(runtime.tenant.programs.api.call).not.toHaveBeenCalled();
  });

  it("does not fall back to a bearer when the platform cookie is revoked after tenant selection", async () => {
    runtime.primary.programs.identityAccess.validateSession.mockResolvedValueOnce({ user: { id: "person-a" } }).mockResolvedValueOnce(null);
    const response = await GET(request(), params);
    expect(response.status).toBe(401);
    expect(runtime.tenant.programs.clientGateway.authorizeToken).not.toHaveBeenCalled();
    expect(runtime.tenant.programs.api.call).not.toHaveBeenCalled();
    expect(runtime.release).toHaveBeenCalledOnce();
  });

  it("releases after a POST body read fails and the handler refuses its missing body", async () => {
    const post = new Request(request(), { method: "POST", body: "invalid-json" });
    runtime.tenant.programs.api.call.mockResolvedValueOnce({ ok: false, errorCode: "validation.required", error: "Body required" });
    expect((await POST(post, params)).status).toBe(400);
    expect(runtime.release).toHaveBeenCalledOnce();
  });
});
