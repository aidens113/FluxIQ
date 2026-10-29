import type { FluxIQRequestOrigin, IamPolicyDocument, IamPolicyKind } from "@fluxiq/contracts/iam";
import type { FluxIQProfile } from "@fluxiq/contracts/platform";

// Types shared across the IAM engine (hosted production plan, Permissions).
// The policy grammar, FRNs and action names are the frozen contracts in
// `@fluxiq/contracts/iam`; these are the engine's own seams: what the
// evaluator receives, what it decides, and what the decision audit records.
// Stable for lanes B2 and B3 (t788): change them only with the lead.

/** The principal types that act. A `group` holds policies and never acts. */
export type IamActingPrincipalType = "user" | "role" | "service-identity";

/**
 * An acting principal. `id` is the user id, role name or service-identity
 * name, and is what `${fluxiq:PrincipalId}` and `fluxiq:PrincipalId` bind to.
 * `workspaceId` is null for a platform-level service identity. `frn` is the
 * principal's FRN (`frn:fluxiq:iam:<workspaceId>:<type>/<id>`), which the audit
 * records.
 */
export type IamPrincipal = {
  type: IamActingPrincipalType;
  id: string;
  workspaceId: string | null;
  frn: string;
};

/** A policy as the evaluator receives it: the name the audit cites, its kind, and its parsed document. */
export type IamPolicy = {
  name: string;
  kind: IamPolicyKind;
  document: IamPolicyDocument;
};

/**
 * Every policy that applies to one principal for one request, gathered by the
 * store (`store/`):
 *
 * - `identity`: attached directly, through the principal's groups, and
 *   through the role it assumed;
 * - `guardrails`: deny-only, applying to every principal in the workspace;
 * - `sessions`: session policies (`FluxIQBrowserSession`, or the one passed
 *   when assuming a role); when any are present, each must also allow;
 * - `boundary`: the permission boundary, or null for none.
 */
export type IamPolicySet = {
  identity: readonly IamPolicy[];
  guardrails: readonly IamPolicy[];
  sessions: readonly IamPolicy[];
  boundary: IamPolicy | null;
};

/**
 * One resource a request acts on, with the facts its conditions read. An
 * action on no specific resource, and a create or list, acts on its parent; a
 * top-level parent is the workspace, `frn:fluxiq:platform::workspace/<workspaceId>`.
 * `ownerId` is `fluxiq:ResourceOwner` (a user id); `tags` are
 * `fluxiq:ResourceTag/<key>`.
 */
export type IamResource = {
  frn: string;
  ownerId?: string | null;
  tags?: Readonly<Record<string, string>>;
};

/**
 * The request facts the global condition keys read. `workspaceId` binds
 * `${fluxiq:WorkspaceId}` and `fluxiq:WorkspaceId`; a key whose fact is absent
 * is missing, and a condition on it follows AWS: it passes under `...IfExists`
 * and under a negated operator (`StringNotEquals`, `NotIpAddress`), and fails
 * under every other operator.
 * `currentTimeMs` is epoch milliseconds.
 */
export type IamRequestContext = {
  workspaceId: string | null;
  origin: FluxIQRequestOrigin;
  currentTimeMs: number;
  requestId?: string;
  sourceIp?: string;
  mfaPresent?: boolean;
  profile?: FluxIQProfile;
  connectedClientId?: string;
};

/** The statement that decided: its policy's name and its `Sid` (null when it has none). */
export type IamMatchedStatement = {
  policy: string;
  sid: string | null;
};

/**
 * Why a resource was allowed or denied: `explicit-deny` (a matching `Deny` in
 * any policy), `allowed` (an identity statement allowed and every session
 * policy and the boundary allowed), or `implicit-deny` (nothing allowed it).
 */
export type IamDecisionReason = "explicit-deny" | "allowed" | "implicit-deny";

/** The decision for one resource. `matched` is `"implicit"` for an implicit deny. */
export type IamResourceDecision = {
  resource: string;
  decision: "allow" | "deny";
  reason: IamDecisionReason;
  matched: IamMatchedStatement | "implicit";
};

/**
 * The decision for one request: allowed only when every resource is allowed.
 * `matched` is the deciding statement of the first denied resource, or of the
 * first resource when all are allowed. `fullAccess` is true when the decision
 * came from the full-access fast path (an unconditional `Allow *` on the
 * workspace with no `Deny` anywhere in the set).
 */
export type IamDecision = {
  principal: string;
  action: string;
  decision: "allow" | "deny";
  matched: IamMatchedStatement | "implicit";
  resources: readonly IamResourceDecision[];
  fullAccess: boolean;
};

/**
 * One audit record, in the plan's read and export form. `category` decides
 * retention and flush: `allow` (day-partitioned, 90 days on `service`,
 * buffered), `deny` and `iam-change` (their own time-indexed table, one year,
 * flushed at once). An `iam-change` records a change the store made (an
 * attachment, a policy version, a membership), with `action` the IAM action
 * and `resources` what it changed. `time` is epoch seconds. `ipPrefix` is the
 * caller's address truncated (IPv4 /24, IPv6 /48), or null.
 */
export type IamAuditRecord = {
  category: "allow" | "deny" | "iam-change";
  time: number;
  requestId: string;
  principal: string;
  action: string;
  resources: readonly string[];
  decision: "allow" | "deny";
  matched: IamMatchedStatement | "implicit";
  origin: FluxIQRequestOrigin;
  ipPrefix: string | null;
};

/** Where decisions and IAM changes are recorded. `record` never awaits storage; `flush` drains the buffer. */
export type IamAuditSink = {
  record(record: IamAuditRecord): void;
  flush(): Promise<void>;
};
