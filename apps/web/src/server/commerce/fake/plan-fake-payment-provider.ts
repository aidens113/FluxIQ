import { randomBytes } from "node:crypto";
import { FakePaymentProvider } from "fluxiq/platform";
import type { CommerceEntitlementGrant, PaymentCheckout, PaymentCheckoutExpiry, PaymentCheckoutRequest, PaymentPortalRequest, PaymentProvider, ProviderSubscriptionFetch, ProviderSubscriptionState, ProviderWebhookEvent } from "fluxiq/platform";
import type { CommercePlanCatalog } from "../types";
import { fakeProviderState } from "./fake-provider-state";
import type { FakeProviderState } from "./fake-provider-state";

/** How long a fake payment pays for: one month. */
const PERIOD_MS = 30 * 24 * 3_600_000;
const DEFAULT_CHECKOUT_LIFETIME_MS = 24 * 60 * 60 * 1000;

type Checkout = FakeProviderState["checkouts"][string];

/**
 * The `fake` payment provider of a local rehearsal, which takes no money and
 * reaches no network: Core's fake, with a person paying stood in for by the
 * provider's own signed completion. When a signed
 * `checkout.session.completed` arrives for a checkout this provider opened,
 * naming the subscription `fake_sub_<checkoutId>`, the checkout is completed
 * and that subscription is created as Stripe would create it from the plan:
 * active for a month, one grant per configured grant of each line, a counted
 * line's grants carrying the line's quantity. Nothing in the body sets any
 * state: the plan configuration alone decides what was bought, and only the
 * holder of the deployment's webhook signing secret can sign the event.
 *
 * Like a real provider, it keeps its checkouts and subscriptions across
 * FluxIQ's restarts (`stateFile`), so a subscription the ledger recorded is
 * still the provider's after a restart: cancelling and reconciling it when an
 * account is deleted works as it would at Stripe. Checkout ids are random, so
 * a restarted provider never reissues one the ledger already holds.
 *
 * The composition refuses it on any origin that is not this machine's.
 */
export class PlanFakePaymentProvider implements PaymentProvider {
  readonly providerId: string;
  private readonly inner: FakePaymentProvider;
  private readonly plans: CommercePlanCatalog;
  private readonly now: () => number;
  private readonly checkoutLifetimeMs: number;
  private readonly state: ReturnType<typeof fakeProviderState> | null;
  private readonly subscriptions = new Map<string, ProviderSubscriptionState>();

  constructor(options: { webhookSecret: string; plans: CommercePlanCatalog; checkoutLifetimeMs?: number; now?: () => number; stateFile?: string }) {
    this.now = options.now ?? Date.now;
    this.checkoutLifetimeMs = options.checkoutLifetimeMs ?? DEFAULT_CHECKOUT_LIFETIME_MS;
    this.inner = new FakePaymentProvider({ webhookSecret: options.webhookSecret, now: this.now, checkoutLifetimeMs: this.checkoutLifetimeMs });
    this.providerId = this.inner.providerId;
    this.plans = options.plans;
    this.state = options.stateFile === undefined ? null : fakeProviderState(options.stateFile);
    const saved = this.state?.load() ?? null;
    if (saved !== null) {
      for (const [checkoutId, checkout] of Object.entries(saved.checkouts)) this.inner.checkouts.set(checkoutId, { ...checkout });
      for (const subscription of Object.values(saved.subscriptions)) this.put(subscription);
    }
  }

  async createCheckout(request: PaymentCheckoutRequest): Promise<PaymentCheckout> {
    const checkoutId = `fake_cs_${randomBytes(9).toString("hex")}`;
    this.inner.checkouts.set(checkoutId, { planId: request.planId, accountId: request.accountId, customerId: request.customerId ?? null, status: "open" });
    this.save();
    return { checkoutId, url: `https://checkout.fake.invalid/${checkoutId}?plan=${encodeURIComponent(request.planId)}`, expiresAtMs: this.now() + this.checkoutLifetimeMs };
  }

  async expireCheckout(checkoutId: string): Promise<PaymentCheckoutExpiry> {
    const outcome = await this.inner.expireCheckout(checkoutId);
    this.save();
    return outcome;
  }

  createPortal(request: PaymentPortalRequest): Promise<{ url: string }> {
    return this.inner.createPortal(request);
  }

  async verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<ProviderWebhookEvent> {
    const event = await this.inner.verifyWebhook(rawBody, signatureHeader);
    const settled = event.checkout;
    if (settled?.outcome !== "completed" || event.subscriptionId !== `fake_sub_${settled.checkoutId}`) return event;
    const checkout = this.inner.checkouts.get(settled.checkoutId);
    const plan = checkout === undefined ? undefined : this.plans[checkout.planId];
    if (checkout === undefined || plan === undefined || checkout.status !== "open") return event;
    this.inner.completeCheckout(settled.checkoutId);
    const nowMs = this.now();
    const entitlements: CommerceEntitlementGrant[] = plan.lines.flatMap((line) => line.grants.map((grant) => ({
      key: grant.key,
      allocation: grant.allocation,
      capabilities: [...grant.capabilities],
      regions: [...grant.regions],
      resourceIds: [],
      ...(line.unit === "flat" ? {} : { quantity: line.quantity }),
      validFromMs: nowMs,
      validUntilMs: nowMs + PERIOD_MS
    })));
    this.put({
      accountId: null,
      customerId: checkout.customerId ?? `fake_cus_${settled.checkoutId}`,
      subscriptionId: event.subscriptionId,
      status: "active",
      paidThroughMs: nowMs + PERIOD_MS,
      cancelAtPeriodEnd: false,
      endedAtMs: null,
      verifiedAtMs: nowMs,
      entitlements
    });
    this.save();
    return event;
  }

  getSubscription(subscriptionId: string): Promise<ProviderSubscriptionFetch | null> {
    return this.inner.getSubscription(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string, options: { idempotencyKey: string }): Promise<void> {
    await this.inner.cancelSubscription(subscriptionId, options);
    const current = await this.inner.getSubscription(subscriptionId);
    if (current !== null) this.subscriptions.set(subscriptionId, current.subscription);
    this.save();
  }

  closeCustomer(customerId: string, options: { idempotencyKey: string }): Promise<void> {
    return this.inner.closeCustomer(customerId, options);
  }

  private put(subscription: ProviderSubscriptionState): void {
    this.inner.putSubscription(subscription);
    this.subscriptions.set(subscription.subscriptionId, structuredClone(subscription));
  }

  private save(): void {
    if (this.state === null) return;
    const checkouts: Record<string, Checkout> = {};
    for (const [checkoutId, checkout] of this.inner.checkouts) checkouts[checkoutId] = { ...checkout };
    this.state.save({ checkouts, subscriptions: Object.fromEntries(this.subscriptions) });
  }
}
