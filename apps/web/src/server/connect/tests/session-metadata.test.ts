import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceSessionMetadata } from "../session-metadata";

const f = vi.hoisted(() => {
  const tenant = { primary: false };
  const manager = { tenancy: "multi", primaryWorkspaceId: "primary", get: vi.fn() };
  return { tenant, manager, snapshot: vi.fn(), getAccount: vi.fn(), getWorkspace: vi.fn(), getMembership: vi.fn() };
});
vi.mock("../../../lib/fluxiq", () => ({
  getFluxIQWorkspaces: () => f.manager,
  getFluxIQAfterReload: async () => ({ programs: { identityAccess: { snapshot: f.snapshot } } })
}));
vi.mock("../../provisioning-listener", () => ({ getPlatformServices: async () => ({ store: f }) }));

const account = { userId: "person", status: "active", deletion: null, emailVerifiedAtMs: 1, displayName: "Actual person", email: "person@example.test" };
const principal = { userId: "person", trustedClientId: "trusted-client", clientType: "extension" as const };

beforeEach(() => {
  vi.resetAllMocks();
  f.manager.tenancy = "multi";
  f.tenant.primary = false;
  f.manager.get.mockImplementation((id: string) => id === "tenant" ? f.tenant : undefined);
  f.snapshot.mockResolvedValue({ users: [{ id: "person", enabled: true }], sessions: [] });
  f.getAccount.mockResolvedValue(account);
  f.getWorkspace.mockResolvedValue({ workspaceId: "tenant" });
  f.getMembership.mockResolvedValue({ status: "active" });
});

describe("server-owned reconnect identity", () => {
  it("returns real account details and the pinned workspace with no panel session", async () => {
    expect(await createWorkspaceSessionMetadata("tenant")(principal)).toEqual({
      user: { userId: "person", displayName: "Actual person", email: "person@example.test" },
      workspace: { workspaceId: "tenant", name: "tenant" }
    });
    expect(f.getMembership).toHaveBeenCalledWith("tenant", "person");
  });
  it.each(["primary", "foreign"])("refuses an unavailable or primary tenant %s", async (workspaceId) => {
    expect(await createWorkspaceSessionMetadata(workspaceId)(principal)).toBeNull();
    expect(f.getAccount).not.toHaveBeenCalled();
  });
  it("refuses single-tenant construction", async () => {
    f.manager.tenancy = "single";
    expect(await createWorkspaceSessionMetadata("tenant")(principal)).toBeNull();
  });
  it.each([
    null, { ...account, userId: "another" }, { ...account, status: "disabled" },
    { ...account, deletion: {} }, { ...account, emailVerifiedAtMs: null },
    { ...account, email: "invalid" }, { ...account, displayName: "" }
  ])("refuses unavailable or invalid account state %#", async (value) => {
    f.getAccount.mockResolvedValue(value);
    expect(await createWorkspaceSessionMetadata("tenant")(principal)).toBeNull();
  });
  it("reads current primary identity rather than the approving session", async () => {
    f.snapshot.mockResolvedValue({ users: [{ id: "person", enabled: false }], sessions: [] });
    expect(await createWorkspaceSessionMetadata("tenant")(principal)).toBeNull();
  });
  it("refuses missing workspace or removed membership", async () => {
    f.getWorkspace.mockResolvedValueOnce(null);
    expect(await createWorkspaceSessionMetadata("tenant")(principal)).toBeNull();
    f.getMembership.mockResolvedValue({ status: "removed" });
    expect(await createWorkspaceSessionMetadata("tenant")(principal)).toBeNull();
  });
  it("does not return early account data after its authority is disabled", async () => {
    f.getAccount.mockResolvedValueOnce(account).mockResolvedValue({ ...account, status: "disabled" });
    expect(await createWorkspaceSessionMetadata("tenant")(principal)).toBeNull();
  });
  it("refuses a tenant replaced during the awaited membership check", async () => {
    f.getMembership.mockImplementation(async () => {
      f.manager.get.mockReturnValue({ primary: false });
      return { status: "active" };
    });
    expect(await createWorkspaceSessionMetadata("tenant")(principal)).toBeNull();
  });
  it("leaves provider failures for the gateway's fixed refusal boundary", async () => {
    const failure = new Error("synthetic storage failure");
    f.getMembership.mockRejectedValue(failure);
    await expect(createWorkspaceSessionMetadata("tenant")(principal)).rejects.toBe(failure);
  });
});
