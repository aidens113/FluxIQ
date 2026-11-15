import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
  const validateSession = vi.fn();
  const primary = { programs: { identityAccess: { validateSession, snapshot: vi.fn() } } };
  const tenant = { programs: { identityAccess: { validateSession: vi.fn(), snapshot: vi.fn() } } };
  return {
    primary,
    tenant,
    release: vi.fn(),
    presenter: vi.fn(),
    resolveBrowser: vi.fn(),
    manager: { tenancy: "multi", primaryWorkspaceId: "workspace-main", primary: () => ({ fluxiq: primary }), acquire: vi.fn() },
    store: { getAccount: vi.fn(), listMembershipsOfUser: vi.fn(), getWorkspace: vi.fn() }
  };
});

vi.mock("../../fluxiq", () => ({ getFluxIQWorkspaces: () => runtime.manager, getFluxIQWebRuntimeStatus: runtime.presenter }));
vi.mock("../../../server/provisioning-listener", () => ({ getPlatformServices: async () => ({ store: runtime.store }) }));
vi.mock("../../../server/browser-trust", () => ({ resolveServiceClientHttpRoute: runtime.resolveBrowser }));

import { FLUXIQ_SESSION_COOKIE } from "../../session-cookie";
import { workspaceProgramContext } from "../program-context";

