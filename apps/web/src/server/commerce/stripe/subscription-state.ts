import type Stripe from "stripe";
import type { CommerceEntitlementGrant, CommerceSubscriptionStatus, ProviderSubscriptionState } from "fluxiq/platform";
import type { CommercePlanCatalog, CommercePlanLine } from "../types";
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
 * price; a price the catalog does not sell grants nothing. A counted line's
 * grants carry the item's quantity (dedicated browsers, seats; a dedicated
 * grant of a flat price counts one), and a dedicated grant whose item names
 * its resources (`fluxiq_resource_ids`) names them instead of counting.
 *
 * The account is only what the metadata echoes (null when it names none,
 * as stripe-mock's fixtures do); billing resolves the account from FluxIQ's
 * own checkout record and cross-checks this echo.
 */
export function stripeSubscriptionState(subscription: Stripe.Subscription, plans: CommercePlanCatalog, verifiedAtMs: number): ProviderSubscriptionState {
  const echoed = subscription.metadata?.[STRIPE_METADATA.account];
  const accountId = echoed === undefined || echoed === null || echoed === "" ? null : echoed;
  if (accountId !== null && (typeof accountId !== "string" || accountId.trim() !== accountId)) {
    throw new Error(`Stripe subscription ${subscription.id} has a malformed ${STRIPE_METADATA.account} metadata value.`);
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
    const line = lineOf(plans, item.price?.id);
    if (line === undefined) continue;
    const validUntilMs = item.current_period_end * 1000;
    if (!(validUntilMs > validFromMs)) continue;
    const resourceIds = [...new Set((item.metadata?.[STRIPE_METADATA.resources] ?? "").split(",").map((id) => id.trim()).filter((id) => id !== ""))];
    const counted = line.unit === "flat" ? 1 : item.quantity ?? 1;
    // An item counting nothing (quantity 0) grants nothing.
    if (!Number.isSafeInteger(counted) || counted < 1) continue;
    for (const template of line.grants) {
      const dedicated = template.allocation === "dedicated";
      const named = dedicated && resourceIds.length > 0;
      const quantity = named ? undefined : dedicated || line.unit !== "flat" ? counted : undefined;
      granted.push({
        key: template.key,
        allocation: template.allocation,
        capabilities: [...template.capabilities],
        regions: [...template.regions],
        resourceIds: named ? resourceIds : [],
        ...(quantity === undefined ? {} : { quantity }),
        validFromMs,
        validUntilMs
      });
    }
  }
  return granted;
}

function lineOf(plans: CommercePlanCatalog, priceId: string | undefined): CommercePlanLine | undefined {
  for (const plan of Object.values(plans)) for (const line of plan.lines) if (line.priceId === priceId) return line;
  return undefined;
}

function seconds(values: readonly (number | null | undefined)[], pick: (...values: number[]) => number): number | null {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length === 0 ? null : pick(...known) * 1000;
}
