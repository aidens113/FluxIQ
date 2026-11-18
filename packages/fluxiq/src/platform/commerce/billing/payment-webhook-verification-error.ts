/** A webhook whose signature, timestamp or body could not be verified; the route answers 400. */
export class PaymentWebhookVerificationError extends Error {
  constructor(readonly reason: "missing-signature" | "bad-signature" | "timestamp-outside-tolerance" | "malformed-payload") {
    super(`Payment webhook not verified: ${reason}`);
    this.name = "PaymentWebhookVerificationError";
  }
}
