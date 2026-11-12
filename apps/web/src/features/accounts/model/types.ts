// The account screens' model (hosted production plan, Identity And Sessions and
// Account Provisioning API; W5 accounts). Shared by the panel's components and
// the `/api/accounts` routes, so the wire shape is written down once. No type
// here ever carries a password, PIN, code, token, session id or link.

/**
 * What a person may do in the workspace, as the panel names it. Each maps to
 * one predefined policy (`ACCOUNT_ROLES`); `owner` is claimed, never given
 * here, and `other` is a membership this screen does not recognise.
 */
export type AccountRole = "owner" | "administrator" | "read-only" | "member" | "other";

/** A role this screen may give: never `owner` or `other`. */
export type AssignableRole = "administrator" | "read-only" | "member";

/**
 * `invited`: has an account but has not yet set a password from the welcome
 * link; `turned-off`: may not sign in.
 */
export type MemberState = "active" | "turned-off" | "invited";

/**
 * Where a person's access is managed: `account`, a platform account with a
 * workspace membership (changed through `/api/accounts` only: Identity
 * Access's `update-user` refuses their role and sign-in); `identity`, a person
 * added before accounts existed, with an Identity Access user only (changed
 * through Identity Access's own `update-user`, local and self-hosted only).
 */
export type MemberSource = "account" | "identity";

export type MemberRow = {
  userId: string;
  name: string;
  /** The account's email, or an older person's sign-in name. */
  email: string;
  role: AccountRole;
  state: MemberState;
  source: MemberSource;
  /** The person viewing the screen. */
  self: boolean;
  /** When the account was made (the invite, for an invited person); null for an older person. */
  invitedAt: number | null;
  lastSignInAt: number | null;
};

/** The workspace's kind, from the platform store: the one workspace of this FluxIQ, a person's own, or an organisation's. */
export type WorkspaceKind = "single" | "personal" | "organisation";

/** What `GET /api/accounts/members` answers. */
export type MembersView = {
  workspaceKind: WorkspaceKind;
  /** The roles this deployment lets an administrator give. */
  assignableRoles: AssignableRole[];
  /** Whether removing a person is available here (one workspace: removing deletes their account). */
  canRemove: boolean;
  members: MemberRow[];
};

/** The caller's own credentials, re-proved for a change that moves authority. Held only while the request is sent. */
export type CredentialProof = { password: string; pin?: string; totp?: string };

/** A change to one person, as `POST /api/accounts/member` takes it (`action`), less the proof. */
export type MemberChange =
  | { action: "set-role"; userId: string; role: AssignableRole }
  | { action: "turn-off"; userId: string }
  | { action: "turn-on"; userId: string }
  | { action: "remove"; userId: string }
  | { action: "resend-invite"; userId: string }
  | { action: "revoke-invite"; userId: string };

export type MemberChangeAction = MemberChange["action"];

/** An invite, as `POST /api/accounts/invite` takes it, less the proof. */
export type InviteRequest = { email: string; displayName: string; role: AssignableRole };

/**
 * What became of a request: done; refused for lack of access; refused until
 * the caller re-proves their credentials; refused for a reason the person can
 * act on (`message`); or failed.
 */
export type AccountsOutcome =
  | { kind: "done" }
  | { kind: "denied" }
  | { kind: "needs-proof"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "failed" };
