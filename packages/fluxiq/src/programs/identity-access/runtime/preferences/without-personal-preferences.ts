import type { User } from "../../types.ts";

/**
 * The user as someone else may see them: without the person's own preferences
 * (`startingHumanness`). Every user the service hands out about another person
 * (the snapshot, an administrator's create, update or authenticator change)
 * goes through here; only the person's own session (`validateSession`,
 * `authenticate`) carries them.
 */
export function withoutPersonalPreferences(user: User): User {
  const { startingHumanness: _own, ...shared } = user;
  return shared;
}
