import type { DefaultAdminOutcome, OwnerClaimIdentity } from "./types";

/** Identity access creates this account on an empty store: username and password `admin`. */
const DEFAULT_ADMIN_ID = "admin";
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";
/** `IdentityLastAdministratorError`'s code. */
const LAST_ADMINISTRATOR = "identity.last_administrator";

/**
 * Takes the default `admin` account out of use once the owner exists (an
 * enabled administrator, so the last-administrator rule allows it).
 *
 * Still on its default password, it is deleted: nothing was ever done as it
 * that a person could want back. Otherwise (renamed, a changed password, or
 * two-factor sign-in) someone has used it, so it is disabled rather than
 * deleted, keeping its credential and sealed keys for the owner to re-enable;
 * its sessions are revoked either way.
 */
export async function retireDefaultAdmin(identity: OwnerClaimIdentity): Promise<DefaultAdminOutcome> {
  const admin = (await identity.snapshot()).users.find((user) => user.id === DEFAULT_ADMIN_ID);
  if (admin === undefined) return "absent";
  if (admin.enabled && admin.username === DEFAULT_ADMIN_USERNAME && (await stillHasDefaultPassword(identity))) {
    try {
      if (await identity.deleteUser(DEFAULT_ADMIN_ID)) return "deleted";
    } catch (error) {
      // Only the last-administrator rule falls through, to disabling (which that rule then decides too).
      if ((error as { code?: unknown }).code !== LAST_ADMINISTRATOR) throw error;
    }
  }
  if (admin.enabled) await identity.updateUser({ id: DEFAULT_ADMIN_ID, enabled: false });
  await identity.revokeUserSessions(DEFAULT_ADMIN_ID);
  return "disabled";
}

async function stillHasDefaultPassword(identity: OwnerClaimIdentity): Promise<boolean> {
  try {
    const signedIn = await identity.authenticate({ username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD });
    await identity.revokeSession(signedIn.session.id);
    return signedIn.user.id === DEFAULT_ADMIN_ID;
  } catch {
    return false;
  }
}
