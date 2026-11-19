/**
 * Provider adapters deliver complete, verified snapshots, never checkout redirects.
 * `unpaid` is a provider's final dunning state (retries exhausted); `paused` is a
 * subscription the provider holds without collecting (for example a trial that
 * ended without a payment method).
 */
export type CommerceSubscriptionStatus = "active" | "trial" | "past-due" | "unpaid" | "paused" | "canceled" | "incomplete";

export type CommerceAllocationClass = "control" | "shared" | "dedicated";

export type CommerceEntitlementGrant = {
  key: string;
  allocation: CommerceAllocationClass;
  capabilities: readonly string[];
  /** Explicit eligible regions; control services may use an empty list. */
  regions: readonly string[];
  /**
   * A dedicated grant either names its exact resources here, or names none
   * and counts them with `quantity`; shared and control grants name none.
   */
  resourceIds: readonly string[];
  /**
   * How many of what the grant's price counts it carries (dedicated browsers,
   * seats): a counted dedicated grant admits at most this many dedicated
   * targets at once. Absent on a grant that names its resources, and on one
   * that counts nothing.
   */
  quantity?: number;
  validFromMs: number;
  validUntilMs: number;
};

export type CommerceSubscriptionSnapshot = {
  accountId: string;
  customerId: string;
  subscriptionId: string;
  /**
   * Positive monotonic version scoped to provider + subscription. The trusted
   * adapter supplies a provider sequence or a serialized reconciliation version.
   * Delivery time and provider timestamps are NOT interchangeable with this.
   */
  version: number;
  status: CommerceSubscriptionStatus;
  /**
   * Exclusive payment/trial boundary; null grants no cloud eligibility. For a
   * past-due or unpaid subscription it is when paid coverage ended, which is
   * where the grace period starts.
   */
  paidThroughMs: number | null;
  /** The provider ends the subscription at `paidThroughMs`; it stays paid until then. */
  cancelAtPeriodEnd: boolean;
  /** When the provider ended the subscription; null while it has not ended. */
  endedAtMs: number | null;
  /** When the adapter verified current provider state, not webhook delivery time. */
  verifiedAtMs: number;
  entitlements: readonly CommerceEntitlementGrant[];
};

export type VerifiedCommerceEvent = {
  kind: "subscription.snapshot";
  providerId: string;
  eventId: string;
  /** SHA-256 of the original authenticated provider payload; no raw payment data. */
  payloadSha256: string;
  subscription: CommerceSubscriptionSnapshot;
};

export type CommerceSubscriptionRecord = CommerceSubscriptionSnapshot & { providerId: string };

export type CommerceEventReceipt = {
  providerId: string;
  eventId: string;
  subscriptionId: string;
  version: number;
  outcome: "applied" | "stale" | "unchanged";
  recordedAtMs: number;
};

export type CommerceStoredEvent = {
  event: VerifiedCommerceEvent;
  receipt: CommerceEventReceipt;
};

export type CommerceEventResult = CommerceEventReceipt & { duplicate: boolean };

/**
 * A checkout the account started, recorded by FluxIQ when it was created:
 * the account, the plan and the provider customer it was started for. It is
 * how a subscription the provider later reports is resolved to its account
 * (`completeCheckout`), never the provider's own echo of the account. The
 * account is `checkout-pending` while one is open: not completed, not
 * expired, and before `expiresAtMs`.
 */
export type CommerceCheckoutRecord = {
  accountId: string;
  providerId: string;
  checkoutId: string;
  /** The operator-configured plan the checkout sells. */
  planId: string;
  /** The account's existing provider customer it was started for; null when the provider creates one. */
  customerId: string | null;
  createdAtMs: number;
  /** Exclusive: the provider no longer completes the checkout from here on. */
  expiresAtMs: number;
  /** The subscription the completed checkout created; null until it completed. */
  subscriptionId: string | null;
  completedAtMs: number | null;
  /** When FluxIQ expired the checkout at the provider (a newer checkout started, or the account closed). */
  expiredAtMs: number | null;
};

