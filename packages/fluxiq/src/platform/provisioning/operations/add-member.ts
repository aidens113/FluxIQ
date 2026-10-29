import { ProvisioningRefusal } from "../context/index.ts";
import { checkProvisioningPolicies, syncMemberPolicies } from "../policies/index.ts";
import { refreshIdentityRole } from "./refresh-identity-role.ts";
import { requireAccount } from "./require-account.ts";
import type { ProvisioningOperation } from "./types.ts";

/**
 * `addMember`: adds an account to an organisation workspace. Enterprise
 * only: `entitlement_required` unless `iam.organisation` holds. The
 * workspace must be an organisation workspace (`not_found`), the account
 * active (`not_found`, `disabled`). An active member is `already_member`
 * with its policies left as they were; a removed one is added again. The
 * identity role is set first, from every active membership plus this one, so
 * a demotion identity access refuses (`last_administrator`) changes nothing:
 * no membership is written and no policy attached.
 */
export const addMemberOperation: ProvisioningOperation<"addMember"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input, { caller, grant }) {
    if (!context.organisationEntitled) throw new ProvisioningRefusal("entitlement_required", "Organisation workspaces need the iam.organisation entitlement.");
    const nowMs = context.now();
    const policies = checkProvisioningPolicies(input.policies, context.tenancy, caller.transport, nowMs);
    const account = await requireAccount(context, input.userId);
    if (account.status === "disabled") throw new ProvisioningRefusal("disabled", "The account is disabled.");
    const workspace = await context.store.getWorkspace(input.workspaceId);
    if (workspace === null || workspace.kind !== "organisation") throw new ProvisioningRefusal("not_found", "No such organisation workspace.");
    const existing = await context.store.getMembership(input.workspaceId, input.userId);
    if (existing !== null && existing.status === "active") {
      return { status: "already_member", userId: input.userId, workspaceId: input.workspaceId, policies: existing.policies };
    }
    await refreshIdentityRole(context, input.userId, { workspaceId: input.workspaceId, policies });
    await context.store.putMembership({
      workspaceId: input.workspaceId,
      userId: input.userId,
      policies,
      groups: existing?.groups ?? [],
      status: "active",
      createdAtMs: existing?.createdAtMs ?? nowMs,
      updatedAtMs: nowMs
    });
    await syncMemberPolicies(context, grant, input.workspaceId, input.userId, policies);
    return { status: "added", userId: input.userId, workspaceId: input.workspaceId, policies };
  }
};
