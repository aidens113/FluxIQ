import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ConnectAuthorizeRequest } from "fluxiq/platform/profile";
import { connectRequestParams } from "../model";

/** Only the digest is sent to the trusted approval service. Never persist or return the raw panel cookie. */
export function connectSessionDigest(rawCookie: string): string {
  return createHash("sha256").update(rawCookie, "utf8").digest("hex");
}

/** Bind the displayed query and consent action to this HttpOnly session; no server-side token state is required. */
export function createConsentEvidence(request: ConnectAuthorizeRequest, rawCookie: string): string {
  return createHmac("sha256", rawCookie).update(`fluxiq-connect-consent-v1\0${connectRequestParams(request).toString()}`, "utf8").digest("hex");
}

export function matchesConsentEvidence(evidence: string | null, request: ConnectAuthorizeRequest, rawCookie: string): boolean {
  return evidence !== null && /^[a-f0-9]{64}$/u.test(evidence) && timingSafeEqual(Buffer.from(evidence, "hex"), Buffer.from(createConsentEvidence(request, rawCookie), "hex"));
}
