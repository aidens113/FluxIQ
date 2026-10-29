import { describe, expect, it } from "vitest";
import { IdentityAccessService } from "../../../../identity-access/index.ts";
import { automationStudioProjectDefaultOwner } from "../default-owner.ts";

const identityUsers = (identity: IdentityAccessService) => async () => (await identity.snapshot()).users;

describe("automationStudioProjectDefaultOwner", () => {
  it("is the workspace owner when one is named", async () => {
    const owner = await automationStudioProjectDefaultOwner({ workspaceOwner: async () => "ws-owner", users: async () => [{ id: "a", roleId: "admin", enabled: true, createdAtMs: 1 }] });
    expect(owner).toBe("ws-owner");
  });

  it("falls back to the first enabled admin by creation order when no workspace owner is named", async () => {
    const identity = new IdentityAccessService();
    // Identity Access seeds its default `admin` (created now); these are older.
    await identity.upsertUser({ id: "viewer-oldest", username: "viewer", displayName: "Viewer", roleId: "viewer", nowMs: 1 });
    await identity.upsertUser({ id: "admin-disabled", username: "off", displayName: "Off", roleId: "admin", enabled: false, nowMs: 2 });
    await identity.upsertUser({ id: "admin-second", username: "zed", displayName: "Zed", roleId: "admin", nowMs: 4 });
    await identity.upsertUser({ id: "admin-first", username: "yan", displayName: "Yan", roleId: "admin", nowMs: 3 });
    expect(await automationStudioProjectDefaultOwner({ workspaceOwner: async () => null, users: identityUsers(identity) })).toBe("admin-first");
    expect(await automationStudioProjectDefaultOwner({ workspaceOwner: async () => "", users: identityUsers(identity) })).toBe("admin-first");
  });

  it("breaks a creation-time tie by user id", async () => {
    const users = [
      { id: "b", roleId: "admin", enabled: true, createdAtMs: 7 },
      { id: "a", roleId: "admin", enabled: true, createdAtMs: 7 }
    ];
    expect(await automationStudioProjectDefaultOwner({ users: async () => users })).toBe("a");
  });

  it("is the seeded admin of a fresh Identity Access", async () => {
    expect(await automationStudioProjectDefaultOwner({ users: identityUsers(new IdentityAccessService()) })).toBe("admin");
  });

  it("is null with no workspace owner and no enabled admin", async () => {
    const owner = await automationStudioProjectDefaultOwner({ users: async () => [{ id: "v", roleId: "viewer", enabled: true, createdAtMs: 1 }, { id: "x", roleId: "admin", enabled: false, createdAtMs: 2 }] });
    expect(owner).toBeNull();
  });
});
