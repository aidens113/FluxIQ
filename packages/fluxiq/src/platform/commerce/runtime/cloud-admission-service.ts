import { grantInForceUntil, subscriptionBillingState } from "../model/index.ts";
import type { CommerceAllocationClass, CommerceEntitlementGrant, CommerceSubscriptionRecord } from "../model/index.ts";
import type {
  CloudAdmissionOptions,
  CommerceAdmissionDecision,
  CommerceAdmissionPolicy,
  CommerceAdmissionRequest,
  CommerceDeploymentMode,
  CommerceExecutionAuthority,
  CommerceExecutionTarget
} from "./types.ts";

/**
 * Checks authorized target eligibility without choosing another target. A
 * dedicated target is admitted by a grant that names it, or by counted grants
 * (`quantity`) while the account holds fewer dedicated targets than their sum
 * (`holdings`; a target it already holds is always admitted again). Call
 * again at dispatch/resume before new allocation. Existing run/stop/read/export
 * policy, reservations, metering and provider provisioning are separate owners.
 * Resolver/storage errors propagate: an outage cannot yield an allowed result.
 */
export class CloudAdmissionService<Actor> {
  private readonly policy: CommerceAdmissionPolicy | null;
  private readonly now: () => number;
  private readonly deploymentMode: CommerceDeploymentMode;
  private readonly authorize: CloudAdmissionOptions<Actor>["authorize"];
  private readonly ledger: CloudAdmissionOptions<Actor>["ledger"];
  private readonly holdings: CloudAdmissionOptions<Actor>["holdings"];

  constructor(options: CloudAdmissionOptions<Actor>) {
    if (!["local", "self-hosted", "service"].includes(options.deploymentMode)) throw new TypeError("Invalid commerce deployment mode");
    this.deploymentMode = options.deploymentMode;
    this.authorize = options.authorize;
    this.ledger = options.ledger;
    this.holdings = options.holdings;
    this.policy = copyPolicy(options.policy);
    this.now = options.now ?? Date.now;
  }

  async admit(input: CommerceAdmissionRequest<Actor>): Promise<CommerceAdmissionDecision> {
    if (![input.workspaceId, input.targetId, input.capability].every(identifier)) return { allowed: false, reason: "invalid-request" };
    const request: CommerceAdmissionRequest<Actor> = {
      actor: input.actor,
      workspaceId: input.workspaceId,
      targetId: input.targetId,
      capability: input.capability
    };
    const resolved = await this.authorize(request);
    if (resolved === null || !identifier(resolved.principalId) || !identifier(resolved.accountId) || resolved.workspaceId !== request.workspaceId) {
      return { allowed: false, reason: "not-authorized" };
    }
    const authority = copyAuthority(resolved);
    const target = authority.target;
    if (target.targetId !== request.targetId || target.ownerAccountId !== authority.accountId || target.ownerWorkspaceId !== request.workspaceId) {
      return { allowed: false, reason: "target-ownership-mismatch" };
    }
    if (!target.capabilities.includes(request.capability)) return { allowed: false, reason: "capability-unavailable" };
    const binding = {
      principalId: authority.principalId,
      accountId: authority.accountId,
      workspaceId: authority.workspaceId,
      targetId: target.targetId,
      capability: request.capability
    };
    if (target.kind === "customer-owned" && this.deploymentMode !== "service") {
      return { ...binding, allowed: true, source: "customer-owned" };
    }
    if (authority.cloudAuthorization?.accountId !== authority.accountId || authority.cloudAuthorization.workspaceId !== request.workspaceId) {
      return { allowed: false, reason: "cloud-account-required" };
    }
    if (this.policy === null || this.ledger === undefined) return { allowed: false, reason: "commerce-policy-unavailable" };
    const allocation: CommerceAllocationClass = target.kind === "managed-cloud" ? target.allocation : "control";
    const key = this.policy.entitlementKeys[allocation];
    const subscriptions = await this.ledger.listSubscriptions(authority.accountId);
    const nowMs = this.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new TypeError("Invalid commerce clock");
    if (subscriptions.length === 0) return { allowed: false, reason: "subscription-required" };
    // Counted dedicated grants add up across subscriptions; the first one in force names the decision's subscription.
    let limit = 0;
    let counted: { subscription: CommerceSubscriptionRecord; validUntilMs: number } | null = null;
    for (const subscription of subscriptions) {
      if (!eligible(subscription, authority.accountId, nowMs, this.policy)) continue;
      // The same billing state the account's entitlement reports: only active and past-due inside grace admit.
      const billing = subscriptionBillingState(subscription, nowMs, { allowTrial: this.policy.allowTrial, graceMs: this.policy.graceMs, retentionMs: 0 });
      if (billing.admitsUntilMs === null || billing.admitsUntilMs <= nowMs) continue;
      for (const grant of subscription.entitlements) {
        if (!matches(grant, key, allocation, request.capability, target)) continue;
        const grantUntil = grantInForceUntil(grant, nowMs, billing.grantExtensionMs);
        if (grantUntil === null) continue;
        const validUntilMs = Math.min(billing.admitsUntilMs, grantUntil, subscription.verifiedAtMs + this.policy.maxVerificationAgeMs);
        if (isCounted(grant)) {
          limit += grant.quantity as number;
          counted ??= { subscription, validUntilMs };
          continue;
        }
        return this.allowed(binding, allocation, key, subscription, validUntilMs);
      }
    }
    if (counted !== null) {
      if (this.holdings === undefined) return { allowed: false, reason: "commerce-policy-unavailable" };
      if (!await this.holdings.claim({ accountId: authority.accountId, targetId: target.targetId, limit })) return { allowed: false, reason: "entitlement-exhausted" };
      return this.allowed(binding, allocation, key, counted.subscription, counted.validUntilMs);
    }
    return { allowed: false, reason: "entitlement-required" };
  }

