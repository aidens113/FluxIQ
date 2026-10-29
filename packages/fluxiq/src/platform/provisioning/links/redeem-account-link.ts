import { isConnectContinuePath } from "@fluxiq/contracts/platform";
import type { PlatformLinkPurpose } from "../../store/index.ts";
import { isLinkTokenUsable } from "../../store/rules/index.ts";
import { isWeakPassword, twoFactorRefusal } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import type { PlatformLinkRedemption, PlatformLinkRefusal } from "../types.ts";
import { linkTokenDigest } from "./link-token-digest.ts";
import { recordLinkRedemption } from "./record-link-redemption.ts";

/** 32 bytes in base64url without padding. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/u;

const INVALID_LINK: PlatformLinkRefusal = { ok: false, code: "invalid_link" };

/**
 * Redeems a welcome or reset link: sets the password, verifies the email,
 * and revokes the account's sessions. An unknown, used, expired or
 * wrong-purpose token, and one whose account is gone, are all `invalid_link`.
 * A disabled account is `disabled` and a short password `weak_password`;
 * both leave the token unused, so the person can try again with the same
 * link.
 *
 * Once every check has passed the token is reserved (consumed, so a replay or
 * a racing redemption is `invalid_link`) and the password is set through
 * identity's link path, which needs no old credential and so works after a
 * restart; the change is then audited (`recordLinkRedemption`). Identity
 * refusing an account with two-factor sign-in and a sealed credential is
 * `two_factor`. On that refusal, or if setting the password, revoking the
 * sessions or verifying the email fails, the reservation is released (the link
 * stays usable until it expires) and the refusal is answered or the error
 * propagates. The caller serialises this with every other mutation.
 */
export async function redeemAccountLink(
  context: ProvisioningContext,
  purpose: PlatformLinkPurpose,
  input: { token: string; password: string }
): Promise<{ ok: true; redemption: PlatformLinkRedemption } | PlatformLinkRefusal> {
  if (typeof input.token !== "string" || !TOKEN_SHAPE.test(input.token)) return INVALID_LINK;
  const digest = linkTokenDigest(input.token);
  const nowMs = context.now();
  const record = await context.store.getLinkToken(digest);
  if (record === null || !isLinkTokenUsable(record, purpose, nowMs)) return INVALID_LINK;
  const account = await context.store.getAccount(record.userId);
  if (account === null || account.status === "deleted") return INVALID_LINK;
  if (account.status === "disabled") return { ok: false, code: "disabled" };
  if (typeof input.password !== "string" || isWeakPassword(input.password)) return { ok: false, code: "weak_password" };
  const consumed = await context.store.consumeLinkToken(digest, purpose, nowMs);
  if (consumed === null) return INVALID_LINK;
  try {
    await context.identity.resetPassword(account.userId, input.password);
    await recordLinkRedemption(context, purpose, account.userId);
    await context.identity.revokeUserSessions(account.userId);
    await context.store.putAccount({ ...account, emailVerifiedAtMs: account.emailVerifiedAtMs ?? nowMs, updatedAtMs: nowMs });
  } catch (error) {
    await releaseReservation(context, digest, nowMs);
    if (twoFactorRefusal(error) !== null) return { ok: false, code: "two_factor" };
    throw error;
  }
  const continueUrl = consumed.continueUrl !== null && isConnectContinuePath(consumed.continueUrl) ? consumed.continueUrl : null;
  return { ok: true, redemption: { userId: account.userId, email: account.email, continueUrl } };
}

/** Puts the token back unused; a release that fails leaves the token used, and the redemption's own error is the one reported. */
async function releaseReservation(context: ProvisioningContext, digest: string, usedAtMs: number): Promise<void> {
  try {
    await context.store.releaseLinkToken(digest, usedAtMs);
  } catch {
    /* best-effort: the redemption's own error or refusal is what the caller sees; a failed release leaves the token used, as documented */
  }
}
