import type { User } from "../../types.ts";
import { IdentityUsernameTakenError } from "../username-taken-error.ts";
import { usernameKey } from "./username-key.ts";

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
 */
export function refuseTakenUsername(users: ReadonlyMap<string, User>, id: string, username: string | undefined): void {
  if (username === undefined) return;
  if (users.get(id)?.username === username) return;
  const key = usernameKey(username);
  for (const user of users.values()) {
    if (user.id !== id && usernameKey(user.username) === key) throw new IdentityUsernameTakenError();
  }
}
