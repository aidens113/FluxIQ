import type { PlatformAccountRecord } from "../../store/index.ts";
import { deliverProvisioningEmail, PROVISIONING_LIFETIMES } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import { issueLinkToken } from "./issue-link-token.ts";

/** Issues a password-reset link for the account and mails it; true when the sender accepted the email. */
export async function mailResetLink(context: ProvisioningContext, account: PlatformAccountRecord): Promise<boolean> {
  const link = await issueLinkToken(context, "reset", account.userId, null);
  const expiresInMinutes = String(Math.round(PROVISIONING_LIFETIMES.resetLinkMs / (60 * 1000)));
  return deliverProvisioningEmail(context, {
    template: "password-reset",
    to: account.email,
    variables: { displayName: account.displayName, resetUrl: link.url, expiresInMinutes }
  });
}
