import type { CommerceAllocationClass, CommerceLedger } from "../model/index.ts";

export type CommerceDeploymentMode = "local" | "self-hosted" | "service";

export type CommerceAdmissionRequest<Actor> = {
  actor: Actor;
  workspaceId: string;
  targetId: string;
  capability: string;
};

type TargetOwnership = {
  targetId: string;
  ownerAccountId: string;
  ownerWorkspaceId: string;
  capabilities: readonly string[];
};

export type CommerceExecutionTarget = TargetOwnership & (
  | { kind: "customer-owned" }
  | { kind: "managed-cloud"; allocation: "shared" | "dedicated"; region: string }
);

/**
 * Produced ONLY by the server's authenticated IAM/target resolver. This is
 * not a request DTO: routing metadata, hostnames and client booleans cannot
 * establish account/workspace authority or paid status.
 */
export type CommerceExecutionAuthority = {
  principalId: string;
  accountId: string;
  workspaceId: string;
  target: CommerceExecutionTarget;
  /** Present only after verified FluxIQ Cloud account/workspace authorization. */
  cloudAuthorization: { accountId: string; workspaceId: string } | null;
};

export type CommerceAdmissionPolicy = {
  /** Operator-owned versioned policy, not the subscription's commercial plan. */
  id: string;
  maxVerificationAgeMs: number;
  allowTrial: boolean;
  entitlementKeys: Record<CommerceAllocationClass, string>;
};

export type CloudAdmissionOptions<Actor> = {
  deploymentMode: CommerceDeploymentMode;
  /** Must check the actor's current identity, workspace, action and target IAM. */
  authorize(request: CommerceAdmissionRequest<Actor>): Promise<CommerceExecutionAuthority | null>;
  ledger?: Pick<CommerceLedger, "listSubscriptions">;
  policy?: CommerceAdmissionPolicy;
  now?: () => number;
};

export type CommerceAdmissionDenial =
  | "invalid-request"
  | "not-authorized"
  | "target-ownership-mismatch"
  | "capability-unavailable"
  | "cloud-account-required"
  | "commerce-policy-unavailable"
  | "subscription-required"
  | "entitlement-required";

type AdmissionBinding = {
  principalId: string;
  accountId: string;
  workspaceId: string;
  targetId: string;
  capability: string;
};

/** Eligibility decision only: not a capacity reservation or execution credential. */
export type CommerceAdmissionDecision =
  | { allowed: false; reason: CommerceAdmissionDenial }
  | (AdmissionBinding & { allowed: true; source: "customer-owned" })
  | (AdmissionBinding & {
      allowed: true;
      source: "commerce";
      allocation: CommerceAllocationClass;
      policyId: string;
      entitlementKey: string;
      providerId: string;
      subscriptionId: string;
      subscriptionVersion: number;
      validUntilMs: number;
    });
