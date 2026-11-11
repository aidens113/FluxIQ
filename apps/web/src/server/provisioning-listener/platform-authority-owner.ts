import type { IdentityAuthorityOwner } from "fluxiq/auth";
import { getPlatformServices } from "./platform-services";

/**
 * Who holds an account holder's authority, for every workspace instance's
 * Identity Access (`identityAccess.authority.holdElsewhere`): the platform's
 * account provisioning, for anyone with a platform account, as the Access
 * screen counts them (`/api/accounts/members` lists such a person as
 * `account`, everyone else as `identity`). Their role is derived from their
 * memberships' policies and their sign-in from their account's status, so
 * `update-user` refuses to change either and provisioning stays the one
 * writer. Composes the platform services on first use; a store that cannot be
 * read throws, which refuses the change.
 */
export const platformAuthorityOwner: IdentityAuthorityOwner = {
  async holdsAuthorityOf(userId: string): Promise<boolean> {
    const services = await getPlatformServices();
    return (await services.store.getAccount(userId)) !== null;
  }
};
