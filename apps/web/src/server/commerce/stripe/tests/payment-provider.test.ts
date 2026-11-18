import { createHash } from "node:crypto";
import { PaymentProviderUnavailableError, signWebhookPayload } from "fluxiq/platform";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { isStripeOutage, StripePaymentProvider } from "..";

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

describe("StripePaymentProvider closing an account's billing", () => {
  // 127.0.0.1:9 refuses every connection: Stripe unreachable, as in an outage.
  const unreachable = new StripePaymentProvider({ secretKey: "sk_test_local_only", webhookSecret: WEBHOOK_SECRET, plans: {}, apiBaseUrl: "http://127.0.0.1:9", now: Date.now });

  it("reports an unreachable Stripe as a provider outage, for cancelling and for closing", async () => {
    await expect(unreachable.cancelSubscription("sub_1", { idempotencyKey: "receipt-1:cancel:sub_1" })).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
    await expect(unreachable.closeCustomer("cus_1", { idempotencyKey: "receipt-1:close:cus_1" })).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
  }, 60_000);

  it("tells an outage (connection, rate limit, Stripe's own error) from a refusal", () => {
    const raw = { message: "synthetic" };
    expect(isStripeOutage(new Stripe.errors.StripeConnectionError(raw))).toBe(true);
    expect(isStripeOutage(new Stripe.errors.StripeRateLimitError(raw))).toBe(true);
    expect(isStripeOutage(new Stripe.errors.StripeAPIError(raw))).toBe(true);
    expect(isStripeOutage(new Stripe.errors.StripeInvalidRequestError(raw))).toBe(false);
    expect(isStripeOutage(new Stripe.errors.StripeAuthenticationError(raw))).toBe(false);
    expect(isStripeOutage(new Error("synthetic"))).toBe(false);
  });
});
