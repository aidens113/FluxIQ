import { createHash } from "node:crypto";
import Stripe from "stripe";
import { CommerceBillingError, PaymentWebhookVerificationError } from "fluxiq/platform";
import type {
  PaymentCheckout,
  PaymentCheckoutRequest,
  PaymentPortalRequest,
  PaymentProvider,
  ProviderSubscriptionFetch,
  ProviderWebhookEvent
} from "fluxiq/platform";
import type { CommercePlanCatalog } from "../types";
import { stripeEventSubscriptionId } from "./event-subscription-id";
import { STRIPE_METADATA } from "./metadata";
import { stripeSubscriptionState } from "./subscription-state";

/** Stripe's own webhook replay tolerance, in seconds. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

export type StripePaymentProviderOptions = {
  secretKey: string;
  webhookSecret: string;
  plans: CommercePlanCatalog;
  /** A Stripe-compatible API other than api.stripe.com, such as a local stripe-mock; null for Stripe itself. */
  apiBaseUrl: string | null;
  now?: () => number;
};

/**
 * The Stripe adapter of the payment provider port, on the official `stripe`
 * package. It reports Stripe's state and decides nothing: the commerce ledger
 * and `subscriptionBillingState` do. Its keys come from secret files; the
 * payer is the FluxIQ account, carried on the subscription's metadata.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly providerId = "stripe";
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly plans: CommercePlanCatalog;
  private readonly now: () => number;

  constructor(options: StripePaymentProviderOptions) {
    this.stripe = new Stripe(options.secretKey, options.apiBaseUrl === null ? {} : endpoint(options.apiBaseUrl));
    this.webhookSecret = options.webhookSecret;
    this.plans = options.plans;
    this.now = options.now ?? Date.now;
  }

  async createCheckout(request: PaymentCheckoutRequest): Promise<PaymentCheckout> {
    const plan = Object.hasOwn(this.plans, request.planId) ? this.plans[request.planId] : undefined;
    if (plan === undefined) throw new CommerceBillingError("unknown-plan");
    const metadata = { [STRIPE_METADATA.account]: request.accountId };
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.priceId, quantity: 1 }],
      client_reference_id: request.accountId,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      metadata,
      subscription_data: { metadata },
      ...(request.customerId === undefined ? {} : { customer: request.customerId })
    });
    if (typeof session.url !== "string" || session.url === "") throw new Error(`Stripe checkout ${session.id} returned no URL.`);
    return { checkoutId: session.id, url: session.url, expiresAtMs: session.expires_at * 1000 };
  }

  async createPortal(request: PaymentPortalRequest): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({ customer: request.customerId, return_url: request.returnUrl });
    return { url: session.url };
  }

  async verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<ProviderWebhookEvent> {
    if (signatureHeader === null || signatureHeader.trim() === "") throw new PaymentWebhookVerificationError("missing-signature");
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(rawBody, signatureHeader, this.webhookSecret, WEBHOOK_TOLERANCE_SECONDS);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new PaymentWebhookVerificationError(/tolerance/iu.test(error.message) ? "timestamp-outside-tolerance" : "bad-signature");
      }
      throw new PaymentWebhookVerificationError("malformed-payload");
    }
    if (typeof event?.id !== "string" || typeof event.type !== "string" || event.data?.object === undefined) throw new PaymentWebhookVerificationError("malformed-payload");
    return { eventId: event.id, type: event.type, payloadSha256: sha256(rawBody), subscriptionId: stripeEventSubscriptionId(event) };
  }

  async getSubscription(subscriptionId: string): Promise<ProviderSubscriptionFetch | null> {
    let subscription: Stripe.Subscription;
    try {
      subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") return null;
      throw error;
    }
    return { subscription: stripeSubscriptionState(subscription, this.plans, this.now()), payloadSha256: sha256(JSON.stringify(subscription)) };
  }
}

function endpoint(apiBaseUrl: string): Stripe.StripeConfig {
  const url = new URL(apiBaseUrl);
  const protocol = url.protocol === "http:" ? "http" : "https";
  return { host: url.hostname, port: url.port === "" ? (protocol === "http" ? 80 : 443) : Number(url.port), protocol };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