/** A checkout's completion: the provider reported that it created `subscriptionId`. */
export type CommerceCheckoutCompletion = {
  providerId: string;
  checkoutId: string;
  subscriptionId: string;
  completedAtMs: number;
};

export type CommerceApplyOptions = {
  /**
   * Compare-and-set for serialized reconciliation: the version the caller read
   * before fetching provider state (0 when none was stored). When the stored
   * version differs, nothing is recorded and `CommerceConflictError("version-superseded")`
   * is thrown, so the caller re-reads and fetches again.
   */
  expectedPreviousVersion?: number;
};

export interface CommerceLedger {
  /** Only a trusted provider verifier/reconciler may call this server-side API. */
  applyVerifiedEvent(event: VerifiedCommerceEvent, options?: CommerceApplyOptions): Promise<CommerceEventResult>;
  getEvent(providerId: string, eventId: string): Promise<CommerceStoredEvent | null>;
  getSubscription(providerId: string, subscriptionId: string): Promise<CommerceSubscriptionRecord | null>;
  listSubscriptions(accountId: string): Promise<CommerceSubscriptionRecord[]>;
  /** Every stored subscription of one provider, for periodic reconciliation. */
  listProviderSubscriptions(providerId: string): Promise<CommerceSubscriptionRecord[]>;
  /**
   * Records a checkout as created: `subscriptionId`, `completedAtMs` and
   * `expiredAtMs` are null. Idempotent: the same record again is a no-op; a
   * changed one under the same id conflicts.
   */
  recordCheckout(record: CommerceCheckoutRecord): Promise<void>;
  listCheckouts(accountId: string): Promise<CommerceCheckoutRecord[]>;
  getCheckout(providerId: string, checkoutId: string): Promise<CommerceCheckoutRecord | null>;
  /**
   * Marks a recorded checkout completed and binds its subscription to the
   * checkout's account, atomically. Idempotent for the same subscription;
   * `checkout-reused` when the checkout completed with another subscription,
   * `subscription-rebound` when the subscription already belongs to another
   * account. Null when no such checkout was recorded.
   */
  completeCheckout(completion: CommerceCheckoutCompletion): Promise<CommerceCheckoutRecord | null>;
  /** Marks a recorded, not completed checkout expired; repeats harmlessly. Null when no such checkout was recorded. */
  expireCheckout(providerId: string, checkoutId: string, expiredAtMs: number): Promise<CommerceCheckoutRecord | null>;
  /**
   * The account FluxIQ's own records bind a provider subscription to: its
   * stored snapshot's account, else the account of the checkout that created
   * it; null when neither exists.
   */
  subscriptionAccount(providerId: string, subscriptionId: string): Promise<string | null>;
  /** The account a provider customer is bound to by an earlier subscription; null when none. */
  customerAccount(providerId: string, customerId: string): Promise<string | null>;
}

/**
 * An account's billing state. Only `active` and `past-due` (inside its grace)
 * admit new work; every state keeps read, stop and export, and none stops a
 * running task.
 */
export type CommerceBillingState =
  | "none"
  | "checkout-pending"
  | "active"
  | "past-due"
  | "suspended"
  | "cancel-at-period-end"
  | "ended"
  | "restricted";

/** Operator-owned billing policy; nothing here is a default the code invents. */
export type CommerceBillingPolicy = {
  /** Whether a trial subscription counts as paid; when false a trial is `restricted`. */
  allowTrial: boolean;
  /** How long new work is still admitted after paid coverage ended unpaid. */
  graceMs: number;
  /** How long an ended account's data is kept, counted from when it ended. */
  retentionMs: number;
};

/** What one subscription means for billing at one instant. */
export type CommerceSubscriptionBillingState = {
  state: Exclude<CommerceBillingState, "none">;
  /** Exclusive end of the window in which this subscription admits new work; null when it admits none now. */
  admitsUntilMs: number | null;
  /** How far past `validUntilMs` a grant of this subscription stays in force (the grace of a past-due subscription). */
  grantExtensionMs: number;
  graceEndsAt?: number;
  retentionEndsAt?: number;
};
