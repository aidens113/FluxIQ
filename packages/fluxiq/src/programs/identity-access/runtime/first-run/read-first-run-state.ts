import type { IdentityFirstRunState, User } from "../../types.ts";
import { INVALID_CREDENTIALS } from "./invalid-credentials.ts";
import { TEMPORARY_ADMIN } from "./temporary-admin.ts";

/**
 * Which first-run state a store is in: `unclaimed` with no account at all,
 * `temporary-admin` while the enabled default admin still opens with the
 * temporary password (proved by `prove`, which mints no session), else
 * `claimed`. Only the wrong-password refusal means "not temporary"; any other
 * failure to prove is thrown.
 */
export async function readFirstRunState(users: ReadonlyMap<string, User>, prove: (userId: string, password: string) => Promise<unknown>): Promise<IdentityFirstRunState> {
  if (users.size === 0) return "unclaimed";
  const admin = users.get(TEMPORARY_ADMIN.userId);
  if (!admin?.enabled) return "claimed";
  try {
    await prove(admin.id, TEMPORARY_ADMIN.password);
    return "temporary-admin";
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_CREDENTIALS) return "claimed";
    throw error;
  }
}
