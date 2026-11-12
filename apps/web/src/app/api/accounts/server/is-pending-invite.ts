import { neverAccepted } from "./never-accepted";

/**
 * Whether an account is still an invite: active, and never accepted
 * (`neverAccepted`: email not verified by the welcome link, never signed in,
 * no password set by any other path).
 */
export function isPendingInvite(
  account: { status: string; emailVerifiedAtMs: number | null; lastSignInAtMs: number | null },
  user: { passwordConfigured?: boolean } | undefined
): boolean {
  return account.status === "active" && neverAccepted(account, user);
}
