import { beforeAll, describe, expect, it } from "vitest";
import { StripePaymentProvider } from "..";

// The Stripe adapter against a local `stripe/stripe-mock`, never api.stripe.com.
// Set FLUXIQ_STRIPE_MOCK_URL (for example http://127.0.0.1:12111) to run it,
// after `docker run --rm -d -p 12111:12111 stripe/stripe-mock`. Without the
// setting it is skipped; with it and no mock answering, it fails saying so.
const mockUrl = process.env.FLUXIQ_STRIPE_MOCK_URL?.trim() || null;
const plans = { shared: { priceId: "price_1", unit: "flat" as const, grants: [{ key: "cloud.shared", allocation: "shared" as const, capabilities: ["execute"], regions: ["region-a"] }] } };

describe.skipIf(mockUrl === null)("StripePaymentProvider against stripe-mock", () => {
  let provider: StripePaymentProvider;

  beforeAll(async () => {
    const url = new URL(mockUrl!);
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) throw new Error(`FLUXIQ_STRIPE_MOCK_URL must be a local stripe-mock, not ${url.hostname}`);
    try {
      await fetch(new URL("/v1/customers", url), { headers: { authorization: "Bearer sk_test_123" }, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new Error(`stripe-mock not reachable at ${url.origin} (${error instanceof Error ? error.message : String(error)})`);
    }
    provider = new StripePaymentProvider({ secretKey: "sk_test_123", webhookSecret: "whsec_unused_here", plans, apiBaseUrl: url.origin });
  });

  it("creates a subscription checkout through the official SDK", async () => {
    const checkout = await provider.createCheckout({ accountId: "account-a", planId: "shared", successUrl: "https://example.invalid/ok", cancelUrl: "https://example.invalid/no", customerId: "cus_123" });
    expect(checkout.checkoutId).toMatch(/^cs_/u);
    expect(checkout.url).toMatch(/^https:\/\//u);
    expect(Number.isSafeInteger(checkout.expiresAtMs)).toBe(true);
  });

  it("opens a billing portal session for a customer", async () => {
    expect((await provider.createPortal({ accountId: "account-a", customerId: "cus_123", returnUrl: "https://example.invalid/back" })).url).toMatch(/^https:\/\//u);
  });

  it("retrieves a subscription and refuses one that names no FluxIQ account", async () => {
    // stripe-mock answers with its fixture subscription, whose metadata names no account.
    await expect(provider.getSubscription("sub_123")).rejects.toThrow(/names no FluxIQ account/u);
  });
});
