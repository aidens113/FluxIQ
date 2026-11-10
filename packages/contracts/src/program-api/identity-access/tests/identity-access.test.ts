// The Identity and Access inputs never carry a password, PIN, authenticator code or role.
import { describe, expect, it } from "vitest";
import { identityAccessSnapshotInput, renameIdentityUserInput, revokeIdentitySessionInput } from "../index.ts";

describe("identity access inputs", () => {
  it("snapshot takes nothing", () => {
    expect(identityAccessSnapshotInput.parse(undefined)).toEqual({});
  });

  it("rename needs a person and drops role, enabled and credentials", () => {
    expect(renameIdentityUserInput.parse({ id: "user-one", displayName: "A Name" })).toEqual({ id: "user-one", displayName: "A Name" });
    expect(renameIdentityUserInput.parse({ id: "u", roleId: "admin", enabled: false, authorizationPassword: "x", password: "y" })).toEqual({ id: "u" });
    expect(renameIdentityUserInput.read({ displayName: "A" })).toEqual({ ok: false, error: expect.stringContaining("id:") });
    expect(Object.keys(renameIdentityUserInput.jsonSchema().properties as object).sort()).toEqual(["displayName", "id", "username"]);
  });

  it("revoke-session needs a session digest", () => {
    expect(revokeIdentitySessionInput.parse({ sessionDigest: "abc" })).toEqual({ sessionDigest: "abc" });
    expect(revokeIdentitySessionInput.read({})).toEqual({ ok: false, error: expect.stringContaining("sessionDigest:") });
    expect(Object.keys(revokeIdentitySessionInput.jsonSchema().properties as object)).toEqual(["sessionDigest"]);
  });
});
