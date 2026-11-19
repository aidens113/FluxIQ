import { SQLiteRepository } from "../../../framework/persistence/repository/sqlite-repository.ts";
import {
  CommerceConflictError,
  commerceEventIdentity,
  commerceSubscriptionIdentity,
  validateCommerceCheckout,
  validateCommerceEvent
} from "../model/index.ts";
import type {
  CommerceApplyOptions,
  CommerceCheckoutCompletion,
  CommerceCheckoutRecord,
  CommerceEventReceipt,
  CommerceEventResult,
  CommerceLedger,
  CommerceStoredEvent,
  CommerceSubscriptionRecord,
  CommerceSubscriptionSnapshot,
  VerifiedCommerceEvent
} from "../model/index.ts";
import { CommerceRecords, commerceRecordKey } from "./records.ts";

type StoredEvent = CommerceStoredEvent & { identity: string };
type SubscriptionReference = { providerId: string; subscriptionId: string };
/** Where a checkout id points: its account, so the record is found without the caller naming one. */
type CheckoutReference = { accountId: string };
/** A subscription a completed checkout created, bound to that checkout's account before any snapshot is stored. */
type SubscriptionBinding = { accountId: string; checkoutId: string };

/**
 * Durable provider-neutral ledger. Each operation runs in BEGIN IMMEDIATE;
 * provider event deduplication, immutable ownership and the effective snapshot
 * commit together across connections/processes, not just within a JS queue.
 * Payment verification/serialized provider reconciliation belongs to its caller.
 */
export class SQLiteCommerceLedger implements CommerceLedger {
  private readonly repository: SQLiteRepository;
  private readonly now: () => number;

  constructor(options: { rootDir: string; now?: () => number }) {
    this.repository = new SQLiteRepository({ rootDir: options.rootDir, kind: "platform.commerce" });
    this.now = options.now ?? Date.now;
  }

  async applyVerifiedEvent(input: VerifiedCommerceEvent, options: CommerceApplyOptions = {}): Promise<CommerceEventResult> {
    const event = validateCommerceEvent(input);
    const expected = options.expectedPreviousVersion;
    if (expected !== undefined && (!Number.isSafeInteger(expected) || expected < 0)) throw new TypeError("Invalid commerce expected version");
    const identity = commerceEventIdentity(event);
    const nowMs = this.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError("Invalid commerce clock");
    return this.transaction(async (records) => {
      const eventKey = commerceRecordKey("event", event.providerId, event.eventId);
      const duplicate = await records.get<StoredEvent>(eventKey);
      if (duplicate !== null) {
        if (duplicate.identity !== identity) throw new CommerceConflictError("event-reused");
        return { ...duplicate.receipt, duplicate: true };
      }
      const subscription = event.subscription;
      const customerKey = commerceRecordKey("customer", event.providerId, subscription.customerId);
      const customer = await records.get<{ accountId: string }>(customerKey);
      if (customer !== null && customer.accountId !== subscription.accountId) throw new CommerceConflictError("customer-rebound");
      const binding = await records.get<SubscriptionBinding>(commerceRecordKey("binding", event.providerId, subscription.subscriptionId));
      if (binding !== null && binding.accountId !== subscription.accountId) throw new CommerceConflictError("subscription-rebound");
      const subscriptionKey = commerceRecordKey("subscription", event.providerId, subscription.subscriptionId);
      const previous = await records.get<CommerceSubscriptionSnapshot>(subscriptionKey);
      if (expected !== undefined && (previous?.version ?? 0) !== expected) throw new CommerceConflictError("version-superseded");
      const outcome = this.transition(previous, subscription);
      const receipt: CommerceEventReceipt = {
        providerId: event.providerId,
        eventId: event.eventId,
        subscriptionId: subscription.subscriptionId,
        version: subscription.version,
        outcome,
        recordedAtMs: nowMs
      };
      if (outcome === "applied") {
        await records.put(customerKey, { accountId: subscription.accountId }, nowMs);
        await records.put(subscriptionKey, subscription, nowMs);
        const reference: SubscriptionReference = { providerId: event.providerId, subscriptionId: subscription.subscriptionId };
        await records.put(commerceRecordKey("account", subscription.accountId, event.providerId, subscription.subscriptionId), reference, nowMs);
      }
      const stored: StoredEvent = { event, receipt, identity };
      await records.put(eventKey, stored, nowMs);
      return { ...receipt, duplicate: false };
    });
  }

