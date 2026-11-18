import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentWebhookVerificationError } from "../payment-webhook-verification-error.ts";

/**
 * Verifies a Stripe-scheme (v1) signature header over the exact raw body, with
 * a timestamp tolerance against replay of an old signed delivery. Any `v1`
 * entry may match (a secret being rotated signs with both).
 */
export function verifyWebhookSignature(options: { payload: string; header: string | null; secret: string; nowMs: number; toleranceMs: number }): void {
  if (options.header === null || options.header.trim() === "") throw new PaymentWebhookVerificationError("missing-signature");
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of options.header.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === "t" && /^\d{1,12}$/u.test(value)) timestamp = Number(value);
    else if (name === "v1" && /^[a-f0-9]{64}$/u.test(value)) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) throw new PaymentWebhookVerificationError("bad-signature");
  const expected = Buffer.from(createHmac("sha256", options.secret).update(`${timestamp}.${options.payload}`, "utf8").digest("hex"), "utf8");
  if (!signatures.some((signature) => timingSafeEqual(Buffer.from(signature, "utf8"), expected))) {
    throw new PaymentWebhookVerificationError("bad-signature");
  }
  if (Math.abs(options.nowMs - timestamp * 1000) > options.toleranceMs) throw new PaymentWebhookVerificationError("timestamp-outside-tolerance");
}
