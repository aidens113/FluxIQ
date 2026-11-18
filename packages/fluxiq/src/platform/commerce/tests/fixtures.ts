import type { CommerceEntitlementGrant, CommerceSubscriptionSnapshot, VerifiedCommerceEvent } from "../model/index.ts";
import type { CommerceAdmissionPolicy, CommerceExecutionAuthority } from "../runtime/index.ts";

export function grant(overrides: Partial<CommerceEntitlementGrant> = {}): CommerceEntitlementGrant {
  const base: CommerceEntitlementGrant = {
    key: "cloud.shared",
    allocation: "shared",
    capabilities: ["execute"],
    regions: ["region-a"],
    resourceIds: [],
    validFromMs: 1_000,
    validUntilMs: 5_000
  };
  return { ...base, ...overrides };
}

export function event(eventId: string, version = 1, overrides: Partial<CommerceSubscriptionSnapshot> = {}): VerifiedCommerceEvent {
  const base: CommerceSubscriptionSnapshot = {
    accountId: "account-a",
    customerId: "customer-a",
    subscriptionId: "subscription-a",
    version,
    status: "active",
    paidThroughMs: 5_000,
    verifiedAtMs: 1_500,
    entitlements: [grant()]
  };
  return {
    kind: "subscription.snapshot",
    providerId: "fixture-provider",
    eventId,
    payloadSha256: "a".repeat(64),
    subscription: { ...base, ...overrides }
  };
}

export function policy(overrides: Partial<CommerceAdmissionPolicy> = {}): CommerceAdmissionPolicy {
  const base: CommerceAdmissionPolicy = {
    id: "policy-1",
    maxVerificationAgeMs: 1_000,
    allowTrial: false,
    entitlementKeys: { control: "cloud.control", shared: "cloud.shared", dedicated: "cloud.dedicated" }
  };
  return { ...base, ...overrides };
}

export function authority(overrides: Partial<CommerceExecutionAuthority> = {}): CommerceExecutionAuthority {
  const base: CommerceExecutionAuthority = {
    principalId: "principal-a",
    accountId: "account-a",
    workspaceId: "workspace-a",
    target: {
      kind: "managed-cloud",
      allocation: "shared",
      region: "region-a",
      targetId: "pool-a",
      ownerAccountId: "account-a",
      ownerWorkspaceId: "workspace-a",
      capabilities: ["execute"]
    },
    cloudAuthorization: { accountId: "account-a", workspaceId: "workspace-a" }
  };
  return { ...base, ...overrides };
}
