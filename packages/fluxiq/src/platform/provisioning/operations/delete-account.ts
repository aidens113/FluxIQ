import { randomUUID } from "node:crypto";
import type { PlatformAccountRecord } from "../../store/index.ts";
import { DeletionPending, PROVISIONING_LIFETIMES, ProvisioningRefusal } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import { completeAccountDeletion } from "./complete-account-deletion.ts";
import { personalWorkspaceIds } from "./personal-workspace-ids.ts";
import type { ProvisioningOperation } from "./types.ts";

/**
 * `deleteAccount`, answered with a receipt.
 *
 * - `immediate`: deleted now (`completeAccountDeletion`); a scheduled
 *   deletion brought forward keeps its receipt id and request time. When a
 *   step must wait (`DeletionPending`: a personal workspace with work in
 *   flight, a provider that did not answer), the deletion is left scheduled,
 *   due at once, and answered `scheduled`; the sweep finishes it. A deletion
 *   never fails for a reason that passes, and never stops a running task;
 * - `scheduled`: disabled at once (sign-in refused, sessions and connected
 *   clients revoked), status `deleted`, and deleted after 7 days by
 *   `runDueDeletions`. Asking again while scheduled returns the same receipt.
 *
 * Either mode asks identity access first (the delete, or the disable), so the
 * last enabled administrator is refused (`last_administrator`) before any
 * session, connected client or row has changed.
 */
export const deleteAccountOperation: ProvisioningOperation<"deleteAccount"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input, { grant }) {
    const account = await context.store.getAccount(input.userId);
    if (account === null) throw new ProvisioningRefusal("not_found", "No such account.");
    const nowMs = context.now();
    const scheduled = account.deletion;

    if (input.mode === "immediate") {
      const receiptId = scheduled?.receiptId ?? randomUUID();
      try {
        const workspaceIds = await completeAccountDeletion(context, grant, account, receiptId);
        const receipt = {
          receiptId,
          userId: account.userId,
          mode: "immediate" as const,
          requestedAt: scheduled?.requestedAtMs ?? nowMs,
          scheduledFor: scheduled?.scheduledForMs ?? null,
          completedAt: nowMs,
          workspaceIds
        };
        return { status: "deleted", receipt };
      } catch (error) {
        if (!(error instanceof DeletionPending)) throw error;
        return { status: "scheduled", receipt: await dueNow(context, account, receiptId, nowMs) };
      }
    }

    const workspaceIds = await personalWorkspaceIds(context, account.userId);
    if (scheduled !== null) {
      const receipt = { receiptId: scheduled.receiptId, userId: account.userId, mode: "scheduled" as const, requestedAt: scheduled.requestedAtMs, scheduledFor: scheduled.scheduledForMs, completedAt: null, workspaceIds };
      return { status: "scheduled", receipt };
    }
    await context.identity.updateUser({ id: account.userId, enabled: false });
    const deletion = { receiptId: randomUUID(), requestedAtMs: nowMs, scheduledForMs: nowMs + PROVISIONING_LIFETIMES.scheduledDeletionMs };
    await context.store.putAccount({ ...account, status: "deleted", deletion, updatedAtMs: nowMs });
    await context.identity.revokeUserSessions(account.userId);
    await context.revokeConnectedClients(account.userId, "account_deleted");
    const receipt = { receiptId: deletion.receiptId, userId: account.userId, mode: "scheduled" as const, requestedAt: nowMs, scheduledFor: deletion.scheduledForMs, completedAt: null, workspaceIds };
    return { status: "scheduled", receipt };
  }
};

/**
 * An immediate deletion that must wait: its record (written by
 * `completeAccountDeletion`, or a scheduled one brought forward) is made due
 * at once, so the next sweep finishes it under the same receipt id, and the
 * `scheduled` receipt says so.
 */
async function dueNow(context: ProvisioningContext, account: PlatformAccountRecord, receiptId: string, nowMs: number) {
  const current = (await context.store.getAccount(account.userId)) ?? account;
  const deletion = { receiptId, requestedAtMs: current.deletion?.requestedAtMs ?? nowMs, scheduledForMs: nowMs };
  await context.store.putAccount({ ...current, status: "deleted", deletion, updatedAtMs: nowMs });
  const workspaceIds = await personalWorkspaceIds(context, account.userId);
  return { receiptId, userId: account.userId, mode: "immediate" as const, requestedAt: deletion.requestedAtMs, scheduledFor: deletion.scheduledForMs, completedAt: null, workspaceIds };
}