  getEvent(providerId: string, eventId: string): Promise<CommerceStoredEvent | null> {
    return this.transaction(async (records) => {
      const stored = await records.get<StoredEvent>(commerceRecordKey("event", providerId, eventId));
      return stored === null ? null : { event: stored.event, receipt: stored.receipt };
    });
  }

  getSubscription(providerId: string, subscriptionId: string): Promise<CommerceSubscriptionRecord | null> {
    return this.transaction(async (records) => {
      const subscription = await records.get<CommerceSubscriptionSnapshot>(commerceRecordKey("subscription", providerId, subscriptionId));
      return subscription === null ? null : { ...subscription, providerId };
    });
  }

  listSubscriptions(accountId: string): Promise<CommerceSubscriptionRecord[]> {
    const prefix = `${commerceRecordKey("account", accountId)}/`;
    return this.transaction(async (records) => {
      const references = await records.list<SubscriptionReference>(prefix);
      const subscriptions: CommerceSubscriptionRecord[] = [];
      for (const reference of references) {
        const subscription = await records.get<CommerceSubscriptionSnapshot>(commerceRecordKey("subscription", reference.providerId, reference.subscriptionId));
        if (subscription === null || subscription.accountId !== accountId) throw new Error("Commerce account index is inconsistent");
        subscriptions.push({ ...subscription, providerId: reference.providerId });
      }
      return subscriptions;
    });
  }

  listProviderSubscriptions(providerId: string): Promise<CommerceSubscriptionRecord[]> {
    const prefix = `${commerceRecordKey("subscription", providerId)}/`;
    return this.transaction(async (records) => {
      const subscriptions = await records.list<CommerceSubscriptionSnapshot>(prefix);
      return subscriptions.map((subscription) => ({ ...subscription, providerId }));
    });
  }

  async recordCheckout(input: CommerceCheckoutRecord): Promise<void> {
    const record = validateCommerceCheckout(input);
    if (record.subscriptionId !== null || record.completedAtMs !== null || record.expiredAtMs !== null) throw new TypeError("Invalid commerce checkout: a checkout is recorded as created");
    const nowMs = this.clock();
    await this.transaction(async (records) => {
      const referenceKey = commerceRecordKey("checkout-id", record.providerId, record.checkoutId);
      const reference = await records.get<CheckoutReference>(referenceKey);
      if (reference !== null && reference.accountId !== record.accountId) throw new CommerceConflictError("checkout-reused");
      const key = commerceRecordKey("checkout", record.accountId, record.providerId, record.checkoutId);
      const existing = await records.get<CommerceCheckoutRecord>(key);
      if (existing !== null) {
        const created = { ...existing, subscriptionId: null, completedAtMs: null, expiredAtMs: null };
        if (JSON.stringify(created) !== JSON.stringify(record)) throw new CommerceConflictError("checkout-reused");
        return;
      }
      await records.put(key, record, nowMs);
      await records.put(referenceKey, { accountId: record.accountId } satisfies CheckoutReference, nowMs);
    });
  }

  listCheckouts(accountId: string): Promise<CommerceCheckoutRecord[]> {
    const prefix = `${commerceRecordKey("checkout", accountId)}/`;
    return this.transaction((records) => records.list<CommerceCheckoutRecord>(prefix));
  }

  getCheckout(providerId: string, checkoutId: string): Promise<CommerceCheckoutRecord | null> {
    return this.transaction((records) => this.findCheckout(records, providerId, checkoutId));
  }

