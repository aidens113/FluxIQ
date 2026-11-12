import type { User } from "../../types.ts";
import { IdentityUsernameTakenError } from "../username-taken-error.ts";
import { usernameKey } from "./username-key.ts";
import { IdentityUsernameRecaseError } from "./recase-error.ts";

/**
 * Throws `IdentityUsernameTakenError` when writing `username` for the person
 * `id` (new or existing) would give them a name another person already has,
 * ignoring case (`usernameKey`). `undefined` (the name is not being written)
 * passes, and so does the person's own stored name written exactly as it is,
 * so two people stored before this check with names that differ only by case
 * can each still be updated. Any other name, the person's own in another case
 * included, must have a key no other person has: re-casing one's own name
 * passes unless someone else shares it ignoring case, when the re-case is a
 * case-only clash with that person and is refused like any other.
 * `recase` mode first requires the person's current canonical name, before
 * comparing other people's names. The service calls this immediately before
 * its synchronous map mutation, so a stale endpoint read cannot authorize a
 * real rename, and a refusal changes no other user fields either.
 */
export function refuseTakenUsername(users: ReadonlyMap<string, User>, id: string, username: string | undefined, mode: "replace" | "recase" = "replace"): void {
  const own = users.get(id);
  if (mode === "recase" && (username === undefined || !own || usernameKey(username) !== usernameKey(own.username))) throw new IdentityUsernameRecaseError();
  if (username === undefined) return;
  if (own?.username === username) return;
  const key = usernameKey(username);
  for (const user of users.values()) {
    if (user.id !== id && usernameKey(user.username) === key) throw new IdentityUsernameTakenError();
  }
}
