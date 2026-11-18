import type { ProvisioningContext, ProvisioningGrant } from "../../context/index.ts";
import { syncMemberPolicies } from "../../policies/index.ts";

/**
 * Ends a person's access to one workspace after its membership was written
 * as suspended or removed: detaches its policies there, revokes their
 * connected clients bound to that workspace only (`revoked_by_admin`), and
 * drops the session unlocks they hold in its key custody. Their platform
 * sessions stay: the session's workspace is chosen afresh on every request
 * from active memberships, so their next request lands in another workspace
 * or in none.
 */
export async function endWorkspaceAccess(context: ProvisioningContext, grant: ProvisioningGrant, workspaceId: string, userId: string): Promise<void> {
  await syncMemberPolicies(context, grant, workspaceId, userId, []);
  await context.revokeConnectedClients(userId, "revoked_by_admin", { workspaceId });
  await context.dropWorkspaceCustody(workspaceId, userId);
}
