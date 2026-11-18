import { createHash } from "node:crypto";
import { PaymentProviderUnavailableError } from "../payment-provider-unavailable-error.ts";
import { PaymentWebhookVerificationError } from "../payment-webhook-verification-error.ts";
import { signWebhookPayload, verifyWebhookSignature } from "../signature/index.ts";
import type {
  PaymentCheckout,
  PaymentCheckoutRequest,
  PaymentPortalRequest,
  PaymentProvider,
  ProviderSubscriptionFetch,
  ProviderSubscriptionState,
  ProviderWebhookEvent
} from "../types.ts";

type FakeEventBody = { id: string; type: string; subscriptionId: string | null };

/**
 * An in-memory payment provider for tests and local development. It keeps
 * subscriptions the test sets, signs its webhooks with the same v1 scheme the
 * Stripe adapter verifies, and never reaches a network. Its URLs use the
 * reserved `.invalid` domain so nothing can follow them.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly providerId: string;
  /** How often each subscription was fetched, so tests can prove a duplicate made no provider call. */
  readonly fetches = new Map<string, number>();
  /** Each cancellation the fake carried out, by idempotency key: a retry with the same key is not another one. */
  readonly cancellations = new Map<string, string>();
  /** Each customer closure, by idempotency key. */
  readonly customerClosures = new Map<string, string>();
  /** While true, cancelling and closing throw `PaymentProviderUnavailableError`, as an outage would. */
  unavailable = false;
  private readonly subscriptions = new Map<string, ProviderSubscriptionState>();
  private readonly webhookSecret: string;
  private readonly now: () => number;
  private readonly checkoutLifetimeMs: number;
  private checkoutCount = 0;

  constructor(options: { webhookSecret: string; providerId?: string; now?: () => number; checkoutLifetimeMs?: number }) {
    if (typeof options.webhookSecret !== "string" || options.webhookSecret.length < 16) throw new TypeError("The fake provider needs a webhook secret of at least 16 characters");
    this.webhookSecret = options.webhookSecret;
    this.providerId = options.providerId ?? "fake";
    this.now = options.now ?? Date.now;
    this.checkoutLifetimeMs = options.checkoutLifetimeMs ?? 24 * 60 * 60 * 1000;
  }

  /** Sets (or replaces) the provider's current state of one subscription. */
  putSubscription(subscription: ProviderSubscriptionState): void {
    this.subscriptions.set(subscription.subscriptionId, structuredClone(subscription));
  }

  /** A webhook delivery as the provider would send it: the raw body and its signature header. */
  signedEvent(event: FakeEventBody, timestampMs = this.now()): { rawBody: string; signature: string } {
    const rawBody = JSON.stringify(event);
    return { rawBody, signature: signWebhookPayload(rawBody, this.webhookSecret, timestampMs) };
  }

  async createCheckout(request: PaymentCheckoutRequest): Promise<PaymentCheckout> {
    this.checkoutCount += 1;
    const checkoutId = `fake_cs_${this.checkoutCount}`;
    return { checkoutId, url: `https://checkout.fake.invalid/${checkoutId}?plan=${encodeURIComponent(request.planId)}`, expiresAtMs: this.now() + this.checkoutLifetimeMs };
  }

  async createPortal(request: PaymentPortalRequest): Promise<{ url: string }> {
    return { url: `https://portal.fake.invalid/${encodeURIComponent(request.customerId)}` };
  }

  async verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<ProviderWebhookEvent> {
    verifyWebhookSignature({ payload: rawBody, header: signatureHeader, secret: this.webhookSecret, nowMs: this.now(), toleranceMs: 300_000 });
    let body: Partial<FakeEventBody>;
    try { body = JSON.parse(rawBody) as Partial<FakeEventBody>; }
    catch { throw new PaymentWebhookVerificationError("malformed-payload"); }
    if (typeof body.id !== "string" || body.id === "" || typeof body.type !== "string" || (body.subscriptionId !== null && typeof body.subscriptionId !== "string")) {
      throw new PaymentWebhookVerificationError("malformed-payload");
    }
    return { eventId: body.id, type: body.type, payloadSha256: sha256(rawBody), subscriptionId: body.subscriptionId ?? null };
  }

  async cancelSubscription(subscriptionId: string, options: { idempotencyKey: string }): Promise<void> {
    if (this.unavailable) throw new PaymentProviderUnavailableError("cancelSubscription");
    if (this.cancellations.has(options.idempotencyKey)) return;
    this.cancellations.set(options.idempotencyKey, subscriptionId);
    const stored = this.subscriptions.get(subscriptionId);
    if (stored === undefined || stored.status === "canceled") return;
    this.subscriptions.set(subscriptionId, { ...stored, status: "canceled", cancelAtPeriodEnd: false, endedAtMs: this.now(), entitlements: [] });
  }

  async closeCustomer(customerId: string, options: { idempotencyKey: string }): Promise<void> {
    if (this.unavailable) throw new PaymentProviderUnavailableError("closeCustomer");
    if (!this.customerClosures.has(options.idempotencyKey)) this.customerClosures.set(options.idempotencyKey, customerId);
  }

  async getSubscription(subscriptionId: string): Promise<ProviderSubscriptionFetch | null> {
    this.fetches.set(subscriptionId, (this.fetches.get(subscriptionId) ?? 0) + 1);
    const stored = this.subscriptions.get(subscriptionId);
    if (stored === undefined) return null;
    const subscription = { ...structuredClone(stored), verifiedAtMs: this.now() };
    return { subscription, payloadSha256: sha256(JSON.stringify(subscription)) };
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
