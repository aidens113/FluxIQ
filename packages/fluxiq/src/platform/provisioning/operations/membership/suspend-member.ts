import { ProvisioningRefusal } from "../../context/index.ts";
import { refreshIdentityRole } from "../refresh-identity-role.ts";
import { requireAccount } from "../require-account.ts";
import type { ProvisioningOperation } from "../types.ts";
import { endWorkspaceAccess } from "./end-workspace-access.ts";
import { refuseLastWorkspaceAdministrator } from "./refuse-last-workspace-administrator.ts";
import { requireSharedWorkspace } from "./require-shared-workspace.ts";

/**
 * `suspendMember`: one membership in one shared workspace becomes
 * `suspended`, keeping its policies for `resumeMember`. The account and its
 * other memberships are untouched. Checks first, changing nothing: the
 * account (`not_found`), the workspace (`not_found`, personal included), an
 * active membership (`not_found`), the workspace's last administrator
 * (`last_administrator`), then the identity role without this workspace, so
 * identity access refusing it changes nothing either. Then the status, and
 * `endWorkspaceAccess`.
 */
export const suspendMemberOperation: ProvisioningOperation<"suspendMember"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input, { grant }) {
    await requireAccount(context, input.userId);
    await requireSharedWorkspace(context, input.workspaceId);
    const membership = await context.store.getMembership(input.workspaceId, input.userId);
    if (membership === null || membership.status !== "active") throw new ProvisioningRefusal("not_found", "The account is not an active member of this workspace.");
    await refuseLastWorkspaceAdministrator(context, membership);
    await refreshIdentityRole(context, input.userId, { workspaceId: input.workspaceId, policies: [] });
    await context.store.putMembership({ ...membership, status: "suspended", updatedAtMs: context.now() });
    await endWorkspaceAccess(context, grant, input.workspaceId, input.userId);
    return { status: "suspended", userId: input.userId, workspaceId: input.workspaceId };
  }
};
