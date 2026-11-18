import type { PlatformAccountRecord } from "../../store/index.ts";
import type { ProvisioningContext, ProvisioningGrant } from "../context/index.ts";
import { syncMemberPolicies } from "../policies/index.ts";
import { personalWorkspaceIds } from "./personal-workspace-ids.ts";

/**
 * Deletes an account now: the one hook every deletion goes through
 * (`deleteAccount` immediate, and `runDueDeletions`). In order, each step
 * safe to repeat and keyed by the deletion receipt id `receiptId`:
 *
 * 1. identity access deletes the user. The only step that can be refused
 *    (the last enabled administrator), so it comes first and a refusal
 *    changes nothing. A deletion not yet recorded is then recorded, due at
 *    once, so a failure after this point leaves it for the sweep;
 * 2. the account's sessions are revoked (identity access already revoked
 *    them with the user; the port does not promise that, so it is asked
 *    again), then its connected clients in every workspace (`account_deleted`);
 * 3. for each membership: its policies are detached, then the session
 *    unlocks it holds in that workspace's key custody are dropped;
 * 4. billing is closed (`closeBilling`), before anything is purged, so
 *    nothing is billed during the purge;
 * 5. the environments it pays for, and those of its personal workspaces, are
 *    purged (`purgeEnvironments`);
 * 6. each personal workspace is deleted: its data (`deleteWorkspaceData`
 *    closes it and removes its root), then its row;
 * 7. the account row goes, with its memberships and link tokens.
 *
 * A step that must wait (a personal workspace with work in flight, a
 * provider that did not answer) throws `DeletionPending`, which passes
 * through: the caller keeps the deletion scheduled and the sweep finishes it.
 * A run already going keeps going to its result or its budget. A retry
 * finishes a failure part-way: `deleteUser` answers false for a user already
 * gone. Returns the personal workspace ids deleted by this call.
 */
export async function completeAccountDeletion(context: ProvisioningContext, grant: ProvisioningGrant, account: PlatformAccountRecord, receiptId: string): Promise<string[]> {
  const userId = account.userId;
  await context.identity.deleteUser(userId);
  if (account.deletion === null) {
    const nowMs = context.now();
    await context.store.putAccount({ ...account, status: "deleted", deletion: { receiptId, requestedAtMs: nowMs, scheduledForMs: nowMs }, updatedAtMs: nowMs });
  }
  await context.identity.revokeUserSessions(userId);
  await context.revokeConnectedClients(userId, "account_deleted");
  const memberships = await context.store.listMembershipsOfUser(userId);
  for (const membership of memberships) {
    await syncMemberPolicies(context, grant, membership.workspaceId, userId, []);
    await context.dropWorkspaceCustody(membership.workspaceId, userId);
  }
  const workspaceIds = await personalWorkspaceIds(context, userId);
  await context.closeBilling(userId, receiptId);
  await context.purgeEnvironments({ accountId: userId, workspaceIds, operationId: receiptId });
  for (const workspaceId of workspaceIds) {
    await context.deleteWorkspaceData(workspaceId);
    await context.store.deleteWorkspace(workspaceId);
  }
  await context.store.deleteAccount(userId);
  return workspaceIds;
}
