import type { IdentityAccessListing, IdentityAccessSnapshot, IdentityAuthorityOwner, IdentityUserUpdate } from "../../types.ts";
import { IdentityAuthorityManagedError } from "./managed-error.ts";
import { IdentityAuthorityUncheckedError } from "./unchecked-error.ts";

/**
 * Where a person's authority (sign-in name, sign-in role and on/off) is held:
 * here, or with the one owner a host hands it to (`holdElsewhere`), its
 * account provisioning. One source of truth per person: an account holder's
 * role is a projection of their memberships' policies, their on/off follows
 * their account's status and their sign-in name is their account's email, all
 * written only by provisioning, so the `update-user` endpoint asks
 * `refuseChangeHeldElsewhere` before it changes any of the three and refuses
 * an account holder's. Provisioning writes through
 * `IdentityAccessService.updateUser`, which never asks.
 */
export class IdentityAuthorityDelegation {
  private owner: IdentityAuthorityOwner | null = null;

  /**
   * Hands account holders' authority to `owner`. Set once for the service's
   * life: the same owner again is a no-op, and a different one is refused, so
   * nothing can quietly take the delegation back or move it.
   */
  holdElsewhere(owner: IdentityAuthorityOwner): void {
    if (this.owner === owner) return;
    if (this.owner !== null) throw new Error("identity.authority_owner_set: account holders' authority is already held elsewhere");
    this.owner = owner;
  }

  /**
   * Throws `IdentityAuthorityManagedError` when `update` would change the
   * sign-in name, role or on/off of a person whose authority is held
   * elsewhere, and `IdentityAuthorityUncheckedError` when the owner could not
   * answer. Presence decides, as it does for the credential recheck: the
   * `update-user` endpoint first drops every field equal to the person's
   * stored value (a resent value is not a change), so `update` carries only
   * the fields being changed, and it does not ask about a sign-in name
   * re-cased (the same name of the same person, so no change of authority). A
   * display-name change, or any change with no owner set, passes.
   */
  async refuseChangeHeldElsewhere(update: Pick<IdentityUserUpdate, "id" | "username" | "roleId" | "enabled">): Promise<void> {
    if (update.username === undefined && update.roleId === undefined && update.enabled === undefined) return;
    const owner = this.owner;
    if (owner === null) return;
    let heldElsewhere: boolean;
    try {
      heldElsewhere = await owner.holdsAuthorityOf(update.id);
    } catch {
      throw new IdentityAuthorityUncheckedError();
    }
    if (heldElsewhere) throw new IdentityAuthorityManagedError();
  }

  /**
   * `snapshot` with each person marked `authorityHeldElsewhere` exactly when
   * `refuseChangeHeldElsewhere` would refuse a change of theirs: an account
   * holder, or a person the owner could not answer for (the change would be
   * refused unchecked, so a client must not offer it either). With no owner
   * set, nobody is. The flag speaks of real changes: resending anyone's
   * current values is not a change, and neither is re-casing a person's
   * sign-in name, so `update-user` refuses neither.
   */
  async listing(snapshot: IdentityAccessSnapshot): Promise<IdentityAccessListing> {
    const users = await Promise.all(snapshot.users.map(async (user) => ({ ...user, authorityHeldElsewhere: await this.refuses(user.id) })));
    return { ...snapshot, users };
  }

  /** Whether `refuseChangeHeldElsewhere` refuses an authority change of this person: the same decision, asked through it. */
  private async refuses(userId: string): Promise<boolean> {
    try {
      await this.refuseChangeHeldElsewhere({ id: userId, enabled: true });
      return false;
    } catch (error) {
      if (error instanceof IdentityAuthorityManagedError || error instanceof IdentityAuthorityUncheckedError) return true;
      throw error;
    }
  }
}
