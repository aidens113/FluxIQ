import type { AccountsResponse } from "./accounts-response";
import { refuseAccounts } from "./refuse-accounts";

const SENTENCES: Readonly<Record<string, readonly [status: number, error: string]>> = Object.freeze({
  email_taken: [409, "That email already has an account."],
  not_found: [404, "That person is no longer here. Reload to see who is."],
  disabled: [409, "That person is turned off. Turn them on first."],
  forbidden_policy: [403, "That role cannot be given here."],
  forbidden: [403, "You do not have access to do this."],
  invalid_input: [400, "Check the email and name, then try again."],
  entitlement_required: [403, "Adding people to an organisation needs a plan that includes organisations."],
  last_administrator: [409, "This is the last administrator who can sign in. Make someone else an administrator first."],
  rate_limited: [429, "Too many changes at once. Wait a moment and try again."]
});

/**
 * The answer for a provisioning error code. Only the code is read: the
 * provisioning message is for an operator and is never passed on. An
 * unexpected code is a failure, not a refusal.
 */
export function provisioningRefusal(code: string): AccountsResponse {
  const known = Object.hasOwn(SENTENCES, code) ? SENTENCES[code] : undefined;
  if (known === undefined) return refuseAccounts(500, "failed", "That did not work. Try again.");
  return refuseAccounts(known[0], code, known[1]);
}