  private allowed(binding: AdmissionBinding, allocation: CommerceAllocationClass, key: string, subscription: CommerceSubscriptionRecord, validUntilMs: number): CommerceAdmissionDecision {
    return {
      ...binding,
      allowed: true,
      source: "commerce",
      allocation,
      policyId: (this.policy as CommerceAdmissionPolicy).id,
      entitlementKey: key,
      providerId: subscription.providerId,
      subscriptionId: subscription.subscriptionId,
      subscriptionVersion: subscription.version,
      validUntilMs
    };
  }
}

type AdmissionBinding = { principalId: string; accountId: string; workspaceId: string; targetId: string; capability: string };

/** A dedicated grant that counts its targets instead of naming them. */
function isCounted(grant: CommerceEntitlementGrant): boolean {
  return grant.allocation === "dedicated" && grant.resourceIds.length === 0 && Number.isSafeInteger(grant.quantity) && (grant.quantity as number) >= 1;
}

function eligible(subscription: CommerceSubscriptionRecord, accountId: string, nowMs: number, policy: CommerceAdmissionPolicy): boolean {
  return subscription.accountId === accountId
    && identifier(subscription.providerId)
    && identifier(subscription.subscriptionId)
    && Number.isSafeInteger(subscription.version) && subscription.version > 0
    && Number.isSafeInteger(subscription.verifiedAtMs) && subscription.verifiedAtMs >= 0
    && subscription.verifiedAtMs <= nowMs
    && nowMs - subscription.verifiedAtMs < policy.maxVerificationAgeMs;
}

function matches(grant: CommerceEntitlementGrant, key: string, allocation: CommerceAllocationClass, capability: string, target: CommerceExecutionTarget): boolean {
  return grant.key === key && grant.allocation === allocation
    && grant.capabilities.includes(capability)
    && (target.kind === "customer-owned" || grant.regions.includes(target.region))
    && (allocation !== "dedicated" || isCounted(grant) || grant.resourceIds.includes(target.targetId));
}

function copyAuthority(value: CommerceExecutionAuthority): CommerceExecutionAuthority {
  const original = value.target;
  if (original === null || typeof original !== "object" || !Array.isArray(original.capabilities)) throw new TypeError("Invalid authorized commerce target");
  const ownership = {
    targetId: original.targetId,
    ownerAccountId: original.ownerAccountId,
    ownerWorkspaceId: original.ownerWorkspaceId,
    capabilities: [...original.capabilities]
  };
  let target: CommerceExecutionTarget;
  if (original.kind === "customer-owned") target = { ...ownership, kind: "customer-owned" };
  else if (original.kind === "managed-cloud" && ["shared", "dedicated"].includes(original.allocation) && identifier(original.region)) {
    target = { ...ownership, kind: "managed-cloud", allocation: original.allocation, region: original.region };
  } else throw new TypeError("Invalid authorized commerce target");
  return {
    principalId: value.principalId,
    accountId: value.accountId,
    workspaceId: value.workspaceId,
    target,
    cloudAuthorization: value.cloudAuthorization === null ? null : {
      accountId: value.cloudAuthorization.accountId,
      workspaceId: value.cloudAuthorization.workspaceId
    }
  };
}

function copyPolicy(value: CommerceAdmissionPolicy | undefined): CommerceAdmissionPolicy | null {
  if (value === undefined) return null;
  if (!identifier(value.id) || !Number.isSafeInteger(value.maxVerificationAgeMs) || value.maxVerificationAgeMs < 1 || typeof value.allowTrial !== "boolean"
    || !Number.isSafeInteger(value.graceMs) || value.graceMs < 0) {
    throw new TypeError("Invalid commerce admission policy");
  }
  if (![value.entitlementKeys?.control, value.entitlementKeys?.shared, value.entitlementKeys?.dedicated].every(identifier)) {
    throw new TypeError("Invalid commerce entitlement policy keys");
  }
  return {
    id: value.id,
    maxVerificationAgeMs: value.maxVerificationAgeMs,
    allowTrial: value.allowTrial,
    graceMs: value.graceMs,
    entitlementKeys: {
      control: value.entitlementKeys.control,
      shared: value.entitlementKeys.shared,
      dedicated: value.entitlementKeys.dedicated
    }
  };
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
