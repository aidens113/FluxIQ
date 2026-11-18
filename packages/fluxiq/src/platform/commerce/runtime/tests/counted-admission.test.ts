import { expect, it } from "vitest";
import type { CommerceEntitlementGrant, CommerceSubscriptionRecord, CommerceSubscriptionSnapshot } from "../../model/index.ts";
import { authority, event, grant, policy } from "../../tests/fixtures.ts";
import { CloudAdmissionService } from "../index.ts";
import type { CommerceAdmissionRequest, CommerceExecutionAuthority, CommerceHoldings } from "../index.ts";

// Counted dedicated grants: a grant with a quantity and no resource ids admits
// at most that many dedicated targets of the account at once.

const browsers = (quantity: number, overrides: Partial<CommerceEntitlementGrant> = {}) =>
  grant({ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["environment.dedicated"], quantity, ...overrides });

function record(id: string, changes: Partial<CommerceSubscriptionSnapshot> = {}): CommerceSubscriptionRecord {
  return { ...event(id, 1, { subscriptionId: id, ...changes }).subscription, providerId: "fixture-provider" };
}

function dedicated(targetId: string): CommerceExecutionAuthority {
  return authority({
    target: { kind: "managed-cloud", allocation: "dedicated", region: "region-a", targetId, ownerAccountId: "account-a", ownerWorkspaceId: "workspace-a", capabilities: ["environment.dedicated"] }
  });
}

/** Holdings as an allocating engine keeps them: what the account holds, claimed atomically. */
class MemoryHoldings implements CommerceHoldings {
  readonly held = new Map<string, Set<string>>();
  async claim(request: { accountId: string; targetId: string; limit: number }): Promise<boolean> {
    const held = this.held.get(request.accountId) ?? new Set<string>();
    if (held.has(request.targetId)) return true;
    if (held.size >= request.limit) return false;
    held.add(request.targetId);
    this.held.set(request.accountId, held);
    return true;
  }
}

function setup(subscriptions: CommerceSubscriptionRecord[], options: { holdings?: CommerceHoldings | null; nowMs?: number } = {}) {
  const holdings = options.holdings === undefined ? new MemoryHoldings() : options.holdings;
  const clock = { nowMs: options.nowMs ?? 2_000 };
  const service = new CloudAdmissionService<string>({
    deploymentMode: "service",
    authorize: async (request) => dedicated(request.targetId),
    ledger: { listSubscriptions: async (accountId) => subscriptions.filter((entry) => entry.accountId === accountId) },
    policy: policy(),
    ...(holdings === null ? {} : { holdings }),
    now: () => clock.nowMs
  });
  const admit = (targetId: string) => service.admit({ actor: "verified-session", workspaceId: "workspace-a", targetId, capability: "environment.dedicated" } satisfies CommerceAdmissionRequest<string>);
  return { admit, holdings, clock };
}

it("admits N dedicated targets for a grant of N and refuses the N+1th", async () => {
  const { admit } = setup([record("sub-1", { entitlements: [browsers(2)] })]);
  expect(await admit("env-1")).toMatchObject({ allowed: true, source: "commerce", allocation: "dedicated", targetId: "env-1", subscriptionId: "sub-1" });
  expect(await admit("env-2")).toMatchObject({ allowed: true, targetId: "env-2" });
  expect(await admit("env-3")).toEqual({ allowed: false, reason: "entitlement-exhausted" });
  // A target the account already holds is admitted again (a start, a replayed create).
  expect(await admit("env-1")).toMatchObject({ allowed: true, targetId: "env-1" });
});

it("adds counts across subscriptions and grants", async () => {
  const { admit } = setup([record("sub-1", { entitlements: [browsers(1)] }), record("sub-2", { customerId: "customer-a", entitlements: [browsers(1)] })]);
  expect(await admit("env-1")).toMatchObject({ allowed: true });
  expect(await admit("env-2")).toMatchObject({ allowed: true });
  expect(await admit("env-3")).toMatchObject({ allowed: false, reason: "entitlement-exhausted" });
});

it("lets only one of two concurrent claims take the last unit", async () => {
  const { admit } = setup([record("sub-1", { entitlements: [browsers(1)] })]);
  const decisions = await Promise.all([admit("env-1"), admit("env-2")]);
  expect(decisions.filter((decision) => decision.allowed)).toHaveLength(1);
});

it("refuses a counted grant when nothing keeps the count, never treating it as unlimited", async () => {
  const { admit } = setup([record("sub-1", { entitlements: [browsers(5)] })], { holdings: null });
  expect(await admit("env-1")).toEqual({ allowed: false, reason: "commerce-policy-unavailable" });
});

it("still admits a named resource without consulting the count", async () => {
  const named = grant({ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["environment.dedicated"], resourceIds: ["env-named"] });
  const { admit, holdings } = setup([record("sub-1", { entitlements: [named] })]);
  expect(await admit("env-named")).toMatchObject({ allowed: true, targetId: "env-named" });
  expect(await admit("env-other")).toMatchObject({ allowed: false, reason: "entitlement-required" });
  expect((holdings as MemoryHoldings).held.size).toBe(0);
});

it("refuses new targets once the subscription lapses, and claims nothing", async () => {
  const { admit, clock, holdings } = setup([record("sub-1", { status: "past-due", paidThroughMs: 1_900, entitlements: [browsers(3, { validUntilMs: 1_900 })] })]);
  clock.nowMs = 2_000;
  expect(await admit("env-1")).toMatchObject({ allowed: false, reason: "entitlement-required" });
  expect((holdings as MemoryHoldings).held.size).toBe(0);
});
