import type { PlatformAccountRecord } from "../../store/index.ts";
import { ProvisioningRefusal } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";

/** The account, or `not_found` for an unknown one and for one whose deletion is scheduled (its row stays only until then). */
export async function requireAccount(context: ProvisioningContext, userId: string): Promise<PlatformAccountRecord> {
  const account = await context.store.getAccount(userId);
  if (account === null || account.status === "deleted") throw new ProvisioningRefusal("not_found", "No such account.");
  return account;
}
