import { ProvisioningRefusal } from "../../context/index.ts";
import { syncMemberPolicies } from "../../policies/index.ts";
import { refreshIdentityRole } from "../refresh-identity-role.ts";
import { requireAccount } from "../require-account.ts";
import type { ProvisioningOperation } from "../types.ts";
import { requireSharedWorkspace } from "./require-shared-workspace.ts";

/**
 * `resumeMember`: a suspended membership becomes active again with the
 * policies it kept. Refused for an unknown or deleted account (`not_found`),
 * a disabled one (`disabled`: its sign-in is off account-wide), and a
 * membership that is not suspended (`not_found`). The identity role is set
 * first. Connected clients revoked by the suspension stay revoked.
 */
export const resumeMemberOperation: ProvisioningOperation<"resumeMember"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input, { grant }) {
    const account = await requireAccount(context, input.userId);
    if (account.status === "disabled") throw new ProvisioningRefusal("disabled", "The account is disabled.");
    await requireSharedWorkspace(context, input.workspaceId);
    const membership = await context.store.getMembership(input.workspaceId, input.userId);
    if (membership === null || membership.status !== "suspended") throw new ProvisioningRefusal("not_found", "The account has no suspended membership of this workspace.");
    const policies = membership.policies;
    await refreshIdentityRole(context, input.userId, { workspaceId: input.workspaceId, policies });
    await context.store.putMembership({ ...membership, status: "active", updatedAtMs: context.now() });
    await syncMemberPolicies(context, grant, input.workspaceId, input.userId, policies);
    return { status: "resumed", userId: input.userId, workspaceId: input.workspaceId, policies };
  }
};
