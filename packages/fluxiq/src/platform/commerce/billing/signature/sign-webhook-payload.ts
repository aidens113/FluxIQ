import { createHmac } from "node:crypto";

/**
 * Signs a webhook body with Stripe's v1 scheme: `t=<unix seconds>,v1=<hex
 * HMAC-SHA256(secret, "<t>.<body>")>`. The fake provider and tests use it to
 * sign payloads locally; nothing here talks to a provider.
 */
export function signWebhookPayload(payload: string, secret: string, timestampMs: number): string {
  const seconds = Math.floor(timestampMs / 1000);
  const signature = createHmac("sha256", secret).update(`${seconds}.${payload}`, "utf8").digest("hex");
  return `t=${seconds},v1=${signature}`;
}
