import type { PlatformAccountRecord } from "../../store/index.ts";
import { deliverProvisioningEmail, PROVISIONING_LIFETIMES } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import { issueLinkToken } from "./issue-link-token.ts";

/** Issues a welcome link for the account and mails it; true when the sender accepted the email. */
export async function mailWelcomeLink(context: ProvisioningContext, account: PlatformAccountRecord, continueUrl: string | null): Promise<boolean> {
  const link = await issueLinkToken(context, "welcome", account.userId, continueUrl);
  const expiresInHours = String(Math.round(PROVISIONING_LIFETIMES.welcomeLinkMs / (60 * 60 * 1000)));
  return deliverProvisioningEmail(context, {
    template: "welcome",
    to: account.email,
    variables: { displayName: account.displayName, welcomeUrl: link.url, expiresInHours }
  });
}
