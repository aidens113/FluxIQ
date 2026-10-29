import type { PlatformEmailMessage } from "../types.ts";
import type { ProvisioningContext } from "./types.ts";

/**
 * Sends one email; true when the sender accepted it. A failed send is
 * reported through `reportEmailFailure` and answered false, never thrown: an
 * operation's answer must not depend on whether mail works, or a failure for
 * an existing address would tell a caller the address has an account.
 */
export async function deliverProvisioningEmail(context: ProvisioningContext, message: PlatformEmailMessage): Promise<boolean> {
  try {
    await context.email.send(message);
    return true;
  } catch (error) {
    context.reportEmailFailure(message.template, error);
    return false;
  }
}
