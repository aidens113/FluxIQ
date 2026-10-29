import { requireAccount } from "./require-account.ts";
import type { ProvisioningOperation } from "./types.ts";

/**
 * `disableAccount`: refuses sign-in (identity-access `enabled: false`),
 * revokes the account's sessions and its connected clients
 * (`account_disabled`, which lane D sends as `server.revoked`), and records
 * the reason. Disabling a disabled account revokes again and answers the same.
 */
export const disableAccountOperation: ProvisioningOperation<"disableAccount"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input) {
    const account = await requireAccount(context, input.userId);
    await context.identity.updateUser({ id: account.userId, enabled: false });
    await context.store.putAccount({ ...account, status: "disabled", disabledReason: input.reason, updatedAtMs: context.now() });
    await context.identity.revokeUserSessions(account.userId);
    await context.revokeConnectedClients(account.userId, "account_disabled");
    return { status: "disabled", userId: account.userId };
  }
};
