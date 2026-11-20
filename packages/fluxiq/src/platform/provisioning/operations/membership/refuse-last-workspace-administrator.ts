import type { PlatformMembershipRecord } from "../../../store/index.ts";
import { ProvisioningRefusal } from "../../context/index.ts";
import type { ProvisioningContext } from "../../context/index.ts";
import { identityRoleForPolicies } from "../../policies/index.ts";

/**
 * Refuses (`last_administrator`) to end the access of a workspace's last
 * active administrator: suspending or removing them would leave the workspace
 * with nobody who can manage its people. Decided per workspace, from its own
 * memberships, before anything changes. A membership that is not active, or
 * not an administrator's, is never refused here.
 */
export async function refuseLastWorkspaceAdministrator(context: ProvisioningContext, membership: PlatformMembershipRecord): Promise<void> {
  if (membership.status !== "active" || identityRoleForPolicies(membership.policies) !== "admin") return;
  const members = await context.store.listMembershipsOfWorkspace(membership.workspaceId);
  const others = members.filter((other) => other.userId !== membership.userId && other.status === "active" && identityRoleForPolicies(other.policies) === "admin");
  if (others.length === 0) throw new ProvisioningRefusal("last_administrator", "The workspace's last administrator cannot be suspended or removed.");
}
