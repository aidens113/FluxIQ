import { mailResetLink } from "../links/index.ts";
import { requireAccount } from "./require-account.ts";
import type { ProvisioningOperation } from "./types.ts";

/**
 * `rotateCredentials` by scope: `sessions` revokes panel sessions, `browsers`
 * revokes connected clients (`credentials_rotated`), `password` mails a reset
 * link to an active account, `all` does the three. `resetSent` is true only
 * when the sender accepted the reset email.
 */
export const rotateCredentialsOperation: ProvisioningOperation<"rotateCredentials"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input) {
    const account = await requireAccount(context, input.userId);
    const all = input.scope === "all";
    const sessionsRevoked = all || input.scope === "sessions" ? await context.identity.revokeUserSessions(account.userId) : 0;
    const connectedClientsRevoked = all || input.scope === "browsers" ? await context.revokeConnectedClients(account.userId, "credentials_rotated") : 0;
    const resetSent = (all || input.scope === "password") && account.status === "active" ? await mailResetLink(context, account) : false;
    return { status: "rotated", userId: account.userId, sessionsRevoked, connectedClientsRevoked, resetSent };
  }
};
