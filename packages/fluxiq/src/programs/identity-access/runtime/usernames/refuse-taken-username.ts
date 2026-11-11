import type { User } from "../../types.ts";
import { IdentityUsernameTakenError } from "../username-taken-error.ts";
import { usernameKey } from "./username-key.ts";

/**
 * Throws `IdentityUsernameTakenError` when writing `username` for the person
 * `id` (new or existing) would give them a name another person already has,
 * ignoring case (`usernameKey`). `undefined` (the name is not being written)
 * passes. A name with the same key as the person's own current one passes
 * too: it creates no new clash, so a person may keep their own name in any
 * case, and two people stored before this check with names that differ only
 * by case can each still be updated. Only a write that would move a person
 * onto another person's key is refused.
 */
export function refuseTakenUsername(users: ReadonlyMap<string, User>, id: string, username: string | undefined): void {
  if (username === undefined) return;
  const key = usernameKey(username);
  const own = users.get(id);
  if (own !== undefined && usernameKey(own.username) === key) return;
  for (const user of users.values()) {
    if (user.id !== id && usernameKey(user.username) === key) throw new IdentityUsernameTakenError();
  }
}
