import { beforeAll, describe, expect, it } from "vitest";
import { StripePaymentProvider } from "..";

// The Stripe adapter against a local `stripe/stripe-mock`, never api.stripe.com.
// Set FLUXIQ_STRIPE_MOCK_URL (for example http://127.0.0.1:12111) to run it,
// after `docker run --rm -d -p 12111:12111 stripe/stripe-mock`. Without the
// setting it is skipped; with it and no mock answering, it fails saying so.
const mockUrl = process.env.FLUXIQ_STRIPE_MOCK_URL?.trim() || null;
const plans = { shared: { name: "Shared", lines: [{ priceId: "price_1", unit: "flat" as const, quantity: 1, grants: [{ key: "cloud.shared", allocation: "shared" as const, capabilities: ["execute"], regions: ["region-a"] }] }] } };

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
    provider = new StripePaymentProvider({ secretKey: "sk_test_123", webhookSecret: "whsec_unused_here", plans, apiBaseUrl: url.origin, checkoutLifetimeMs: 3_600_000 });
  });

  it("creates a subscription checkout through the official SDK", async () => {
    const checkout = await provider.createCheckout({ accountId: "account-a", planId: "shared", successUrl: "https://example.invalid/ok", cancelUrl: "https://example.invalid/no", customerId: "cus_123" });
    expect(checkout.checkoutId).toMatch(/^cs_/u);
    expect(checkout.url).toMatch(/^https:\/\//u);
    // stripe-mock reflects the expiry FluxIQ asks for, so the recorded checkout expires in the future.
    expect(checkout.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("expires a checkout session", async () => {
    expect(await provider.expireCheckout("cs_123")).toBe("expired");
  });

  it("opens a billing portal session for a customer", async () => {
    expect((await provider.createPortal({ accountId: "account-a", customerId: "cus_123", returnUrl: "https://example.invalid/back" })).url).toMatch(/^https:\/\//u);
  });

  it("retrieves a subscription whose metadata names no account (stripe-mock's fixture)", async () => {
    const fetched = await provider.getSubscription("sub_123");
    expect(fetched?.subscription.accountId).toBeNull();
    expect(fetched?.subscription.customerId).toMatch(/^cus_/u);
  });

  it("cancels a subscription and closes a customer with an idempotency key, through the official SDK", async () => {
    await expect(provider.cancelSubscription("sub_123", { idempotencyKey: "receipt-mock:cancel:sub_123" })).resolves.toBeUndefined();
    await expect(provider.closeCustomer("cus_123", { idempotencyKey: "receipt-mock:close:cus_123" })).resolves.toBeUndefined();
  });
});
