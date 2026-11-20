import { CommerceConflictError } from "../model/index.ts";
import type { CommerceBillingPolicy, CommerceCheckoutRecord, CommerceEventResult, CommerceLedger, VerifiedCommerceEvent } from "../model/index.ts";
import { CommerceBillingError } from "./commerce-billing-error.ts";
import { deriveCommerceEntitlement } from "./derive-entitlement.ts";
import type {
  CommerceBillingServiceOptions,
  CommerceCloseReport,
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

  /**
   * Starts a provider checkout of one configured plan for the paying account
   * and records it (account, plan, customer), so the account reads
   * `checkout-pending` and the subscription it creates resolves to this
   * account through FluxIQ's record. The account's open checkout, if any, is
   * expired at the provider first, so one account never has two payable.
   */
  async createCheckout(request: PaymentCheckoutRequest): Promise<PaymentCheckout> {
    if (![request.accountId, request.planId, request.successUrl, request.cancelUrl].every(identifier)) throw new CommerceBillingError("invalid-request");
    await this.expireOpenCheckouts(request.accountId);
    const customerId = await this.customerOf(request.accountId);
    const createdAtMs = this.clock();
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
      planId: request.planId,
      customerId: customerId ?? null,
      createdAtMs,
      expiresAtMs: checkout.expiresAtMs,
      subscriptionId: null,
      completedAtMs: null,
      expiredAtMs: null
    });
    return checkout;
  }

  /** The account's checkouts, newest first, from the ledger. */
  async listCheckouts(accountId: string): Promise<CommerceCheckoutRecord[]> {
    if (!identifier(accountId)) throw new CommerceBillingError("invalid-request");
    return (await this.ledger.listCheckouts(accountId))
      .filter((checkout) => checkout.accountId === accountId)
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
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
    if (event.checkout !== null) await this.settleCheckout(event.checkout.checkoutId, event.checkout.outcome, event.subscriptionId);
    if (event.subscriptionId === null) return { eventId: event.eventId, outcome: "ignored", subscriptionId: null, version: null };
    const recorded = await this.recordedDelivery(event.eventId, event.payloadSha256);
    if (recorded !== null) return recorded;
    try {
      const result = await this.reconcile(event.subscriptionId, { eventId: event.eventId, payloadSha256: event.payloadSha256 });
      if (result === null) return { eventId: event.eventId, outcome: "unbound", subscriptionId: event.subscriptionId, version: null };
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
    const result = await this.reconcile(subscriptionId, null);
    if (result === null) throw new CommerceBillingError("subscription-unbound");
    return result;
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

  /**
   * Account deletion's billing step: expires the payer's open checkout, so
   * nothing can be paid for a closing account, cancels every subscription of the payer
   * that has not ended, records the provider's ended state for each (the
   * entitlement then reads `ended`; ledger rows, which hold the account id and
   * no email, stay for `policy.retentionMs`), then closes the payer's
   * customers. Every provider call carries an idempotency key derived from
   * `operationId` (the deletion receipt), so a retry after an outage
   * (`PaymentProviderUnavailableError`, thrown as it came) cancels each
   * subscription once. Customers and subscriptions come from the ledger,
   * never the caller.
   */
  async closeAccount(accountId: string, operationId: string): Promise<CommerceCloseReport> {
    if (!identifier(accountId) || !identifier(operationId)) throw new CommerceBillingError("invalid-request");
    const subscriptions = (await this.ledger.listSubscriptions(accountId))
      .filter((subscription) => subscription.providerId === this.provider.providerId && subscription.accountId === accountId);
    const report: CommerceCloseReport = { checkoutsExpired: await this.expireOpenCheckouts(accountId), cancelled: [], customersClosed: [] };
    for (const subscription of subscriptions) {
      if (subscription.status === "canceled" || subscription.endedAtMs !== null) continue;
      await this.provider.cancelSubscription(subscription.subscriptionId, { idempotencyKey: `${operationId}:cancel:${subscription.subscriptionId}` });
      await this.reconcile(subscription.subscriptionId, null);
      report.cancelled.push(subscription.subscriptionId);
    }
    for (const customerId of new Set(subscriptions.map((subscription) => subscription.customerId))) {
      await this.provider.closeCustomer(customerId, { idempotencyKey: `${operationId}:close:${customerId}` });
      report.customersClosed.push(customerId);
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

  /**
   * Expires every open checkout of the account at the provider and records
   * it; one the provider had already completed is left to its completion.
   * Answers the checkouts expired.
   */
  private async expireOpenCheckouts(accountId: string): Promise<string[]> {
    const nowMs = this.clock();
    const open = (await this.ledger.listCheckouts(accountId)).filter((checkout) => checkout.accountId === accountId
      && checkout.providerId === this.provider.providerId
      && checkout.completedAtMs === null && checkout.expiredAtMs === null && nowMs < checkout.expiresAtMs);
    const expired: string[] = [];
    for (const checkout of open) {
      if (await this.provider.expireCheckout(checkout.checkoutId) !== "expired") continue;
      await this.ledger.expireCheckout(this.provider.providerId, checkout.checkoutId, this.clock());
      expired.push(checkout.checkoutId);
    }
    return expired;
  }

  /** Records what a signed checkout event reports: a completion binds its subscription to the checkout's account. */
  private async settleCheckout(checkoutId: string, outcome: "completed" | "expired", subscriptionId: string | null): Promise<void> {
    if (!identifier(checkoutId)) return;
    if (outcome === "expired") {
      await this.ledger.expireCheckout(this.provider.providerId, checkoutId, this.clock());
      return;
    }
    if (subscriptionId === null) return;
    await this.ledger.completeCheckout({ providerId: this.provider.providerId, checkoutId, subscriptionId, completedAtMs: this.clock() });
  }

  /**
   * Fetches the provider's current state of one subscription and writes it
   * as the next ledger version, under the account FluxIQ's own records bind
   * it to: its stored snapshot, else the checkout that created it, else the
   * customer an earlier subscription bound. The provider's echo of the
   * account is only cross-checked, never followed, so forged metadata cannot
   * move a subscription to another account. Null when no record binds it
   * yet (nothing is written).
   */
  private async reconcile(subscriptionId: string, origin: { eventId: string; payloadSha256: string } | null): Promise<CommerceEventResult | null> {
    const providerId = this.provider.providerId;
    // Ends when a write commits: each lost compare-and-set means another writer committed newer provider state.
    for (;;) {
      const previous = await this.ledger.getSubscription(providerId, subscriptionId);
      const fetched = await this.provider.getSubscription(subscriptionId);
      if (fetched === null) throw new CommerceBillingError("subscription-missing-at-provider");
      if (fetched.subscription.subscriptionId !== subscriptionId) throw new TypeError("Payment provider returned a different subscription");
      const accountId = previous?.accountId
        ?? await this.ledger.subscriptionAccount(providerId, subscriptionId)
        ?? await this.ledger.customerAccount(providerId, fetched.subscription.customerId);
      if (accountId === null) return null;
      const echoed = fetched.subscription.accountId;
      if (echoed !== null && echoed !== accountId) throw new CommerceConflictError("account-mismatch");
      const version = (previous?.version ?? 0) + 1;
      const event: VerifiedCommerceEvent = {
        kind: "subscription.snapshot",
        providerId,
        eventId: origin?.eventId ?? `reconcile:${subscriptionId}:${version}`,
        payloadSha256: origin?.payloadSha256 ?? fetched.payloadSha256,
        subscription: { ...fetched.subscription, accountId, version }
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
