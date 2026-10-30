import type { SecretKeysService } from "fluxiq";
import type { DurableLoginAttemptTracker } from "../../../lib/login-attempts";
import type { OwnerClaimDeps } from "../../../server/owner-claim";

/** The failure counters the submit consults: one for the whole instance, one per client address (used only with `FLUXIQ_TRUST_PROXY`). */
export type SetupAttempts = {
  global: Pick<DurableLoginAttemptTracker, "remainingLockout" | "registerFailure">;
  address: Pick<DurableLoginAttemptTracker, "remainingLockout" | "registerFailure">;
};

/** What the setup submit needs, injected so tests pass the real services of a temporary FluxIQ instance. */
export type SetupDeps = Omit<OwnerClaimDeps, "provisioning"> & {
  provisioning: OwnerClaimDeps["provisioning"] & { recordSignIn(userId: string): Promise<boolean> };
  secretKeys: Pick<SecretKeysService, "unlockSession">;
  attempts: SetupAttempts;
};
