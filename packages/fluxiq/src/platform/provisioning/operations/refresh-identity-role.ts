import { identityRoleForPolicies } from "../policies/index.ts";
import type { ProvisioningContext } from "../context/index.ts";

/**
 * Sets the account's identity-access `roleId` from the policies of all its
 * active memberships (until lane B3, one role per user stands in for them).
 * `pending` is one workspace's membership as it is about to be stored, active
 * with these policies, whether it is new, removed or active now. A caller
 * passes it before writing anything, so identity access is asked first: a
 * demotion it refuses (the last enabled administrator) fails before any
 * membership or attachment has changed.
 */
export async function refreshIdentityRole(context: ProvisioningContext, userId: string, pending?: { workspaceId: string; policies: readonly string[] }): Promise<void> {
  const memberships = await context.store.listMembershipsOfUser(userId);
  const policies = memberships
    .filter((membership) => membership.status === "active" && membership.workspaceId !== pending?.workspaceId)
    .flatMap((membership) => membership.policies);
  if (pending !== undefined) policies.push(...pending.policies);
  await context.identity.updateUser({ id: userId, roleId: identityRoleForPolicies(policies) });
}
