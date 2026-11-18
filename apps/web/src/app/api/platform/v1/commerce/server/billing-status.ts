import { payerOf } from "./payer-of";
import type { CommerceRouteAnswer, CommerceRouteDeps } from "./types";

/**
 * The plan page's view: the plans a person can choose (names and what each
 * line counts, never a provider price id), and the paying account's billing
 * state, how many dedicated browsers and seats its grants in force allow,
 * and its open checkout. A workspace without a paying account answers the
 * plans with `account: null`.
 */
export async function billingStatus(deps: CommerceRouteDeps): Promise<CommerceRouteAnswer> {
  const plans = Object.entries(deps.config.plans).map(([id, plan]) => ({ id, name: plan.name, lines: plan.lines.map((line) => ({ unit: line.unit, quantity: line.quantity })) }));
  const accountId = await payerOf(deps);
  if (accountId === null) return { status: 200, body: { ok: true, plans, account: null } };
  const [entitlement, checkouts] = await Promise.all([deps.billing.getEntitlement(accountId), deps.billing.listCheckouts(accountId)]);
  const nowMs = deps.now();
  const open = checkouts.find((checkout) => checkout.completedAtMs === null && checkout.expiredAtMs === null && nowMs < checkout.expiresAtMs) ?? null;
  const count = (counted: (grant: (typeof entitlement.grants)[number]) => boolean) => entitlement.grants.filter(counted).reduce((sum, grant) => sum + (grant.quantity ?? grant.resourceIds.length), 0);
  return {
    status: 200,
    body: {
      ok: true,
      plans,
      account: {
        state: entitlement.state,
        dedicatedEnvironments: count((grant) => grant.allocation === "dedicated"),
        seats: count((grant) => grant.allocation !== "dedicated" && grant.quantity !== undefined),
        ...(entitlement.graceEndsAt === undefined ? {} : { graceEndsAt: entitlement.graceEndsAt }),
        openCheckout: open === null ? null : { planId: open.planId, expiresAtMs: open.expiresAtMs }
      }
    }
  };
}
