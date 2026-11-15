import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConnectApproval } from "../approval";

const state = vi.hoisted(() => ({
  tenancy: "multi", snapshot: vi.fn(), getAccount: vi.fn(), listMembershipsOfUser: vi.fn(), getWorkspace: vi.fn()
}));
vi.mock("../../../lib/fluxiq", () => ({
  getFluxIQAfterReload: async () => ({ programs: { identityAccess: { snapshot: state.snapshot } } }),
  getFluxIQWorkspaces: () => ({ tenancy: state.tenancy, primaryWorkspaceId: "workspace-main" })
}));
vi.mock("../../provisioning-listener", () => ({ getPlatformServices: async () => ({ store: state }) }));
const digest = "a".repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  state.tenancy = "multi";
  state.snapshot.mockResolvedValue({ users: [{ id: "person-one", enabled: true }], sessions: [{ id: digest, userId: "person-one", expiresAtMs: Date.now() + 60_000 }] });
  state.getAccount.mockResolvedValue({ userId: "person-one", status: "active", deletion: null, emailVerifiedAtMs: 1, displayName: "Test person", email: "person@example.test" });
  state.listMembershipsOfUser.mockResolvedValue([{ workspaceId: "tenant-one", status: "active", createdAtMs: 1 }]);
  state.getWorkspace.mockResolvedValue({ workspaceId: "tenant-one" });
});
describe("current platform consent authority", () => {
  it("derives user and tenant from the live session digest", async () => {
    expect(await validateConnectApproval(digest)).toMatchObject({ allowed: true, user: { userId: "person-one" }, workspace: { workspaceId: "tenant-one" } });
    expect(state.getAccount).toHaveBeenCalledWith("person-one");
  });
  it("refuses raw or malformed session values before opening the platform", async () => {
    expect(await validateConnectApproval("raw-cookie")).toEqual({ allowed: false, error: "invalid_grant" });
    expect(state.snapshot).not.toHaveBeenCalled();
  });
  it.each([{ sessions: [] }, { sessions: [{ id: digest, userId: "person-one", expiresAtMs: 1 }] }])("refuses revoked or expired sessions", async ({ sessions }) => {
    state.snapshot.mockResolvedValue({ users: [{ id: "person-one", enabled: true }], sessions });
    expect(await validateConnectApproval(digest)).toEqual({ allowed: false, error: "invalid_grant" });
    expect(state.getAccount).not.toHaveBeenCalled();
  });
  it("refuses a disabled identity", async () => {
    state.snapshot.mockResolvedValue({ users: [{ id: "person-one", enabled: false }], sessions: [{ id: digest, userId: "person-one", expiresAtMs: Date.now() + 60_000 }] });
    expect(await validateConnectApproval(digest)).toEqual({ allowed: false, error: "account_disabled" });
  });
  it.each([null, { status: "disabled", deletion: null }, { status: "active", deletion: {} }])("refuses unavailable account state %j", async (account) => {
    state.getAccount.mockResolvedValue(account);
    expect(await validateConnectApproval(digest)).toEqual({ allowed: false, error: "account_disabled" });
  });
  it("requires service email verification", async () => {
    state.getAccount.mockResolvedValue({ status: "active", deletion: null, emailVerifiedAtMs: null });
    expect(await validateConnectApproval(digest)).toEqual({ allowed: false, error: "email_unverified" });
  });
  it("refuses removed membership without selecting primary", async () => {
    state.listMembershipsOfUser.mockResolvedValue([{ workspaceId: "tenant-one", status: "removed", createdAtMs: 1 }]);
    expect(await validateConnectApproval(digest)).toEqual({ allowed: false, error: "invalid_grant" });
  });
});
