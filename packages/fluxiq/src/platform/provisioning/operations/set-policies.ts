import { ProvisioningRefusal } from "../context/index.ts";
import { checkProvisioningPolicies, syncMemberPolicies } from "../policies/index.ts";
import { refreshIdentityRole } from "./refresh-identity-role.ts";
import { requireAccount } from "./require-account.ts";
import type { ProvisioningOperation } from "./types.ts";

/**
 * `setPolicies`: replaces an active member's attached policies in one
 * workspace, and its interim identity role. The account and an active
 * membership must exist (`not_found`); the policies pass the provisionable
 * check (`forbidden_policy`). The identity role is set first, from the new
 * policies, so demoting the last enabled administrator is refused
 * (`last_administrator`) before any attachment or membership changes.
 */
export const setPoliciesOperation: ProvisioningOperation<"setPolicies"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input, { caller, grant }) {
    const nowMs = context.now();
    const policies = checkProvisioningPolicies(input.policies, context.tenancy, caller.transport, nowMs);
    await requireAccount(context, input.userId);
    const membership = await context.store.getMembership(input.workspaceId, input.userId);
    if (membership === null || membership.status !== "active") throw new ProvisioningRefusal("not_found", "The account is not a member of this workspace.");
    await refreshIdentityRole(context, input.userId, { workspaceId: input.workspaceId, policies });
    await syncMemberPolicies(context, grant, input.workspaceId, input.userId, policies);
    await context.store.putMembership({ ...membership, policies, updatedAtMs: nowMs });
    return { status: "updated", userId: input.userId, workspaceId: input.workspaceId, policies };
  }
};
