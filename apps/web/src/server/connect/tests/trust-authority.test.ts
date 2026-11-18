import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceTrustAuthority } from "../trust-authority";

const state = vi.hoisted(() => ({ approve: vi.fn(), get: vi.fn(), present: vi.fn(), locked: vi.fn() }));
vi.mock("../approval", () => ({ validateConnectApproval: state.approve }));
vi.mock("../../../lib/fluxiq", () => ({ getFluxIQWorkspaces: () => ({ get: state.get }) }));
const input = { credential: "synthetic-credential", trustedClientId: "trust-one", userId: "person-one", approvingSessionDigest: "a".repeat(64), expiresAt: 100_000 };
beforeEach(() => {
  vi.resetAllMocks();
  state.approve.mockResolvedValue({ allowed: true, user: { userId: "person-one" }, workspace: { workspaceId: "tenant-one" } });
  state.get.mockReturnValue({ primary: false, fluxiq: { programs: { secretKeys: { credentialUnlocks: { enrollCredential: state.present, enrollLockedCredential: state.locked } } } } });
  state.present.mockResolvedValue(undefined);
});
describe("tenant-bound consent custody", () => {
  it("enrolls authenticated client authority without creating a default lock", async () => {
    await createWorkspaceTrustAuthority("tenant-one").grantCredential(input);
    expect(state.get).toHaveBeenCalledWith("tenant-one");
    expect(state.present).toHaveBeenCalledWith({
      userId: input.userId, approvingSessionDigest: input.approvingSessionDigest,
      holderKind: "paired-client", holderId: "paired-client:trust-one",
      expiresAtMs: input.expiresAt, label: "Connected client"
    }, input.credential);
    expect(state.present).toHaveBeenCalledOnce();
    expect(state.locked).not.toHaveBeenCalled();
  });
  it.each([
    { allowed: false, error: "invalid_grant" },
    { allowed: true, user: { userId: "other-user" }, workspace: { workspaceId: "tenant-one" } },
    { allowed: true, user: { userId: "person-one" }, workspace: { workspaceId: "other-tenant" } }
  ])("refuses ended or mismatched authority before custody: %j", async (approval) => {
    state.approve.mockResolvedValue(approval);
    const authority = createWorkspaceTrustAuthority("tenant-one");
    expect(await authority.validateApproval(input)).toBeNull();
    await expect(authority.grantCredential(input)).rejects.toThrow("no longer active");
    expect(state.get).not.toHaveBeenCalled();
    expect(state.present).not.toHaveBeenCalled();
  });
  it("propagates durable custody failure to the issuer instead of publishing an unconfirmed grant", async () => {
    state.present.mockRejectedValue(new Error("persistence failed"));
    await expect(createWorkspaceTrustAuthority("tenant-one").grantCredential(input)).rejects.toThrow("persistence failed");
  });
  it.each([undefined, { primary: true }])("refuses missing or primary tenant runtime", async (tenant) => {
    state.get.mockReturnValue(tenant);
    await expect(createWorkspaceTrustAuthority("tenant-one").grantCredential(input)).rejects.toThrow("tenant is unavailable");
    expect(state.present).not.toHaveBeenCalled();
  });
});
