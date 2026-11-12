import type { PlatformProvisioningCaller } from "fluxiq/platform";
import type { AccountsResponse } from "./accounts-response";
import type { AccountPlatform, AccountRouteDeps } from "./route-deps";
import { neverAccepted } from "./never-accepted";
import { provisioningRefusal } from "./provisioning-refusal";
import { refuseAccounts } from "./refuse-accounts";

const DONE: AccountsResponse = { status: 200, body: { ok: true } };
const ACCEPTED = refuseAccounts(409, "not_invited", "This person has already accepted their invite.");

/**
 * Cancels a pending invite without ever deleting an account its person has
 * taken up. Whether an invite is still pending is read outside the
 * provisioning queue, so a person can redeem their welcome link between that
 * read and the delete. The account is therefore turned off first, through the
 * queue: once that has run, a redemption is refused (`disabled`) and nothing
 * else can accept the invite, so the state read next is final. Then:
 *
 * - still never accepted: the account is deleted (`deleteAccount`
 *   immediate), which ends the link with it;
 * - accepted in between: the account is turned back on and the answer is
 *   409 `not_invited`, as if the acceptance had come first. Turning off
 *   revoked their sessions, so they sign in again once.
 *
 * A failed delete turns the account back on and answers the delete's refusal.
 */
export async function revokeInvite(
  deps: Pick<AccountRouteDeps, "identityAccess">,
  platform: AccountPlatform,
  userId: string,
  caller: PlatformProvisioningCaller,
  requestId: string
): Promise<AccountsResponse> {
  const off = await platform.provisioning.run("disableAccount", { requestId: `${requestId}-hold`, userId, reason: "Invite being cancelled by a workspace administrator." }, caller);
  if (!off.ok) return provisioningRefusal(off.error.code);
  const account = await platform.store.getAccount(userId);
  if (account === null || account.status === "deleted") return provisioningRefusal("not_found");
  const user = (await deps.identityAccess.snapshot()).users.find((candidate) => candidate.id === userId);
  if (!neverAccepted(account, user)) return (await restore(platform, userId, caller, requestId)) ?? ACCEPTED;
  const deleted = await platform.provisioning.run("deleteAccount", { requestId, userId, mode: "immediate" }, caller);
  if (deleted.ok) return DONE;
  return (await restore(platform, userId, caller, requestId)) ?? provisioningRefusal(deleted.error.code);
}

/** Turns the account back on; null when it is, else the refusal that says it could not be. */
async function restore(platform: AccountPlatform, userId: string, caller: PlatformProvisioningCaller, requestId: string): Promise<AccountsResponse | null> {
  const on = await platform.provisioning.run("enableAccount", { requestId: `${requestId}-restore`, userId, reason: "Invite was not cancelled." }, caller);
  return on.ok ? null : provisioningRefusal(on.error.code);
}
