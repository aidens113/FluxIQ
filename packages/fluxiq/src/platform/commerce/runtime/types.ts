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
  /**
   * How long after paid coverage ended unpaid new work is still admitted
   * (past-due inside grace); 0 admits none. Running work is never stopped here.
   */
  graceMs: number;
  entitlementKeys: Record<CommerceAllocationClass, string>;
};

/**
 * What an account holds of a counted allocation: the dedicated targets it
 * runs or keeps allocated now. The engine that allocates them implements it
 * (for dedicated environments, the environment store).
 */
export interface CommerceHoldings {
  /**
   * Answers true and counts `targetId` as held by the account when it is
   * already held, or when the account holds fewer than `limit` targets;
   * false otherwise. Atomic with every other claim, so two concurrent claims
   * cannot both take the last unit; a claimed target stays counted until the
   * allocation it was claimed for is recorded or refused.
   */
  claim(request: { accountId: string; targetId: string; limit: number }): Promise<boolean>;
}

export type CloudAdmissionOptions<Actor> = {
  deploymentMode: CommerceDeploymentMode;
  /** Must check the actor's current identity, workspace, action and target IAM. */
  authorize(request: CommerceAdmissionRequest<Actor>): Promise<CommerceExecutionAuthority | null>;
  ledger?: Pick<CommerceLedger, "listSubscriptions">;
  policy?: CommerceAdmissionPolicy;
  /**
   * Counts dedicated targets against counted grants (a grant with a
   * `quantity` and no `resourceIds`). Without it a counted grant admits
   * nothing (`commerce-policy-unavailable`): a count no one keeps is never
   * taken as unlimited.
   */
  holdings?: CommerceHoldings;
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
  | "entitlement-required"
  | "entitlement-exhausted";

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
