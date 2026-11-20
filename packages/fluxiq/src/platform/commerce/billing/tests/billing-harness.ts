import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SQLiteCommerceLedger } from "../../storage/index.ts";
import { grant } from "../../tests/fixtures.ts";
import { CommerceBillingService, FakePaymentProvider } from "../index.ts";
import type { PaymentProvider, ProviderSubscriptionState } from "../index.ts";

// The billing service over a real SQLite ledger and the fake provider, shared by the billing tests.

export const SECRET = "whsec_fake_local_test_secret";
const roots: string[] = [];

/** Removes every ledger root `setup` made; call it in `afterEach`. */
export async function removeBillingRoots(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export function state(changes: Partial<ProviderSubscriptionState> = {}): ProviderSubscriptionState {
  return {
    accountId: "account-a",
    customerId: "customer-a",
    subscriptionId: "sub-a",
    status: "active",
    paidThroughMs: 5_000,
    cancelAtPeriodEnd: false,
    endedAtMs: null,
    verifiedAtMs: 0,
    entitlements: [grant()],
    ...changes
  };
}


/** Subscriptions the tests bind to their accounts as a completed checkout would, unless a test asks for none. */
const BINDINGS: readonly [string, string][] = [["account-a", "sub-a"], ["account-a", "sub-old"], ["account-a", "sub-ghost"], ["account-b", "sub-b"]];

export async function setup(options: { provider?: (fake: FakePaymentProvider) => PaymentProvider; bound?: boolean } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-billing-"));
  roots.push(rootDir);
  const clock = { nowMs: 2_000 };
  const fake = new FakePaymentProvider({ webhookSecret: SECRET, now: () => clock.nowMs, checkoutLifetimeMs: 1_000 });
  const provider = options.provider?.(fake) ?? fake;
  const open = () => new CommerceBillingService({
    ledger: new SQLiteCommerceLedger({ rootDir, now: () => clock.nowMs }),
    provider,
    policy: { allowTrial: false, graceMs: 1_000, retentionMs: 30_000 },
    refreshAfterMs: 500,
    now: () => clock.nowMs
  });
  let service = open();
  const deliver = (id: string, subscriptionId: string | null = "sub-a") => {
    const { rawBody, signature } = fake.signedEvent({ id, type: "customer.subscription.updated", subscriptionId });
    return service.ingestWebhook(rawBody, signature);
  };
  const complete = (id: string, checkoutId: string, subscriptionId: string) => {
    const { rawBody, signature } = fake.signedEvent({ id, type: "checkout.session.completed", subscriptionId, checkout: { checkoutId, outcome: "completed" } });
    return service.ingestWebhook(rawBody, signature);
  };
  // Binds a subscription to its account as FluxIQ's own record of a completed checkout, without a provider fetch.
  const ledger = new SQLiteCommerceLedger({ rootDir, now: () => clock.nowMs });
  const bind = async (accountId: string, subscriptionId: string) => {
    const checkoutId = `bound-${subscriptionId}`;
    await ledger.recordCheckout({ accountId, providerId: fake.providerId, checkoutId, planId: "shared", customerId: null, createdAtMs: 0, expiresAtMs: 1, subscriptionId: null, completedAtMs: null, expiredAtMs: null });
    await ledger.completeCheckout({ providerId: fake.providerId, checkoutId, subscriptionId, completedAtMs: 0 });
  };
  if (options.bound !== false) for (const [accountId, subscriptionId] of BINDINGS) await bind(accountId, subscriptionId);
  return {
    rootDir,
    clock,
    fake,
    deliver,
    complete,
    ledger,
    get service() {
      return service;
    },
    restart() {
      service = open();
      return service;
    }
  };
}

