import { CommerceConflictError } from "../model/index.ts";
import type { CommerceBillingPolicy, CommerceEventResult, CommerceLedger, VerifiedCommerceEvent } from "../model/index.ts";
import { CommerceBillingError } from "./commerce-billing-error.ts";
import { deriveCommerceEntitlement } from "./derive-entitlement.ts";
import type {
  CommerceBillingServiceOptions,
  CommerceEntitlement,
  CommerceReconcileReport,
  CommerceWebhookResult,
  PaymentCheckout,
  PaymentCheckoutRequest,
  PaymentProvider
} from "./types.ts";

/**
 * Billing on the commerce ledger. Webhooks are triggers, never state: a
 * verified event makes the service fetch the provider's CURRENT subscription
 * and write it as the next ledger version, so duplicates are answered from the
 * ledger and an out-of-order event cannot restore an older state.
 *
 * Versions are serialized by compare-and-set: the version read before the
 * provider fetch must still be the stored one when the result is written. A
 * writer that loses re-reads and fetches again, so every committed snapshot was
 * fetched after the one before it committed. No lock is held across a network
 * call, so admission reads never wait on the provider.
 */
export class CommerceBillingService {
  private readonly ledger: CommerceLedger;
  private readonly provider: PaymentProvider;
  private readonly policy: CommerceBillingPolicy;
  private readonly refreshAfterMs: number;
  private readonly now: () => number;

  constructor(options: CommerceBillingServiceOptions) {
    const { policy } = options;
    if (typeof policy?.allowTrial !== "boolean" || !nonNegative(policy.graceMs) || !nonNegative(policy.retentionMs)) throw new TypeError("Invalid commerce billing policy");
    if (!Number.isSafeInteger(options.refreshAfterMs) || options.refreshAfterMs < 1) throw new TypeError("Invalid commerce refresh interval");
    if (!identifier(options.provider?.providerId)) throw new TypeError("Invalid payment provider");
    this.ledger = options.ledger;
    this.provider = options.provider;
    this.policy = { allowTrial: policy.allowTrial, graceMs: policy.graceMs, retentionMs: policy.retentionMs };
    this.refreshAfterMs = options.refreshAfterMs;
    this.now = options.now ?? Date.now;
  }

  get providerId(): string {
    return this.provider.providerId;
  }

  /** Interface I2. Reads the ledger only; never calls the provider. */
  async getEntitlement(accountId: string): Promise<CommerceEntitlement> {
    if (!identifier(accountId)) throw new CommerceBillingError("invalid-request");
    const [subscriptions, checkouts] = await Promise.all([this.ledger.listSubscriptions(accountId), this.ledger.listCheckouts(accountId)]);
    return deriveCommerceEntitlement({ accountId, subscriptions, checkouts, nowMs: this.clock(), policy: this.policy });
  }

  /** Starts a provider checkout for the paying account and records it, so the account reads `checkout-pending`. */
  async createCheckout(request: PaymentCheckoutRequest): Promise<PaymentCheckout> {
    if (![request.accountId, request.planId, request.successUrl, request.cancelUrl].every(identifier)) throw new CommerceBillingError("invalid-request");
    const customerId = await this.customerOf(request.accountId);
    const checkout = await this.provider.createCheckout({
      accountId: request.accountId,
      planId: request.planId,
      successUrl: request.successUrl,
      cancelUrl: request.cancelUrl,
      ...(customerId === undefined ? {} : { customerId })
    });
    await this.ledger.recordCheckout({
      accountId: request.accountId,
      providerId: this.provider.providerId,
      checkoutId: checkout.checkoutId,
      createdAtMs: this.clock(),
      expiresAtMs: checkout.expiresAtMs
    });
    return checkout;
  }

  /** A provider billing portal for the account's own customer; the customer comes from the ledger, never the caller. */
  async createPortal(request: { accountId: string; returnUrl: string }): Promise<{ url: string }> {
    if (!identifier(request.accountId) || !identifier(request.returnUrl)) throw new CommerceBillingError("invalid-request");
    const customerId = await this.customerOf(request.accountId);
    if (customerId === undefined) throw new CommerceBillingError("no-customer");
    return this.provider.createPortal({ accountId: request.accountId, customerId, returnUrl: request.returnUrl });
  }

