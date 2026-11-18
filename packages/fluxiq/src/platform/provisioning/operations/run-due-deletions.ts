import { DeletionPending } from "../context/index.ts";
import type { ProvisioningContext, ProvisioningGrant } from "../context/index.ts";
import { completeAccountDeletion } from "./complete-account-deletion.ts";

/**
 * Completes every scheduled deletion due by `nowMs`; returns how many. Each
 * account's IAM changes cite `{ policy: "scheduled-deletion" }` under its
 * receipt id, which also keys its billing and environment steps. One that
 * must wait (`DeletionPending`) stays scheduled and is tried on the next
 * sweep; it is not a failure. One account failing does not stop the others:
 * every failure is collected and thrown together once the sweep is done, so
 * none is lost and the failed accounts stay scheduled for the next sweep.
 */
export async function runDueDeletions(context: ProvisioningContext, nowMs: number): Promise<number> {
  const accounts = await context.store.listAccounts();
  const due = accounts.filter((account) => account.deletion !== null && account.deletion.scheduledForMs <= nowMs);
  const failures: unknown[] = [];
  let completed = 0;
  for (const account of due) {
    const receiptId = account.deletion?.receiptId ?? account.userId;
    const grant: ProvisioningGrant = { actor: "in-process", origin: "provisioning", requestId: receiptId, ipPrefix: null, matched: { policy: "scheduled-deletion", sid: null } };
    try {
      await completeAccountDeletion(context, grant, account, receiptId);
      completed += 1;
    } catch (error) {
      if (!(error instanceof DeletionPending)) failures.push(error);
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, `${failures.length} of ${due.length} due account deletions failed.`);
  return completed;
}
