import type Stripe from "stripe";
import type { CommerceEntitlementGrant, CommerceSubscriptionStatus, ProviderSubscriptionState } from "fluxiq/platform";
import type { CommercePlanCatalog } from "../types";
import { STRIPE_METADATA } from "./metadata";

const STATUSES: Readonly<Record<string, CommerceSubscriptionStatus>> = {
  active: "active",
  trialing: "trial",
  past_due: "past-due",
  unpaid: "unpaid",
  paused: "paused",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled"
};

/**
 * A Stripe subscription as the commerce ledger's provider state. Paid
 * coverage is the current period while active or trialing (cut short by a
 * scheduled `cancel_at`), and ended at the current period's START once
 * past-due or unpaid, since Stripe has already opened the unpaid period: that
 * is where grace counts from. Grants come from the operator's plan catalog by
 * price; a price the catalog does not sell grants nothing, and a dedicated
 * grant without its resource ids is not provisioned yet and grants nothing.
 */
export function stripeSubscriptionState(subscription: Stripe.Subscription, plans: CommercePlanCatalog, verifiedAtMs: number): ProviderSubscriptionState {
  const accountId = subscription.metadata?.[STRIPE_METADATA.account];
  if (typeof accountId !== "string" || accountId === "" || accountId.trim() !== accountId) {
    throw new Error(`Stripe subscription ${subscription.id} names no FluxIQ account in its ${STRIPE_METADATA.account} metadata.`);
  }
  const status = Object.hasOwn(STATUSES, subscription.status) ? STATUSES[subscription.status] : undefined;
  if (status === undefined) throw new Error(`Stripe subscription ${subscription.id} has an unknown status.`);
  const items = subscription.items?.data ?? [];
  const periodStart = seconds(items.map((item) => item.current_period_start), Math.min);
  const periodEnd = seconds(items.map((item) => item.current_period_end), Math.min);
  const cancelAt = typeof subscription.cancel_at === "number" ? subscription.cancel_at * 1000 : null;
  const scheduledEnd = cancelAt !== null && periodEnd !== null && cancelAt <= periodEnd;
  return {
    accountId,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    subscriptionId: subscription.id,
    status,
    paidThroughMs: paidThrough(status, periodStart, periodEnd, cancelAt),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true || scheduledEnd,
    endedAtMs: endedAt(subscription),
    verifiedAtMs,
    entitlements: status === "canceled" || status === "incomplete" ? [] : grants(subscription, plans)
  };
}

function paidThrough(status: CommerceSubscriptionStatus, periodStart: number | null, periodEnd: number | null, cancelAt: number | null): number | null {
  if (status === "active" || status === "trial") return periodEnd === null ? null : Math.min(periodEnd, cancelAt ?? periodEnd);
  if (status === "past-due" || status === "unpaid") return periodStart;
  return null;
}

function endedAt(subscription: Stripe.Subscription): number | null {
  if (typeof subscription.ended_at === "number") return subscription.ended_at * 1000;
  if (subscription.status === "canceled" && typeof subscription.canceled_at === "number") return subscription.canceled_at * 1000;
  return null;
}

function grants(subscription: Stripe.Subscription, plans: CommercePlanCatalog): CommerceEntitlementGrant[] {
  const granted: CommerceEntitlementGrant[] = [];
  const validFromMs = subscription.start_date * 1000;
  for (const item of subscription.items?.data ?? []) {
    const plan = Object.values(plans).find((entry) => entry.priceId === item.price?.id);
    if (plan === undefined) continue;
    const validUntilMs = item.current_period_end * 1000;
    if (!(validUntilMs > validFromMs)) continue;
    const resourceIds = (item.metadata?.[STRIPE_METADATA.resources] ?? "").split(",").map((id) => id.trim()).filter((id) => id !== "");
    for (const template of plan.grants) {
      if (template.allocation === "dedicated" && resourceIds.length === 0) continue;
      granted.push({
        key: template.key,
        allocation: template.allocation,
        capabilities: [...template.capabilities],
        regions: [...template.regions],
        resourceIds: template.allocation === "dedicated" ? [...new Set(resourceIds)] : [],
        validFromMs,
        validUntilMs
      });
    }
  }
  return granted;
}

function seconds(values: readonly (number | null | undefined)[], pick: (...values: number[]) => number): number | null {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length === 0 ? null : pick(...known) * 1000;
}
