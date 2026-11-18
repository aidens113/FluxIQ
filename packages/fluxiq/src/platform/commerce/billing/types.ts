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

/** A provider's current subscription state; the ledger assigns its version. */
export type ProviderSubscriptionState = Omit<CommerceSubscriptionSnapshot, "version">;

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

export type PaymentPortalRequest = { accountId: string; customerId: string; returnUrl: string };

/**
 * The payment provider port. Stripe is the production adapter; `FakePaymentProvider`
 * serves tests and local development. Nothing in it decides entitlement: it
 * reports provider state, and the ledger and `subscriptionBillingState` decide.
 */
export interface PaymentProvider {
  readonly providerId: string;
  createCheckout(request: PaymentCheckoutRequest): Promise<PaymentCheckout>;
  createPortal(request: PaymentPortalRequest): Promise<{ url: string }>;
  /** Verifies the signature over the exact raw body; throws `PaymentWebhookVerificationError` otherwise. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<ProviderWebhookEvent>;
  /** The provider's current state of one subscription; null when the provider has no such subscription. */
  getSubscription(subscriptionId: string): Promise<ProviderSubscriptionFetch | null>;
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
  outcome: "applied" | "unchanged" | "stale" | "duplicate" | "ignored";
  subscriptionId: string | null;
  version: number | null;
};

export type CommerceReconcileReport = {
  reconciled: string[];
  failed: { subscriptionId: string; error: string }[];
};
