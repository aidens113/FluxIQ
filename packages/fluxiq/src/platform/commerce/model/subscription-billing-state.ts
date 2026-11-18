import type { CommerceBillingPolicy, CommerceSubscriptionBillingState, CommerceSubscriptionSnapshot } from "./types.ts";

/**
 * The billing state of one subscription at `nowMs`. Pure, and the one place
 * the meaning of a provider status is decided: the entitlement and cloud
 * admission both read it, so they cannot disagree.
 *
 * - active/trial paid through a future instant: `active`, or
 *   `cancel-at-period-end` when the provider will end it there; both admit
 *   new work until that instant, because the customer has paid through it;
 * - paid coverage over without a renewal (an `active` snapshot past its
 *   boundary, or `past-due`): `past-due` until `paidThroughMs + graceMs`, then
 *   `suspended`; a scheduled cancel whose period is over is `ended`;
 * - `unpaid` (dunning exhausted): `suspended`; `paused`, or a trial the policy
 *   does not admit: `restricted`; `incomplete`: `checkout-pending`;
 * - `canceled`: `ended`, data retained until `endedAtMs + retentionMs`.
 */
export function subscriptionBillingState(
  subscription: CommerceSubscriptionSnapshot,
  nowMs: number,
  policy: CommerceBillingPolicy
): CommerceSubscriptionBillingState {
  switch (subscription.status) {
    case "incomplete": return closed("checkout-pending");
    case "paused": return closed("restricted");
    case "unpaid": return closed("suspended");
    case "canceled": return ended(subscription.endedAtMs ?? subscription.verifiedAtMs, policy);
    case "past-due": return lapsed(subscription.paidThroughMs, nowMs, policy);
    case "trial": return policy.allowTrial ? paid(subscription, nowMs, policy) : closed("restricted");
    case "active": return paid(subscription, nowMs, policy);
  }
}

function paid(subscription: CommerceSubscriptionSnapshot, nowMs: number, policy: CommerceBillingPolicy): CommerceSubscriptionBillingState {
  const paidThrough = subscription.paidThroughMs;
  if (paidThrough !== null && paidThrough > nowMs) {
    return { state: subscription.cancelAtPeriodEnd ? "cancel-at-period-end" : "active", admitsUntilMs: paidThrough, grantExtensionMs: 0 };
  }
  if (subscription.cancelAtPeriodEnd && paidThrough !== null) return ended(paidThrough, policy);
  return lapsed(paidThrough, nowMs, policy);
}

function lapsed(paidThrough: number | null, nowMs: number, policy: CommerceBillingPolicy): CommerceSubscriptionBillingState {
  if (paidThrough === null) return closed("suspended");
  const graceEndsAt = paidThrough + policy.graceMs;
  if (nowMs < graceEndsAt) return { state: "past-due", admitsUntilMs: graceEndsAt, grantExtensionMs: policy.graceMs, graceEndsAt };
  return closed("suspended");
}

function ended(endedAtMs: number, policy: CommerceBillingPolicy): CommerceSubscriptionBillingState {
  return { state: "ended", admitsUntilMs: null, grantExtensionMs: 0, retentionEndsAt: endedAtMs + policy.retentionMs };
}

function closed(state: CommerceSubscriptionBillingState["state"]): CommerceSubscriptionBillingState {
  return { state, admitsUntilMs: null, grantExtensionMs: 0 };
}
