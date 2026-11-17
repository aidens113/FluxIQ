import { beforeEach, describe, expect, it, vi } from "vitest";
import { keyManagementContext } from "../context";

const state = vi.hoisted(() => ({ validate: vi.fn(), workspace: vi.fn(), acquire: vi.fn(), authorize: vi.fn(), release: vi.fn(), cookie: "synthetic-cookie" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock("../../../../lib/workspaces", () => ({ sessionWorkspaceId: state.workspace }));
vi.mock("../../../../lib/fluxiq", () => ({
  getFluxIQAfterReload: async () => ({ programs: { identityAccess: { validateSession: state.validate } } }),
  getFluxIQWorkspaces: () => ({ acquire: state.acquire })
}));
const auth = { session: { id: "synthetic-cookie" }, user: { id: "person-one" }, role: { id: "viewer", permissions: [] } };
beforeEach(() => {
  vi.resetAllMocks();
  state.cookie = "synthetic-cookie";
  state.validate.mockResolvedValue(auth);
  state.workspace.mockResolvedValue("tenant-one");
  state.authorize.mockResolvedValue({ allowed: true });
  state.acquire.mockResolvedValue({ release: state.release, fluxiq: { programs: { api: { authorize: state.authorize } } } });
});
describe("tenant IAM for personal API keys", () => {
  it("uses tenant policy, the real cookie actor and the own-user resource", async () => {
    expect(await keyManagementContext("POST")).toEqual({ userId: "person-one", workspaceId: "tenant-one" });
    expect(state.acquire).toHaveBeenCalledWith("tenant-one");
    expect(state.authorize).toHaveBeenCalledWith(expect.objectContaining({ action: "iam:EnrollApiKey", actor: expect.objectContaining({ userId: "person-one", sessionId: state.cookie }), resources: { kind: "user", self: true } }));
    expect(state.release).toHaveBeenCalledOnce();
  });
  it("refuses policy denial and still releases storage", async () => {
    state.authorize.mockResolvedValue({ allowed: false, response: { error: "sensitive policy detail" } });
    await expect(keyManagementContext("DELETE")).rejects.toThrow("Key management is not permitted");
    expect(state.release).toHaveBeenCalledOnce();
  });
  it("refuses a session revoked while the workspace was opening", async () => {
    state.validate.mockResolvedValueOnce(auth).mockResolvedValueOnce(null);
    expect(await keyManagementContext("GET")).toBeNull();
    expect(state.authorize).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledOnce();
  });
  it("opens nothing without the session cookie", async () => {
    state.cookie = "";
    expect(await keyManagementContext()).toBeNull();
    expect(state.acquire).not.toHaveBeenCalled();
  });
});
