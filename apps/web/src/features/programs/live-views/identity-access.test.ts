import { describe, expect, it } from "vitest";
import type { User } from "fluxiq/identity-access";
import { isLastEnabledAdmin, visibleIdentityUsers } from "./identity-access";
import { readFileSync } from "node:fs";

const users: User[] = [
  { id: "admin", username: "admin", displayName: "Primary Admin", roleId: "admin", enabled: true, totpEnabled: true, createdAtMs: 1, updatedAtMs: 2 },
  { id: "viewer", username: "reader", displayName: "Read Only", roleId: "viewer", enabled: false, totpEnabled: false, createdAtMs: 1, updatedAtMs: 2 }
];

describe("IdentityAccessLive view model", () => {
  it("searches friendly identity fields and combines enabled filters", () => {
    expect(visibleIdentityUsers(users, "primary", "all").map((user) => user.id)).toEqual(["admin"]);
    expect(visibleIdentityUsers(users, "viewer", "disabled").map((user) => user.id)).toEqual(["viewer"]);
    expect(visibleIdentityUsers(users, "reader", "enabled")).toEqual([]);
  });

  it("identifies only the final enabled administrator as protected", () => {
    expect(isLastEnabledAdmin(users, users[0]!)).toBe(true);
    expect(isLastEnabledAdmin([...users, { ...users[0]!, id: "admin.two" }], users[0]!)).toBe(false);
    expect(isLastEnabledAdmin(users, users[1]!)).toBe(false);
  });

  it("routes every privileged mutation through the operation gate", () => {
    const source = readFileSync(new URL("./identity-access.tsx", import.meta.url), "utf8");
    for (const operation of ["create-user", "update-user", "update-role", "update-credential", "begin-totp", "confirm-totp", "disable-totp"]) {
      expect(source).toContain(`operation.run("${operation}"`);
    }
  });
});
