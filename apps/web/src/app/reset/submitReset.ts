import type { AccountLinkResponse } from "../welcome/server";
import { readTokenAndPassword, refuse } from "../welcome/server";
import type { ResetDeps } from "./ResetDeps";

/**
 * Redeems a reset link: sets the new password (the link service revokes the
 * account's sessions) and signs nobody in; the person signs in at "/". Keys
 * sealed under the old password stay sealed.
 */
export async function submitReset(request: Request, deps: ResetDeps): Promise<AccountLinkResponse> {
  const input = await readTokenAndPassword(request);
  if ("status" in input) return input;
  const redeemed = await deps.links.redeemReset(input);
  if (!redeemed.ok) return refuse(redeemed.code === "disabled" || redeemed.code === "two_factor" ? 403 : 400, redeemed.code);
  return { status: 200, body: { ok: true } };
}
