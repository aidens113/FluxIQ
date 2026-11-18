import { expect, it } from "vitest";
import { event, grant } from "../../tests/fixtures.ts";
import { grantInForceUntil, subscriptionBillingState } from "../index.ts";
import type { CommerceBillingPolicy, CommerceSubscriptionSnapshot } from "../index.ts";

const policy: CommerceBillingPolicy = { allowTrial: false, graceMs: 1_000, retentionMs: 10_000 };
const at = (changes: Partial<CommerceSubscriptionSnapshot>, nowMs = 2_000, overrides: Partial<CommerceBillingPolicy> = {}) =>
  subscriptionBillingState(event("e", 1, changes).subscription, nowMs, { ...policy, ...overrides });

it("is active and admits until the paid-through boundary", () => {
  expect(at({})).toEqual({ state: "active", admitsUntilMs: 5_000, grantExtensionMs: 0 });
});

it("reports a scheduled cancel as cancel-at-period-end, admitting new work through the paid period, then ended at the boundary with retention", () => {
  expect(at({ cancelAtPeriodEnd: true })).toEqual({ state: "cancel-at-period-end", admitsUntilMs: 5_000, grantExtensionMs: 0 });
  expect(at({ cancelAtPeriodEnd: true }, 5_000)).toEqual({ state: "ended", admitsUntilMs: null, grantExtensionMs: 0, retentionEndsAt: 15_000 });
});

it("gives past-due a grace window from the end of paid coverage, then suspends", () => {
  expect(at({ status: "past-due", paidThroughMs: 1_500 })).toEqual({ state: "past-due", admitsUntilMs: 2_500, grantExtensionMs: 1_000, graceEndsAt: 2_500 });
  expect(at({ status: "past-due", paidThroughMs: 1_500 }, 2_499)).toMatchObject({ state: "past-due" });
  expect(at({ status: "past-due", paidThroughMs: 1_500 }, 2_500)).toEqual({ state: "suspended", admitsUntilMs: null, grantExtensionMs: 0 });
  expect(at({ status: "past-due", paidThroughMs: 1_500 }, 2_000, { graceMs: 0 })).toMatchObject({ state: "suspended" });
  expect(at({ status: "past-due", paidThroughMs: null })).toMatchObject({ state: "suspended" });
});

it("treats an active snapshot past its boundary without a renewal as past-due inside grace", () => {
  expect(at({ paidThroughMs: 1_800 })).toMatchObject({ state: "past-due", admitsUntilMs: 2_800, graceEndsAt: 2_800 });
  expect(at({ paidThroughMs: 1_800 }, 2_800)).toMatchObject({ state: "suspended" });
  expect(at({ paidThroughMs: null })).toMatchObject({ state: "suspended" });
});

it("maps unpaid to suspended, paused to restricted and incomplete to checkout-pending", () => {
  expect(at({ status: "unpaid" })).toMatchObject({ state: "suspended", admitsUntilMs: null });
  expect(at({ status: "paused" })).toMatchObject({ state: "restricted", admitsUntilMs: null });
  expect(at({ status: "incomplete", paidThroughMs: null })).toMatchObject({ state: "checkout-pending", admitsUntilMs: null });
});

it("admits a trial only when the policy allows trials, else restricts it", () => {
  expect(at({ status: "trial" })).toMatchObject({ state: "restricted", admitsUntilMs: null });
  expect(at({ status: "trial" }, 2_000, { allowTrial: true })).toMatchObject({ state: "active", admitsUntilMs: 5_000 });
});

it("ends a canceled subscription with a retention countdown from when it ended", () => {
  expect(at({ status: "canceled", paidThroughMs: null, endedAtMs: 1_700 })).toEqual({ state: "ended", admitsUntilMs: null, grantExtensionMs: 0, retentionEndsAt: 11_700 });
  expect(at({ status: "canceled", paidThroughMs: null, endedAtMs: null, verifiedAtMs: 1_900 })).toMatchObject({ retentionEndsAt: 11_900 });
});

it("keeps a grant in force from its inclusive start to its exclusive end, extended by grace", () => {
  expect(grantInForceUntil(grant(), 1_000, 0)).toBe(5_000);
  expect(grantInForceUntil(grant(), 999, 0)).toBeNull();
  expect(grantInForceUntil(grant(), 5_000, 0)).toBeNull();
  expect(grantInForceUntil(grant(), 5_000, 1_000)).toBe(6_000);
});
