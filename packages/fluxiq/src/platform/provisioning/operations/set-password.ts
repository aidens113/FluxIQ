import { isWeakPassword, ProvisioningRefusal } from "../context/index.ts";
import { requireAccount } from "./require-account.ts";
import type { ProvisioningOperation } from "./types.ts";

/**
 * `setPassword`, in-process only (`run` answers `operation_unavailable` over
 * HTTP): the operator's reset, already authorised and audited as one IAM
 * decision, so it goes through identity's privileged `resetPassword` with no
 * recheck of the old credential and works after a restart (the offline
 * command line always starts one). Then every session of the account is
 * revoked. A disabled account is `disabled`; an account with two-factor
 * sign-in whose credential is sealed is `two_factor`, unchanged.
 */
export const setPasswordOperation: ProvisioningOperation<"setPassword"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input) {
    const account = await requireAccount(context, input.userId);
    if (account.status === "disabled") throw new ProvisioningRefusal("disabled", "The account is disabled.");
    if (isWeakPassword(input.password)) throw new ProvisioningRefusal("weak_password", "The password must be at least 12 characters.");
    await context.identity.resetPassword(account.userId, input.password);
    const sessionsRevoked = await context.identity.revokeUserSessions(account.userId);
    return { status: "updated", sessionsRevoked };
  }
};
