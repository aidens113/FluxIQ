// The sign-in name uniqueness rule on its own: names are compared ignoring
// case, a person may keep their own name in any case while nobody else has it,
// and two people stored before the rule with names that differ only by case
// can each keep their name exactly, but neither may re-case it or move onto
// another person's name.

import { describe, expect, it } from "vitest";
import type { User } from "../../../types.ts";
import { IdentityUsernameTakenError } from "../../username-taken-error.ts";
import { refuseTakenUsername, usernameKey } from "../index.ts";

function person(id: string, username: string): User {
  return { id, username, displayName: id, roleId: "viewer", enabled: true, totpEnabled: false, createdAtMs: 0, updatedAtMs: 0 };
}

function people(...users: User[]): ReadonlyMap<string, User> {
  return new Map(users.map((user) => [user.id, user]));
}

describe("usernameKey", () => {
  it("is lower-casing only: equal ignoring case, nothing trimmed", () => {
    expect(usernameKey("Ann@Example.Test")).toBe(usernameKey("ann@example.test"));
    expect(usernameKey("ÉLODIE")).toBe(usernameKey("élodie"));
    expect(usernameKey("ann ")).not.toBe(usernameKey("ann"));
  });
});

describe("refuseTakenUsername", () => {
  const users = people(person("ann", "ann"), person("bob", "Bob"));

  it("refuses a new person whose name is another's in any case", () => {
    expect(() => refuseTakenUsername(users, "new", "ANN")).toThrow(IdentityUsernameTakenError);
    expect(() => refuseTakenUsername(users, "new", "bob")).toThrow(IdentityUsernameTakenError);
    expect(() => refuseTakenUsername(users, "new", "carol")).not.toThrow();
  });

  it("refuses renaming a person onto another's name in any case", () => {
    expect(() => refuseTakenUsername(users, "ann", "BOB")).toThrow(IdentityUsernameTakenError);
  });

  it("lets a person keep their own name in any case, and passes when no name is written", () => {
    expect(() => refuseTakenUsername(users, "bob", "BOB")).not.toThrow();
    expect(() => refuseTakenUsername(users, "bob", "bob")).not.toThrow();
    expect(() => refuseTakenUsername(users, "bob", undefined)).not.toThrow();
  });

  it("names its refusal by code", () => {
    let refusal: unknown;
    try {
      refuseTakenUsername(users, "new", "Ann");
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({ code: "identity.username_taken" });
  });

  describe("with two people already stored under names that differ only by case", () => {
    const duplicates = people(person("first", "Ann"), person("second", "ann"), person("bob", "bob"));

    it("lets either keep their name exactly as stored", () => {
      expect(() => refuseTakenUsername(duplicates, "first", "Ann")).not.toThrow();
      expect(() => refuseTakenUsername(duplicates, "second", "ann")).not.toThrow();
    });

    it("refuses either re-casing the shared name, a case-only clash with the other", () => {
      expect(() => refuseTakenUsername(duplicates, "first", "ANN")).toThrow(IdentityUsernameTakenError);
      expect(() => refuseTakenUsername(duplicates, "second", "Ann")).toThrow(IdentityUsernameTakenError);
    });

    it("lets either move to a free name, and refuses a move onto anyone else's", () => {
      expect(() => refuseTakenUsername(duplicates, "first", "anne")).not.toThrow();
      expect(() => refuseTakenUsername(duplicates, "first", "Bob")).toThrow(IdentityUsernameTakenError);
    });

    it("refuses a third person taking that name in any case", () => {
      expect(() => refuseTakenUsername(duplicates, "third", "aNN")).toThrow(IdentityUsernameTakenError);
    });
  });
});