function request(cookie = "panel-cookie", bearer?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${FLUXIQ_SESSION_COOKIE}=${cookie}`);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  return new Request("https://panel.example.test/api/programs/example/snapshot", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime.manager.tenancy = "multi";
  runtime.resolveBrowser.mockResolvedValue(null);
  runtime.primary.programs.identityAccess.validateSession.mockResolvedValue({ user: { id: "person-a" } });
  runtime.store.getAccount.mockResolvedValue({ status: "active", deletion: null });
  runtime.store.listMembershipsOfUser.mockResolvedValue([{ workspaceId: "tenant-a", userId: "person-a", status: "active", createdAtMs: 0 }]);
  runtime.store.getWorkspace.mockResolvedValue({ workspaceId: "tenant-a" });
  runtime.manager.acquire.mockImplementation(async (workspaceId: string) => ({
    workspaceId,
    fluxiq: workspaceId === runtime.manager.primaryWorkspaceId ? runtime.primary : runtime.tenant,
    release: runtime.release
  }));
});

describe("a web program's workspace context", () => {
  it.each([null, { status: "disabled", deletion: null }, { status: "active", deletion: { scheduled: true } }])("refuses inactive account state before workspace acquisition: %j", async (account) => {
    runtime.store.getAccount.mockResolvedValue(account);
    expect(await workspaceProgramContext(request())).toBeNull();
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
  });

  it("selects the cookie's tenant and supplies platform identity without the primary runtime presenter", async () => {
    const selected = await workspaceProgramContext(request("panel-cookie", "other-tenant-token"));
    expect(runtime.primary.programs.identityAccess.validateSession).toHaveBeenCalledWith("panel-cookie");
    expect(runtime.manager.acquire).toHaveBeenCalledTimes(1);
    expect(runtime.manager.acquire).toHaveBeenCalledWith("tenant-a");
    expect(selected?.context.fluxiq).toBe(runtime.tenant);
    expect(selected?.context.identityAuthority).toBe(runtime.primary.programs.identityAccess);
    expect(selected?.context.webRuntimeStatus).toBeUndefined();
    expect(selected?.acceptBearer).toBe(false);
    expect(runtime.presenter).not.toHaveBeenCalled();
    selected?.release();
    expect(runtime.release).toHaveBeenCalledOnce();
  });

  it("refuses an unproved service bearer without acquiring primary or scanning tenant gateways", async () => {
    expect(await workspaceProgramContext(request("", "browser-token"))).toBeNull();
    expect(runtime.primary.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).toHaveBeenCalledWith("browser-token");
  });

  it("refuses invalid service cookies despite a bearer", async () => {
    runtime.primary.programs.identityAccess.validateSession.mockResolvedValue(null);
    expect(await workspaceProgramContext(request("expired-cookie", "browser-token"))).toBeNull();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
  });

  it("freezes a proved browser channel without forwarding a cookie or choosing a body-supplied tenant", async () => {
    const guard = vi.fn(async () => true);
    runtime.resolveBrowser.mockResolvedValue({ lease: { workspaceId: "browser-tenant", fluxiq: runtime.tenant, release: runtime.release }, revalidateAuthority: guard });
    const selected = await workspaceProgramContext(request("", "browser-token"));
    expect(selected?.sessionId).toBeUndefined();
    expect(selected?.authorization).toBe("Bearer browser-token");
    expect(selected?.context.identityAuthority).toBe(runtime.primary.programs.identityAccess);
    expect(await selected?.context.revalidateAuthority?.()).toBe(true);
    expect(guard).toHaveBeenCalledOnce();
    selected?.release();
    expect(runtime.release).toHaveBeenCalledOnce();
  });

  it("releases a selected cookie workspace if membership changes during acquisition", async () => {
    runtime.manager.acquire.mockImplementationOnce(async () => {
      runtime.store.listMembershipsOfUser.mockResolvedValue([]);
      return { workspaceId: "tenant-a", fluxiq: runtime.tenant, release: runtime.release };
    });
    expect(await workspaceProgramContext(request("panel-cookie", "other-token"))).toBeNull();
    expect(runtime.release).toHaveBeenCalledOnce();
    expect(runtime.resolveBrowser).not.toHaveBeenCalled();
  });

  it("keeps checking the cookie's original user and workspace after selection", async () => {
    const selected = await workspaceProgramContext(request());
    expect(selected?.authorization).toBeNull();
    expect(await selected?.context.revalidateAuthority?.()).toBe(true);
    runtime.primary.programs.identityAccess.validateSession.mockResolvedValue({ user: { id: "person-b" } });
    expect(await selected?.context.revalidateAuthority?.()).toBe(false);
    selected?.release();
  });

  it("releases the tenant when post-acquisition authority throws", async () => {
    runtime.manager.acquire.mockImplementationOnce(async () => {
      runtime.store.getAccount.mockRejectedValueOnce(new Error("Synthetic account read failure"));
      return { workspaceId: "tenant-a", fluxiq: runtime.tenant, release: runtime.release };
    });
    await expect(workspaceProgramContext(request())).rejects.toThrow("Synthetic account read failure");
    expect(runtime.release).toHaveBeenCalledOnce();
  });

  it.each(["absent", "removed", "primary", "dangling"])("refuses %s workspace membership before acquisition", async (state) => {
    if (state === "absent") runtime.store.listMembershipsOfUser.mockResolvedValue([]);
    if (state === "removed") runtime.store.listMembershipsOfUser.mockResolvedValue([{ workspaceId: "tenant-a", status: "removed", createdAtMs: 0 }]);
    if (state === "primary") runtime.store.listMembershipsOfUser.mockResolvedValue([{ workspaceId: "workspace-main", status: "active", createdAtMs: 0 }]);
    if (state === "dangling") runtime.store.getWorkspace.mockResolvedValue(null);
    expect(await workspaceProgramContext(request())).toBeNull();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
  });

  it.each(["listMembershipsOfUser", "getWorkspace"] as const)("propagates %s failures before acquiring anything", async (method) => {
    runtime.store[method].mockRejectedValueOnce(new Error("Platform lookup failed"));
    await expect(workspaceProgramContext(request())).rejects.toThrow("Platform lookup failed");
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
  });

  it("holds the single primary without requiring a panel cookie and retains its legacy presenter", async () => {
    runtime.manager.tenancy = "single";
    const selected = await workspaceProgramContext(request("", "local-browser-token"));
    expect(runtime.manager.acquire).toHaveBeenCalledTimes(1);
    expect(runtime.manager.acquire).toHaveBeenCalledWith("workspace-main");
    expect(selected?.context.fluxiq).toBe(runtime.primary);
    expect(selected?.context.webRuntimeStatus).toBe(runtime.presenter);
    expect(selected?.context.identityAuthority).toBeUndefined();
    expect(selected?.acceptBearer).toBe(true);
    expect(runtime.primary.programs.identityAccess.validateSession).not.toHaveBeenCalled();
    expect(runtime.store.listMembershipsOfUser).not.toHaveBeenCalled();
    selected?.release();
    expect(runtime.release).toHaveBeenCalledOnce();
  });
});