  /**
   * Verifies one webhook delivery and reconciles the subscription it names.
   * A redelivery, a concurrent duplicate or a replay after restart is answered
   * from the ledger without another provider call.
   */
  async ingestWebhook(rawBody: string, signatureHeader: string | null): Promise<CommerceWebhookResult> {
    const event = await this.provider.verifyWebhook(rawBody, signatureHeader);
    if (event.subscriptionId === null) return { eventId: event.eventId, outcome: "ignored", subscriptionId: null, version: null };
    const recorded = await this.recordedDelivery(event.eventId, event.payloadSha256);
    if (recorded !== null) return recorded;
    try {
      const result = await this.reconcile(event.subscriptionId, { eventId: event.eventId, payloadSha256: event.payloadSha256 });
      return { eventId: event.eventId, outcome: result.duplicate ? "duplicate" : result.outcome, subscriptionId: result.subscriptionId, version: result.version };
    } catch (error) {
      // A concurrent delivery of the same event committed first under this event id.
      if (error instanceof CommerceConflictError && error.code === "event-reused") {
        const settled = await this.recordedDelivery(event.eventId, event.payloadSha256);
        if (settled !== null) return settled;
      }
      throw error;
    }
  }

  /** Fetches the provider's current state of one subscription and records it as the next version. */
  async reconcileSubscription(subscriptionId: string): Promise<CommerceEventResult> {
    if (!identifier(subscriptionId)) throw new CommerceBillingError("invalid-request");
    return this.reconcile(subscriptionId, null);
  }

  /**
   * Reconciles every subscription of this provider verified at least
   * `refreshAfterMs` ago, so admission's verification freshness holds without
   * waiting for a webhook. Each failure is reported; none hides another.
   */
  async reconcileDue(): Promise<CommerceReconcileReport> {
    const nowMs = this.clock();
    const due = (await this.ledger.listProviderSubscriptions(this.provider.providerId))
      .filter((subscription) => nowMs - subscription.verifiedAtMs >= this.refreshAfterMs);
    const report: CommerceReconcileReport = { reconciled: [], failed: [] };
    for (const subscription of due) {
      try {
        await this.reconcile(subscription.subscriptionId, null);
        report.reconciled.push(subscription.subscriptionId);
      } catch (error) {
        report.failed.push({ subscriptionId: subscription.subscriptionId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return report;
  }

  /** The account's provider customer, from its ledger subscriptions; the caller never names it. */
  private async customerOf(accountId: string): Promise<string | undefined> {
    const subscriptions = (await this.ledger.listSubscriptions(accountId))
      .filter((subscription) => subscription.providerId === this.provider.providerId && subscription.accountId === accountId);
    return subscriptions[0]?.customerId;
  }

  private async recordedDelivery(eventId: string, payloadSha256: string): Promise<CommerceWebhookResult | null> {
    const stored = await this.ledger.getEvent(this.provider.providerId, eventId);
    if (stored === null) return null;
    if (stored.event.payloadSha256 !== payloadSha256) throw new CommerceConflictError("event-reused");
    return { eventId, outcome: "duplicate", subscriptionId: stored.receipt.subscriptionId, version: stored.receipt.version };
  }

  private async reconcile(subscriptionId: string, origin: { eventId: string; payloadSha256: string } | null): Promise<CommerceEventResult> {
    const providerId = this.provider.providerId;
    // Ends when a write commits: each lost compare-and-set means another writer committed newer provider state.
    for (;;) {
      const previous = await this.ledger.getSubscription(providerId, subscriptionId);
      const fetched = await this.provider.getSubscription(subscriptionId);
      if (fetched === null) throw new CommerceBillingError("subscription-missing-at-provider");
      if (fetched.subscription.subscriptionId !== subscriptionId) throw new TypeError("Payment provider returned a different subscription");
      const version = (previous?.version ?? 0) + 1;
      const event: VerifiedCommerceEvent = {
        kind: "subscription.snapshot",
        providerId,
        eventId: origin?.eventId ?? `reconcile:${subscriptionId}:${version}`,
        payloadSha256: origin?.payloadSha256 ?? fetched.payloadSha256,
        subscription: { ...fetched.subscription, version }
      };
      try {
        return await this.ledger.applyVerifiedEvent(event, { expectedPreviousVersion: previous?.version ?? 0 });
      } catch (error) {
        if (error instanceof CommerceConflictError && error.code === "version-superseded") continue;
        throw error;
      }
    }
  }

  private clock(): number {
    const nowMs = this.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError("Invalid commerce clock");
    return nowMs;
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function nonNegative(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
