import type { IdentityAccessService } from "fluxiq";
import type { PlatformAccountLinks } from "fluxiq/platform";

/** What the welcome submit needs, injected so tests can pass the real services over memory doubles. */
export type WelcomeDeps = {
  links: Pick<PlatformAccountLinks, "redeemWelcome">;
  provisioning: { recordSignIn(userId: string): Promise<boolean> };
  identityAccess: Pick<IdentityAccessService, "createSession" | "revokeSession">;
  /** Restores the account's saved keys for the new session, in the session's own workspace; best effort. */
  restoreKeys(input: { sessionId: string; userId: string; authorizationPassword: string; expiresAtMs: number }): Promise<unknown>;
};
