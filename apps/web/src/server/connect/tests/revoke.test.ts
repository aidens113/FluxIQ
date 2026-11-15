import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeConnectCredential } from "../revoke";

const state = vi.hoisted(() => ({ proof: vi.fn(), workspace: vi.fn(), acquire: vi.fn(), revoke: vi.fn(), release: vi.fn() }));
vi.mock("../../browser-trust", () => ({ getBrowserTrustRepository: () => ({ lookupCredential: state.proof }) }));
vi.mock("../../provisioning-listener", () => ({ getPlatformServices: async () => ({ store: { getWorkspace: state.workspace } }) }));
vi.mock("../../../lib/fluxiq", () => ({
  getFluxIQAfterReload: async () => ({ paths: { fluxiq: "synthetic-platform-root" } }),
  getFluxIQWorkspaces: () => ({ tenancy: "multi", primaryWorkspaceId: "workspace-main", acquire: state.acquire })
}));
const binding = { workspaceId: "tenant-one", trustedClientId: "trust-one", approvedByUserId: "disabled-person" };
beforeEach(() => {
  vi.resetAllMocks();
  state.proof.mockResolvedValue({ status: "current", binding });
  state.workspace.mockResolvedValue({ workspaceId: "tenant-one" });
  state.acquire.mockResolvedValue({ release: state.release, fluxiq: { programs: { clientGateway: { revokeTrustedClient: state.revoke } } } });
  state.revoke.mockResolvedValue(true);
});
describe("proved client self-revocation", () => {
  it("revokes only the proved tenant trust even for a disabled owner", async () => {
    await revokeConnectCredential("synthetic-token");
    expect(state.acquire).toHaveBeenCalledWith("tenant-one");
    expect(state.revoke).toHaveBeenCalledWith("trust-one", expect.any(String));
    expect(state.release).toHaveBeenCalledOnce();
  });
  it.each([{ status: "invalid", reason: "forged" }, { status: "inactive", reason: "expired", binding }])("leaves no valid-token oracle for %j", async (proof) => {
    state.proof.mockResolvedValue(proof);
    await expect(revokeConnectCredential("synthetic-token")).resolves.toBeUndefined();
    expect(state.acquire).not.toHaveBeenCalled();
  });
  it("does not recreate a deleted workspace to revoke its old trust", async () => {
    state.workspace.mockResolvedValue(null);
    await revokeConnectCredential("synthetic-token");
    expect(state.acquire).not.toHaveBeenCalled();
  });
  it("propagates persistence failure after releasing the tenant", async () => {
    state.revoke.mockRejectedValue(new Error("write failed"));
    await expect(revokeConnectCredential("synthetic-token")).rejects.toThrow("write failed");
    expect(state.release).toHaveBeenCalledOnce();
  });
});
