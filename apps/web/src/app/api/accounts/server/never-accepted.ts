/**
 * Whether a person never took up their invite: their email was never
 * verified by the welcome link, they never signed in, and no password was set
 * by any other path (`passwordConfigured`, from Identity Access, when known).
 * It reads the account whatever its status, so it still answers once the
 * account has been turned off to cancel the invite.
 */
export function neverAccepted(
  account: { emailVerifiedAtMs: number | null; lastSignInAtMs: number | null },
  user: { passwordConfigured?: boolean } | undefined
): boolean {
  return account.emailVerifiedAtMs === null && account.lastSignInAtMs === null && user?.passwordConfigured !== true;
}
