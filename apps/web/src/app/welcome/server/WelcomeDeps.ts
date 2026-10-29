import type { IdentityAccessService, SecretKeysService } from "fluxiq";
import type { PlatformAccountLinks } from "fluxiq/platform";

/** What the welcome submit needs, injected so tests can pass the real services over memory doubles. */
export type WelcomeDeps = {
  links: Pick<PlatformAccountLinks, "redeemWelcome">;
  provisioning: { recordSignIn(userId: string): Promise<boolean> };
  identityAccess: Pick<IdentityAccessService, "createSession" | "revokeSession">;
  secretKeys: Pick<SecretKeysService, "unlockSession">;
};
