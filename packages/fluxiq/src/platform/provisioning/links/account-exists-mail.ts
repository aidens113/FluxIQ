import { deliverProvisioningEmail } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";

/**
 * Mails "you already have an account" to an address that has one: a sign-in
 * link and the reset page, where the person can ask for a reset link. No
 * token is issued, so a stranger's sign-up attempt changes nothing.
 */
export async function mailAccountExists(context: ProvisioningContext, email: string): Promise<boolean> {
  return deliverProvisioningEmail(context, {
    template: "account-exists",
    to: email,
    variables: { signInUrl: `${context.publicOrigin}/`, resetUrl: `${context.publicOrigin}/reset` }
  });
}
