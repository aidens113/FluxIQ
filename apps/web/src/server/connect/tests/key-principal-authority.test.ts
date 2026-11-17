import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ enabled: true, member: true, account: true, revoked: false, signedIn: false, rolePermissions: ["programs.write", "secrets.manage"], workspace: "tenant", owner: "owner" }));
vi.mock("../../../lib/fluxiq", () => ({
  getFluxIQWorkspaces: () => ({ tenancy: "multi", primaryWorkspaceId: "primary" }),
  getFluxIQAfterReload: async () => ({ paths: { fluxiq: "isolated-unused-path" }, programs: { identityAccess: {
    snapshot: async () => ({ users: [{ id: "owner", roleId: "role", enabled: f.enabled }], roles: [{ id: "role", permissions: f.rolePermissions }] }),
    validateSession: async () => f.signedIn && f.enabled ? { user: { id: "owner" }, role: { id: "role", permissions: f.rolePermissions }, session: { expiresAtMs: Date.now() + 60_000 } } : null
  } } })
}));
vi.mock("../../provisioning-listener", () => ({ getPlatformServices: async () => ({ store: {
  getAccount: async () => ({ status: f.account ? "active" : "disabled", deletion: null }),
  getWorkspace: async () => ({ workspaceId: "tenant" }),
  getMembership: async () => ({ status: f.member ? "active" : "removed" })
} }) }));
vi.mock("../../browser-trust", () => ({ getBrowserTrustRepository: () => ({ scopedStore: (workspace: string) => ({ load: async () => workspace === f.workspace ? [{ trustedClientId: "client", approvedByUserId: f.owner, expiresAt: Date.now() + 60_000, ...(f.revoked ? { revokedAt: 1 } : {}) }] : [] }) }) }));
import { workspaceKeyPrincipalAuthority } from "../key-principal-authority";
beforeEach(() => { Object.assign(f, { enabled: true, member: true, account: true, revoked: false, signedIn: false, rolePermissions: ["programs.write", "secrets.manage"], workspace: "tenant", owner: "owner" }); });
describe("hosted saved-key principal authority", () => {
  const principal = { kind: "client" as const, userId: "owner", trustedClientId: "client" };
  it("uses independent client trust even when the approving panel has signed out", async () => {
    const result = await workspaceKeyPrincipalAuthority("tenant")(principal);
    expect(result?.actor).toMatchObject({ userId: "owner", channel: "paired-client", permissions: ["programs.write"] });
  });
  it.each(["enabled", "member", "account"] as const)("rechecks current %s on every call", async (field) => {
    const authority = workspaceKeyPrincipalAuthority("tenant");
    expect(await authority(principal)).not.toBeNull();
    f[field] = false;
    expect(await authority(principal)).toBeNull();
  });
  it("rejects durable client revoke, foreign owner and foreign tenant", async () => {
    const authority = workspaceKeyPrincipalAuthority("tenant");
    f.revoked = true;
    expect(await authority(principal)).toBeNull();
    f.revoked = false;
    f.owner = "someone-else";
    expect(await authority(principal)).toBeNull();
    f.owner = "owner";
    f.workspace = "other-tenant";
    expect(await authority(principal)).toBeNull();
  });
  it("refreshes role permissions and refuses a signed-out panel principal", async () => {
    const authority = workspaceKeyPrincipalAuthority("tenant");
    f.rolePermissions = ["programs.read"];
    expect((await authority(principal))?.actor.permissions).toEqual(["programs.read"]);
    expect(await authority({ kind: "session", userId: "owner", sessionId: "expired-panel" })).toBeNull();
  });
});
