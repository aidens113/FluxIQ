import type {
  CommerceBillingPolicy,
  CommerceBillingState,
  CommerceEntitlementGrant,
  CommerceLedger,
  CommerceSubscriptionSnapshot
} from "../model/index.ts";

/**
 * Interface I2: what an account may do, derived from the ledger. Only
 * `active` and `past-due` (inside `graceEndsAt`) admit new work; every state
 * keeps read, stop and export. `revision` is opaque and changes exactly when
 * the entitlement or the ledger facts it is derived from change.
 */
export type CommerceEntitlement = {
  accountId: string;
  revision: string;
  state: CommerceBillingState;
  /** The grants in force now of the subscriptions that admit new work; empty in every other state. */
  grants: CommerceEntitlementGrant[];
  /** past-due only: new work stops being admitted at this instant (exclusive). */
  graceEndsAt?: number;
  /** ended only: the account's data is kept until this instant. */
  retentionEndsAt?: number;
};

/**
 * A provider's current subscription state; the ledger assigns its version.
 * `accountId` is only what the provider echoes back (Stripe's
 * `fluxiq_account_id` metadata), null when it echoes none: billing resolves
 * the account from FluxIQ's own records and refuses an echo that disagrees.
 */
export type ProviderSubscriptionState = Omit<CommerceSubscriptionSnapshot, "version" | "accountId"> & { accountId: string | null };

export type ProviderSubscriptionFetch = {
  subscription: ProviderSubscriptionState;
  /** SHA-256 of the provider response the state was read from. */
  payloadSha256: string;
};

/** A provider webhook after its signature was verified. */
export type ProviderWebhookEvent = {
  eventId: string;
  type: string;
  /** SHA-256 of the raw signed body. */
  payloadSha256: string;
  /** The subscription the event concerns; null for events billing does not track. */
  subscriptionId: string | null;
  /**
   * A checkout the signed event reports settled: `completed` names the
   * subscription it created (an immutable provider fact, so the signed event
   * is trusted for it), `expired` names none. Null for every other event.
   */
  checkout: { checkoutId: string; outcome: "completed" | "expired" } | null;
};

export type PaymentCheckoutRequest = {
  /** The payer: the account a workspace's billing belongs to. */
  accountId: string;
  /** An operator-configured plan id, never a provider price id from a client. */
  planId: string;
  successUrl: string;
  cancelUrl: string;
  /** The account's existing provider customer, from the ledger, so one payer stays one customer. */
  customerId?: string;
};

export type PaymentCheckout = { checkoutId: string; url: string; expiresAtMs: number };

/** What expiring a checkout came to: expired, or the provider had already completed it (its subscription then arrives as usual). */
export type PaymentCheckoutExpiry = "expired" | "completed";

export type PaymentPortalRequest = { accountId: string; customerId: string; returnUrl: string };

/**
 * The payment provider port. Stripe is the production adapter; `FakePaymentProvider`
 * serves tests and local development. Nothing in it decides entitlement: it
 * reports provider state, and the ledger and `subscriptionBillingState` decide.
 */
export interface PaymentProvider {
  readonly providerId: string;
  /** Sells the plan's line items, each with the quantity the plan configures. */
  createCheckout(request: PaymentCheckoutRequest): Promise<PaymentCheckout>;
  /**
   * Expires an open checkout so it can no longer be paid; one that already
   * expired counts as expired. Throws `PaymentProviderUnavailableError` when
   * the provider did not answer.
   */
  expireCheckout(checkoutId: string): Promise<PaymentCheckoutExpiry>;
  createPortal(request: PaymentPortalRequest): Promise<{ url: string }>;
  /** Verifies the signature over the exact raw body; throws `PaymentWebhookVerificationError` otherwise. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<ProviderWebhookEvent>;
  /** The provider's current state of one subscription; null when the provider has no such subscription. */
  getSubscription(subscriptionId: string): Promise<ProviderSubscriptionFetch | null>;
  /**
   * Ends a subscription now (no further charge; invoices stay at the
   * provider). Every retry passes the same `idempotencyKey`, so it is one
   * provider operation. A subscription the provider already ended, or does
   * not have, counts as ended. Throws `PaymentProviderUnavailableError` when
   * the provider did not answer.
   */
  cancelSubscription(subscriptionId: string, options: { idempotencyKey: string }): Promise<void>;
  /**
   * Closes a customer: its saved payment methods go with it and it can never
   * be charged again; its invoices stay at the provider. Same idempotency and
   * unavailability rules as `cancelSubscription`; an unknown customer counts
   * as closed.
   */
  closeCustomer(customerId: string, options: { idempotencyKey: string }): Promise<void>;
}

export type CommerceBillingServiceOptions = {
  ledger: CommerceLedger;
  provider: PaymentProvider;
  policy: CommerceBillingPolicy;
  /** A subscription verified longer ago than this is due for reconciliation. */
  refreshAfterMs: number;
  now?: () => number;
};

export type CommerceWebhookResult = {
  eventId: string;
  /**
   * `unbound`: the event names a subscription no FluxIQ record binds to an
   * account yet (its checkout's completion has not arrived); nothing is
   * recorded, and the completion reconciles it from current provider state.
   */
  outcome: "applied" | "unchanged" | "stale" | "duplicate" | "ignored" | "unbound";
  subscriptionId: string | null;
  version: number | null;
};

/** What closing an account's billing did: the open checkouts it expired, the subscriptions it cancelled now, and the customers it closed. */
export type CommerceCloseReport = {
  checkoutsExpired: string[];
  cancelled: string[];
  customersClosed: string[];
};

export type CommerceReconcileReport = {
  reconciled: string[];
  failed: { subscriptionId: string; error: string }[];
};
