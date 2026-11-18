import { createHash } from "node:crypto";
import { grantInForceUntil, subscriptionBillingState } from "../model/index.ts";
import type {
  CommerceBillingPolicy,
  CommerceBillingState,
  CommerceCheckoutRecord,
  CommerceEntitlementGrant,
  CommerceSubscriptionBillingState,
  CommerceSubscriptionRecord
} from "../model/index.ts";
import type { CommerceEntitlement } from "./types.ts";

/** Which state an account with several subscriptions reports, first wins. Admitting states come first. */
const PRECEDENCE: readonly CommerceBillingState[] = ["active", "past-due", "cancel-at-period-end", "suspended", "restricted", "checkout-pending", "ended"];

/**
 * An account's entitlement at `nowMs`, from its ledger subscriptions and
 * checkouts. Pure: the same ledger facts and instant give the same answer and
 * revision. Each subscription's meaning comes from `subscriptionBillingState`,
 * the function cloud admission decides by too.
 */
export function deriveCommerceEntitlement(input: {
  accountId: string;
  subscriptions: readonly CommerceSubscriptionRecord[];
  checkouts: readonly CommerceCheckoutRecord[];
  nowMs: number;
  policy: CommerceBillingPolicy;
}): CommerceEntitlement {
  const { accountId, nowMs, policy } = input;
  const subscriptions = input.subscriptions.filter((subscription) => subscription.accountId === accountId);
  const billed = subscriptions.map((subscription) => ({ subscription, billing: subscriptionBillingState(subscription, nowMs, policy) }));
  const pendingCheckout = input.checkouts.some((checkout) => checkout.accountId === accountId && checkout.createdAtMs <= nowMs && nowMs < checkout.expiresAtMs);
  const states = new Set<CommerceBillingState>(billed.map(({ billing }) => billing.state));
  if (pendingCheckout) states.add("checkout-pending");
  const state = PRECEDENCE.find((candidate) => states.has(candidate)) ?? "none";
  const grants: CommerceEntitlementGrant[] = [];
  for (const { subscription, billing } of billed) {
    if (!admits(billing, nowMs)) continue;
    for (const grant of subscription.entitlements) {
      if (grantInForceUntil(grant, nowMs, billing.grantExtensionMs) !== null) grants.push(copyGrant(grant));
    }
  }
  const entitlement: CommerceEntitlement = { accountId, revision: "", state, grants: admitting(state) ? grants : [] };
  if (state === "past-due") entitlement.graceEndsAt = latest(billed.filter(({ billing }) => billing.state === "past-due").map(({ billing }) => billing.graceEndsAt));
  if (state === "ended") entitlement.retentionEndsAt = latest(billed.filter(({ billing }) => billing.state === "ended").map(({ billing }) => billing.retentionEndsAt));
  entitlement.revision = revisionOf(entitlement, subscriptions, input.checkouts.filter((checkout) => checkout.accountId === accountId));
  return entitlement;
}

function admits(billing: CommerceSubscriptionBillingState, nowMs: number): boolean {
  return billing.admitsUntilMs !== null && billing.admitsUntilMs > nowMs;
}

function admitting(state: CommerceBillingState): boolean {
  return state === "active" || state === "past-due" || state === "cancel-at-period-end";
}

function latest(values: readonly (number | undefined)[]): number {
  return Math.max(...values.filter((value): value is number => value !== undefined));
}

function copyGrant(grant: CommerceEntitlementGrant): CommerceEntitlementGrant {
  return {
    key: grant.key,
    allocation: grant.allocation,
    capabilities: [...grant.capabilities],
    regions: [...grant.regions],
    resourceIds: [...grant.resourceIds],
    validFromMs: grant.validFromMs,
    validUntilMs: grant.validUntilMs
  };
}

/**
 * Hashes the entitlement and the ledger facts behind it, but not subscription
 * versions or verification times: a reconciliation that only re-confirms the
 * same provider state does not change the revision.
 */
function revisionOf(entitlement: CommerceEntitlement, subscriptions: readonly CommerceSubscriptionRecord[], checkouts: readonly CommerceCheckoutRecord[]): string {
  const facts = {
    accountId: entitlement.accountId,
    state: entitlement.state,
    grants: entitlement.grants,
    graceEndsAt: entitlement.graceEndsAt ?? null,
    retentionEndsAt: entitlement.retentionEndsAt ?? null,
    subscriptions: subscriptions
      .map((subscription) => [subscription.providerId, subscription.subscriptionId, subscription.customerId, subscription.status, subscription.paidThroughMs, subscription.cancelAtPeriodEnd, subscription.endedAtMs, subscription.entitlements])
      .sort(compareJson),
    checkouts: checkouts.map((checkout) => [checkout.providerId, checkout.checkoutId, checkout.expiresAtMs]).sort(compareJson)
  };
  return createHash("sha256").update(JSON.stringify(facts), "utf8").digest("hex").slice(0, 32);
}

function compareJson(left: unknown, right: unknown): number {
  const a = JSON.stringify(left);
  const b = JSON.stringify(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
