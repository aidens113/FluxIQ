import { describe, expect, it } from "vitest";
import { roleOfIdentityRole, roleOfPolicies, shapeMembersView } from "..";

describe("roleOfPolicies", () => {
  it("names the strongest known policy, and anything else as custom", () => {
    expect(roleOfPolicies(["FluxIQReadOnlyAccess", "FluxIQAdministratorAccess"])).toBe("administrator");
    expect(roleOfPolicies(["FluxIQOwnerFullAccess"])).toBe("owner");
    expect(roleOfPolicies(["FluxIQUserAccess"])).toBe("member");
    expect(roleOfPolicies(["FluxIQReadOnlyAccess"])).toBe("read-only");
    expect(roleOfPolicies(["SomethingElse"])).toBe("other");
    expect(roleOfPolicies(["constructor", "toString"])).toBe("other");
    expect(roleOfPolicies([])).toBe("other");
  });
});

describe("roleOfIdentityRole", () => {
  it("maps today's roles, and nothing else", () => {
    expect([roleOfIdentityRole("admin"), roleOfIdentityRole("viewer"), roleOfIdentityRole("hasOwnProperty")]).toEqual(["administrator", "read-only", "other"]);
  });
});

describe("shapeMembersView", () => {
  it("keeps only the named fields, so nothing else an answer carries reaches the screen", () => {
    const view = shapeMembersView({
      workspaceKind: "single",
      assignableRoles: ["administrator", "owner", "read-only"],
      canRemove: true,
      members: [
        { userId: "u1", name: "Ana", email: "ana@example.test", role: "administrator", state: "invited", source: "account", self: false, invitedAt: 5, lastSignInAt: null, welcomeUrl: "https://x/welcome#token=SECRET", passwordHash: "HASH" },
        { name: "no id" }
      ]
    });
    expect(view.assignableRoles).toEqual(["administrator", "read-only"]);
    expect(view.members).toEqual([{ userId: "u1", name: "Ana", email: "ana@example.test", role: "administrator", state: "invited", source: "account", self: false, invitedAt: 5, lastSignInAt: null }]);
    expect(JSON.stringify(view)).not.toMatch(/SECRET|HASH/u);
  });

  it("reads an unknown role or state as the safe default", () => {
    const [member] = shapeMembersView({ members: [{ userId: "u1", role: "superuser", state: "weird", source: "elsewhere" }] }).members;
    expect(member).toMatchObject({ role: "other", state: "active", source: "account", self: false });
  });
});
