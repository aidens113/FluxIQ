import type { ClientGatewayRevocationReason, PanelEmailTemplate } from "@fluxiq/contracts/platform";
import type { IamAuditSink, IamChangeContext, IamDecision, IamMatchedStatement, IamPrincipal, IamRequestContext, IamResource } from "../../iam/index.ts";
import type { PlatformStore } from "../../store/index.ts";
import type { SerialQueue } from "../../store/rules/index.ts";
import type { EmailSender, PlatformAccountLinks, PlatformIdentityPort, PlatformProvisioning } from "../types.ts";

// The provisioning service's dependencies and the context every operation
// shares (hosted production plan, Account Provisioning API; lane B1). Every
// port is structural, so the IAM authorizer, an `IamStore` and the
// identity-access service fit as they are.

/** Single tenancy: one workspace, today's users. Multi: a personal workspace per sign-up, and organisation workspaces. */
export type PlatformTenancy = { mode: "single"; workspaceId: string } | { mode: "multi" };

/** The IAM authorizer's one method provisioning calls (`IamAuthorizer` fits). It records its own audit row. */
export type PlatformProvisioningAuthorizer = {
  authorize(principal: IamPrincipal, action: string, resources: IamResource[], context: IamRequestContext): Promise<IamDecision>;
};

/** One workspace's IAM attachments (`IamStore` fits): where a member's policies are attached to its user principal. */
export type PlatformIamAttachments = {
  attachPolicy(principalFrn: string, policyName: string, context: IamChangeContext): Promise<void>;
  detachPolicy(principalFrn: string, policyName: string, context: IamChangeContext): Promise<void>;
  listAttachedPolicies(principalFrn: string): Promise<string[]>;
};

/**
 * What `createPlatformProvisioning` needs.
 *
 * - `revokeConnectedClients`: lane D's port; absent, no client is revoked and
 *   the count is 0;
 * - `deleteWorkspaceData`: lane C's port, called before a personal workspace's
 *   row is removed; absent, only the row goes;
 * - `onWorkspaceCreated`: `workspace.created`, after a personal workspace's row is written;
 * - `entitlements.organisation`: `iam.organisation`; false by default;
 * - `reportEmailFailure`: told when an email could not be sent (the operation
 *   carries on, so an answer never depends on whether mail works); by
 *   default a one-line warning naming the template and the error's name only.
 */
export type PlatformProvisioningDeps = {
  store: PlatformStore;
  identity: PlatformIdentityPort;
  authorizer: PlatformProvisioningAuthorizer;
  auditSink: IamAuditSink;
  iamAttachments(workspaceId: string): PlatformIamAttachments;
  email: EmailSender;
  publicOrigin: string;
  tenancy: PlatformTenancy;
  revokeConnectedClients?: (userId: string, reason: ClientGatewayRevocationReason) => Promise<number>;
  deleteWorkspaceData?: (workspaceId: string) => Promise<void>;
  onWorkspaceCreated?: (workspaceId: string) => Promise<void>;
  entitlements?: { organisation?: boolean };
  reportEmailFailure?: (template: PanelEmailTemplate, error: unknown) => void;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
};

/** The provisioning service: the operations, the welcome and reset links, the sign-in stamp, and the scheduled-deletion sweep. */
export type PlatformProvisioningService = PlatformProvisioning &
  PlatformAccountLinks & {
    /** Stamps `lastSignInAt`; false when there is no such account. */
    recordSignIn(userId: string, nowMs?: number): Promise<boolean>;
    /** Completes every scheduled deletion due by `nowMs`; returns how many were completed. */
    runDueDeletions(nowMs?: number): Promise<number>;
  };

/**
 * Who an allowed operation acts as, for the IAM changes it makes: the actor's
 * principal (an FRN, `platform-admin` or `in-process`), the origin, the
 * request id, the caller's address prefix and the deciding statement.
 */
export type ProvisioningGrant = {
  actor: string;
  origin: IamChangeContext["origin"];
  requestId: string;
  ipPrefix: string | null;
  matched: IamMatchedStatement;
};

/** The dependencies with every default filled in, shared by the operations. */
export type ProvisioningContext = {
  store: PlatformStore;
  identity: PlatformIdentityPort;
  authorizer: PlatformProvisioningAuthorizer;
  auditSink: IamAuditSink;
  iamAttachments(workspaceId: string): PlatformIamAttachments;
  email: EmailSender;
  publicOrigin: string;
  tenancy: PlatformTenancy;
  revokeConnectedClients(userId: string, reason: ClientGatewayRevocationReason): Promise<number>;
  deleteWorkspaceData(workspaceId: string): Promise<void>;
  onWorkspaceCreated(workspaceId: string): Promise<void>;
  organisationEntitled: boolean;
  reportEmailFailure(template: PanelEmailTemplate, error: unknown): void;
  now(): number;
  randomBytes(size: number): Buffer;
  /** One writer per process: every mutation runs through it. */
  queue: SerialQueue;
};
