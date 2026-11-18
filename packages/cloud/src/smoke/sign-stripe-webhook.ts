import { createHmac } from "node:crypto";

/**
 * The `Stripe-Signature` header Stripe sends: `t=<seconds>,v1=<hex HMAC-SHA256
 * of "<seconds>.<raw body>" under the endpoint's signing secret>`. The smoke
 * signs its test event with the deployment's generated secret the way Stripe
 * signs a real one.
 */
export function signStripeWebhook(rawBody: string, secret: string, nowSeconds: number): string {
  const signature = createHmac("sha256", secret).update(`${nowSeconds}.${rawBody}`, "utf8").digest("hex");
  return `t=${nowSeconds},v1=${signature}`;
}
