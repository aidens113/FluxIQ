import { createProvisioningContext } from "../context/index.ts";
import type { PlatformProvisioningDeps, PlatformProvisioningService } from "../context/index.ts";
import { createPlatformAccountLinks } from "../links/index.ts";
import { runDueDeletions } from "../operations/index.ts";
import { runProvisioningOperation } from "./run-provisioning-operation.ts";

/**
 * The provisioning service (`platform.provisioning`): the contract's
 * operations through `run`, the welcome and reset links for Core's pages,
 * the sign-in stamp, and the scheduled-deletion sweep. Every mutation in
 * this process goes through one queue, so read-modify-write on the store
 * never interleaves.
 */
export function createPlatformProvisioning(deps: PlatformProvisioningDeps): PlatformProvisioningService {
  const context = createProvisioningContext(deps);
  const links = createPlatformAccountLinks(context);
  return {
    run: (operation, input, caller) => runProvisioningOperation(context, operation, input, caller),
    redeemWelcome: links.redeemWelcome,
    requestReset: links.requestReset,
    redeemReset: links.redeemReset,
    recordSignIn: (userId, nowMs) =>
      context.queue.run(async () => {
        const account = await context.store.getAccount(userId);
        if (account === null) return false;
        const signedInAtMs = nowMs ?? context.now();
        await context.store.putAccount({ ...account, lastSignInAtMs: signedInAtMs, updatedAtMs: signedInAtMs });
        return true;
      }),
    runDueDeletions: (nowMs) => context.queue.run(() => runDueDeletions(context, nowMs ?? context.now()))
  };
}
