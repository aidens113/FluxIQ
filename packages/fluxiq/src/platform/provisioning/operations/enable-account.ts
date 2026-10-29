import { requireAccount } from "./require-account.ts";
import type { ProvisioningOperation } from "./types.ts";

/**
 * `enableAccount`: restores sign-in. Revoked sessions and clients stay
 * revoked. An account whose deletion is scheduled is `not_found`: it cannot
 * be enabled again.
 */
export const enableAccountOperation: ProvisioningOperation<"enableAccount"> = {
  async target(_context, input) {
    return input.userId;
  },

  async execute(context, input) {
    const account = await requireAccount(context, input.userId);
    await context.identity.updateUser({ id: account.userId, enabled: true });
    await context.store.putAccount({ ...account, status: "active", disabledReason: null, updatedAtMs: context.now() });
    return { status: "enabled", userId: account.userId };
  }
};
