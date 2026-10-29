import type { PlatformAccountRecord } from "../../store/index.ts";
import type { ProvisioningContext, ProvisioningGrant } from "../context/index.ts";
import { syncMemberPolicies } from "../policies/index.ts";
import { personalWorkspaceIds } from "./personal-workspace-ids.ts";

/**
 * Deletes an account now. Identity access deleting the user is the only step
 * that can be refused (the last enabled administrator), so it comes first and
 * a refusal changes nothing: no session or connected client is revoked and no
 * row is touched. Then: revoke its sessions (identity access already revoked
 * them with the user; the port does not promise that, so it is asked again)
 * and connected clients (`account_deleted`), detach every membership's
 * policies, delete each personal workspace (its data through
 * `deleteWorkspaceData`, then its row), and finally remove the account row
 * with its memberships and link tokens. A failure part-way is finished by a
 * retry: `deleteUser` answers false for a user already gone. Returns the
 * personal workspace ids it deleted.
 */
export async function completeAccountDeletion(context: ProvisioningContext, grant: ProvisioningGrant, account: PlatformAccountRecord): Promise<string[]> {
  const userId = account.userId;
  await context.identity.deleteUser(userId);
  await context.identity.revokeUserSessions(userId);
  await context.revokeConnectedClients(userId, "account_deleted");
  const memberships = await context.store.listMembershipsOfUser(userId);
  for (const membership of memberships) await syncMemberPolicies(context, grant, membership.workspaceId, userId, []);
  const workspaceIds = await personalWorkspaceIds(context, userId);
  for (const workspaceId of workspaceIds) {
    await context.deleteWorkspaceData(workspaceId);
    await context.store.deleteWorkspace(workspaceId);
  }
  await context.store.deleteAccount(userId);
  return workspaceIds;
}
