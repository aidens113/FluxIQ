import { ProvisioningRefusal } from "../../context/index.ts";
import { refreshIdentityRole } from "../refresh-identity-role.ts";
import { requireAccount } from "../require-account.ts";
import type { ProvisioningOperation } from "../types.ts";
import { endWorkspaceAccess } from "./end-workspace-access.ts";
import { refuseLastWorkspaceAdministrator } from "./refuse-last-workspace-administrator.ts";
import { requireSharedWorkspace } from "./require-shared-workspace.ts";

/**
 * `removeMember`: ends one active or suspended membership of a shared
 * workspace (`removed`, no policies). The account, its personal workspace
 * and its other memberships are untouched; a personal workspace is
 * `not_found` (its owner leaves by deleting the account). The same checks
 * as `suspendMember` come first, then the status, then `endWorkspaceAccess`.
 */
export const removeMemberOperation: ProvisioningOperation<"removeMember"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input, { grant }) {
    await requireAccount(context, input.userId);
    await requireSharedWorkspace(context, input.workspaceId);
    const membership = await context.store.getMembership(input.workspaceId, input.userId);
    if (membership === null || membership.status === "removed") throw new ProvisioningRefusal("not_found", "The account is not a member of this workspace.");
    await refuseLastWorkspaceAdministrator(context, membership);
    await refreshIdentityRole(context, input.userId, { workspaceId: input.workspaceId, policies: [] });
    await context.store.putMembership({ ...membership, status: "removed", policies: [], updatedAtMs: context.now() });
    await endWorkspaceAccess(context, grant, input.workspaceId, input.userId);
    return { status: "removed", userId: input.userId, workspaceId: input.workspaceId };
  }
};
