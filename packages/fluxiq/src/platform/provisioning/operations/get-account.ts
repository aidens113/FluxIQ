import type { PlatformProvisioningInput } from "@fluxiq/contracts/platform";
import type { PlatformAccountRecord } from "../../store/index.ts";
import { UNRESOLVED_ACCOUNT_ID } from "../authorization/index.ts";
import { ProvisioningRefusal } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import type { ProvisioningOperation } from "./types.ts";

async function findAccount(context: ProvisioningContext, input: PlatformProvisioningInput<"getAccount">): Promise<PlatformAccountRecord | null> {
  if ("userId" in input) return context.store.getAccount(input.userId);
  if ("email" in input) return context.store.findAccountByEmail(input.email);
  return context.store.findAccountByExternalId(input.externalId);
}

/**
 * `getAccount` by exactly one of userId, email and externalId: the account
 * as the caller may see it, its active memberships' workspace ids, and never
 * a hash, a policy, a token or workspace content. Unknown is `not_found`.
 */
export const getAccountOperation: ProvisioningOperation<"getAccount"> = {
  async target(context, input) {
    if ("userId" in input) return input.userId;
    return (await findAccount(context, input))?.userId ?? UNRESOLVED_ACCOUNT_ID;
  },

  async execute(context, input) {
    const account = await findAccount(context, input);
    if (account === null) throw new ProvisioningRefusal("not_found", "No such account.");
    const memberships = await context.store.listMembershipsOfUser(account.userId);
    const workspaceIds = memberships.filter((membership) => membership.status === "active").map((membership) => membership.workspaceId);
    return { userId: account.userId, email: account.email, status: account.status, workspaceIds, createdAt: account.createdAtMs, lastSignInAt: account.lastSignInAtMs };
  }
};