  async completeCheckout(completion: CommerceCheckoutCompletion): Promise<CommerceCheckoutRecord | null> {
    const { providerId, checkoutId, subscriptionId, completedAtMs } = completion;
    if (![providerId, checkoutId, subscriptionId].every(identifier) || !Number.isSafeInteger(completedAtMs) || completedAtMs < 0) throw new TypeError("Invalid commerce checkout completion");
    const nowMs = this.clock();
    return this.transaction(async (records) => {
      const record = await this.findCheckout(records, providerId, checkoutId);
      if (record === null) return null;
      if (record.completedAtMs !== null) {
        if (record.subscriptionId !== subscriptionId) throw new CommerceConflictError("checkout-reused");
        return record;
      }
      const bindingKey = commerceRecordKey("binding", providerId, subscriptionId);
      const binding = await records.get<SubscriptionBinding>(bindingKey);
      if (binding !== null && binding.accountId !== record.accountId) throw new CommerceConflictError("subscription-rebound");
      const stored = await records.get<CommerceSubscriptionSnapshot>(commerceRecordKey("subscription", providerId, subscriptionId));
      if (stored !== null && stored.accountId !== record.accountId) throw new CommerceConflictError("subscription-rebound");
      // The provider completing it is the fact: a completion outranks an expiry FluxIQ recorded.
      const completed = validateCommerceCheckout({ ...record, subscriptionId, completedAtMs, expiredAtMs: null });
      await records.put(commerceRecordKey("checkout", record.accountId, providerId, checkoutId), completed, nowMs);
      if (binding === null) await records.put(bindingKey, { accountId: record.accountId, checkoutId } satisfies SubscriptionBinding, nowMs);
      return completed;
    });
  }

  async expireCheckout(providerId: string, checkoutId: string, expiredAtMs: number): Promise<CommerceCheckoutRecord | null> {
    if (!identifier(providerId) || !identifier(checkoutId) || !Number.isSafeInteger(expiredAtMs) || expiredAtMs < 0) throw new TypeError("Invalid commerce checkout expiry");
    const nowMs = this.clock();
    return this.transaction(async (records) => {
      const record = await this.findCheckout(records, providerId, checkoutId);
      if (record === null || record.completedAtMs !== null || record.expiredAtMs !== null) return record;
      const expired = validateCommerceCheckout({ ...record, expiredAtMs });
      await records.put(commerceRecordKey("checkout", record.accountId, providerId, checkoutId), expired, nowMs);
      return expired;
    });
  }

  subscriptionAccount(providerId: string, subscriptionId: string): Promise<string | null> {
    return this.transaction(async (records) => {
      const stored = await records.get<CommerceSubscriptionSnapshot>(commerceRecordKey("subscription", providerId, subscriptionId));
      if (stored !== null) return stored.accountId;
      return (await records.get<SubscriptionBinding>(commerceRecordKey("binding", providerId, subscriptionId)))?.accountId ?? null;
    });
  }

  customerAccount(providerId: string, customerId: string): Promise<string | null> {
    return this.transaction(async (records) => (await records.get<{ accountId: string }>(commerceRecordKey("customer", providerId, customerId)))?.accountId ?? null);
  }

  private async findCheckout(records: CommerceRecords, providerId: string, checkoutId: string): Promise<CommerceCheckoutRecord | null> {
    const reference = await records.get<CheckoutReference>(commerceRecordKey("checkout-id", providerId, checkoutId));
    if (reference === null) return null;
    const record = await records.get<CommerceCheckoutRecord>(commerceRecordKey("checkout", reference.accountId, providerId, checkoutId));
    if (record === null || record.accountId !== reference.accountId) throw new Error("Commerce checkout index is inconsistent");
    return record;
  }

  private clock(): number {
    const nowMs = this.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError("Invalid commerce clock");
    return nowMs;
  }

  private transition(previous: CommerceSubscriptionSnapshot | null, next: CommerceSubscriptionSnapshot): CommerceEventReceipt["outcome"] {
    if (previous === null) return "applied";
    if (previous.accountId !== next.accountId || previous.customerId !== next.customerId) {
      throw new CommerceConflictError("subscription-rebound");
    }
    if (previous.version > next.version) return "stale";
    if (previous.version < next.version) return "applied";
    if (commerceSubscriptionIdentity(previous) !== commerceSubscriptionIdentity(next)) throw new CommerceConflictError("version-reused");
    return "unchanged";
  }

  private transaction<T>(operation: (records: CommerceRecords) => Promise<T>): Promise<T> {
    return this.repository.transaction({}, (transaction) => operation(new CommerceRecords(transaction, this.repository.tableName)));
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
