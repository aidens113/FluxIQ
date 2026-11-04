import { describe, expect, it } from "vitest";
import { isOwnerWrittenDatabaseKind, isSensitiveDatabaseKind } from "../sensitive-stores.ts";

describe("the sensitive stores", () => {
  it.each(["identity.users", "secret.keys", "secret.credential-unlocks", " SECRET.CREDENTIAL-UNLOCKS "])("includes %s, however it is spelt", (kind) => {
    expect(isSensitiveDatabaseKind(kind)).toBe(true);
  });

  it("leaves an ordinary store alone", () => {
    expect(isSensitiveDatabaseKind("widgets")).toBe(false);
    expect(isOwnerWrittenDatabaseKind("widgets")).toBe(false);
  });

  it("keeps the unlock store to its owner, and the other two open to a recheck", () => {
    expect(isOwnerWrittenDatabaseKind("secret.credential-unlocks")).toBe(true);
    expect(isOwnerWrittenDatabaseKind(" Secret.Credential-Unlocks")).toBe(true);
    expect(isOwnerWrittenDatabaseKind("secret.keys")).toBe(false);
    expect(isOwnerWrittenDatabaseKind("identity.users")).toBe(false);
  });
});
