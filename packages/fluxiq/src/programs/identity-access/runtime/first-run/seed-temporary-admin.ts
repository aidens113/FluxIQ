import type { User } from "../../types.ts";
import { TEMPORARY_ADMIN } from "./temporary-admin.ts";

/** On an empty store, adds the default admin and gives it the temporary password through `setPassword`; false when the store has any account. */
export async function seedTemporaryAdmin(users: Map<string, User>, setPassword: (userId: string, password: string) => Promise<unknown>): Promise<boolean> {
  if (users.size > 0) return false;
  const now = Date.now();
  const user: User = {
    id: TEMPORARY_ADMIN.userId,
    username: TEMPORARY_ADMIN.username,
    displayName: TEMPORARY_ADMIN.displayName,
    roleId: "admin",
    enabled: true,
    totpEnabled: false,
    createdAtMs: now,
    updatedAtMs: now
  };
  users.set(user.id, user);
  await setPassword(user.id, TEMPORARY_ADMIN.password);
  return true;
}
