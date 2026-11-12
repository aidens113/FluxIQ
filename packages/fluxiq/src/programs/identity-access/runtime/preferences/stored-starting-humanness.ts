import { humannessSchema } from "@fluxiq/contracts/automation";
import type { User } from "../../types.ts";

/**
 * A stored user with its `startingHumanness` kept only when it is a valid
 * level (`humannessSchema`): a record edited by hand or written by an older
 * build cannot hand a run a level outside 0-100.
 */
export function storedStartingHumanness(user: User): User {
  if (user.startingHumanness === undefined) return user;
  if (humannessSchema.safeParse(user.startingHumanness).success) return user;
  const { startingHumanness: _invalid, ...rest } = user;
  return rest;
}
