import { normalizeEmail } from "../../store/rules/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import type { PlatformAccountLinks } from "../types.ts";
import { redeemAccountLink } from "./redeem-account-link.ts";
import { mailResetLink } from "./reset-link-mail.ts";

/**
 * The welcome and reset links for Core's own pages. Every call runs through
 * the provisioning queue, so a redemption never interleaves with an
 * operation on the same account. `requestReset` answers `{ ok: true }` for
 * any input: an active account gets a reset link, and nothing else happens
 * for an unknown, disabled or deleted one.
 */
export function createPlatformAccountLinks(context: ProvisioningContext): PlatformAccountLinks {
  return {
    redeemWelcome: (input) => context.queue.run(() => redeemAccountLink(context, "welcome", input)),
    redeemReset: (input) => context.queue.run(() => redeemAccountLink(context, "reset", input)),
    requestReset: (input) =>
      context.queue.run(async () => {
        if (typeof input.email !== "string") return { ok: true };
        const account = await context.store.findAccountByEmail(normalizeEmail(input.email));
        if (account !== null && account.status === "active") await mailResetLink(context, account);
        return { ok: true };
      })
  };
}
