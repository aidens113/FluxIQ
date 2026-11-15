/** Provider adapters deliver complete, verified snapshots, never checkout redirects. */
export type CommerceSubscriptionStatus = "active" | "trial" | "past-due" | "canceled" | "incomplete";

export type CommerceAllocationClass = "control" | "shared" | "dedicated";

export type CommerceEntitlementGrant = {
  key: string;
  allocation: CommerceAllocationClass;
  capabilities: readonly string[];
  /** Explicit eligible regions; control services may use an empty list. */
  regions: readonly string[];
  /** Dedicated grants name their exact resources; shared/control grants name none. */
  resourceIds: readonly string[];
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
  /** Exclusive payment/trial boundary; null grants no cloud eligibility. */
  paidThroughMs: number | null;
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

export interface CommerceLedger {
  /** Only a trusted provider verifier/reconciler may call this server-side API. */
  applyVerifiedEvent(event: VerifiedCommerceEvent): Promise<CommerceEventResult>;
  getEvent(providerId: string, eventId: string): Promise<CommerceStoredEvent | null>;
  getSubscription(providerId: string, subscriptionId: string): Promise<CommerceSubscriptionRecord | null>;
  listSubscriptions(accountId: string): Promise<CommerceSubscriptionRecord[]>;
}
