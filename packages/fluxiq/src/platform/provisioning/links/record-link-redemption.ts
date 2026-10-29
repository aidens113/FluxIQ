import { randomUUID } from "node:crypto";
import { PLATFORM_PROVISIONING_OPERATIONS } from "@fluxiq/contracts/platform";
import type { PlatformLinkPurpose } from "../../store/index.ts";
import { provisioningAccountFrn, userPrincipalFrn } from "../authorization/index.ts";
import type { ProvisioningContext } from "../context/index.ts";

/**
 * Records a password set by a link redemption as the one IAM decision every
 * password change by provisioning is: an allow of `platform:SetAccountPassword` on the account's
 * FRN, with origin `provisioning`, citing `{policy: "welcome-link" |
 * "reset-link", sid: null}` (the checked link is the authority). The
 * principal is the account's own user, or `account-link` when it acts in no
 * workspace. Nothing secret is in the row: no token, digest or password.
 */
export async function recordLinkRedemption(context: ProvisioningContext, purpose: PlatformLinkPurpose, userId: string): Promise<void> {
  const nowMs = context.now();
  context.auditSink.record({
    category: "allow",
    time: Math.floor(nowMs / 1000),
    requestId: randomUUID(),
    principal: (await userPrincipalFrn(context, userId)) ?? "account-link",
    action: PLATFORM_PROVISIONING_OPERATIONS.setPassword.action,
    resources: [provisioningAccountFrn(userId)],
    decision: "allow",
    matched: { policy: `${purpose}-link`, sid: null },
    origin: "provisioning",
    ipPrefix: null
  });
}
