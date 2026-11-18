import { createHash } from "node:crypto";
import { signWebhookPayload } from "fluxiq/platform";
import { describe, expect, it } from "vitest";
import { StripePaymentProvider } from "..";

// Payloads are signed here, locally, with Stripe's v1 scheme; the official
// SDK verifies them. Nothing in this file reaches a network.
const WEBHOOK_SECRET = "whsec_local_test_only_value";
const provider = new StripePaymentProvider({ secretKey: "sk_test_local_only", webhookSecret: WEBHOOK_SECRET, plans: {}, apiBaseUrl: "http://127.0.0.1:9" });
const body = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "customer.subscription.updated",
  api_version: null,
  created: 1,
  livemode: false,
  pending_webhooks: 0,
  request: null,
  data: { object: { object: "subscription", id: "sub_1" } }
});

describe("StripePaymentProvider webhooks", () => {
  it("verifies a locally signed delivery and names its subscription", async () => {
    const event = await provider.verifyWebhook(body, signWebhookPayload(body, WEBHOOK_SECRET, Date.now()));
    expect(event).toEqual({
      eventId: "evt_1",
      type: "customer.subscription.updated",
      payloadSha256: createHash("sha256").update(body).digest("hex"),
      subscriptionId: "sub_1"
    });
  });

  it("refuses a missing signature, another secret, a changed body and an expired timestamp", async () => {
    await expect(provider.verifyWebhook(body, null)).rejects.toMatchObject({ reason: "missing-signature" });
    await expect(provider.verifyWebhook(body, signWebhookPayload(body, "whsec_someone_else", Date.now()))).rejects.toMatchObject({ reason: "bad-signature" });
    await expect(provider.verifyWebhook(body.replace("sub_1", "sub_2"), signWebhookPayload(body, WEBHOOK_SECRET, Date.now()))).rejects.toMatchObject({ reason: "bad-signature" });
    await expect(provider.verifyWebhook(body, signWebhookPayload(body, WEBHOOK_SECRET, Date.now() - 301_000))).rejects.toMatchObject({ reason: "timestamp-outside-tolerance" });
  });

  it("refuses a plan the operator does not sell before calling Stripe", async () => {
    await expect(provider.createCheckout({ accountId: "account-a", planId: "constructor", successUrl: "https://example.invalid/ok", cancelUrl: "https://example.invalid/no" }))
      .rejects.toMatchObject({ code: "unknown-plan" });
  });
});
