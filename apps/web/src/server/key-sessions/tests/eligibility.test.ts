import { describe, expect, it, vi } from "vitest";
import { keySessionEligible } from "../eligibility";

function input() {
  return {
    userId: "alice", workspaceId: "ws-alice", tenancy: "multi" as const, primaryWorkspaceId: "primary",
    enabledUser: vi.fn(async () => true),
    store: {
      getAccount: vi.fn(async () => ({ status: "active", deletion: null })),
      getWorkspace: vi.fn(async () => ({ workspaceId: "ws-alice" })),
      getMembership: vi.fn(async () => ({ status: "active" }))
    }
  };
}

// Test ports return only fields this boundary reads; production uses PlatformStore.
const eligible = (value: ReturnType<typeof input>) => keySessionEligible(value as unknown as Parameters<typeof keySessionEligible>[0]);

describe("key session platform eligibility", () => {
  it("requires current identity, account, workspace and membership", async () => {
    const value = input();
    expect(await eligible(value)).toBe(true);
    expect(value.store.getMembership).toHaveBeenCalledWith("ws-alice", "alice");
    value.enabledUser.mockResolvedValue(false);
    expect(await eligible(value)).toBe(false);
  });
  it.each(["disabled", "deleted"])("refuses %s accounts", async (status) => {
    const value = input();
    value.store.getAccount.mockResolvedValue({ status, deletion: null });
    expect(await eligible(value)).toBe(false);
  });
  it("refuses removed membership and the platform workspace", async () => {
    const value = input();
    value.store.getMembership.mockResolvedValue({ status: "removed" });
    expect(await eligible(value)).toBe(false);
    value.workspaceId = "primary";
    expect(await eligible(value)).toBe(false);
  });
  it("fails on store outage instead of authorizing", async () => {
    const value = input();
    value.store.getWorkspace.mockRejectedValue(new Error("unavailable"));
    await expect(eligible(value)).rejects.toThrow("unavailable");
  });
  it("preserves single tenancy without cloud membership or subscription", async () => {
    const value = input();
    expect(await keySessionEligible({ ...value, store: value.store as unknown as Parameters<typeof keySessionEligible>[0]["store"], tenancy: "single", workspaceId: "primary" })).toBe(true);
    expect(value.store.getAccount).not.toHaveBeenCalled();
    expect(await keySessionEligible({ ...value, store: value.store as unknown as Parameters<typeof keySessionEligible>[0]["store"], tenancy: "single" })).toBe(false);
  });
});
