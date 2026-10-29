import { isConnectContinuePath } from "@fluxiq/contracts/platform";
import type { PlatformLinkPurpose } from "../../store/index.ts";
import { PROVISIONING_LIFETIMES } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";
import { linkTokenDigest } from "./link-token-digest.ts";

const TOKEN_BYTES = 32;

/** A freshly issued link: its URL, which carries the token once (in the fragment), and when it expires. */
export type IssuedLink = {
  url: string;
  expiresAtMs: number;
};

/**
 * Issues a one-time link for an account: 32 random bytes, base64url,
 * stored only as its SHA-256 digest, living 24 hours (welcome) or 1 hour
 * (reset). Issuing supersedes every earlier link of the same purpose. A
 * `continueUrl` is kept only when it is a same-origin `/connect/authorize`
 * path. The URL is `<publicOrigin>/welcome#token=...` or `/reset#token=...`.
 */
export async function issueLinkToken(context: ProvisioningContext, purpose: PlatformLinkPurpose, userId: string, continueUrl: string | null): Promise<IssuedLink> {
  const token = context.randomBytes(TOKEN_BYTES).toString("base64url");
  const createdAtMs = context.now();
  const expiresAtMs = createdAtMs + (purpose === "welcome" ? PROVISIONING_LIFETIMES.welcomeLinkMs : PROVISIONING_LIFETIMES.resetLinkMs);
  await context.store.deleteLinkTokensOf(userId, purpose);
  await context.store.putLinkToken({
    tokenDigest: linkTokenDigest(token),
    purpose,
    userId,
    continueUrl: continueUrl !== null && isConnectContinuePath(continueUrl) ? continueUrl : null,
    createdAtMs,
    expiresAtMs,
    usedAtMs: null
  });
  return { url: `${context.publicOrigin}/${purpose}#token=${token}`, expiresAtMs };
}
