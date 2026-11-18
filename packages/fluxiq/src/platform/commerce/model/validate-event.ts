import type { CommerceEntitlementGrant, CommerceSubscriptionSnapshot, VerifiedCommerceEvent } from "./types.ts";

const STATUSES = new Set(["active", "trial", "past-due", "unpaid", "paused", "canceled", "incomplete"]);
const ALLOCATIONS = new Set(["control", "shared", "dedicated"]);

/** Validates and copies before any await, so callers cannot mutate a queued event. */
export function validateCommerceEvent(value: VerifiedCommerceEvent): VerifiedCommerceEvent {
  exactKeys(value, ["kind", "providerId", "eventId", "payloadSha256", "subscription"]);
  if (value.kind !== "subscription.snapshot") invalid("kind");
  identifier(value.providerId, "providerId");
  identifier(value.eventId, "eventId");
  if (typeof value.payloadSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.payloadSha256)) invalid("payloadSha256");
  const subscription = copySubscription(value.subscription);
  return {
    kind: "subscription.snapshot",
    providerId: value.providerId,
    eventId: value.eventId,
    payloadSha256: value.payloadSha256,
    subscription
  };
}

function copySubscription(value: CommerceSubscriptionSnapshot): CommerceSubscriptionSnapshot {
  exactKeys(value, ["accountId", "customerId", "subscriptionId", "version", "status", "paidThroughMs", "cancelAtPeriodEnd", "endedAtMs", "verifiedAtMs", "entitlements"]);
  identifier(value.accountId, "accountId");
  identifier(value.customerId, "customerId");
  identifier(value.subscriptionId, "subscriptionId");
  if (!Number.isSafeInteger(value.version) || value.version < 1) invalid("version");
  if (!STATUSES.has(value.status)) invalid("status");
  if (value.paidThroughMs !== null) timestamp(value.paidThroughMs, "paidThroughMs");
  if (typeof value.cancelAtPeriodEnd !== "boolean") invalid("cancelAtPeriodEnd");
  if (value.endedAtMs !== null) timestamp(value.endedAtMs, "endedAtMs");
  timestamp(value.verifiedAtMs, "verifiedAtMs");
  if (!Array.isArray(value.entitlements)) invalid("entitlements");
  return {
    accountId: value.accountId,
    customerId: value.customerId,
    subscriptionId: value.subscriptionId,
    version: value.version,
    status: value.status,
    paidThroughMs: value.paidThroughMs,
    cancelAtPeriodEnd: value.cancelAtPeriodEnd,
    endedAtMs: value.endedAtMs,
    verifiedAtMs: value.verifiedAtMs,
    entitlements: value.entitlements.map(copyGrant)
  };
}

function copyGrant(value: CommerceEntitlementGrant): CommerceEntitlementGrant {
  exactKeys(value, ["key", "allocation", "capabilities", "regions", "resourceIds", "validFromMs", "validUntilMs"]);
  identifier(value.key, "entitlement.key");
  if (!ALLOCATIONS.has(value.allocation)) invalid("entitlement.allocation");
  const capabilities = strings(value.capabilities, "capabilities");
  const regions = strings(value.regions, "regions");
  const resourceIds = strings(value.resourceIds, "resourceIds");
  if (capabilities.length === 0) invalid("entitlement.capabilities");
  if (value.allocation !== "control" && regions.length === 0) invalid("entitlement.regions");
  if (value.allocation === "dedicated" ? resourceIds.length === 0 : resourceIds.length !== 0) invalid("entitlement.resourceIds");
  timestamp(value.validFromMs, "entitlement.validFromMs");
  timestamp(value.validUntilMs, "entitlement.validUntilMs");
  if (value.validUntilMs <= value.validFromMs) invalid("entitlement.interval");
  return {
    key: value.key,
    allocation: value.allocation,
    capabilities,
    regions,
    resourceIds,
    validFromMs: value.validFromMs,
    validUntilMs: value.validUntilMs
  };
}

function strings(value: readonly string[], name: string): string[] {
  if (!Array.isArray(value)) invalid(name);
  for (const entry of value) identifier(entry, name);
  if (new Set(value).size !== value.length) invalid(`${name}.duplicate`);
  return [...value];
}

function exactKeys(value: unknown, names: readonly string[]): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("object");
  const keys = Object.keys(value);
  if (keys.length !== names.length || keys.some((key) => !names.includes(key))) invalid("fields");
}

function identifier(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) invalid(name);
}

function timestamp(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) invalid(name);
}

function invalid(name: string): never {
  throw new TypeError(`Invalid commerce event: ${name}`);
}
